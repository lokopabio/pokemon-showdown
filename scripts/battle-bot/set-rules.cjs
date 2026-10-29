'use strict';
// Generation priors and repair rules. The full legality catalog remains unrestricted.
const clone=x=>JSON.parse(JSON.stringify(x));
const inertAbilities=new Set(['honeygather','illuminate','runaway','friendguard','telepathy','plus','minus','healer','battery','symbiosis','receiver','powerofalchemy']);
const harmfulAbilities=new Set(['slowstart','truant','defeatist','stall']);
const singlesDead=new Set(['helpinghand','afteryou','quash','holdhands','celebrate','happyhour','splash','happyhour','bestow','spotlight','aromaticmist','instruct']);
class SetRules{
  constructor(explorer){this.e=explorer;this.dex=explorer.dex;}
  attacks(set){return set.moves.map(m=>this.dex.moves.get(m)).filter(m=>m.category!=='Status');}
  physical(set){return set.moves.some(m=>this.dex.moves.get(m).category==='Physical');}
  usefulMove(id){const m=this.dex.moves.get(id);return !singlesDead.has(m.id)&&!['adjacentAlly','allies'].includes(m.target);}
  itemWorks(set,id,{trickRoom=false}={}){
    const item=this.dex.items.get(id),species=this.dex.species.get(set.species),attacks=this.attacks(set),has=m=>set.moves.some(x=>this.dex.moves.get(x).id===m);
    if(item.itemUser&&!item.itemUser.some(n=>this.dex.species.get(n).baseSpecies===species.baseSpecies))return false;
    if(item.onMemory&&!has('multiattack'))return false;
    if(item.onDrive&&!has('technoblast'))return false;
    const typeMatch=(item.desc||'').match(/Holder's (\w+)-type attacks have/);
    if(typeMatch&&!attacks.some(m=>m.type===typeMatch[1])&&!(item.onPlate&&has('judgment')))return false;
    if(item.id==='eviolite'&&!species.nfe)return false;
    if(item.id==='blacksludge'&&!species.types.includes('Poison'))return false;
    if(item.id==='assaultvest'&&set.moves.some(m=>this.dex.moves.get(m).category==='Status'))return false;
    if(['choiceband','choicespecs','choicescarf'].includes(item.id)&&set.moves.some(m=>this.dex.moves.get(m).category==='Status'&&!['trick','switcheroo','healingwish','memento'].includes(this.dex.moves.get(m).id)))return false;
    if(item.id==='choiceband'&&!this.physical(set))return false;
    if(item.id==='choicespecs'&&!attacks.some(m=>m.category==='Special'))return false;
    if(item.id==='choicescarf'&&trickRoom)return false;
    if(item.id.endsWith('seed')&&['electricseed','grassyseed','mistyseed','psychicseed'].includes(item.id)){
      const type=item.id.slice(0,-4);if(!has(type+'terrain')&&!this.dex.abilities.get(set.ability).id.startsWith(type+'surge'))return false;
    }
    if(['ironball','machobrace','poweranklet','powerband','powerbelt','powerbracer','powerlens','powerweight'].includes(item.id)&&!has('fling')&&!has('trick')&&!has('switcheroo'))return false;
    if(['flameorb','toxicorb'].includes(item.id)&&!['guts','quickfeet','poisonheal','magicguard','flareboost','toxicboost'].includes(this.dex.abilities.get(set.ability).id)&&!has('trick')&&!has('switcheroo')&&!has('facade'))return false;
    if(item.id==='throatspray'&&!attacks.some(m=>m.flags.sound&&m.category==='Special'))return false;
    if(item.id==='lightclay'&&!has('reflect')&&!has('lightscreen')&&!has('auroraveil'))return false;
    if(item.id==='powerherb'&&!attacks.some(m=>m.flags.charge))return false;
    if(item.id==='whiteherb'&&!has('shellsmash')&&!attacks.some(m=>m.self?.boosts&&Object.values(m.self.boosts).some(n=>n<0)))return false;
    if(['damp','heat','icy','smooth'].some(prefix=>item.id===prefix+'rock')){const weather={damprock:['raindance','drizzle'],heatrock:['sunnyday','drought'],icyrock:['hail','snowwarning'],smoothrock:['sandstorm','sandstream']}[item.id];if(!has(weather[0])&&this.dex.abilities.get(set.ability).id!==weather[1])return false;}
    return true;
  }
  chooseAbility(set){const species=this.dex.species.get(set.species);let options=Object.values(species.abilities).map(a=>this.dex.abilities.get(a)).filter(a=>a.id!=='moody'&&this.e.data.nativeAbilities.includes(a.id));
    const useful=options.filter(a=>!inertAbilities.has(a.id)&&!harmfulAbilities.has(a.id));if(useful.length)options=useful;
    return options.map(a=>({a,key:-Math.log(Math.max(this.e.random(),1e-9))/Math.max(0.1,a.rating||0.1)})).sort((a,b)=>a.key-b.key)[0]?.a.id;
  }
  chooseItem(set,plan){const good=this.e.data.items.filter(i=>i.native&&this.itemWorks(set,i.id,plan));
    // Useful generic items are a prior, not a prescribed species set.
    const preferred=good.filter(i=>['leftovers','lifeorb','sitrusberry','lumberry','rockyhelmet','assaultvest','choiceband','choicespecs','choicescarf','eviolite','blacksludge','flameorb','toxicorb','lightclay','powerherb','whiteherb','focussash','expertbelt','muscleband','wiseglasses'].includes(i.id));
    return this.e.sample(preferred.length&&this.e.random()<0.9?preferred:good)?.name||'';
  }
  repair(original,plan={}){
    const set=clone(original),species=this.dex.species.get(set.species),pool=this.e.data.species[species.id].moves.filter(m=>this.e.data.moves[m].native&&this.usefulMove(m));
    const has=id=>set.moves.some(m=>this.dex.moves.get(m).id===id),physical=species.baseStats.atk>=species.baseStats.spa;
    const attackPool=pool.filter(m=>this.dex.moves.get(m).category!=='Status');
    const rankedAttacks=()=>attackPool.map(id=>{const m=this.dex.moves.get(id),category=m.category===(physical?'Physical':'Special')?1.6:0.5,stab=species.types.includes(m.type)?1.5:1,power=m.basePower||50;return {id,key:-Math.log(Math.max(this.e.random(),1e-9))/Math.max(1,power*category*stab)};}).sort((a,b)=>a.key-b.key).map(r=>r.id);
    const replacement=()=>rankedAttacks().find(m=>!set.moves.some(x=>this.dex.moves.get(x).id===m))||pool.find(m=>!has(m));
    set.moves=set.moves.map(m=>this.dex.moves.get(m).id);
    const sleep=()=>set.moves.some(m=>['spore','sleeppowder','hypnosis','lovelykiss','darkvoid','sing','grasswhistle','yawn'].includes(m));
    set.moves=set.moves.map(m=>!this.usefulMove(m)||(m==='dreameater'&&!sleep())||(['sleeptalk','snore'].includes(m)&&!has('rest'))?replacement():m);
    set.moves=[...new Set(set.moves)];while(set.moves.length<4)set.moves.push(replacement());
    if(!this.attacks(set).length&&attackPool.length)set.moves[0]=replacement();
    const reliable=attackPool.filter(id=>{const m=this.dex.moves.get(id);return (m.basePower>0||m.damage)&&!m.flags.charge&&!m.flags.recharge&&!['focuspunch','lastresort','dreameater','snore','suckerpunch','fakeout','bide','counter','mirrorcoat'].includes(id);});
    const selectedStrength=category=>this.attacks(set).filter(m=>m.category===category).reduce((sum,m)=>sum+(m.basePower||0),0);
    const mainCategory=selectedStrength('Physical')*species.baseStats.atk>=selectedStrength('Special')*species.baseStats.spa?'Physical':'Special';
    const stab=reliable.filter(id=>{const m=this.dex.moves.get(id);return m.category===mainCategory&&species.types.includes(m.type);});
    const replaceSlot=(id)=>{const scores=set.moves.map((m,i)=>({i,m,score:this.dex.moves.get(m).category==='Status'?0:1})).filter(r=>!(plan.trickRoom&&r.m==='trickroom')).sort((a,b)=>a.score-b.score);set.moves[scores[0].i]=id;};
    if(stab.length&&!set.moves.some(id=>stab.includes(id)))replaceSlot(this.e.sample(stab));
    const direct=set.moves.filter(id=>reliable.includes(id));
    if(direct.length<2&&reliable.length>=2){const option=rankedAttacks().find(id=>reliable.includes(id)&&!set.moves.includes(id));if(option)replaceSlot(option);}
    const attacks=this.attacks(set);const physicalMoves=attacks.filter(m=>m.category==='Physical'),specialMoves=attacks.filter(m=>m.category==='Special');
    const strength=category=>attacks.filter(m=>m.category===category).reduce((sum,m)=>sum+(m.basePower||0)*(species.types.includes(m.type)?1.5:1),0);
    const attackStat=physicalMoves.length&&!specialMoves.length?'atk':specialMoves.length&&!physicalMoves.length?'spa':strength('Physical')*species.baseStats.atk>=strength('Special')*species.baseStats.spa?'atk':'spa';
    const slow=!!plan.trickRoom&&species.baseStats.spe<=70;
    set.ivs={hp:31,atk:this.physical(set)?31:0,def:31,spa:31,spd:31,spe:slow?0:31};
    const evs={hp:0,atk:0,def:0,spa:0,spd:0,spe:0};
    // Starting spreads support the selected attacks; later calculator proposals can refine them.
    evs[attackStat]=252;evs[slow||species.baseStats.spe<70?'hp':'spe']=252;evs[evs.hp?'spd':'hp']=4;
    if(set.evs&&Object.values(set.evs).reduce((a,b)=>a+b,0)<=510){
      const proposed=clone(set.evs);
      if(!this.physical(set))proposed.atk=0;
      if(!specialMoves.length)proposed.spa=0;
      if(slow)proposed.spe=0;
      const total=Object.values(proposed).reduce((a,b)=>a+b,0);
      // Keep purposeful mutations only if their investment still supports the damage stat.
      if((proposed[attackStat]||0)>=128&&total>=400)set.evs=proposed;else set.evs=evs;
    }else set.evs=evs;
    if(slow){set.evs.spe=0;set.nature=attackStat==='atk'?'brave':'quiet';}
    else {const nature=this.dex.natures.get(set.nature);if(!nature.exists||!nature.plus||nature.minus===attackStat||nature.minus==='spe'||(!this.physical(set)&&nature.plus==='atk')||(!specialMoves.length&&nature.plus==='spa'))set.nature=attackStat==='atk'?(species.baseStats.spe>=70?'jolly':'adamant'):(species.baseStats.spe>=70?'timid':'modest');}
    let remaining=508-Object.values(set.evs).reduce((a,b)=>a+b,0);for(const stat of ['hp','spd','def',attackStat]){const add=Math.min(remaining,252-(set.evs[stat]||0));if(add>0){set.evs[stat]=(set.evs[stat]||0)+add;remaining-=add;}}
    const ability=this.dex.abilities.get(set.ability).id;
    const alternatives=Object.values(species.abilities).map(a=>this.dex.abilities.get(a).id);
    if((inertAbilities.has(ability)||harmfulAbilities.has(ability))&&alternatives.some(a=>!inertAbilities.has(a)&&!harmfulAbilities.has(a)&&a!=='moody'))set.ability=this.chooseAbility(set);
    if(!this.itemWorks(set,set.item,plan))set.item=this.chooseItem(set,plan);
    return set;
  }
  team(team,plan={}){const actual={trickRoom:!!plan.trickRoom&&team.some(s=>s.moves.some(m=>this.dex.moves.get(m).id==='trickroom'))};return team.map(s=>this.repair(s,actual));}
}
module.exports={SetRules};
