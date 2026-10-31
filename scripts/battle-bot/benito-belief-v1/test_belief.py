import unittest
from belief import affinity, choose_action
from review import frames
class Tests(unittest.TestCase):
 def test_effects_not_species(self):
  moves={'waterpulse':{'flags':{'pulse':1}},'aurasphere':{'flags':{'pulse':1}}}
  self.assertEqual(affinity('megalauncher',['waterpulse'],moves),1.5)
  self.assertEqual(affinity('serenegrace',['waterpulse'],moves),1)
  self.assertEqual(affinity('megalauncher',[],moves),1)
 def test_weighted_scenarios(self):
  samples=[{'weight':w,'actions':[{'action':a,'visits':10,'totalScore':v*10} for a,v in rows]} for w,rows in [(0.5,[('risky',1),('safe',.6)]),(.5,[('risky',.3),('safe',.6)])]]
  best,values=choose_action(samples,['risky','safe'])
  self.assertEqual(best,'safe');self.assertAlmostEqual(values['risky']['mean'],.65)
 def test_missing_unvisited_and_illegal(self):
  s=[{'weight':1,'actions':[{'action':'good','visits':1,'totalScore':.5},{'action':'illegal','visits':1,'totalScore':1}]}]
  self.assertEqual(choose_action(s,['good'])[0],'good')
  with self.assertRaises(ValueError):choose_action(s,['missing'])
 def test_nan_rejected(self):
  with self.assertRaises(ValueError):choose_action([{'weight':1,'actions':[{'action':'x','visits':1,'totalScore':float('nan')}]}],['x'])
 def test_public_frames(self):
  s='|turn|1\n|request|{"rqid":3}\n|botsearch|{}\n|botchoice|3|move 1\n|move|p1a: X|Surf|p2a: Y\n|request|{"wait":true}\n'
  f=list(frames(s));self.assertEqual(f[0]['playedChoice'],'move 1');self.assertNotIn('|botsearch|{}',f[0]['events']);self.assertTrue(f[1]['request']['wait'])
if __name__=='__main__':unittest.main()

class EvidenceTests(unittest.TestCase):
 def test_exact_and_censored_damage(self):
  from evidence import interval_match
  self.assertTrue(interval_match([44,45,46],100,55))
  self.assertFalse(interval_match([44,45,46],100,53))
  self.assertTrue(interval_match([44,45,46],30,0))
 def test_clean_move_order_and_damage(self):
  from evidence import extract
  e=['|move|p1a: Airrivas|Acrobatics|p2a: Ladesaurio','|-damage|p2a: Ladesaurio|58/351','|move|p2a: Ladesaurio|Dragon Rush|p1a: Airrivas']
  r=extract(e,'p2','p1',307)
  self.assertFalse(r['ownFirst']);self.assertEqual(r['afterHP'],58)
  self.assertIsNone(extract(e+['|-crit|p2a: Ladesaurio'],'p2','p1',307))
  self.assertIsNone(extract(e+['|switch|p1a: Airrivas|Airrivas|100/100'],'p2','p1',307))
 def test_residual_damage_not_attack_evidence(self):
  from evidence import extract
  e=['|move|p1a: X|Toxic|p2a: Y','|move|p2a: Y|Tackle|p1a: X','|-damage|p2a: Y|80/100|[from] psn']
  self.assertIsNone(extract(e,'p2','p1',100))
 def test_recovery_before_hit_uses_recovered_hp(self):
  from evidence import extract
  e=['|move|p2a: Q|Recover|p2a: Q','|-heal|p2a: Q|240/297','|move|p1a: M|Moonblast|p2a: Q','|-damage|p2a: Q|60/297']
  r=extract(e,'p2','p1',92)
  self.assertEqual(r['beforeHP']-r['afterHP'],180)
 def test_boost_after_hit_does_not_change_damage_context(self):
  from evidence import extract
  e=['|move|p1a: A|Acrobatics|p2a: L','|-damage|p2a: L|58/351','|move|p2a: L|Coil|p2a: L','|-boost|p2a: L|def|1']
  r=extract(e,'p2','p1',307)
  self.assertIsNotNone(r);self.assertFalse(r['orderStable'])
 def test_leftovers_after_damage_preserves_observation(self):
  from evidence import extract
  e=['|move|p1a: A|Acrobatics|p2a: L','|-damage|p2a: L|58/351','|move|p2a: L|Coil|p2a: L','|-boost|p2a: L|def|1','|-heal|p2a: L|79/351|[from] item: Leftovers']
  r=extract(e,'p2','p1',307)
  self.assertEqual(r['beforeHP']-r['afterHP'],249)
 def test_native_check_accepts_lowercase_move_categories(self):
  import types,sys
  from unittest.mock import patch
  from evidence import Evidence
  actor=lambda name:types.SimpleNamespace(name=name,hp=100,max_hp=100,boosts={},volatile_statuses=[],status=None,item='none',ability='airlock')
  own=actor('own');opponent=actor('opponent')
  context=types.SimpleNamespace(user=types.SimpleNamespace(active=own,side_conditions={}),opponent=types.SimpleNamespace(active=opponent,reserve=[],side_conditions={}),weather=None,field=None,get_effective_speed=lambda side:100)
  evidence=Evidence();evidence.records=[{'species':'opponent','context':context,'ownMove':'tackle','opponentMove':'acrobatics','ownFirst':True,'orderStable':True,'beforeHP':100,'afterHP':55}]
  modules={'fp.search.poke_engine_helpers':types.SimpleNamespace(battle_to_poke_engine_state=lambda c:c),'fp.data':types.SimpleNamespace(all_move_json={'tackle':{'category':'physical','priority':0},'acrobatics':{'category':'physical','basePower':55,'priority':0}}),'poke_engine':types.SimpleNamespace(calculate_damage=lambda *args:([1,2],[46,69]))}
  with patch.dict(sys.modules,modules):
   checks=evidence.check(context)
  self.assertEqual(len(checks),1);self.assertTrue(checks[0]['damageCompatible']);self.assertTrue(checks[0]['speedCompatible'])

 def test_native_maximum_pair_is_not_a_roll_list(self):
  from evidence import native_damage_envelope
  self.assertTrue(native_damage_envelope([258,387],307,58)['damageCompatible'])
  self.assertFalse(native_damage_envelope([129,193],307,58)['damageCompatible'])
  self.assertFalse(native_damage_envelope([258,387],400,90)['damageCompatible'])
  self.assertTrue(native_damage_envelope([258,387],79,0)['damageCompatible'])
  with self.assertRaises(ValueError):native_damage_envelope([258],307,58)
