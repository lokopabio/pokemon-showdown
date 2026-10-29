"""JSON-lines adapter; accepts only own requests and player-visible battle logs."""
import json
import os
import sys

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

def main():
    battle = None
    for line in sys.stdin:
        message = json.loads(line)
        request = message['request']
        if request.get('wait'):
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
        battle.msg_list = [event for event in message['events'] if not (first and event.startswith('|switch|' + battle.user.name))]
        process_battle_updates(battle)
        battle.user.update_from_request_json(request)
        battle.request_json = request
        battle.rqid = request.get('rqid', 0)
        battle.force_switch = bool(request.get('forceSwitch'))
        sampled, _ = prepare_battles(battle, 1)[0]
        state = battle_to_poke_engine_state(sampled)
        result = monte_carlo_tree_search(state, int(os.environ.get('ROMAN_SEARCH_MS', '10')), threads=1)
        best = max(result.side_one, key=lambda action: action.visits).move_choice
        battle.user.last_selected_move = LastUsedMove(battle.user.active.name, best, battle.turn)
        if best.startswith('switch '):
            target = best.split(' ', 1)[1]
            pokemon = next(p for p in battle.user.reserve if p.name == target)
            choice = f'switch {pokemon.index}'
        else:
            moves = request.get('active', [{}])[0].get('moves', [])
            index = next(i + 1 for i, m in enumerate(moves) if m['id'] == best or (best.startswith('hiddenpower') and m['id'].startswith('hiddenpower')))
            choice = f'move {index}'
        print(json.dumps({'choice': choice, 'visits': result.total_visits}), flush=True)

if __name__ == '__main__':
    main()
