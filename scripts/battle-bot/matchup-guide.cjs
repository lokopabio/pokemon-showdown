'use strict';
// Calculator proposals inform exploration; they never replace measured battle results.
const {Calculator}=require('./calculator.cjs');
class MatchupGuide{
  constructor({enginePath,targets}){this.calc=new Calculator({enginePath});this.targets=targets;this.cache=new Map();}
  profile(set,target){const key=JSON.stringify([set,target]);if(this.cache.has(key))return this.cache.get(key);let report;
    try{const a=this.calc.pokemon(set),b=this.calc.pokemon(target.set),field=new this.calc.api.Field({gameType:'Singles'});
      const attacks=(attacker,defender,moves)=>moves.map(m=>this.calc.dex.moves.get(m)).filter(m=>m.category!=='Status').map(m=>({move:m.id,range:this.calc.range(attacker,defender,m,field)}));
      const outgoing=attacks(a,b,set.moves),incoming=attacks(b,a,target.move?[target.move]:target.set.moves);
      const best=outgoing.sort((x,y)=>y.range[0]-x.range[0])[0];const worst=incoming.length?Math.max(...incoming.map(m=>m.range[1])):0;
      const speed=(mon,s)=>{const item=this.calc.dex.items.get(s.item).id;return Math.floor(mon.rawStats.spe*(item==='choicescarf'?1.5:['ironball','machobrace'].includes(item)?0.5:1));};
      const outspeeds=speed(a,set)>speed(b,target.set),damagePercent=best?100*best.range[0]/b.maxHP():0;
      const survives=worst*(target.surviveHits||1)<a.maxHP();
      const role=target.role||'profile';
      const met=role==='check'?survives:role==='breaker'?damagePercent>=(target.damagePercent||100):role==='revenge'?outspeeds&&damagePercent>=(target.damagePercent||100):survives&&damagePercent>=50;
      report={species:set.species,target:target.set.species,role,outgoing,incoming,hp:a.maxHP(),targetHP:b.maxHP(),outspeeds,minimumDamagePercent:damagePercent,survivesTargetHits:survives,objectiveMet:met&&(!target.outspeed||outspeeds),assumptions:'Neutral field, full HP, no boosts. Survival excludes recovery, hazards and multi-turn status; speed includes Scarf/Iron Ball/Macho Brace, not ability/weather activation.'};
    }catch(error){report={species:set.species,target:target.set.species,unavailable:error.message,objectiveMet:false};}
    this.cache.set(key,report);return report;
  }
  team(team){const profiles=this.targets.map(target=>{const eligible=team.filter(s=>!target.forSpecies||this.calc.dex.species.get(s.species).id===this.calc.dex.species.get(target.forSpecies).id);return {target,sets:eligible.map(s=>this.profile(s,target))};});const specific=profiles.filter(p=>p.target.role&&p.target.role!=='profile');
    const score=ps=>ps.reduce((n,p)=>n+Number(p.sets.some(r=>r.objectiveMet)),0)/Math.max(1,ps.length);
    return {score:specific.length?score(specific)+score(profiles)*0.001:score(profiles),profiles,engineSHA256:this.calc.sha};
  }
  propose(parent,explorer){const options=[parent,...Array.from({length:5},()=>explorer.mutate(parent))];return options.map(team=>({team,score:this.team(team).score})).sort((a,b)=>b.score-a.score)[0].team;}
}
module.exports={MatchupGuide};
