"""Exercise actual bridge availability filtering without loading native dependencies."""
import ast
from pathlib import Path
from types import SimpleNamespace
import unittest
source=ast.parse(Path(__file__).with_name('foul-play-bridge.py').read_text())
namespace={}
exec(compile(ast.Module(body=[n for n in source.body if isinstance(n,ast.FunctionDef) and n.name=='request_choice'],type_ignores=[]),'<bridge>', 'exec'),namespace)
choice=namespace['request_choice']
class Tests(unittest.TestCase):
    def test_disabled_and_empty_pp_moves_are_unavailable(self):
        r={'active':[{'moves':[{'id':'geomancy','disabled':True,'pp':15},{'id':'moonblast','pp':0},{'id':'shadowball','pp':5}]}]}
        self.assertIsNone(choice(r,'geomancy',[]))
        self.assertIsNone(choice(r,'moonblast',[]))
        self.assertEqual(choice(r,'shadowball',[]),'move 3')
    def test_switches_and_force_switch_false(self):
        r={'forceSwitch':[False],'active':[{'moves':[{'id':'tackle','pp':10}]}],'side':{'pokemon':[{'active':True,'condition':'10/100'},{'active':False,'condition':'20/100'}]}}
        reserve=[SimpleNamespace(name='carlis',index=2)]
        self.assertEqual(choice(r,'tackle',reserve),'move 1')
        self.assertEqual(choice(r,'switch carlis',reserve),'switch 2')
        r['active'][0]['trapped']=True
        self.assertIsNone(choice(r,'switch carlis',reserve))
        r['forceSwitch']=[True]
        self.assertEqual(choice(r,'switch carlis',reserve),'switch 2')
        self.assertIsNone(choice(r,'tackle',reserve))
        r['side']['pokemon'][1]['condition']='0 fnt'
        self.assertIsNone(choice(r,'switch carlis',reserve))
if __name__=='__main__':unittest.main()
