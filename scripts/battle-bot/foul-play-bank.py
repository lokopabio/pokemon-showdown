"""Custom set hypotheses. These counts are priors, never measured usage rates."""
import json
import logging
import os
import random
from copy import deepcopy, copy
from functools import lru_cache

from fp.battle.helpers import normalize_name
from fp.data.sets.base import PokemonMoveset, PokemonSet, PredictedPokemonSet
from fp.data.sets.team_datasets import TeamDatasets
from fp.data.sets.smogon import SmogonSets
from fp.search.helpers import populate_pkmn_from_set
from fp.data import pokedex
from fp.teams.roman_guard import validate_custom_team

logger = logging.getLogger(__name__)

def bank_species_name(name):
    return normalize_name(pokedex.get(name, {}).get('baseSpecies', name))

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
    pkmn.roman_prior_illusion_moves = []
    bank_name = bank_species_name(pkmn.name)
    probe = copy(pkmn)
    # Trace/Skill Swap changes the current ability, not the set's original ability.
    if pkmn.original_ability:
        probe.ability = pkmn.original_ability
    # Upstream deductions from missing activations assume standard mechanics.
    # Keep explicit reveals hard, but don't eliminate a custom set on these
    # unverified negative inferences (for example, a missed recovery message).
    probe.impossible_items = set()
    probe.impossible_abilities = set()
    changed_item = getattr(pkmn, 'roman_item_changed', False)
    match_item = not changed_item or pkmn.removed_item is not None
    if changed_item and pkmn.removed_item is not None:
        probe.item = pkmn.removed_item
        probe.removed_item = None
    # Custom mechanic speed inference has not been validated; don't treat inferred
    # bounds as hard observations. Revealed moves, items and abilities remain hard.
    remaining = [s for s in bank_sets().get(bank_name, []) if s.full_set_pkmn_can_have_set(probe, speed_check=False, match_item=match_item)]
    source = 'custom-bank-hypothesis'
    if not remaining and probe.ability not in (None, 'illusion'):
        # An earlier undamaged Illusion user can leave moves on its disguise's
        # public record. A later real switch (e.g. Trace activation) must not
        # force those uncertain historical moves into the current species' set.
        current_moves = pkmn.moves_used_since_switch_in
        older = [m for m in probe.moves if m.name not in current_moves]
        historical = copy(probe)
        historical.moves = older
        possible_prior_illusion = older and any(
            s.pkmn_set.ability == 'illusion' and s.pkmn_moveset.makes_sense_on_pkmn(historical)
            for sets in bank_sets().values() for s in sets)
        if possible_prior_illusion:
            current = copy(probe)
            current.moves = [m for m in probe.moves if m.name in current_moves]
            remaining = [s for s in bank_sets().get(bank_name, [])
                         if s.full_set_pkmn_can_have_set(current, speed_check=False, match_item=match_item)]
            if remaining:
                # This object is in a sampled battle copy, not observed memory.
                pkmn.moves = list(current.moves)
                pkmn.roman_prior_illusion_moves = [m.name for m in older]
                source = 'custom-bank-possible-prior-illusion'
    if not remaining and probe.ability in (None, 'illusion'):
        # A move incompatible with the apparent species can be an Illusion clue.
        # This changes only a sampled battle copy, never the observed battle.
        hypotheses = [(name, s) for name, sets in bank_sets().items() for s in sets
                      if s.pkmn_set.ability == 'illusion'
                      and s.full_set_pkmn_can_have_set(probe, speed_check=False, match_item=match_item)]
        if hypotheses:
            name, chosen = random.choice(hypotheses)
            apparent = pkmn.name
            pkmn.forme_change(name)
            pkmn.zoroark_disguised_as = apparent
            logger.info('Custom Illusion hypothesis: apparent=%s possible=%s', apparent, name)
            remaining = [chosen]
    if not remaining:
        # Never replace revealed information with a contradictory bank guess.
        details = {'ability': pkmn.ability, 'original_ability': pkmn.original_ability,
                   'item': pkmn.item, 'removed_item': pkmn.removed_item,
                   'moves': [m.name for m in pkmn.moves], 'impossible_items': sorted(pkmn.impossible_items),
                   'impossible_abilities': sorted(pkmn.impossible_abilities), 'choice_possible': pkmn.can_have_choice_item}
        raise ValueError(f'No compatible custom set hypothesis for {pkmn.name}: {details}')
    populate_pkmn_from_set(pkmn, deepcopy(random.choice(remaining)), source=source)

def reconcile_prior_illusion_history(pkmn):
    if not pkmn.moves or not (pkmn.original_ability or pkmn.ability):
        return
    sampled = deepcopy(pkmn)
    try:
        sample_bank_pokemon(sampled)
    except ValueError:
        return
    ambiguous = set(sampled.roman_prior_illusion_moves)
    if ambiguous:
        histories = list(getattr(pkmn, 'roman_uncertain_appearances', []))
        histories.append({'apparent_species': pkmn.name, 'possible_prior_illusion': True,
                          'moves': [(m.name, m.current_pp) for m in pkmn.moves if m.name in ambiguous]})
        pkmn.roman_uncertain_appearances = histories
        pkmn.moves = [m for m in pkmn.moves if m.name not in ambiguous]
        logger.info('Retained uncertain prior appearance separately for %s: %s', pkmn.name, sorted(ambiguous))

