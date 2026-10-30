"""Dependency-free tests execute actual inference functions against small fixtures."""
import ast
import random
import unittest
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace as NS

class Predicted:
    def __init__(self,pkmn_set,pkmn_moveset):self.pkmn_set,self.pkmn_moveset=pkmn_set,pkmn_moveset
    def full_set_pkmn_can_have_set(self,p,speed_check=False,match_item=True):
        return (not p.ability or self.pkmn_set.ability==(p.original_ability or p.ability)) and all(m.name in self.pkmn_moveset.moves for m in p.moves) and (not match_item or p.item=='unknownitem' or self.pkmn_set.item==p.item)

class InferenceTests(unittest.TestCase):
    def setUp(self):
        moves={'icebeam':('Special',90,'ice'),'fireblast':('Special',110,'fire'),'recover':('Status',0,'normal'),'taunt':('Status',0,'dark'),'surf':('Special',90,'water'),'watergun':('Special',40,'water'),'cut':('Physical',50,'normal'),'belch':('Special',120,'poison')}
        self.data={'species':{'xristian':{'moves':list(moves),'abilityMoves':{'flashfire':list(moves),'mummy':['icebeam','recover','taunt','cut']},'abilities':['flashfire','mummy'],'stats':{'atk':50,'spa':100,'spe':100},'types':['ice','fire']}},'moves':{m:{'native':True,'category':c,'power':p,'type':t}for m,(c,p,t)in moves.items()},'nativeAbilities':['flashfire','mummy']}
        def populate(p,chosen,source):
            pp={m.name:m.current_pp for m in p.moves};p.moves=[NS(name=m,current_pp=pp.get(m,16))for m in chosen.pkmn_moveset.moves];p.selected=chosen;p.source=source
        env={'deepcopy':deepcopy,'random':random.Random(42),'legal_catalog':lambda:self.data,'move_id':lambda m:m,'learns':lambda name,moves:all(m in self.data['species'][name]['moves']for m in moves),'all_move_json':{},'PokemonSet':NS,'PokemonMoveset':NS,'PredictedPokemonSet':Predicted,'reconcile_history':lambda p:None,'populate_pkmn_from_set':populate}
        tree=ast.parse(Path(__file__).with_name('foul-play-open.py').read_text());names={'compatible_abilities','bank_compatible','generated_hypothesis','sample_open_pokemon'}
        exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),'<actual inference>','exec'),env);self.env=env
    def pokemon(self,moves=(),ability=None,item='unknownitem'):
        return NS(name='xristian',moves=[NS(name=m,current_pp=2)for m in moves],ability=ability,original_ability=None,item=item,can_have_choice_item=True)
    def template(self,moves=('icebeam','fireblast','recover','taunt')):
        return Predicted(NS(ability='flashfire',item='leftovers',nature='timid',evs=(4,0,0,252,0,252),count=1),NS(moves=moves))
    def test_compatible_bank_always_preferred_without_random_completion(self):
        self.env['generated_hypothesis']=lambda *a:(_ for _ in ()).throw(AssertionError('Unexpected open completion'))
        for _ in range(30):
            p=self.pokemon();self.env['sample_open_pokemon'](p,[self.template()]);self.assertEqual(p.source,'compatible-bank');self.assertEqual(p.selected.pkmn_set.item,'leftovers')
    def test_unbanked_move_kept_with_pp_item_and_ability(self):
        p=self.pokemon(['surf'],ability='flashfire',item='lifeorb');self.env['sample_open_pokemon'](p,[self.template()]);self.assertEqual(p.source,'evidence-completion');self.assertEqual(p.moves[0].name,'surf');self.assertEqual(p.moves[0].current_pp,2);self.assertEqual(p.selected.pkmn_set.item,'lifeorb');self.assertEqual(p.selected.pkmn_set.ability,'flashfire')
    def test_unknown_species_completion_is_coherent_not_uniform_lottery(self):
        p=self.pokemon(ability='flashfire');candidate=self.env['generated_hypothesis'](p);self.assertNotIn('belch',candidate.pkmn_moveset.moves);self.assertNotIn('watergun',candidate.pkmn_moveset.moves);self.assertEqual(candidate.pkmn_set.item,'lifeorb');self.assertEqual(candidate.pkmn_set.evs,(0,0,0,252,4,252))
    def test_ability_move_legality_cannot_be_overridden_by_bank(self):
        p=self.pokemon(['surf'],ability='mummy')
        with self.assertRaises(ValueError):self.env['sample_open_pokemon'](p,[self.template()])
    def test_synthetic_seed_not_reported_as_supplied_bank(self):
        t=self.template();t.roman_generated=True;p=self.pokemon();self.env['sample_open_pokemon'](p,[t]);self.assertEqual(p.source,'evidence-completion')
if __name__=='__main__':unittest.main()
