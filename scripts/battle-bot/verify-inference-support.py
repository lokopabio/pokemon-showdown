"""Runs actual sampler/likelihood function bodies without native engine imports."""
import argparse
import ast
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

SOURCE = None


def functions(source):
    tree = ast.parse(source)
    names = {'predict_team_likelihood', 'sample_standardbattle_pokemon'}
    nodes = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
    if len(nodes) != 2:
        raise ValueError('Sampler function definitions missing')
    return compile(ast.fix_missing_locations(ast.Module(body=nodes, type_ignores=[])), '<actual-sampler-functions>', 'exec')


class Picker:
    def __init__(self):
        self.seen = []

    def choices(self, keys, weights):
        self.seen = list(keys)
        # Deterministically expose the tail of the actual candidate population.
        return [keys[-1]]


class Pokemon:
    def __init__(self, name, level=100):
        self.name = name
        self.level = level


def sample(source, counts, revealed=()):
    picker = Picker()
    namespace = {'RAW_COUNT': 'raw_count', 'TEAMMATES': 'teammates', 'random': picker,
                 'Pokemon': Pokemon, 'sample_pokemon': lambda p, mode: None}
    fake = types.ModuleType('fp.data.sets.roman_bank')
    fake.bank_species_name = lambda name: name
    with patch.dict(sys.modules, {'fp.data.sets.roman_bank': fake}):
        exec(functions(source), namespace)
        mode = types.SimpleNamespace(smogon_sets=types.SimpleNamespace(all_pkmn_counts=counts))
        result = namespace['sample_standardbattle_pokemon']([Pokemon(n) for n in revealed], mode)
    return result, picker.seen


def priors(n=115):
    names = [f'mon{i:03d}' for i in range(n)]
    return {name: {'raw_count': 1, 'teammates': {other: 1 for other in names if other != name}} for name in names}


class Tests(unittest.TestCase):
    def test_tail_species_is_reachable(self):
        p, population = sample(SOURCE, priors())
        self.assertEqual(len(population), 115)
        self.assertEqual(p.name, 'mon114')

    def test_revealed_species_excluded_without_truncating_remaining_support(self):
        p, population = sample(SOURCE, priors(), ['mon000','mon114'])
        self.assertEqual(len(population), 113)
        self.assertNotIn('mon000', population)
        self.assertNotIn('mon114', population)
        self.assertEqual(p.name, 'mon113')

    def test_insertion_order_does_not_change_candidate_support(self):
        counts = priors()
        _, a = sample(SOURCE, counts)
        _, b = sample(SOURCE, dict(reversed(list(counts.items()))))
        self.assertEqual(set(a), set(b))

    def test_regression_reproduces_original_cutoff(self):
        limited = SOURCE.replace('keys = list(sample_weights.keys())\n', 'keys = list(sample_weights.keys())[:50]\n').replace('values = list(sample_weights.values())\n', 'values = list(sample_weights.values())[:50]\n')
        _, population = sample(limited, priors())
        self.assertEqual(len(population), 50)
        self.assertNotIn('mon114', population)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--foul', default=str(Path.home() / 'roman-foul-play'))
    args = parser.parse_args()
    SOURCE = (Path(args.foul) / 'fp/search/standard_battles.py').read_text(encoding='utf-8')
    unittest.main(argv=[sys.argv[0]])
