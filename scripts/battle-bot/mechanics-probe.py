"""Ground-truth test adapter. This is not a battle policy; both sides are explicit fixtures."""
import json
import sys
from poke_engine import Pokemon, Move, Side, State, VolatileStatusDurations, generate_instructions

def side(row):
    p=row['pokemon'];stats=p['stats'];types=tuple(p['types']+['typeless']*(2-len(p['types'])))
    mon=Pokemon(id=p['id'],level=100,types=types,base_types=types,hp=p['hp'],maxhp=p['maxhp'],ability=p['ability'] or 'none',item=p['item'] or 'none',nature=p['nature'],evs=tuple(p['evs']),attack=stats['atk'],defense=stats['def'],special_attack=stats['spa'],special_defense=stats['spd'],speed=stats['spe'],status=p['status'] or 'none',weight_kg=p['weight'],moves=[Move(id=m['id'],pp=m['pp'],disabled=False) for m in p['moves']])
    boosts=row['boosts']
    durations=VolatileStatusDurations(slowstart=row.get('slowstart',0))
    return Side(pokemon=[mon]+[Pokemon.create_fainted() for _ in range(5)],volatile_statuses=set(row['volatiles']),volatile_status_durations=durations,attack_boost=boosts['atk'],defense_boost=boosts['def'],special_attack_boost=boosts['spa'],special_defense_boost=boosts['spd'],speed_boost=boosts['spe'],accuracy_boost=boosts['accuracy'],evasion_boost=boosts['evasion'],last_used_move=row.get('lastUsed','move:none'),substitute_health=row.get('substitute',0))

def snapshot(side):
    p=side.pokemon[int(str(side.active_index))]
    return {'id':p.id.lower(),'hp':p.hp,'item':p.item.lower(),'status':p.status.lower(),'types':[t.lower() for t in p.types if t.lower()!='typeless'],'boosts':{'atk':side.attack_boost,'def':side.defense_boost,'spa':side.special_attack_boost,'spd':side.special_defense_boost,'spe':side.speed_boost,'accuracy':side.accuracy_boost,'evasion':side.evasion_boost}}

for line in sys.stdin:
    try:
        row=json.loads(line)
        state=State(side_one=side(row['one']),side_two=side(row['two']),weather=row['weather'],terrain=row['terrain'],trick_room=row.get('trickRoom',False))
        outcomes=[]
        for branch in generate_instructions(state,row['moveOne'],row['moveTwo']):
            after=state.apply_instructions(branch)
            outcomes.append({'probability':branch.percentage,'one':snapshot(after.side_one),'two':snapshot(after.side_two),'instructions':[str(i) for i in branch.instruction_list]})
        print(json.dumps({'outcomes':outcomes}),flush=True)
    except BaseException as error:
        print(json.dumps({'error':str(error)}),flush=True)
