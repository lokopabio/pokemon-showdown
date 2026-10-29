"""Open legal-set hypotheses and public-only appearance identity tracking.

Identity probabilities are explicit structural priors, not calibrated usage rates.
"""
import json
import random
from copy import deepcopy
from functools import lru_cache
from pathlib import Path
from fp.battle.helpers import normalize_name
from fp.data.sets.base import PokemonSet, PokemonMoveset, PredictedPokemonSet
from fp.search.helpers import populate_pkmn_from_set
from fp.data import pokedex

def move_id(name):
    name = normalize_name(name)
    return 'hiddenpower' if name.startswith('hiddenpower') else name

@lru_cache(maxsize=1)
def legal_catalog():
    with (Path(__file__).resolve().parents[1] / 'roman-legal.json').open(encoding='utf-8') as stream:
        return json.load(stream)

def learns(name, moves):
    species = legal_catalog()['species'].get(name)
    return bool(species) and all(move_id(m) in species['moves'] for m in moves)

def generated_hypothesis(pkmn):
    data = legal_catalog()
    species = data['species'].get(pkmn.name)
    if species is None:
        raise ValueError('No legal catalog entry for ' + pkmn.name)
    known = [m.name for m in pkmn.moves if m.name != 'struggle']
    if len(known) > 4 or not learns(pkmn.name, [m for m in known if m not in getattr(pkmn,'roman_copied_moves',[])]) and not getattr(pkmn,'roman_transformed',False):
        raise ValueError('Observed moves conflict with legal learnset for ' + pkmn.name + ': ' + str(known))
    base_ability = pkmn.original_ability or pkmn.ability
    if base_ability and base_ability not in species['abilities'] and not pkmn.original_ability:
        # Explicit changed abilities (Trace etc.) retain original_ability upstream.
        raise ValueError('Observed ability conflicts with legal species: ' + str(base_ability))
    abilities = [a for a in species['abilities'] if a != 'moody' and a in data['nativeAbilities'] and all(move_id(m) in species.get('abilityMoves',{}).get(a,species['moves']) for m in known if m not in getattr(pkmn,'roman_copied_moves',[]))]
    if not abilities:
        raise ValueError('No compatible native ability/move combination for ' + pkmn.name)
    chosen_ability=base_ability or random.choice(abilities)
    ability_pool=species.get('abilityMoves',{}).get(chosen_ability,species['moves'])
    pool = [m for m in ability_pool if data['moves'][m]['native'] and move_id(m) not in {move_id(k) for k in known}]
    if len(pool) < 4 - len(known):
        raise ValueError('Insufficient native moves for ' + pkmn.name)
    moves = known + random.sample(pool, 4 - len(known))
    items = [i['id'] for i in data['items'] if i['native'] and (pkmn.can_have_choice_item or not i['id'].startswith('choice'))]
    item = pkmn.item
    if item in (None, '', 'unknownitem'):
        item = random.choice(items) if item == 'unknownitem' else 'none'
    evs = [0] * 6
    for _ in range(127):
        slot = random.choice([i for i in range(6) if evs[i] < 252])
        evs[slot] += 4
    return PredictedPokemonSet(PokemonSet(ability=chosen_ability,item=item,nature=random.choice(data['natures']),evs=tuple(evs),count=1),PokemonMoveset(moves=tuple(moves)))

def reconcile_history(pkmn):
    """Only separate illegal older evidence that a possible Illusion user can explain."""
    current = set(getattr(pkmn, 'moves_used_since_switch_in', set()))
    if not current or not (pkmn.original_ability or pkmn.ability):
        return
    older = [m for m in pkmn.moves if m.name not in current and m.name != 'struggle']
    illegal = [m for m in older if not learns(pkmn.name, [m.name])]
    if illegal and learns('chemfalse', [m.name for m in illegal]):
        histories = list(getattr(pkmn, 'roman_uncertain_appearances', []))
        histories.append({'apparent_species':pkmn.name,'possible_prior_illusion':True,'moves':[(m.name,m.current_pp) for m in older]})
        pkmn.roman_uncertain_appearances = histories
        pkmn.moves = [m for m in pkmn.moves if m.name in current]
        pkmn.roman_prior_illusion_moves = [m.name for m in older]

def sample_open_pokemon(pkmn, bank_candidates=()):
    reconcile_history(pkmn)
    current = list(getattr(pkmn, 'roman_appearance_moves', [m.name for m in pkmn.moves]))
    probability = getattr(pkmn, 'roman_illusion_probability', None)
    if probability is None:
        probability = 1.0 if not learns(pkmn.name, current) and learns('chemfalse', current) and not (pkmn.original_ability or pkmn.ability) else 0.0
    if pkmn.name != 'chemfalse' and probability and random.random() < probability:
        apparent = pkmn.name
        old_moves = {m.name:deepcopy(m) for m in pkmn.moves}
        pkmn.forme_change('chemfalse')
        pkmn.ability = 'illusion'
        pkmn.original_ability = None
        pkmn.zoroark_disguised_as = apparent
        pkmn.moves = [old_moves[m] for m in current if m in old_moves]
        bank_candidates = ()
    # A finite bank is a proposal distribution, never the legality boundary.
    generated = generated_hypothesis(pkmn)
    compatible = [s for s in bank_candidates if learns(pkmn.name,s.pkmn_moveset.moves)
                  and s.full_set_pkmn_can_have_set(pkmn,speed_check=False,match_item=not getattr(pkmn,'roman_item_changed',False))]
    chosen = deepcopy(random.choice(compatible)) if compatible and random.random() < 0.5 else generated
    populate_pkmn_from_set(pkmn,chosen,source='legal-open-hypothesis')

class AppearanceTracker:
    def __init__(self, prior=0.1):
        self.prior = prior
        self.history = []
        self.current = None
        self.chemfalse_fainted = False
        self.certain_moves = {}

    def before(self, battle, event):
        fields = event.split('|')
        if self.current and any('[from] ability:' in f for f in fields) and any(f.startswith('[of] '+battle.opponent.name+'a:') for f in fields):
            self.current['probability']=0.0
            self.current['confirmed']=True
        if len(fields) < 3 or not fields[2].startswith(battle.opponent.name + 'a:'):
            return
        kind = fields[1]
        if kind in ('switch','drag') and len(fields) > 3:
            if self.current is not None:
                self.history.append(deepcopy(self.current))
            name = normalize_name(fields[3].split(',')[0])
            self.current = {'apparent':name,'moves':[], 'called':[], 'probability':0.0 if self.chemfalse_fainted or name == 'chemfalse' else self.prior,'confirmed':name == 'chemfalse','observations':0}
        if self.current is None:
            return
        if kind == '-transform':
            self.current['transformed']=True
            self.current['probability']=0.0
            self.current['confirmed']=True
        if kind == '-start' and len(fields)>4 and fields[3] in ('Mimic','move: Mimic','Sketch','move: Sketch'):
            self.current.setdefault('copied',[]).append(normalize_name(fields[4]))
        if kind == 'move' and len(fields) > 3:
            mv = normalize_name(fields[3])
            target = 'called' if mv == 'struggle' or any('[from]' in f for f in fields[5:]) else 'moves'
            if mv not in self.current[target]:
                self.current[target].append(mv)
                self.current['observations'] += 1
            moves = [m for m in self.current['moves'] if m not in self.current.get('copied',[])]
            if not self.current['confirmed'] and not self.current.get('transformed'):
                apparent_ok = learns(self.current['apparent'],moves)
                illusion_ok = not self.chemfalse_fainted and learns('chemfalse',moves)
                if not apparent_ok and illusion_ok:
                    self.current['probability'] = 1.0
                elif apparent_ok and not illusion_ok:
                    self.current['probability'] = 0.0
                    self.current['confirmed'] = True
        if kind == '-activate' and any('ability:' in f and 'Illusion' not in f for f in fields[3:]):
            self.current['probability']=0.0
            self.current['confirmed']=True
        if kind == '-ability' and len(fields)>3 and normalize_name(fields[3])!='illusion':
            self.current['probability']=0.0
            self.current['confirmed']=True
        if kind == '-damage' and not any('[from]' in f for f in fields[4:]):
            self.current['direct_damage']=True
        if kind == 'replace' and len(fields)>3:
            name=normalize_name(fields[3].split(',')[0])
            self.current['real']=name
            self.current['probability']=1.0 if name=='chemfalse' else 0.0
            self.current['confirmed']=True
        if kind == 'faint' and (self.current.get('real')=='chemfalse' or self.current['apparent']=='chemfalse'):
            self.chemfalse_fainted=True

    def apply(self,battle):
        if self.current is None or battle.opponent.active is None:
            return
        pkmn=battle.opponent.active
        record=self.current
        if record.get('real')=='chemfalse' or pkmn.name=='chemfalse':
            record['probability']=1.0
        pkmn.roman_copied_moves=list(record.get('copied',[]))
        pkmn.roman_transformed=record.get('transformed',False)
        pkmn.roman_illusion_probability=record['probability']
        pkmn.roman_appearance_moves=list(record['moves'])
        # Current appearance and confirmed earlier appearances are the only hard move evidence.
        # Unresolved old appearances stay in history instead of poisoning future records.
        certain=self.certain_moves.setdefault(pkmn.name,{})
        known={m.name:m for m in pkmn.moves}
        if record['confirmed'] and not record.get('transformed') and (record['probability']==0 or pkmn.name=='chemfalse'):
            for name in record['moves']:
                if name in known and name not in record.get('copied',[]):certain[name]=deepcopy(known[name])
        wanted=set(record['moves'])|set(certain)
        pkmn.moves=[deepcopy(known.get(name,certain.get(name))) for name in wanted if name in known or name in certain]
        if len(pkmn.moves)>4:
            raise ValueError('More than four confirmed moves: '+str({'species':pkmn.name,'record':record,'certain':list(certain),'moves':[m.name for m in pkmn.moves]}))
        # Snapshot is public evidence only and persists for the life of this battle.
        battle.roman_identity_history=self.history

    def finish(self,battle):
        if self.current and self.current.pop('direct_damage',False) and not self.current.get('real'):
            self.current['probability']=0.0
            self.current['confirmed']=True
        self.apply(battle)
