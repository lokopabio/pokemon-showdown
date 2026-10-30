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
             'boosts', 'volatile_statuses', 'status', 'nature', 'evs')} | {
        'moves': [{'name': m.name, 'pp': m.current_pp} for m in pkmn.moves]}

def diagnostic_side(side):
    return {'active': diagnostic_pokemon(side.active),
            'reserve': [diagnostic_pokemon(p) for p in side.reserve]}

def main():
    battle = None
    for line in sys.stdin:
        message = json.loads(line)
        request = message['request']
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
        battle.force_switch = bool(request.get('forceSwitch'))
        budget = int(os.environ.get('ROMAN_SEARCH_MS', '10'))
        scores = {}
        visits = 0
        hypotheses = 3
        diagnostic = None
        if os.environ.get('ROMAN_DIAGNOSTICS') == '1':
            diagnostic = {'schema': 1, 'turn': battle.turn, 'searchMs': budget, 'hypothesisBudgetDivisor': hypotheses,
                          'own': diagnostic_side(battle.user),
                          'observedOpponent': diagnostic_side(battle.opponent),
                          'samples': [], 'note': 'Opponent state contains inferences, not hidden simulator truth.'}
        for sampled, weight in prepare_battles(battle, hypotheses):
            state = battle_to_poke_engine_state(sampled)
            if diagnostic is not None:
                diagnostic['samples'].append({'weight': weight, 'nativeState': state.to_string(),
                    'own': diagnostic_side(sampled.user), 'opponent': diagnostic_side(sampled.opponent)})
            result = monte_carlo_tree_search(state, max(1, budget // hypotheses), threads=1)
            total = sum(action.visits for action in result.side_one) or 1
            visits += result.total_visits
            for action in result.side_one:
                scores[action.move_choice] = scores.get(action.move_choice, 0) + weight * action.visits / total
        best = max(scores, key=scores.get)
        battle.user.last_selected_move = LastUsedMove(battle.user.active.name, best, battle.turn)
        if best.startswith('switch '):
            target = best.split(' ', 1)[1]
            pokemon = next(p for p in battle.user.reserve if p.name == target)
            choice = f'switch {pokemon.index}'
        else:
            moves = request.get('active', [{}])[0].get('moves', [])
            index = next(i + 1 for i, m in enumerate(moves) if m['id'] == best or (best.startswith('hiddenpower') and m['id'].startswith('hiddenpower')))
            choice = f'move {index}'
        print(json.dumps({'choice': choice, 'visits': visits, 'hypotheses': hypotheses, 'actions': scores, 'identity': getattr(getattr(battle,'roman_tracker',None),'current',None), **({'diagnostic': diagnostic} if diagnostic is not None else {})}), flush=True)

if __name__ == '__main__':
    main()
