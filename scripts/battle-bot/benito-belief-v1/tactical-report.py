"""Summarize saved one-turn outcomes; no search or inference is rerun."""
import argparse,json,collections

def summarize(rows):
    cases=[]
    for row in rows:
        result=row['result'];d=result.get('diagnostic') or {}
        for index,sample in enumerate(d.get('samples',[])):
            transitions=sample.get('lastMemberTransitions',[])
            if not transitions:continue
            pairs=[]
            for pair in transitions:
                outcomes=pair['outcomes'];mass=sum(o['percentage'] for o in outcomes)
                if abs(mass-100)>0.05:raise ValueError('Incomplete transition probability mass')
                loss=sum(o['percentage']/100 for o in outcomes if o['own']['hp']==0 and o['opponent']['hp']>0)
                damage=sum(o['percentage']/100*(sample['opponent']['active']['hp']-o['opponent']['hp']) for o in outcomes)
                pairs.append({'action':pair['action'],'reply':pair['reply'],'immediateLoss':loss,'netOpponentHPReduction':damage})
            by_reply=collections.defaultdict(list)
            for p in pairs:by_reply[p['reply']].append(p)
            lethal_replies=[reply for reply,ps in by_reply.items() if all(p['immediateLoss']>=1-1e-6 for p in ps)]
            roots=next((s['actions'] for i,s in enumerate(result.get('scenarioResults',[])) if i==index),[])
            cases.append({'turn':d['turn'],'sample':index+1,'selected':result['choice'],
                          'opponentItem':sample['opponent']['active']['item'],
                          'repliesDefeatingEveryEquippedMove':lethal_replies,'pairs':pairs,
                          'rootMeans':{r['action']:r['totalScore']/r['visits'] if r['visits'] else None for r in roots}})
    return {'cases':cases,'scope':'One-turn equipped-move counterfactuals on sampled states. Reply probabilities are NOT inferred. Switches and future turns are not covered. Dealing chip before a terminal loss does not demonstrate a higher chance of winning.'}

def main():
    p=argparse.ArgumentParser();p.add_argument('input');p.add_argument('--output',required=True);a=p.parse_args()
    with open(a.input,encoding='utf-8-sig') as f:report=summarize([json.loads(l) for l in f if l.strip()])
    with open(a.output,'w',encoding='utf-8') as f:json.dump(report,f,indent=2)
    print(f"Recorded {len(report['cases'])} tactical cases; {a.output}")
if __name__=='__main__':main()
