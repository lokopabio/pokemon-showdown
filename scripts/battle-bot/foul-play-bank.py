"""Custom set hypotheses. These counts are priors, never measured usage rates."""
import json
import logging
import os
import random
from copy import deepcopy
from functools import lru_cache

from fp.battle.helpers import normalize_name
from fp.data.sets.base import PokemonMoveset, PokemonSet, PredictedPokemonSet
from fp.data.sets.team_datasets import TeamDatasets
from fp.data.sets.smogon import SmogonSets
from fp.search.helpers import populate_pkmn_from_set
from fp.teams.roman_guard import validate_custom_team

logger = logging.getLogger(__name__)

@lru_cache(maxsize=1)
def bank_sets():
    with open(os.environ['ROMAN_METAGAME_BANK'], encoding='utf-8') as stream:
        bank = json.load(stream)
    if bank.get('schema') != 1 or bank.get('format') != 'gen7ou':
        raise ValueError('Expected schema 1 Gen 7 OU metagame bank')
    records = [r.get('set', r) for r in bank['sets']]
    records += [s for r in bank.get('teams', []) for s in (r.get('team', []) if isinstance(r, dict) else r)]
    result = {}
    seen = set()
    for s in records:
        try:
            validate_custom_team([s] * 6)
        except ValueError:
            continue
        name = normalize_name(s['species'])
        ability = normalize_name(s['ability'])
        item = normalize_name(s.get('item') or 'none')
        # Benchmark bots don't use Moody or transformations; retain no unsupported guesses.
        if ability == 'moody' or '-mega' in s['species'].lower():
            continue
        moves = tuple(normalize_name(m) for m in s['moves'])
        evs = tuple(s.get('evs', {}).get(k, 0) for k in ('hp','atk','def','spa','spd','spe'))
        key = (name, ability, item, normalize_name(s.get('nature', 'Serious')), evs, moves)
        if key in seen:
            continue
        seen.add(key)
        predicted = PredictedPokemonSet(
            pkmn_set=PokemonSet(ability=ability, item=item, nature=key[3], evs=evs, count=1),
            pkmn_moveset=PokemonMoveset(moves=moves),
        )
        result.setdefault(name, []).append(predicted)
    if len(result) < 6:
        raise ValueError('Need hypotheses for at least six species')
    return result

class BankTeams(TeamDatasets):
    def initialize(self, format_spec, pkmn_names):
        if format_spec.full_name != 'gen7ou':
            raise ValueError('Custom bank supports gen7ou only')
        self.pkmn_mode = format_spec.full_name
        self.pkmn_sets = deepcopy(bank_sets())
        self.raw_pkmn_moves = {name: [s.pkmn_moveset for s in sets] for name, sets in self.pkmn_sets.items()}

    def add_new_pokemon(self, pkmn_name):
        pass  # All hypotheses are loaded up front; no external usage downloads.

class BankPriors(SmogonSets):
    def initialize(self, format_spec, pkmn_names):
        self.pkmn_mode = format_spec.full_name
        sets = bank_sets()
        # Positive uniform co-occurrence priors avoid inventing empirical team frequencies.
        self.all_pkmn_counts = {name: {'raw_count': 1, 'teammates': {other: 1 for other in sets if other != name}} for name in sets}
        self.pkmn_sets = {name: [s.pkmn_set for s in values] for name, values in sets.items()}
        self.raw_pkmn_sets = {name: {'moves': [(m, 1) for m in sorted({m for s in values for m in s.pkmn_moveset.moves})]} for name, values in sets.items()}

    def add_new_pokemon(self, pkmn_name):
        pass

    def get_all_remaining_trait_combinations(self, pkmn):
        # Do not relax item/ability constraints when observations contradict every set.
        return [s.pkmn_set for s in bank_sets().get(pkmn.name, []) if s.full_set_pkmn_can_have_set(pkmn)]

def sample_bank_pokemon(pkmn):
    remaining = [s for s in bank_sets().get(pkmn.name, []) if s.full_set_pkmn_can_have_set(pkmn)]
    if not remaining:
        # Never replace revealed information with a contradictory bank guess.
        raise ValueError(f'No compatible custom set hypothesis for {pkmn.name}; add sets to the bank')
    populate_pkmn_from_set(pkmn, deepcopy(random.choice(remaining)), source='custom-bank-hypothesis')

