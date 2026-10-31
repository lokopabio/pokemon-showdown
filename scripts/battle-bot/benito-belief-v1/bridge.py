"""JSON-lines adapter; accepts only own requests and player-visible battle logs."""
import json
import os
import sys
from copy import deepcopy

sys.path.insert(0, os.environ['ROMAN_FOUL_PLAY'])
from fp.config import FoulPlayConfig
FoulPlayConfig.pokemon_format = 'gen7ou'
from fp.data.mods.apply_mods import apply_gen_7_mods
apply_gen_7_mods()
from fp.battle.state import Battle, LastUsedMove
from fp.battle.protocol import process_battle_updates
from fp.modes.standard_battle import StandardBattleMode
from fp.search.standard_battles import prepare_battles
from fp.search.poke_engine_helpers import battle_to_poke_engine_state
from poke_engine import monte_carlo_tree_search
from belief import install_prior, choose_action
from evidence import Evidence
from posterior import SetBeliefs
from coverage import prepare as prepare_coverage
from action_model import PublicKnowledge, response_scenario, adjust


def request_choice(request, action, reserve):
    """The simulator request is authoritative over native move availability."""
    forced = any(request.get('forceSwitch', []))
    active = request.get('active', [{}])[0]
    if action.startswith('switch '):
        if active.get('trapped') and not forced:
            return None
        name = action.split(' ', 1)[1]
        target = next((p for p in reserve if p.name == name), None)
        if target is None:
            return None
        row = next((p for i,p in enumerate(request['side']['pokemon'], 1) if i == target.index), None)
        if row is None or row.get('active') or 'fnt' in row.get('condition', ''):
            return None
        return f'switch {target.index}'
    if forced:
        return None
    for i, move in enumerate(active.get('moves', []), 1):
        matches = move['id'] == action or (action.startswith('hiddenpower') and move['id'].startswith('hiddenpower'))
        if matches and not move.get('disabled', False) and move.get('pp', 1) > 0:
            return f'move {i}'
    return None

def reconcile_own_illusion(battle, own_active):
    true_name = own_active['details'].split(',')[0].lower().replace('-', '').replace(' ', '')
    if own_active.get('ability') != 'illusion' or battle.user.active.name == true_name:
        return
    real = next(p for p in battle.user.reserve if p.name == true_name)
    disguise = battle.user.active
    # Boosts is a defaultdict: preserve its default zero for untouched stats.
    real.boosts = deepcopy(disguise.boosts)
    real.volatile_statuses = list(disguise.volatile_statuses)
    for key in disguise.boosts:
        disguise.boosts[key] = 0
    disguise.volatile_statuses = []
    battle.user.reserve.remove(real)
    battle.user.reserve.append(disguise)
    battle.user.active = real

def diagnostic_pokemon(pkmn):
    if pkmn is None:
        return None
    return {key: deepcopy(getattr(pkmn, key, None)) for key in
            ('name', 'hp', 'max_hp', 'ability', 'original_ability', 'item', 'stats', 'types',
             'boosts', 'volatile_statuses', 'status', 'nature', 'evs',
             'roman_hypothesis_source', 'roman_compatible_bank_count')} | {
        'moves': [{'name': m.name, 'pp': m.current_pp} for m in pkmn.moves]}

def diagnostic_side(side):
    return {'active': diagnostic_pokemon(side.active),
            'reserve': [diagnostic_pokemon(p) for p in side.reserve]}

def main():
    battle = None
    evidence = Evidence()
    beliefs = SetBeliefs()
    knowledge = PublicKnowledge()
    if os.environ.get("BENITO_BELIEF") == "1":
        install_prior(evidence,beliefs,lambda: battle)
    for line in sys.stdin:
        message = json.loads(line)
        request = message['request']
        evidence.observe(battle, message['events'])
        knowledge.observe(message['events'],request.get('side',{}).get('id',battle.user.name if battle else None))
        if request.get('wait'):
            if battle is not None:
                battle.msg_list = message['events']
                process_battle_updates(battle)
                if hasattr(battle, "roman_tracker"):
                    battle.roman_tracker.finish(battle)
            print(json.dumps({'choice': None}), flush=True)
            continue
        first = battle is None
        if first:
            battle = Battle('local-foul-play-smoke')
            battle.pokemon_format = 'gen7ou'
            battle.generation = 'gen7'
            battle.started = True
            battle.mode = StandardBattleMode()
            battle.user.name = request['side']['id']
            battle.opponent.name = 'p2' if battle.user.name == 'p1' else 'p1'
            battle.user.initialize_first_turn_user_from_json(request)
            battle.mode.team_datasets.initialize(battle.format_spec, set())
            battle.mode.smogon_sets.initialize(battle.format_spec, set())
        own_active = next(p for p in request['side']['pokemon'] if p['active'])
        events = []
        for event in message['events']:
            if first and event.startswith('|switch|' + battle.user.name):
                continue
            # Own requests reveal our true Illusion user. Upstream special-cases
            # Zoroark and otherwise mistakes a custom user's disguise for itself.
            if event.startswith(('|switch|' + battle.user.name, '|drag|' + battle.user.name)) and own_active.get('ability') == 'illusion':
                parts = event.split('|')
                parts[3] = own_active['details']
                event = '|'.join(parts)
            events.append(event)
        battle.msg_list = events
        process_battle_updates(battle)
        if hasattr(battle, "roman_tracker"):
            battle.roman_tracker.finish(battle)
        reconcile_own_illusion(battle, own_active)
        battle.user.update_from_request_json(request)
        battle.request_json = request
        battle.rqid = request.get('rqid', 0)
        battle.force_switch = any(request.get('forceSwitch', []))
        budget = int(os.environ.get('ROMAN_SEARCH_MS', '10'))
        scores = {}
        scenario_results = []
        responses = []
        response_errors = []
        action_model = os.environ.get("BENITO_ACTION_MODEL") == "1" and os.environ.get("BENITO_BELIEF") == "1" and not battle.force_switch
        beliefs.begin_decision()
        visits = 0
        hypotheses = 3
        coverage = {}
        if os.environ.get("BENITO_BELIEF") == "1":
            sampled_scenarios,coverage = prepare_coverage(battle,prepare_battles)
        else:
            sampled_scenarios = list(prepare_battles(battle,hypotheses))
        hypotheses=len(sampled_scenarios)
        diagnostic = None
        if os.environ.get('ROMAN_DIAGNOSTICS') == '1':
            diagnostic = {'schema': 1, 'turn': battle.turn, 'searchMs': budget, 'hypothesisBudgetDivisor': hypotheses,
                          'own': diagnostic_side(battle.user),
                          'observedOpponent': diagnostic_side(battle.opponent),
                          'samples': [], 'evidenceRecords': len(evidence.records), 'evidenceSkipped': evidence.skipped, 'note': 'Opponent state contains inferences, not hidden simulator truth.'}
        for sampled, weight in sampled_scenarios:
            checks = evidence.check(sampled) if os.environ.get('BENITO_EVIDENCE_AUDIT') == '1' else []
            state = battle_to_poke_engine_state(sampled)
            if diagnostic is not None:
                diagnostic['samples'].append({'weight': weight, 'evidenceChecks': checks, 'nativeState': state.to_string(),
                    'own': diagnostic_side(sampled.user), 'opponent': diagnostic_side(sampled.opponent)})
            if os.environ.get('BENITO_EVIDENCE_AUDIT') == '1' and sum(p.hp > 0 for p in [sampled.user.active,*sampled.user.reserve]) == 1:
                from poke_engine import generate_instructions
                probes = []
                for move in sampled.user.active.moves:
                    for reply in sampled.opponent.active.moves:
                        initial = battle_to_poke_engine_state(sampled)
                        outcomes = []
                        for branch in generate_instructions(initial,move.name,reply.name):
                            after = initial.apply_instructions(branch)
                            def living(side):
                                p = side.pokemon[int(str(side.active_index))]
                                return {'hp':p.hp,'maxHP':p.maxhp}
                            outcomes.append({'percentage':branch.percentage,'own':living(after.side_one),'opponent':living(after.side_two)})
                        probes.append({'action':move.name,'reply':reply.name,'outcomes':outcomes})
                if diagnostic is not None:
                    diagnostic['samples'][-1]['lastMemberTransitions'] = probes
            result = monte_carlo_tree_search(state, max(1, int(budget * (.75 if action_model else 1)) // hypotheses), threads=1)
            if action_model:
                try:
                    response = response_scenario(sampled,result,knowledge,max(1,budget // (4*hypotheses)))
                    responses.append({'weight':weight,**response})
                except ValueError as error:
                    response_errors.append(str(error))
            scenario_results.append({'weight': weight, 'actions': [{'action': a.move_choice, 'visits': a.visits, 'totalScore': a.total_score} for a in result.side_one]})
            total = sum(action.visits for action in result.side_one) or 1
            visits += result.total_visits
            for action in result.side_one:
                scores[action.move_choice] = scores.get(action.move_choice, 0) + weight * action.visits / total
        choices = {action: request_choice(request, action, battle.user.reserve) for action in scores}
        discarded = {action: score for action, score in scores.items() if choices[action] is None}
        available = {action: score for action, score in scores.items() if choices[action] is not None}
        if not available:
            raise ValueError('Native search returned no request-legal action: '+str(scores))
        best = max(available, key=available.get)
        objectives = {}
        if os.environ.get('BENITO_BELIEF') == '1':
            best, objectives = choose_action(scenario_results, available)
        risk_objectives = {}
        if action_model and len(responses)==hypotheses:
            try:
                best,risk_objectives = adjust(objectives,responses)
            except ValueError as error:
                response_errors.append(str(error))
        proposed = best
        played = message.get('playedChoice')
        if played:
            if played.startswith('move '):
                best = request['active'][0]['moves'][int(played.split()[1])-1]['id']
            elif played.startswith('switch '):
                target = next(p for p in battle.user.reserve if p.index == int(played.split()[1]))
                best = 'switch ' + target.name
        battle.user.last_selected_move = LastUsedMove(battle.user.active.name, best, battle.turn)
        choice = choices[proposed]
        print(json.dumps({'choice': choice, 'coverage':coverage, 'responseScenarios': responses, 'responseErrors': response_errors, 'riskObjectives': risk_objectives, 'beliefs': beliefs.summary(), 'scenarioResults': scenario_results, 'objectives': objectives, 'visits': visits, 'hypotheses': hypotheses, 'actions': scores, 'discardedUnavailable': discarded, 'identity': getattr(getattr(battle,'roman_tracker',None),'current',None), **({'diagnostic': diagnostic} if diagnostic is not None else {})}), flush=True)

if __name__ == '__main__':
    main()
