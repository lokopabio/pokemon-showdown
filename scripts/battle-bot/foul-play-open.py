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
from fp.data import pokedex, all_move_json

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

def compatible_abilities(pkmn):
    data = legal_catalog()
    species = data['species'].get(pkmn.name)
    if species is None:
        raise ValueError('No legal catalog entry for ' + pkmn.name)
    known = [m.name for m in pkmn.moves if m.name != 'struggle']
    copied = set(getattr(pkmn, 'roman_copied_moves', []))
    if len(known) > 4 or not learns(pkmn.name, [m for m in known if m not in copied]):
        raise ValueError('Observed moves conflict with legal learnset for ' + pkmn.name + ': ' + str(known))
    base = pkmn.original_ability or pkmn.ability
    abilities = [a for a in species['abilities'] if a != 'moody' and a in data['nativeAbilities']
                 and (not base or a == base)
                 and all(move_id(m) in species.get('abilityMoves', {}).get(a, species['moves']) for m in known if m not in copied)]
    if not abilities:
        raise ValueError('No compatible native ability/move combination for ' + pkmn.name)
    return data, species, known, abilities

def bank_compatible(pkmn, candidate):
    data, species, known, abilities = compatible_abilities(pkmn)
    ability = candidate.pkmn_set.ability
    return (ability in abilities and learns(pkmn.name, candidate.pkmn_moveset.moves)
            and all(move_id(m) in species.get('abilityMoves', {}).get(ability, species['moves']) for m in candidate.pkmn_moveset.moves)
            and all(data['moves'].get(move_id(m), {}).get('native', False) for m in candidate.pkmn_moveset.moves)
            and candidate.full_set_pkmn_can_have_set(pkmn, speed_check=False,
                match_item=not getattr(pkmn, 'roman_item_changed', False)))

def generated_hypothesis(pkmn, templates=()):
    """Evidence-preserving completion; no uniform move/item/EV lottery."""
    data, species, known, abilities = compatible_abilities(pkmn)
    # A nearby supplied set provides correlated item/spread/move context even
    # when a newly revealed move rules out an exact bank match.
    plausible = [t for t in templates if t.pkmn_set.ability in abilities]
    def overlap(t):
        return len({move_id(m) for m in known} & {move_id(m) for m in t.pkmn_moveset.moves})
    if plausible:
        best = max(overlap(t) for t in plausible)
        template = deepcopy(random.choice([t for t in plausible if overlap(t) == best]))
        ability = template.pkmn_set.ability
    else:
        template = None
        harmful = {'truant', 'slowstart', 'defeatist', 'stall', 'klutz', 'honeygather', 'illuminate', 'runaway', 'healer', 'friendguard', 'telepathy', 'symbiosis'}
        ability = random.choice([a for a in abilities if a not in harmful] or abilities)
    pool = [m for m in species.get('abilityMoves', {}).get(ability, species['moves']) if data['moves'][m]['native']]
    selected = list(known)
    # Never retain an unobserved move requiring a condition that this completion
    # does not supply. Observed unusual moves remain hard evidence.
    setup_physical = {'swordsdance', 'bulkup', 'dragondance', 'coil', 'curse'}
    setup_special = {'nastyplot', 'calmmind', 'quiverdance', 'geomancy', 'tailglow'}
    utility = {'recover', 'roost', 'slackoff', 'softboiled', 'milkdrink', 'shoreup', 'synthesis', 'stealthrock', 'spikes', 'toxicspikes', 'stickyweb', 'defog', 'rapidspin', 'taunt', 'encore', 'toxic', 'willowisp', 'thunderwave', 'spore', 'leechseed', 'protect', 'substitute', 'batonpass', 'strengthsap', 'partingshot'}
    physical = any(m in setup_physical for m in known) or not any(m in setup_special for m in known) and species['stats']['atk'] >= species['stats']['spa']
    category = 'Physical' if physical else 'Special'
    def eligible(m):
        meta = all_move_json.get(m, {})
        if meta.get('flags', {}).get('charge') or meta.get('flags', {}).get('recharge'):
            return False
        if m in {'belch', 'lastresort', 'dreameater', 'snore', 'sleeptalk', 'focuspunch', 'bide', 'counter', 'mirrorcoat', 'fling', 'synchronoise', 'shelltrap', 'trickroom', 'selfdestruct', 'explosion', 'finalgambit'}:
            return False
        if m in setup_physical | setup_special:
            return False  # setup plans require an existing supplied template or observation
        return data['moves'][m]['category'] != 'Status' or m in utility
    if template:
        for m in template.pkmn_moveset.moves:
            if m in pool and move_id(m) not in {move_id(k) for k in selected} and len(selected) < 4:
                # Complete supplied combinations can carry their own prerequisites.
                selected.append(m)
    def merit(m):
        meta = data['moves'][m]
        if meta['category'] == 'Status':
            return 25 if m in utility else 0
        accuracy = all_move_json.get(m, {}).get('accuracy', 100)
        accuracy = accuracy if isinstance(accuracy, (int, float)) and not isinstance(accuracy, bool) else 100
        return meta.get('power', 0) * accuracy / 100 * (1.5 if meta['type'] in species['types'] else 1) * (1 if meta['category'] == category else 0.5)
    remaining = [m for m in pool if eligible(m) and move_id(m) not in {move_id(k) for k in selected}]
    def marginal(m):
        meta = data['moves'][m]
        redundant = meta['category'] != 'Status' and any(
            data['moves'].get(move_id(k), {}).get('type') == meta['type'] and
            data['moves'].get(move_id(k), {}).get('category') == meta['category'] for k in selected)
        return merit(m) * (0.25 if redundant else 1)
    while len(selected) < 4 and remaining:
        move = max(remaining, key=marginal)
        selected.append(move)
        remaining.remove(move)
    # Full learnsets remain available if a species has no ordinary completion.
    for m in pool:
        if len(selected) >= 4:
            break
        if move_id(m) not in {move_id(k) for k in selected}:
            selected.append(m)
    if len(selected) != 4:
        raise ValueError('Insufficient native moves for ' + pkmn.name)
    categories = [data['moves'].get(move_id(m), {}).get('category') for m in selected]
    item = pkmn.item
    if item == 'unknownitem':
        item = template.pkmn_set.item if template else {'poisonheal':'toxicorb', 'guts':'flameorb', 'quickfeet':'toxicorb', 'harvest':'sitrusberry', 'gluttony':'sitrusberry', 'unburden':'sitrusberry', 'klutz':'none'}.get(ability, 'lifeorb' if categories.count('Status') < 2 else 'leftovers')
        if item.startswith('choice') and (not pkmn.can_have_choice_item or 'Status' in categories and not all(m in {'trick', 'switcheroo', 'healingwish', 'memento'} or data['moves'].get(move_id(m), {}).get('category') != 'Status' for m in selected)):
            item = 'leftovers'
        if item == 'assaultvest' and 'Status' in categories:
            item = 'leftovers'
    elif item in (None, ''):
        item = 'none'
    if template:
        nature, evs = template.pkmn_set.nature, template.pkmn_set.evs
    else:
        evs = [0] * 6
        evs[1 if physical else 3] = 252
        evs[5 if species['stats']['spe'] >= 70 else 0] = 252
        evs[4] = 4
        nature = ('jolly' if physical else 'timid') if species['stats']['spe'] >= 70 else ('adamant' if physical else 'modest')
    return PredictedPokemonSet(PokemonSet(ability=ability, item=item, nature=nature, evs=tuple(evs), count=1), PokemonMoveset(moves=tuple(selected)))

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
    # Transform/Imposter copies the active opponent's battle state, not its origin
    # species' legal set. Upstream protocol handling already copied stats, types,
    # ability and moves with 5 PP; resampling would destroy that public evidence.
    if getattr(pkmn, 'roman_transformed', False) or 'transform' in getattr(pkmn, 'volatile_statuses', []):
        return
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
    # Exact compatible supplied sets are the prior. Unknown observations open
    # a coherent completion; they never get discarded merely for being unbanked.
    compatible = [candidate for candidate in bank_candidates if not getattr(candidate, 'roman_generated', False) and bank_compatible(pkmn, candidate)]
    if compatible:
        chosen = deepcopy(random.choice(compatible))
        source = 'compatible-bank'
    else:
        chosen = generated_hypothesis(pkmn, bank_candidates)
        source = 'evidence-completion'
    populate_pkmn_from_set(pkmn, chosen, source=source)
    pkmn.roman_hypothesis_source = source
    pkmn.roman_compatible_bank_count = len(compatible)

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
        if record.get('transformed'):
            # Preserve all publicly copied moves, including those not used yet.
            battle.roman_identity_history=self.history
            return
        # Current appearance and confirmed earlier appearances are the only hard move evidence.
        # Unresolved old appearances stay in history instead of poisoning future records.
        certain=self.certain_moves.setdefault(pkmn.name,{})
        known={m.name:m for m in pkmn.moves}
        if record['confirmed'] and not record.get('transformed') and (record['probability']==0 or pkmn.name=='chemfalse'):
            for name in record['moves']:
                if name in known and name not in record.get('copied',[]):certain[name]=deepcopy(known[name])
        # A certain disguise is a different identity: keep the real species'
        # confirmed history, but do not attach it to this appearance.
        disguised = record['probability'] == 1.0 and pkmn.name != 'chemfalse'
        wanted=set(record['moves']) | (set() if disguised else set(certain))
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
