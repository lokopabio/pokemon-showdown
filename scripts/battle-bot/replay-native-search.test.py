import importlib.util
import unittest
from pathlib import Path
from types import SimpleNamespace
spec=importlib.util.spec_from_file_location('replay',Path(__file__).with_name('replay-native-search.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class ReplayTests(unittest.TestCase):
 def test_fixed_samples_fresh_states_and_budget_splits(self):
  loaded=[];calls=[]
  def factory(value):loaded.append(value);return {'serialized':value}
  def search(state,budget,threads):
   calls.append((state.copy(),budget,threads));state.clear()
   return SimpleNamespace(side_one=[SimpleNamespace(move_choice='batonpass',visits=3,total_score=2),SimpleNamespace(move_choice='nightslash',visits=1,total_score=0)])
  rows=module.compare([{'weight':0.25,'nativeState':'one'},{'weight':0.75,'nativeState':'two'}],[30,100,300],2,factory,search)
  self.assertEqual(len(rows),6);self.assertEqual(loaded,['one','two']*6)
  self.assertEqual([c[1] for c in calls],[15]*4+[50]*4+[150]*4)
  self.assertTrue(all(r['best']=='batonpass' for r in rows));self.assertTrue(all(r['visitWeights']['batonpass']==0.75 for r in rows))
 def test_invalid_samples_fail(self):
  with self.assertRaises(ValueError):module.compare([], [30],1,None,None)
if __name__=='__main__':unittest.main()
