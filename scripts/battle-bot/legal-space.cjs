'use strict';
// Full server legality catalog. Native support is metadata, not learnset legality.
const fs=require('node:fs');const {Dex,TeamValidator}=require('../../dist/sim');
const {speciesData}=require('./prepare-foul-play.cjs');const {rng}=require('./breed.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));let cached;
function catalog(){
  if(cached)return cached;
  const dex=Dex.forFormat('gen7ou'),validator=TeamValidator.get('gen7ou'),native=require('./compatibility/poke-engine.json');
  const {pool,entries}=speciesData(),species={};
  const availableItems=dex.items.all().filter(i=>i.exists&&!i.megaStone&&!i.zMove&&!i.zMoveType);
  const items=availableItems.filter(i=>!validator.validateTeam([{species:pool[0].name,ability:pool[0].abilities[0],moves:[Object.keys(dex.species.getLearnsetData(pool[0].id).learnset)[0]],evs:{hp:1},item:i.name}]));
  for(const s of entries){
    const ids=new Set();let current=s;const seen=new Set();
    while(current?.exists&&!seen.has(current.id)){seen.add(current.id);for(const id of Object.keys(dex.species.getLearnsetData(current.id).learnset||{}))ids.add(id);current=current.prevo?dex.species.get(current.prevo):null;}
    if(s.battleOnly){const base=dex.species.get(s.baseSpecies);for(const id of Object.keys(dex.species.getLearnsetData(base.id).learnset||{}))ids.add(id);}
    const abilityMoves={};
    for(const ability of Object.values(s.abilities))abilityMoves[dex.abilities.get(ability).id]=[...ids].filter(id=>{const m=dex.moves.get(id);if(!m.exists||m.isZ||m.isMax)return false;return !validator.validateTeam([{species:s.battleOnly?s.baseSpecies:s.name,ability,moves:[m.name],evs:{hp:1}}]);});
    const moves=[...new Set(Object.values(abilityMoves).flat())];
    species[s.id]={name:s.name,baseSpecies:s.battleOnly?dex.species.get(s.baseSpecies).id:s.id,selectable:pool.some(p=>p.id===s.id),types:s.types.map(t=>t.toLowerCase()),stats:s.baseStats,moves,abilityMoves,abilities:Object.values(s.abilities).map(a=>dex.abilities.get(a).id)};
  }
  const moves=Object.fromEntries([...new Set(Object.values(species).flatMap(s=>s.moves))].map(id=>{const m=dex.moves.get(id);return [id,{name:m.name,type:m.type.toLowerCase(),category:m.category,power:m.basePower,priority:m.priority,native:native.moves.includes(id)}];}));
  cached={schema:1,format:'gen7ou',species,moves,items:items.map(i=>({id:i.id,name:i.name,native:native.items.includes(i.id)})),natures:dex.natures.all().map(n=>n.id),nativeAbilities:native.abilities,limitations:'Native identifiers do not establish mechanic parity. Unsupported identifiers remain in the legality catalog but are not generated for native search.'};return cached;
}
function writeCatalog(file){fs.writeFileSync(file,JSON.stringify(catalog(),null,2)+'\n');}
class SetExplorer{
  constructor(seed=1,random=rng(seed)){this.random=random;this.data=catalog();this.dex=Dex.forFormat('gen7ou');this.validator=TeamValidator.get('gen7ou');this.pool=Object.keys(this.data.species).filter(id=>this.data.species[id].selectable);this.rules=new (require('./set-rules.cjs').SetRules)(this);this.baseline=null;this.baselineProposals=0;this.independentProposals=0;}
  sample(a){return a[Math.floor(this.random()*a.length)];}
  spread(){const evs={hp:0,atk:0,def:0,spa:0,spd:0,spe:0},stats=Object.keys(evs);if(this.random()<0.5){const shuffled=stats.map(s=>({s,r:this.random()})).sort((a,b)=>a.r-b.r);evs[shuffled[0].s]=252;evs[shuffled[1].s]=252;evs[shuffled[2].s]=4;}else for(let i=0;i<127;i++){const choices=stats.filter(s=>evs[s]<252);evs[this.sample(choices)]+=4;}return evs;}
  set(name,plan={}){
    const record=this.baseline?.species.find(r=>r.species===name);
    if(record&&!plan.trickRoom&&this.random()<0.75){
      const proposals=record.proposals.filter(p=>!this.validator.validateTeam([clone(p.set)]));
      if(proposals.length){const chosen=proposals.map(p=>({p,k:-Math.log(Math.max(this.random(),1e-9))/Math.max(0.02,p.role==='support'?0.1:p.score*p.score)})).sort((a,b)=>a.k-b.k)[0].p;this.baselineProposals++;return clone(chosen.set);}
    }
    this.independentProposals++;
    const s=this.data.species[name];if(!s)throw Error('Unknown species');const abilities=s.abilities.filter(a=>a!=='moody'&&this.data.nativeAbilities.includes(a)),moves=s.moves.filter(m=>this.data.moves[m].native),items=this.data.items.filter(i=>i.native);if(!abilities.length||moves.length<4)throw Error('Insufficient native identifier support for '+name);
    for(let attempt=0;attempt<200;attempt++){
      // Every move has positive sampling weight; no bank membership requirement.
      const ranked=moves.map(id=>{const m=this.data.moves[id],w=this.random()<0.25?1:Math.max(15,m.power||40)*(s.types.includes(m.type)?1.3:1);return {id,k:-Math.log(Math.max(this.random(),1e-9))/w};}).sort((a,b)=>a.k-b.k);
      const set={species:s.name,name:s.name,level:100,ability:this.sample(abilities),item:this.sample(items).name,moves:ranked.slice(0,4).map(m=>m.id),nature:this.sample(this.data.natures),evs:this.spread(),ivs:{hp:31,atk:31,def:31,spa:31,spd:31,spe:31}};
      set.item=this.rules.chooseItem(set,plan);const repaired=this.rules.repair(set,plan);
      if(!this.validator.validateTeam([clone(repaired)]))return repaired;
    }throw Error('Could not generate legal set for '+name);
  }
  team({trickRoom=this.random()<0.05}={}){for(let attempt=0;attempt<200;attempt++){try{
    const pool=trickRoom?this.pool.filter(n=>this.data.species[n].stats.spe<=70):this.pool;
    const names=pool.map(n=>({n,r:this.random()})).sort((a,b)=>a.r-b.r).slice(0,6).map(x=>x.n);
    if(trickRoom&&!names.some(n=>this.data.species[n].moves.includes('trickroom'))){const setter=pool.find(n=>this.data.species[n].moves.includes('trickroom'));if(!setter)continue;names[0]=setter;}
    const team=names.map(n=>this.set(n,{trickRoom}));
    if(trickRoom){const slot=names.findIndex(n=>this.data.species[n].moves.includes('trickroom'));team[slot].moves[3]='trickroom';}
    const repaired=this.rules.team(team,{trickRoom});if(!this.validator.validateTeam(clone(repaired)))return repaired;
  }catch{}}throw Error('Could not generate legal team');}

  mutate(parent){for(let attempt=0;attempt<200;attempt++){const team=clone(parent),slot=Math.floor(this.random()*6),set=team[slot],name=this.dex.species.get(set.species).id,s=this.data.species[name],kind=Math.floor(this.random()*8);
    if(kind===0)team[slot]=this.set(this.sample(this.pool));
    else if(kind===1)set.moves[Math.floor(this.random()*4)]=this.sample(s.moves.filter(m=>this.data.moves[m].native));
    else if(kind===2)set.item=this.sample(this.data.items.filter(i=>i.native)).name;
    else if(kind===3)set.ability=this.sample(s.abilities.filter(a=>a!=='moody'&&this.data.nativeAbilities.includes(a)));
    else if(kind===4)set.nature=this.sample(this.data.natures);
    else if(kind===5)set.evs=this.spread();
    else if(kind===6)team[slot]=this.set(name,{trickRoom:parent.some(s=>s.ivs?.spe===0)&&parent.some(s=>s.moves.includes('trickroom'))});
    else {const other=Math.floor(this.random()*6);[team[0],team[other]]=[team[other],team[0]];}
    const repaired=this.rules.team(team,{trickRoom:parent.some(s=>s.ivs?.spe===0)&&parent.some(s=>s.moves.includes('trickroom'))});
    if(new Set(repaired.map(p=>p.species)).size===6&&!this.validator.validateTeam(clone(repaired)))return repaired;
  }throw Error('Could not mutate legal team');}
}
module.exports={catalog,writeCatalog,SetExplorer};
