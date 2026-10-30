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
