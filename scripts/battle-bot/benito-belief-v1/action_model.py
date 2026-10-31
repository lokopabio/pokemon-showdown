"""Experimental public-view response prior and explicit one-turn risk costs.

Not a trained human policy or information-gain search. Coefficients are uncalibrated.
"""
import math
from copy import deepcopy

def distribution(actions, floor=.15):
    if not actions or not 0<=floor<=1:raise ValueError('Invalid response prior')
    if any(r.visits<0 for r in actions):raise ValueError('Negative visits')
    total=sum(r.visits for r in actions)
    return {r.move_choice:(1-floor)*(r.visits/total if total else 1/len(actions))+floor/len(actions) for r in actions}

def roster(side):
    return {'alive':sum(p.hp>0 for p in side.pokemon),
            'hp':sum(max(0,p.hp)/p.maxhp for p in side.pokemon if p.maxhp>0)/6}

def metrics(initial, branches):
    before=roster(initial.side_one);out={'lostMembers':0.,'teamHPLoss':0.,'terminalLoss':0.}
    mass=sum(b.percentage for b in branches)
    if abs(mass-100)>.05:raise ValueError('Incomplete transition mass')
    for b in branches:
        state=initial.apply_instructions(b);after=roster(state.side_one);other=roster(state.side_two)
        w=b.percentage/100
        out['lostMembers']+=w*max(0,before['alive']-after['alive'])
        out['teamHPLoss']+=w*(before['hp']-after['hp'])
        out['terminalLoss']+=w*(after['alive']==0 and other['alive']>0)
    return out

def adjust(base, scenarios):
    """Subtract explicit near-term costs from existing future-oriented root values."""
    total=sum(s['weight'] for s in scenarios)
    if not scenarios or total<=0 or not math.isfinite(total) or any(s['weight']<0 for s in scenarios):raise ValueError('Missing response scenarios')
    result={}
    for action,row in base.items():
        costs={'lostMembers':0.,'teamHPLoss':0.,'terminalLoss':0.}
        for s in scenarios:
            if action not in s['matrix']:break
            if any(not math.isfinite(p) or p<0 for p in s['replies'].values()) or abs(sum(s['replies'].values())-1)>1e-6:raise ValueError('Invalid response mass')
            for reply,p in s['replies'].items():
                pair=s['matrix'][action][reply]
                for key in costs:costs[key]+=s['weight']/total*p*pair[key]
        else:
            penalty=.15*costs['lostMembers']+.05*costs['teamHPLoss']+.25*costs['terminalLoss']
            value=row['objective']-penalty
            if not math.isfinite(value):raise ValueError('Nonfinite risk objective')
            result[action]={**costs,'rootObjective':row['objective'],'riskPenalty':penalty,'objective':value}
    if not result:raise ValueError('No complete action comparison')
    return max(result,key=lambda a:result[a]['objective']),result

class PublicKnowledge:
    def __init__(self):self.own={};self.active=None;self.side=None
    def observe(self,events,side):
        if side is None:return
        import re,unicodedata
        clean=lambda s:re.sub('[^a-z0-9]','',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower())
        self.side=side
        for line in events:
            f=line.split('|')
            if len(f)<3:continue
            if f[1] in ('switch','drag','replace') and f[2].startswith(side+'a:') and len(f)>3:
                self.active=clean(f[3].split(',')[0]);self.own.setdefault(self.active,{'moves':[],'ability':None,'item':'unknownitem','fainted':False,'changedItem':False})
            if not self.active:continue
            record=self.own[self.active]
            if f[2].startswith(side+'a:'):
                if f[1]=='move' and len(f)>3 and not any('[from]' in x for x in f[5:]):
                    move=clean(f[3])
                    if move not in record['moves']:record['moves'].append(move)
                if f[1]=='-activate' and len(f)>3 and f[3].startswith('ability: '):record['ability']=clean(f[3].split(': ',1)[1])
                if f[1]=='-ability' and len(f)>3:record['ability']=clean(f[3])
                if f[1]=='-item' and len(f)>3:record['item']=clean(f[3])
                if f[1]=='-enditem':record['item']='none';record['changedItem']=True
                if f[1]=='faint':record['fainted']=True
                for x in f[3:]:
                    if x.startswith('[from] item: '):record['item']=clean(x.split(': ',1)[1])
            if any(x.startswith('[of] '+side+'a:') for x in f):
                for x in f:
                    if x.startswith('[from] ability: '):record['ability']=clean(x.split(': ',1)[1])

    def masked(self,sampled):
        """Bot's private sets/hidden identities never enter the response model."""
        from fp.battle.state import Pokemon
        from fp.data.sets.roman_bank import sample_bank_pokemon,bank_sets
        from fp.data.sets import roman_open
        import random
        if self.active!=sampled.user.active.name:
            raise ValueError('Public identity differs; response model does not support this disguise')
        view=deepcopy(sampled)
        actual={p.name:p for p in [sampled.user.active,*sampled.user.reserve]}
        public=[]
        previous=getattr(roman_open,'_belief_public_sampling',False)
        roman_open._belief_public_sampling=True
        try:
            for name,record in self.own.items():
                p=Pokemon(name,100)
                p.moves=[]
                for move in record['moves']:p.add_move(move)
                p.ability=record['ability'];p.original_ability=record['ability'];p.item=record['item']
                p.roman_item_changed=record['changedItem']
                sample_bank_pokemon(p)
                source=actual.get(name)
                if record['fainted']:p.hp=0
                elif source is not None:
                    # Only percentage HP and public battle modifiers cross this boundary.
                    p.hp=max(1,round(p.max_hp*math.ceil(100*source.hp/max(1,source.max_hp))/100))
                    p.boosts=deepcopy(source.boosts);p.status=source.status;p.volatile_statuses=list(source.volatile_statuses)
                public.append(p)
            available=[name for name in bank_sets() if name not in self.own]
            while len(public)<6:
                name=random.choice(available);available.remove(name)
                p=Pokemon(name,100);sample_bank_pokemon(p);public.append(p)
        finally:roman_open._belief_public_sampling=previous
        view.user.active=next(p for p in public if p.name==self.active)
        view.user.reserve=[p for p in public if p is not view.user.active]
        return view

def response_scenario(sampled,result,knowledge,model_ms):
    from fp.search.poke_engine_helpers import battle_to_poke_engine_state
    from poke_engine import monte_carlo_tree_search,generate_instructions
    public=knowledge.masked(sampled)
    search=monte_carlo_tree_search(battle_to_poke_engine_state(public),model_ms,threads=1)
    replies=distribution(search.side_two)
    # Response legality depends on opponent's own known set; remove actions not in the true scenario root.
    legal={a.move_choice for a in result.side_two}
    replies={a:p for a,p in replies.items() if a in legal}
    total=sum(replies.values())
    if total<=0:raise ValueError('No compatible public-view response')
    replies={a:p/total for a,p in replies.items()}
    matrix={}
    for action in result.side_one:
        matrix[action.move_choice]={}
        for reply in replies:
            initial=battle_to_poke_engine_state(sampled)
            matrix[action.move_choice][reply]=metrics(initial,generate_instructions(initial,action.move_choice,reply))
    public_roster=[public.user.active,*public.user.reserve]
    return {'replies':replies,'matrix':matrix,'publicView':{'revealedSpecies':list(knowledge.own),
            'hypotheticalBotTeam':[{'species':p.name,'ability':p.ability,'item':p.item,'moves':[m.name for m in p.moves]} for p in public_roster]},
            'modelMs':model_ms,'scope':'Public-view MCTS visit prior with 15% uniform exploration, not calibrated human move probabilities. Unknown bot members are hypothetical.'}
