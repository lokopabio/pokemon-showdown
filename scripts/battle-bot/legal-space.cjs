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
    const moves=[...ids].filter(id=>{const m=dex.moves.get(id);if(!m.exists||m.isZ||m.isMax)return false;return !validator.validateTeam([{species:s.battleOnly?s.baseSpecies:s.name,ability:s.abilities[0],moves:[m.name],evs:{hp:1}}]);});
    species[s.id]={name:s.name,baseSpecies:s.battleOnly?dex.species.get(s.baseSpecies).id:s.id,selectable:pool.some(p=>p.id===s.id),types:s.types.map(t=>t.toLowerCase()),stats:s.baseStats,moves,abilities:Object.values(s.abilities).map(a=>dex.abilities.get(a).id)};
  }
  const moves=Object.fromEntries([...new Set(Object.values(species).flatMap(s=>s.moves))].map(id=>{const m=dex.moves.get(id);return [id,{name:m.name,type:m.type.toLowerCase(),category:m.category,power:m.basePower,priority:m.priority,native:native.moves.includes(id)}];}));
  cached={schema:1,format:'gen7ou',species,moves,items:items.map(i=>({id:i.id,name:i.name,native:native.items.includes(i.id)})),natures:dex.natures.all().map(n=>n.id),nativeAbilities:native.abilities,limitations:'Native identifiers do not establish mechanic parity. Unsupported identifiers remain in the legality catalog but are not generated for native search.'};return cached;
}
function writeCatalog(file){fs.writeFileSync(file,JSON.stringify(catalog(),null,2)+'\n');}
class SetExplorer{
  constructor(seed=1,random=rng(seed)){this.random=random;this.data=catalog();this.dex=Dex.forFormat('gen7ou');this.validator=TeamValidator.get('gen7ou');this.pool=Object.keys(this.data.species).filter(id=>this.data.species[id].selectable);}
  sample(a){return a[Math.floor(this.random()*a.length)];}
  spread(){const evs={hp:0,atk:0,def:0,spa:0,spd:0,spe:0},stats=Object.keys(evs);if(this.random()<0.5){const shuffled=stats.map(s=>({s,r:this.random()})).sort((a,b)=>a.r-b.r);evs[shuffled[0].s]=252;evs[shuffled[1].s]=252;evs[shuffled[2].s]=4;}else for(let i=0;i<127;i++){const choices=stats.filter(s=>evs[s]<252);evs[this.sample(choices)]+=4;}return evs;}
  set(name){const s=this.data.species[name];if(!s)throw Error('Unknown species');const abilities=s.abilities.filter(a=>a!=='moody'&&this.data.nativeAbilities.includes(a)),moves=s.moves.filter(m=>this.data.moves[m].native),items=this.data.items.filter(i=>i.native);if(!abilities.length||moves.length<4)throw Error('Insufficient native identifier support for '+name);
    for(let attempt=0;attempt<200;attempt++){
      // Every move has positive sampling weight; no bank membership requirement.
      const ranked=moves.map(id=>{const m=this.data.moves[id],w=this.random()<0.25?1:Math.max(15,m.power||40)*(s.types.includes(m.type)?1.3:1);return {id,k:-Math.log(Math.max(this.random(),1e-9))/w};}).sort((a,b)=>a.k-b.k);
      const set={species:s.name,name:s.name,level:100,ability:this.sample(abilities),item:this.sample(items).name,moves:ranked.slice(0,4).map(m=>m.id),nature:this.sample(this.data.natures),evs:this.spread(),ivs:Object.fromEntries(['hp','atk','def','spa','spd','spe'].map(k=>[k,this.random()<0.15?Math.floor(this.random()*32):this.sample(k==='atk'||k==='spe'?[0,31]:[31])]))};
      if(!this.validator.validateTeam([clone(set)]))return set;
    }throw Error('Could not generate legal set for '+name);
  }
  team(){for(let attempt=0;attempt<200;attempt++){try{const names=this.pool.map(n=>({n,r:this.random()})).sort((a,b)=>a.r-b.r).slice(0,6),team=names.map(({n})=>this.set(n));if(!this.validator.validateTeam(clone(team)))return team;}catch{}}throw Error('Could not generate legal team');}
  mutate(parent){for(let attempt=0;attempt<200;attempt++){const team=clone(parent),slot=Math.floor(this.random()*6),set=team[slot],name=this.dex.species.get(set.species).id,s=this.data.species[name],kind=Math.floor(this.random()*8);
    if(kind===0)team[slot]=this.set(this.sample(this.pool));
    else if(kind===1)set.moves[Math.floor(this.random()*4)]=this.sample(s.moves.filter(m=>this.data.moves[m].native));
    else if(kind===2)set.item=this.sample(this.data.items.filter(i=>i.native)).name;
    else if(kind===3)set.ability=this.sample(s.abilities.filter(a=>a!=='moody'&&this.data.nativeAbilities.includes(a)));
    else if(kind===4)set.nature=this.sample(this.data.natures);
    else if(kind===5)set.evs=this.spread();
    else if(kind===6)set.ivs=Object.fromEntries(['hp','atk','def','spa','spd','spe'].map(k=>[k,Math.floor(this.random()*32)]));
    else {const other=Math.floor(this.random()*6);[team[0],team[other]]=[team[other],team[0]];}
    if(new Set(team.map(p=>p.species)).size===6&&!this.validator.validateTeam(clone(team)))return team;
  }throw Error('Could not mutate legal team');}
}
module.exports={catalog,writeCatalog,SetExplorer};
