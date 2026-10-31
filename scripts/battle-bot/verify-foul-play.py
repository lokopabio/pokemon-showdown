"""Run from a prepared Foul Play checkout: python /path/to/verify-foul-play.py."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path.cwd()))
from fp.config import FoulPlayConfig

FoulPlayConfig.pokemon_format = 'gen7ou'
from fp.data.mods.apply_mods import apply_gen_7_mods

apply_gen_7_mods()
from fp.battle.state import Pokemon
from fp.data import pokedex
from fp.teams.roman_guard import ALLOWED, validate_custom_team

for name in ALLOWED:
    pokemon = Pokemon(name, 100)
    assert pokemon.name == name
    assert pokemon.types == pokedex[name]['types']
    assert pokemon.max_hp > 0

def accepted(species='Carletto', ability='Prankster', item='Leftovers'):
    try:
        validate_custom_team([dict(species=species, ability=ability, item=item)] * 6)
    except ValueError:
        return False
    return True

assert accepted(ability='Shadow Tag')
assert not accepted(ability='Moody')
assert not accepted(species='Charizard')
assert not accepted(species='Carletto-Mega')
assert not accepted(item='Electrium Z')
assert not accepted(item='Carlisite')
assert 'carletto' in ALLOWED and 'lugamon' in ALLOWED
print(f'PASS: {len(ALLOWED)} species load under Gen 7; Fakemon-only, no-Mega, no-Z, no-Moody guards pass; Shadow Tag allowed')
