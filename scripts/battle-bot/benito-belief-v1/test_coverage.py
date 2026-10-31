import unittest
from coverage import allocate
class Tests(unittest.TestCase):
 def rows(self):
  return [{'group':('launcher','water'),'ability':'launcher','weight':2,'candidate':'pulse'},
          {'group':('grace','flying'),'ability':'grace','weight':1,'candidate':'air'}]
 def test_apparent_mass_preserved_regardless_of_branch_count(self):
  p=allocate(self.rows(),.1,choose=lambda xs,ws:xs[0])
  self.assertAlmostEqual(sum(x['weight'] for x in p if x['kind']!='disguise'),.9)
  self.assertAlmostEqual(sum(x['weight'] for x in p if x['kind']=='disguise'),.1)
  self.assertEqual({r['candidate'] for r in p if r['kind']!='disguise'},{'pulse','air'})
 def test_confirmed_identity_and_confirmed_disguise(self):
  self.assertFalse(any(r['kind']=='disguise' for r in allocate(self.rows(),0)))
  self.assertEqual(allocate(self.rows(),1),[{'kind':'disguise','weight':1,'candidate':None}])
 def test_remainder_mass_is_not_dropped(self):
  rows=[{'group':str(i),'ability':'same','weight':1,'candidate':i} for i in range(20)]
  p=allocate(rows,.1,max_groups=2,choose=lambda xs,ws:xs[0])
  remainder=next(r for r in p if r['kind']=='apparent-remainder')
  self.assertAlmostEqual(remainder['weight'],.81)
  self.assertAlmostEqual(sum(r['weight'] for r in p),1)
 def test_each_ability_gets_coverage_before_duplicate_ability_groups(self):
  rows=[{'group':str(i),'ability':'common','weight':100,'candidate':i} for i in range(5)]
  rows.append({'group':'rare','ability':'other','weight':1,'candidate':'rare'})
  p=allocate(rows,0,max_groups=2,choose=lambda xs,ws:xs[0])
  self.assertIn('rare',[r['candidate'] for r in p])
 def test_no_bank_keeps_apparent_open_branch(self):
  p=allocate([],.1)
  self.assertEqual(p[0]['kind'],'apparent-open');self.assertEqual(p[0]['weight'],.9)
 def test_invalid_mass_rejected(self):
  with self.assertRaises(ValueError):allocate(self.rows(),float('nan'))
if __name__=='__main__':unittest.main()

class WiringTests(unittest.TestCase):
 def test_prepare_preserves_identity_mass_and_restores_scoped_override(self):
  import types,sys
  from unittest.mock import patch
  from coverage import prepare
  candidates=[types.SimpleNamespace(pkmn_set=types.SimpleNamespace(ability=a,item='choicescarf'),pkmn_moveset=types.SimpleNamespace(moves=[move])) for a,move in [('megalauncher','waterpulse'),('serenegrace','airslash')]]
  active=types.SimpleNamespace(name='apparent',roman_illusion_probability=.1)
  battle=types.SimpleNamespace(opponent=types.SimpleNamespace(active=active))
  opened=types.SimpleNamespace(_belief_stratum='old',bank_compatible=lambda p,c:True,_belief_affinity=lambda p,c:1,
     all_move_json={'waterpulse':{'category':'special','type':'water'},'airslash':{'category':'special','type':'flying'}})
  def native_prepare(battle,count):
   self.assertEqual(count,1);branch=opened._belief_stratum
   candidate=branch['candidate']
   p=types.SimpleNamespace(name='chemfalse' if branch['illusion'] else 'apparent',ability='illusion' if branch['illusion'] else candidate.pkmn_set.ability,item='choicescarf',moves=[])
   return [(types.SimpleNamespace(opponent=types.SimpleNamespace(active=p)),1)]
  modules={'fp.data.sets':types.SimpleNamespace(roman_open=opened),'fp.data.sets.roman_bank':types.SimpleNamespace(bank_sets=lambda:{'apparent':candidates},bank_species_name=lambda n:n)}
  with patch.dict(sys.modules,modules):scenarios,report=prepare(battle,native_prepare)
  self.assertAlmostEqual(sum(w for s,w in scenarios if s.opponent.active.name=='apparent'),.9)
  self.assertAlmostEqual(sum(w for s,w in scenarios if s.opponent.active.name=='chemfalse'),.1)
  self.assertEqual(opened._belief_stratum,'old');self.assertEqual(report['disguiseMass'],.1)
