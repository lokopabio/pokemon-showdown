import unittest,types
from action_model import PublicKnowledge,distribution,adjust,metrics
class Tests(unittest.TestCase):
 def test_reply_mass_and_exploration(self):
  actions=[types.SimpleNamespace(move_choice='attack',visits=100),types.SimpleNamespace(move_choice='switch x',visits=0)]
  p=distribution(actions);self.assertAlmostEqual(sum(p.values()),1);self.assertGreater(p['switch x'],0);self.assertGreater(p['attack'],p['switch x'])
 def test_prediction_changes_risk_choice(self):
  base={'stay':{'objective':.6},'switch':{'objective':.52}}
  costs=lambda loss:{'lostMembers':loss,'terminalLoss':0,'teamHPLoss':loss/6}
  matrix={'stay':{'attack':costs(1),'uturn':costs(0)},'switch':{'attack':costs(0),'uturn':costs(0)}}
  make=lambda p:[{'weight':1,'replies':{'attack':p,'uturn':1-p},'matrix':matrix}]
  self.assertEqual(adjust(base,make(.9))[0],'switch')
  self.assertEqual(adjust(base,make(.1))[0],'stay')
 def test_no_chip_bonus_in_terminal_loss(self):
  base={'priority':{'objective':.001},'hope':{'objective':.002}}
  pair={'lostMembers':1,'terminalLoss':1,'teamHPLoss':.05}
  scenarios=[{'weight':1,'replies':{'attack':1},'matrix':{a:{'attack':pair} for a in base}}]
  self.assertEqual(adjust(base,scenarios)[0],'hope')
 def test_public_tracker_uses_only_public_events(self):
  p=PublicKnowledge();p.observe(['|switch|p2a: Dijeypepe|Dijeypepe, F|349/349','|move|p1a: X|Surf|p2a: Dijeypepe','|move|p2a: Dijeypepe|Earth Power|p1a: X'],'p2')
  self.assertEqual(list(p.own),['dijeypepe']);self.assertEqual(p.own['dijeypepe']['moves'],['earthpower']);self.assertIsNone(p.own['dijeypepe']['ability']);self.assertEqual(p.own['dijeypepe']['item'],'unknownitem')
 def test_invalid_mass_rejected(self):
  with self.assertRaises(ValueError):adjust({'x':{'objective':1}},[{'weight':1,'replies':{'a':.5},'matrix':{'x':{}}}])
if __name__=='__main__':unittest.main()

class PrivacyTests(unittest.TestCase):
 def test_masked_model_independent_of_unrevealed_private_sets(self):
  import sys,random,copy
  from unittest.mock import patch
  class Pokemon:
   def __init__(self,name,level):
    self.name=name;self.hp=100;self.max_hp=100;self.moves=[];self.ability=None;self.item='unknownitem';self.original_ability=None;self.boosts={};self.status=None;self.volatile_statuses=[]
   def add_move(self,name):self.moves.append(types.SimpleNamespace(name=name))
  def sample(p):
   p.ability=p.ability or 'publicguess';p.item='guessitem' if p.item=='unknownitem' else p.item
   if not p.moves:p.add_move('guessedattack')
  roman_open=types.SimpleNamespace(_belief_public_sampling=False)
  modules={'fp.battle.state':types.SimpleNamespace(Pokemon=Pokemon),'fp.data.sets.roman_bank':types.SimpleNamespace(sample_bank_pokemon=sample,bank_sets=lambda:{'known':[],**{f'hyp{i}':[] for i in range(8)}}),'fp.data.sets':types.SimpleNamespace(roman_open=roman_open)}
  p=PublicKnowledge();p.observe(['|switch|p2a: Known|Known|100/100'],'p2')
  active=Pokemon('known',100);active.add_move('secretattack');active.item='secretitem';active.ability='secretability'
  battle=types.SimpleNamespace(user=types.SimpleNamespace(active=active,reserve=[Pokemon('secretteammate',100)]))
  def signature(v):return [(x.name,x.item,x.ability,[m.name for m in x.moves]) for x in [v.user.active,*v.user.reserve]]
  with patch.dict(sys.modules,modules):
   random.seed(10);a=signature(p.masked(battle))
   battle.user.active.moves=[];battle.user.active.item='differentitem';battle.user.active.ability='differentability';battle.user.reserve=[Pokemon('differentsecret',100)]
   random.seed(10);b=signature(p.masked(battle))
  self.assertEqual(a,b)
  self.assertNotIn('secretteammate',str(a));self.assertNotIn('secretattack',str(a))
 def test_branch_costs_track_switch_recipient_and_terminal_loss(self):
  from action_model import metrics
  def side(hps):return types.SimpleNamespace(pokemon=[types.SimpleNamespace(hp=hp,maxhp=100) for hp in hps])
  after=types.SimpleNamespace(side_one=side([100,0]),side_two=side([100]))
  initial=types.SimpleNamespace(side_one=side([100,100]),apply_instructions=lambda b:after)
  r=metrics(initial,[types.SimpleNamespace(percentage=100)])
  self.assertEqual(r['lostMembers'],1);self.assertEqual(r['terminalLoss'],0);self.assertAlmostEqual(r['teamHPLoss'],1/6)

class NativeBoundaryTests(unittest.TestCase):
 def test_mcts_switches_are_translated_on_both_sides(self):
  from action_model import branches_for
  received=[]
  def strict_native(state,action,reply):
   if action.startswith('switch ') or reply.startswith('switch '):raise ValueError('Native parser rejects prefixed switch')
   received.append((action,reply));return ['branch']
  self.assertEqual(branches_for(strict_native,None,'switch pabio','switch airrivas'),['branch'])
  self.assertEqual(received,[('pabio','airrivas')])
 def test_move_names_and_native_no_move(self):
  from action_model import transition_action
  self.assertEqual(transition_action('moonblast'),'moonblast')
  self.assertEqual(transition_action('No Move'),'none')
  with self.assertRaises(ValueError):transition_action('switch ')
