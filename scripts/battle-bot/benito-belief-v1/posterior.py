"""Persistent, auditable set weights. Scores are not calibrated probabilities."""
import math

class SetBeliefs:
    def __init__(self):
        self.cache={}
        self.latest={}
        self.evaluations=0

    def weight(self, species, signature, revision, prior, evaluate):
        if not math.isfinite(prior) or prior<=0:raise ValueError('Invalid structural prior')
        key=(species,signature,revision)
        if key not in self.cache:
            checks=evaluate()
            # Collapse repeated measurements of the same move to one contradiction.
            # Conservative envelopes are not exact likelihoods; soften instead of banning.
            conflicts={(c['species'],c['move'],kind) for c in checks for kind in ('damageCompatible','speedCompatible') if c.get(kind) is False}
            multiplier=0.05**min(3,len(conflicts))
            self.cache[key]={'checks':checks,'conflicts':len(conflicts),'multiplier':multiplier}
            self.evaluations+=1
            if len(self.cache)>4096:self.cache.pop(next(iter(self.cache)))
        record=self.cache[key]
        score=prior*record['multiplier']
        self.latest.setdefault(species,{})[signature]={'weight':score,'conflicts':record['conflicts'],'checks':record['checks']}
        return score

    def begin_decision(self):self.latest={}

    def summary(self):
        out={}
        for species,sets in self.latest.items():
            total=sum(r['weight'] for r in sets.values())
            out[species]={'allConflict':all(r['conflicts']>0 for r in sets.values()),
                          'sets':[{'signature':key,'normalizedWeight':r['weight']/total,**r} for key,r in sets.items()]}
        return {'species':out,'cachedEvaluations':self.evaluations,'cacheEntries':len(self.cache),
                'scope':'Bounded structural weights and conservative mismatch penalties; not calibrated posterior probabilities.'}
