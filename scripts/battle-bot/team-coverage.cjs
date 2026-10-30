'use strict';
const {Dex}=require('../../dist/sim');
const dex=Dex.forFormat('gen7ou');
const immune={levitate:['Ground'],waterabsorb:['Water'],dryskin:['Water'],stormdrain:['Water'],flashfire:['Fire'],sapsipper:['Grass'],voltabsorb:['Electric'],lightningrod:['Electric'],motordrive:['Electric']};
function multiplier(type,set){const species=dex.species.get(set.species),ability=dex.abilities.get(set.ability).id;if(immune[ability]?.includes(type)||!dex.getImmunity(type,species))return 0;return 2**dex.getEffectiveness(type,species);}
function assessCoverage(team,threats){
 const risks=[];
 for(const threat of threats){const moves=threat.moves.map(m=>dex.moves.get(m)).filter(m=>m.category!=='Status'&&m.basePower>0);if(!moves.length)continue;
  // Worst attack against each teammate; neutral damage alone never certifies a check.
  const exposure=team.map(set=>Math.max(...moves.map(m=>multiplier(m.type,set))));
  const weak=exposure.filter(x=>x>=2).length,answers=exposure.filter(x=>x<1).length;
  const risk=weak>=2?(weak-1)*(answers===0?2:answers===1?1:0.25):0;
  if(risk)risks.push({threat:threat.species,moves:moves.map(m=>m.id),exposure,weak,answers,risk});
 }
 return {score:risks.reduce((n,r)=>n+r.risk,0)/Math.max(1,threats.length),risks:risks.sort((a,b)=>b.risk-a.risk).slice(0,10)};
}
module.exports={multiplier,assessCoverage};
