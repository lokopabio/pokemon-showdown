"""Run from the prepared Foul Play checkout with ROMAN_METAGAME_BANK set."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path.cwd()))
from fp.config import FoulPlayConfig
FoulPlayConfig.pokemon_format = 'gen7ou'
from fp.data.mods.apply_mods import apply_gen_7_mods
apply_gen_7_mods()
from fp.battle.state import Pokemon
from fp.data.sets.roman_bank import bank_sets, BankTeams, BankPriors, sample_bank_pokemon
from fp.format_spec import FormatSpec
from fp.generations import current_generation_mechanics

class BankTests(unittest.TestCase):
    def test_initialization_never_fetches_standard_usage(self):
        with patch('requests.get', side_effect=AssertionError('Unexpected external usage request')):
            teams = BankTeams()
            priors = BankPriors()
            teams.initialize(FormatSpec.from_format_string('gen7ou'), set())
            priors.initialize(FormatSpec.from_format_string('gen7ou'), set())
            teams.add_new_pokemon('carlis')
            priors.add_new_pokemon('carlis')
        self.assertGreaterEqual(len(teams.pkmn_sets), 6)
        self.assertEqual(set(teams.pkmn_sets), set(priors.all_pkmn_counts))
        self.assertFalse(current_generation_mechanics().has_team_preview)
        self.assertFalse(current_generation_mechanics().megas_exist)

    def test_sampling_preserves_revealed_ability_item_move_and_pp(self):
        name = next(iter(bank_sets()))
        candidate = bank_sets()[name][0]
        pokemon = Pokemon(name, 100)
        pokemon.ability = candidate.pkmn_set.ability
        pokemon.item = candidate.pkmn_set.item
        move = candidate.pkmn_moveset.moves[0]
        pokemon.add_move(move)
        pokemon.moves[0].current_pp = 1
        sample_bank_pokemon(pokemon)
        self.assertEqual(pokemon.ability, candidate.pkmn_set.ability)
        self.assertEqual(pokemon.item, candidate.pkmn_set.item)
        self.assertEqual(pokemon.get_move(move).current_pp, 1)

    def test_contradictory_hypotheses_are_not_silently_used(self):
        pokemon = Pokemon(next(iter(bank_sets())), 100)
        pokemon.ability = 'notarealability'
        with self.assertRaisesRegex(ValueError, 'No compatible'):
            sample_bank_pokemon(pokemon)
        self.assertEqual(pokemon.ability, 'notarealability')

if __name__ == '__main__':
    unittest.main()
