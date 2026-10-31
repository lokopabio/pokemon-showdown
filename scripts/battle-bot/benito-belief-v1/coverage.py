"""Stratified active-species scenarios; branch mass is independent of sample count."""
import math,random

def allocate(rows, disguise_probability, max_groups=6, choose=None):
    choose=choose or (lambda xs,ws:random.choices(xs,weights=ws,k=1)[0])
    p=disguise_probability
    if not math.isfinite(p) or not 0<=p<=1 or max_groups<1:raise ValueError('Invalid coverage settings')
    if any(not math.isfinite(r['weight']) or r['weight']<=0 for r in rows):raise ValueError('Invalid set weights')
    groups={}
    for row in rows:groups.setdefault(row['group'],[]).append(row)
    ranked=sorted(groups,key=lambda k:-sum(r['weight'] for r in groups[k]))
    # First retain a representative group for each ability, then fill by mass.
    selected=[];abilities=set()
    for key in ranked:
        ability=groups[key][0]['ability']
        if ability not in abilities and len(selected)<max_groups:selected.append(key);abilities.add(ability)
    for key in ranked:
        if len(selected)>=max_groups:break
        if key not in selected:selected.append(key)
    omitted=[r for k in ranked if k not in selected for r in groups[k]]
    total=sum(r['weight'] for r in rows)
    out=[]
    if p<1:
        if not rows:out.append({'kind':'apparent-open','weight':1-p,'candidate':None})
        else:
            for key in selected:
                members=groups[key];mass=sum(r['weight'] for r in members)
                row=choose(members,[r['weight'] for r in members])
                out.append({'kind':'apparent-bank','group':str(key),'weight':(1-p)*mass/total,'candidate':row['candidate']})
            if omitted:
                mass=sum(r['weight'] for r in omitted)
                out.append({'kind':'apparent-remainder','weight':(1-p)*mass/total,
                            'candidate':choose(omitted,[r['weight'] for r in omitted])['candidate']})
    if p>0:out.append({'kind':'disguise','weight':p,'candidate':None})
    if abs(sum(r['weight'] for r in out)-1)>1e-8:raise ValueError('Coverage lost probability mass')
    return out

def prepare(battle,prepare_battles):
    from fp.data.sets import roman_open
    from fp.data.sets.roman_bank import bank_sets,bank_species_name
    active=battle.opponent.active
    p=getattr(active,'roman_illusion_probability',None)
    if p is None:p=0.
    if active.name=='chemfalse' or getattr(active,'roman_transformed',False):
        return list(prepare_battles(battle,3)),{'mode':'existing-known-identity-or-transform'}
    rows=[]
    for c in bank_sets().get(bank_species_name(active.name),[]):
        if getattr(c,'roman_generated',False) or not roman_open.bank_compatible(active,c):continue
        effects=[]
        for move in c.pkmn_moveset.moves:
            m=roman_open.all_move_json.get(move,{})
            if str(m.get('category','')).lower() in ('physical','special'):
                effects.append((m.get('type',''),m.get('category',''),m.get('priority',0)))
        group=(c.pkmn_set.ability,c.pkmn_set.item,tuple(sorted(set(effects))))
        rows.append({'candidate':c,'ability':c.pkmn_set.ability,'group':group,
                     'weight':roman_open._belief_affinity(active,c)})
    plan=allocate(rows,p)
    sampled=[];report=[]
    previous=getattr(roman_open,'_belief_stratum',None)
    try:
        for branch in plan:
            roman_open._belief_stratum={'species':active.name,'illusion':branch['kind']=='disguise','candidate':branch['candidate']}
            batch=list(prepare_battles(battle,1))
            if len(batch)!=1:raise ValueError('Unexpected sampler batch')
            scenario=batch[0][0]
            actual=scenario.opponent.active.name
            expected='chemfalse' if branch['kind']=='disguise' else active.name
            if actual!=expected:raise ValueError('Identity stratum not honored: '+actual+' != '+expected)
            sampled.append((scenario,branch['weight']))
            report.append({k:v for k,v in branch.items() if k!='candidate'} | {'sampledSpecies':actual,
                'ability':scenario.opponent.active.ability,'item':scenario.opponent.active.item,
                'moves':[m.name for m in scenario.opponent.active.moves]})
    finally:roman_open._belief_stratum=previous
    return sampled,{'mode':'stratified-active-bank','apparentSpecies':active.name,'disguiseMass':p,'branches':report,
                    'scope':'Bank effect strata with bounded remainder; open generated alternatives are not exhaustively covered.'}
