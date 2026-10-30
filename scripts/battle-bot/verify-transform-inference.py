"""Dependency-free regression tests for the open inference Transform boundary."""
import ast
import unittest
from pathlib import Path
from types import SimpleNamespace
from copy import deepcopy

source = ast.parse(Path(__file__).with_name('foul-play-open.py').read_text())
# Load the actual inference/tracker definitions with deliberately failing samplers.
def forbidden(*args, **kwargs):
    raise AssertionError('Transformed state must not be sampled as its origin species')
namespace = {'deepcopy': deepcopy, 'reconcile_history': forbidden,
             'generated_hypothesis': forbidden, 'populate_pkmn_from_set': forbidden}
module = ast.Module(body=[n for n in source.body if isinstance(n, (ast.FunctionDef, ast.ClassDef))
                         and n.name in ('sample_open_pokemon', 'AppearanceTracker')], type_ignores=[])
exec(compile(module, '<actual inference functions>', 'exec'), namespace)

class TransformTests(unittest.TestCase):
    def test_sampling_retains_copied_state_for_imposter_and_transform(self):
        for species in ('fonsomate', 'ferdditto', 'carlis'):
            for flags in ({'roman_transformed': True}, {'volatile_statuses': ['transform']}):
                mon = SimpleNamespace(name=species, moves=['icebeam', 'fireblast', 'recover', 'thunder'],
                                      stats={'attack': 300}, types=['ice'], ability='flashfire', item='choicescarf', hp=123, **flags)
                before = deepcopy(vars(mon))
                namespace['sample_open_pokemon'](mon)
                self.assertEqual(vars(mon), before)

    def test_tracker_preserves_copied_moves_without_committing_origin_learnset(self):
        tracker = namespace['AppearanceTracker']()
        tracker.current = {'apparent': 'fonsomate', 'moves': ['icebeam'], 'transformed': True,
                           'probability': 0.0, 'confirmed': True}
        moves = [SimpleNamespace(name=name, current_pp=5) for name in ('icebeam', 'fireblast', 'recover', 'thunder')]
        mon = SimpleNamespace(name='fonsomate', moves=moves)
        battle = SimpleNamespace(opponent=SimpleNamespace(active=mon))
        tracker.apply(battle)
        self.assertEqual(mon.moves, moves)
        self.assertEqual(tracker.certain_moves, {})
        self.assertTrue(mon.roman_transformed)

if __name__ == '__main__':
    unittest.main()
