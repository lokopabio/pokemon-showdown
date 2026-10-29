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

    def test_copied_ability_does_not_erase_original_set_or_current_ability(self):
        name = next(iter(bank_sets()))
        candidate = bank_sets()[name][0]
        pokemon = Pokemon(name, 100)
        pokemon.original_ability = candidate.pkmn_set.ability
        pokemon.ability = 'levitate'
        pokemon.item = candidate.pkmn_set.item
        sample_bank_pokemon(pokemon)
        self.assertEqual(pokemon.ability, 'levitate')
        self.assertEqual(pokemon.original_ability, candidate.pkmn_set.ability)

    def test_custom_illusion_is_only_a_sampled_hypothesis(self):
        from copy import deepcopy
        observed = Pokemon('waynero', 100)
        observed.add_move('triattack')
        sampled = deepcopy(observed)
        sample_bank_pokemon(sampled)
        self.assertEqual(observed.name, 'waynero')
        self.assertEqual(sampled.ability, 'illusion')
        self.assertEqual(sampled.zoroark_disguised_as, 'waynero')
        self.assertIsNotNone(sampled.get_move('triattack'))

    def test_unverified_negative_inferences_do_not_empty_the_bank(self):
        name = next(iter(bank_sets()))
        pokemon = Pokemon(name, 100)
        pokemon.impossible_items = {s.pkmn_set.item for s in bank_sets()[name]}
        pokemon.impossible_abilities = {s.pkmn_set.ability for s in bank_sets()[name]}
        old_items = set(pokemon.impossible_items)
        sample_bank_pokemon(pokemon)
        self.assertEqual(pokemon.impossible_items, old_items)
        self.assertIsNotNone(pokemon.ability)

    def test_switcheroo_item_is_current_state_not_original_set(self):
        from fp.battle.state import Battle
        from fp.battle.protocol import set_item
        battle = Battle('item-test')
        battle.user.name = 'p1'
        battle.opponent.name = 'p2'
        battle.opponent.active = Pokemon('carlis', 100)
        battle.user.active = Pokemon('carletto', 100)
        pokemon = battle.opponent.active
        pokemon.add_move('scald')
        pokemon.add_move('playrough')
        pokemon.can_have_choice_item = False
        set_item(battle, ['', '-item', 'p2a: Carlis', 'Choice Scarf', '[from] move: Switcheroo'])
        sample_bank_pokemon(pokemon)
        self.assertEqual(pokemon.item, 'choicescarf')
        self.assertIsNotNone(pokemon.get_move('scald'))

    def test_own_illusion_keeps_untouched_boosts_at_zero(self):
        import importlib.util
        from fp.battle.state import Battle
        with patch.dict('os.environ', {'ROMAN_FOUL_PLAY': str(Path.cwd())}):
            spec = importlib.util.spec_from_file_location('roman_bridge', Path(__file__).with_name('foul-play-bridge.py'))
            bridge = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(bridge)
        battle = Battle('illusion-test')
        battle.user.active = Pokemon('pajillero', 100)
        battle.user.active.boosts['speed'] = 2
        battle.user.reserve = [Pokemon('chemfalse', 100)]
        bridge.reconcile_own_illusion(battle, {'details': 'Chemfalse, L100', 'ability': 'illusion'})
        self.assertEqual(battle.user.active.name, 'chemfalse')
        self.assertEqual(battle.user.active.boosts['attack'], 0)
        self.assertEqual(battle.user.active.boosts['speed'], 2)
        self.assertEqual(battle.user.reserve[0].boosts['speed'], 0)

    def test_fidbueluna_busted_form_uses_base_set_hypotheses(self):
        pokemon = Pokemon('fidbuelunabusted', 100)
        self.assertEqual(pokemon.name, 'fidbuelunabusted')
        self.assertEqual(pokemon.types, ['rock', 'fairy'])
        sample_bank_pokemon(pokemon)
        self.assertEqual(pokemon.name, 'fidbuelunabusted')
        self.assertEqual(pokemon.ability, 'disguise')

    def test_own_disguise_form_change_reads_current_request(self):
        from fp.battle.state import Battle
        from fp.battle.protocol import form_change
        # Complete minimal own request: no opponent or hidden team information.
        row = {'ident': 'p1: Fidbueluna', 'details': 'Fidbueluna-Busted, F',
               'condition': '175/199', 'active': True,
               'stats': {'atk': 99, 'def': 174, 'spa': 215, 'spd': 175, 'spe': 267},
               'moves': ['geomancy', 'rapidspin', 'moonblast', 'moongeistbeam'],
               'baseAbility': 'disguise', 'ability': 'disguise', 'item': 'powerherb'}
        battle = Battle('disguise-test')
        battle.user.name = 'p1'
        battle.opponent.name = 'p2'
        battle.user.active = Pokemon('fidbueluna', 100)
        battle.request_json = {'side': {'id': 'p1', 'pokemon': [row]}}
        form_change(battle, ['', 'detailschange', 'p1a: Fidbueluna', 'Fidbueluna-Busted, F'])
        self.assertEqual(battle.user.active.name, 'fidbuelunabusted')
        self.assertEqual(battle.user.active.hp, 175)

    def test_busted_form_and_hidden_teammates_share_one_species_slot(self):
        from fp.battle.state import Battle
        from fp.modes.standard_battle import StandardBattleMode
        from fp.search.standard_battles import predict_team_likelihood, populate_standardbattle_unrevealed_pkmn
        from fp.data.sets.roman_bank import bank_species_name
        battle = Battle('busted-hidden-team-test')
        battle.pokemon_format = 'gen7ou'
        battle.generation = 'gen7'
        battle.mode = StandardBattleMode()
        battle.mode.smogon_sets.initialize(battle.format_spec, set())
        battle.mode.team_datasets.initialize(battle.format_spec, set())
        battle.opponent.active = Pokemon('fidbuelunabusted', 100)
        weights = predict_team_likelihood({'fidbuelunabusted'}, battle.mode.smogon_sets.all_pkmn_counts)
        self.assertNotIn('fidbueluna', weights)
        self.assertTrue(all(value > 0 for value in weights.values()))
        populate_standardbattle_unrevealed_pkmn(battle)
        species = [bank_species_name(p.name) for p in [battle.opponent.active] + battle.opponent.reserve]
        self.assertEqual(len(species), 6)
        self.assertEqual(len(set(species)), 6)
        self.assertEqual(species.count('fidbueluna'), 1)
        self.assertEqual(battle.opponent.active.name, 'fidbuelunabusted')

    def test_missing_cooccurrence_data_has_uniform_prior(self):
        from fp.search.standard_battles import predict_team_likelihood
        priors = {'carlis': {'raw_count': 1, 'teammates': {}}, 'carletto': {'raw_count': 1, 'teammates': {}}}
        self.assertEqual(predict_team_likelihood({'unknownspecies'}, priors), {'carlis': 1.0, 'carletto': 1.0})

    def test_trace_after_possible_prior_illusion_keeps_current_reveals(self):
        from copy import deepcopy
        observed = Pokemon('habiemigo', 100)
        observed.ability = 'snowwarning'
        observed.original_ability = 'trace'
        observed.can_have_choice_item = False
        for move in ['lightscreen', 'spore', 'batonpass', 'psychic']:
            observed.add_move(move)
        observed.moves_used_since_switch_in = {'psychic'}
        observed.get_move('psychic').current_pp = 7
        sampled = deepcopy(observed)
        sample_bank_pokemon(sampled)
        self.assertEqual(sampled.ability, 'snowwarning')
        self.assertEqual(sampled.original_ability, 'trace')
        self.assertIsNotNone(sampled.get_move('psychic'))
        self.assertEqual(sampled.get_move('psychic').current_pp, 7)
        self.assertIsNone(sampled.get_move('spore'))
        self.assertEqual([m.name for m in observed.moves], ['lightscreen', 'spore', 'batonpass', 'psychic'])

    def test_current_appearance_moves_cannot_be_discarded_as_prior_illusion(self):
        observed = Pokemon('habiemigo', 100)
        observed.ability = 'snowwarning'
        observed.original_ability = 'trace'
        for move in ['lightscreen', 'spore', 'batonpass']:
            observed.add_move(move)
        observed.moves_used_since_switch_in = {'spore', 'batonpass'}
        with self.assertRaisesRegex(ValueError, 'No compatible'):
            sample_bank_pokemon(observed)

    def test_trace_reveal_separates_disguised_appearance_before_damage_inference(self):
        from fp.battle.state import Battle
        from fp.battle.protocol import update_ability
        battle = Battle('trace-prior-illusion')
        battle.user.name = 'p1'
        battle.opponent.name = 'p2'
        battle.user.active = Pokemon('tholmas', 100)
        pokemon = Pokemon('habiemigo', 100)
        for move in ['lightscreen', 'spore', 'batonpass', 'psychic']:
            pokemon.add_move(move)
        pokemon.moves_used_since_switch_in = {'psychic'}
        battle.opponent.active = pokemon
        update_ability(battle, ['', '-ability', 'p2a: Habiemigo', 'Snow Warning', '[from] ability: Trace', '[of] p1a: Tholmas'])
        self.assertEqual(pokemon.ability, 'snowwarning')
        self.assertEqual(pokemon.original_ability, 'trace')
        self.assertEqual([m.name for m in pokemon.moves], ['psychic'])
        self.assertEqual([name for name, pp in pokemon.roman_uncertain_appearances[0]['moves']], ['lightscreen', 'spore', 'batonpass'])
        sample_bank_pokemon(pokemon)
        self.assertIsNotNone(pokemon.get_move('psychic'))

if __name__ == '__main__':
    unittest.main()
