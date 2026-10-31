"""Conservative public-evidence checks against complete native hypotheses.

Unsupported event contexts are skipped, not treated as evidence of compatibility.
"""
from copy import deepcopy
import re

def hp(text):
    match=re.match(r'^(\d+)/(\d+)(?: |$)',text)
    return tuple(map(int,match.groups())) if match else None

def interval_match(rolls, before, after):
    # Exact own HP; a KO censors the damage at remaining HP.
    if not rolls or before<=after:return False
    damage=before-after
    return any((r>=damage if after==0 else r==damage) for r in rolls)

def extract(events, own, opponent, before_hp):
    fields=[line.split('|') for line in events]
    # Changing field/state or switched actors invalidates this narrow snapshot.
    excluded={'switch','drag','replace','-transform','-crit','-clearboost','-clearallboost',
              '-swapboost','-setboost','-start','-end','-activate','-ability','-item','-enditem',
              '-weather','-fieldstart','-fieldend','-sidestart','-sideend','-status','-curestatus','-singleturn','cant','-miss','-fail','-immune'}
    if any(len(f)>1 and f[1] in excluded for f in fields):return None
    moves=[f for f in fields if len(f)>4 and f[1]=='move']
    if len(moves)!=2 or {m[2][:2] for m in moves}!={own,opponent}:return None
    if any(any('[from]' in x for x in m[5:]) for m in moves):return None
    hits=[f for f in fields if len(f)>3 and f[1]=='-damage' and f[2].startswith(own+'a:') and not any('[from]' in x for x in f[4:])]
    heals=[f for f in fields if len(f)>2 and f[1]=='-heal' and f[2].startswith(own+'a:')]
    # No multihit, substitute, recoil or healing ambiguity in this first implementation.
    if len(hits)!=1:return None
    hit_index=fields.index(hits[0])
    if any(len(f)>1 and f[1] in ('-boost','-unboost') for f in fields[:hit_index]):return None
    for heal in heals:
        if fields.index(heal)>hit_index:return None
        recovered=hp(heal[3])
        if recovered is None:return None
        before_hp=recovered[0]
    after=hp(hits[0][3]);after_hp=0 if hits[0][3].startswith('0 fnt') else (after[0] if after else None)
    if after_hp is None or before_hp<=after_hp:return None
    clean=lambda s:re.sub('[^a-z0-9]','',s.lower())
    return {'ownMove':clean(next(m[3] for m in moves if m[2][:2]==own)),
            'opponentMove':clean(next(m[3] for m in moves if m[2][:2]==opponent)),
            'orderStable':not any(len(f)>1 and f[1] in ('-boost','-unboost') for f in fields),'ownFirst':moves[0][2][:2]==own,'beforeHP':before_hp,'afterHP':after_hp}

class Evidence:
    def __init__(self):self.records=[];self.skipped=0
    def observe(self,battle,events):
        if battle is None or battle.opponent.active is None:return
        if any(line.startswith(('|-item|','|-enditem|','|-transform|','|replace|')) for line in events):
            self.records=[]
        record=extract(events,battle.user.name,battle.opponent.name,battle.user.active.hp)
        if record is None:self.skipped+=1;return
        record['species']=battle.opponent.active.name
        record['context']=deepcopy(battle)
        self.records.append(record)
        self.records=self.records[-24:]
    def check(self,sampled):
        from fp.search.poke_engine_helpers import battle_to_poke_engine_state
        from fp.data import all_move_json
        from poke_engine import calculate_damage
        results=[]
        for record in self.records:
            candidates=[sampled.opponent.active,*sampled.opponent.reserve]
            candidate=next((p for p in candidates if p.name==record['species']),None)
            if candidate is None or candidate.hp<=0:continue
            context=deepcopy(record['context'])
            old=context.opponent.active
            context.opponent.active=deepcopy(candidate)
            # Restore publicly observed battle-time conditions, retain hypothesized stats/item.
            for attr in ('hp','max_hp','boosts','volatile_statuses','status'):
                setattr(context.opponent.active,attr,deepcopy(getattr(old,attr)))
            # Current item cannot be retroactively assigned across an item change.
            # The extractor skips item-changing turns; retained records still need explicit item history.
            if candidate.item!=old.item and old.item not in ('unknownitem',None):continue
            one=all_move_json.get(record['ownMove'],{});two=all_move_json.get(record['opponentMove'],{})
            # Only ordinary direct damage moves; conditional/multihit moves need separate evidence models.
            if two.get('category') not in ('Physical','Special') or two.get('multihit') or two.get('damage') or two.get('damageCallback') or two.get('basePowerCallback'):continue
            if two.get('basePower',0)<=0:continue
            state=battle_to_poke_engine_state(context)
            _,rolls=calculate_damage(state,record['ownMove'],record['opponentMove'],record['ownFirst'])
            damage_ok=interval_match(rolls,record['beforeHP'],record['afterHP'])
            speed_ok=None
            # Allow ties. Restrict ordering inference to unmodified priority-zero attacks.
            ordinary={'airlock','megalauncher','serenegrace','adaptability','furcoat','roughskin','gooey','competitive','reckless','flashfire','magicguard','intimidate','none'}
            actors=[context.user.active,context.opponent.active]
            if (record['orderStable'] and one.get('priority',0)==two.get('priority',0)==0 and one.get('category') in ('Physical','Special')
                and not context.weather and not context.field and not getattr(context,'trick_room',False)
                and all(p.ability in ordinary and not p.status and not p.volatile_statuses for p in actors)
                and all(p.item in ('choicescarf','choicespecs','choiceband','leftovers','none',None,'lifeorb','powerherb','rockyhelmet') for p in actors)
                and not any(context.user.side_conditions.values()) and not any(context.opponent.side_conditions.values())):
                a=context.get_effective_speed(context.user);b=context.get_effective_speed(context.opponent)
                speed_ok=a>=b if record['ownFirst'] else b>=a
            results.append({'species':record['species'],'move':record['opponentMove'],'observedDamage':record['beforeHP']-record['afterHP'],
                            'rolls':list(rolls),'damageCompatible':damage_ok,'speedCompatible':speed_ok})
        return results
