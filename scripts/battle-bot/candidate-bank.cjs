'use strict';
// Search complete supplied sets; never repair or independently mutate their fields.
const {Dex,Teams,TeamValidator}=require('../../dist/sim');
const {validateCustomTeam}=require('./foul-play-team.cjs');
const {legal,id}=require('./foul-play-roster.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
class CandidateBank {
 constructor(data,trainingTeams,random){
  this.random=random;this.records=new Map();this.rejected=[];const dex=Dex.forFormat('gen7ou');
  const add=(original,source)=>{const set=clone(original),species=dex.species.get(set.species);const allowedNFEs=new Set(['albeerto','fonsomate','tiopep']);const reason=species.nfe&&!allowedNFEs.has(species.id)?'NFE excluded from initial search':species.id==='tiopep'&&(dex.items.get(set.item).id!=='toxicorb'||!set.moves.some(m=>dex.moves.get(m).id==='stealthrock'))?'Tiopep restricted to Toxic Orb + Stealth Rock':null;
   if(reason){this.rejected.push({species:species.name,source,reason});return;}
   try{validateCustomTeam(Array.from({length:6},()=>clone(set)));const problems=TeamValidator.get('gen7ou').validateTeam([clone(set)]);if(problems)throw Error(problems.join('; '));}catch(error){this.rejected.push({species:set.species,source,reason:error.message});return;}
   // Canonical spelling prevents duplicate entries from workbook/team exports.
   set.species=species.name;set.name=species.name;set.ability=dex.abilities.get(set.ability).name;set.item=dex.items.get(set.item).name||'';set.moves=set.moves.map(m=>dex.moves.get(m).name);
   const key=Teams.pack([set]);const row=this.records.get(key);if(row)row.sources.push(source);else this.records.set(key,{id:id([set]),set,species:species.id,sources:[source]});
  };
  for(const [i,r]of (data.sets||[]).entries())add(r.set||r,{kind:'individual-bank',index:i,original:r.source});
  for(const [i,team]of trainingTeams.entries())for(const set of team)add(set,{kind:'training-team',index:i});
  add({species:'Fonsomate',ability:'Imposter',item:'Choice Scarf',nature:'Calm',level:100,evs:{hp:252,atk:0,def:4,spa:0,spd:252,spe:0},ivs:{hp:31,atk:0,def:31,spa:31,spd:31,spe:31},moves:['perishsong','healingwish','infestation','strugglebug']},{kind:'explicit-hypothesis',purpose:'User-requested Imposter Scarf niche; HP retained after transformation. Fallback moves and bulk spread are provisional, not optimized.'});
  this.bySpecies=new Map();for(const row of this.records.values()){if(!this.bySpecies.has(row.species))this.bySpecies.set(row.species,[]);this.bySpecies.get(row.species).push(row);}
  this.species=[...this.bySpecies.keys()];if(this.species.length<6)throw Error('Need six eligible candidate species');
 }
 sample(rows){return rows[Math.floor(this.random()*rows.length)];}
 set(species){return clone(this.sample(this.bySpecies.get(species)).set);}
 team(){for(let attempt=0;attempt<200;attempt++){const names=[...this.species],team=[];while(team.length<6){const i=Math.floor(this.random()*names.length),name=names.splice(i,1)[0];team.push(this.set(name));}if(legal(team))return team;}throw Error('Cannot construct legal bank team');}
 mutate(parent){for(let attempt=0;attempt<200;attempt++){const team=clone(parent),count=this.random()<0.5?1:2;const slots=[0,1,2,3,4,5];for(let n=0;n<count;n++){const slot=slots.splice(Math.floor(this.random()*slots.length),1)[0],used=new Set(team.filter((_,i)=>i!==slot).map(s=>Dex.species.get(s.species).id));team[slot]=this.set(this.sample(this.species.filter(s=>!used.has(s))));}if(legal(team)&&id(team)!==id(parent))return team;}return this.team();}
 report(){return {mode:'supplied complete sets',sets:this.records.size,species:this.species.length,records:[...this.records.values()],rejected:this.rejected,limitation:'Held-out team combinations are excluded from generation; individual sets may also occur in held-out teams. No claim of unseen-set evaluation.'};}
}
module.exports={CandidateBank};
