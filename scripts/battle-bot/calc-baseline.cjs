'use strict';
// Separate calculator reconnaissance. Evidence produces proposals, never species bans.
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {SetExplorer}=require('./legal-space.cjs');const {MatchupGuide}=require('./matchup-guide.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function signature(set){const copy=clone(set);delete copy.benchmark;return hash(copy);}
const utility=['stealthrock','spikes','toxicspikes','stickyweb','defog','rapidspin','taunt','encore','trickroom','wish','healingwish','batonpass','uturn','voltswitch','trick','switcheroo','roar','whirlwind','toxic','willowisp','thunderwave','spore','leechseed','destinybond','perishsong','haze','psychup','reflect','lightscreen','auroraveil','substitute','guardsplit','powersplit','powertrick','skillswap','roleplay','gastroacid','topsyturvy','transform','imprison','disable','healbell','aromatherapy','partingshot'];
const recovery=['recover','roost','slackoff','softboiled','shoreup','synthesis','moonlight','morningsun','rest','strengthsap'];
function speed(guide,set){const mon=guide.calc.pokemon(set),item=guide.calc.dex.items.get(set.item).id;return Math.floor(mon.rawStats.spe*(item==='choicescarf'?1.5:['ironball','machobrace'].includes(item)?0.5:1));}
function scoreProfile(p,role){if(p.unavailable)return false;if(role==='defensive')return p.incoming.length>0&&Math.max(...p.incoming.map(m=>m.range[1]))*2<p.hp;
  return role==='offensive'?(p.outspeeds&&p.minimumDamagePercent>=100)||(p.survivesTargetHits&&p.minimumDamagePercent>=100):p.objectiveMet;}
function targetPanel(data,e,count,results){const bySpecies=new Map();
  for(const row of data.teams||[])for(const set of row.team||row){if(!bySpecies.has(e.dex.species.get(set.species).id)&&!e.validator.validateTeam([clone(set)]))bySpecies.set(e.dex.species.get(set.species).id,clone(set));}
  const observed=[];
  if(results){const teams=new Map(JSON.parse(fs.readFileSync(path.join(results,'teams.json'),'utf8')).map(t=>[t.id,t]));const records=fs.readFileSync(path.join(results,'games.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);const scores=new Map();
    for(const r of records.filter(r=>r.result))for(const [key,p]of [[r.candidate,r.points],[r.rival,1-r.points]]){const old=scores.get(key)||{points:0,games:0};old.points+=p;old.games++;scores.set(key,old);}
    const ranked=[...scores].filter(([,r])=>r.games>=4).sort((a,b)=>b[1].points/b[1].games-a[1].points/a[1].games||a[0].localeCompare(b[0]));
    for(const [key,record]of ranked)for(const set of teams.get(key)?.team||[])if(!observed.some(t=>t.set.species===set.species)&&!e.validator.validateTeam([clone(set)]))observed.push({set:clone(set),role:'profile',source:'observed-successful-team',teamScore:record.points/record.games,teamGames:record.games});
  }
  const selected=observed.slice(0,Math.ceil(count/2));
  const primary=e.pool.filter(n=>!e.dex.species.get(n).nfe).sort((a,b)=>e.dex.species.get(b).bst-e.dex.species.get(a).bst);
  // A diverse strong-stat probe panel supplements observed team evidence; it does not define candidate eligibility.
  const names=primary.filter(n=>!selected.some(t=>e.dex.species.get(t.set.species).id===n));
  const size=Math.min(count-selected.length,names.length);for(let i=0;i<size;i++){const name=names[Math.floor(i*names.length/size)];selected.push({set:bySpecies.get(name)||e.set(name),role:'profile',source:bySpecies.has(name)?'bank-example':'independent-probe'});}
  return selected;
}
function coverageSet(e,guide,name,ability,kind,targets,itemName){const s=e.data.species[name],physical=kind==='physical',defensive=kind==='defense'||kind==='specialDefense',mixed=kind==='mixed';
  const stat=physical?'atk':'spa',evs={hp:0,atk:0,def:0,spa:0,spd:0,spe:0};
  if(defensive){evs.hp=252;evs[kind==='defense'?'def':'spd']=252;evs.spd+=kind==='defense'?4:0;evs.def+=kind==='specialDefense'?4:0;}
  else if(mixed){evs.atk=128;evs.spa=128;evs.spe=252;}
  else{evs[stat]=252;evs.spe=252;evs.hp=4;}
  const base={species:s.name,name:s.name,level:100,ability,item:itemName||(defensive?'Leftovers':'Life Orb'),nature:defensive?(kind==='defense'?'bold':'calm'):mixed?'naive':physical?'adamant':'modest',evs,ivs:{hp:31,atk:31,def:31,spa:31,spd:31,spe:31},moves:[]};
  if(e.mechanics&&e.dex.abilities.get(ability).rating<0)return null;
  const pool=(s.abilityMoves[ability]||[]).filter(id=>e.data.moves[id]?.native&&e.rules.usefulMove(id));
  const attacks=pool.filter(id=>{const m=e.dex.moves.get(id);return (!e.mechanics||e.mechanics.safeMoves.has(id))&&m.category!=='Status'&&(m.basePower||m.damage)&&!m.flags.charge&&!m.flags.recharge&&(e.mechanics||!['focuspunch','dreameater','lastresort','snore','bide','counter','mirrorcoat','selfdestruct','explosion','finalgambit'].includes(id))&&(mixed||defensive||m.category===(physical?'Physical':'Special'));});
  if(!attacks.length)return null;
  const targetsHP=targets.map(t=>guide.calc.pokemon(t.set).maxHP());
  const ranges=new Map();for(const id of attacks){const probe={...base,moves:[id]};if(!e.validator.validateTeam([clone(probe)])){const values=targets.map((t,i)=>{const p=guide.profile(probe,t);return p.unavailable?null:(p.outgoing[0]?.range[0]||0)/targetsHP[i]*(typeof e.dex.moves.get(id).accuracy==='number'?e.dex.moves.get(id).accuracy/100:1);});ranges.set(id,values);}}
  if(!ranges.size)return null;
  const best=targets.map(()=>0),selected=[];
  // Greedy marginal coverage across exact target sets, rather than four independently high-power attacks.
  for(let slot=0;slot<(base.item.startsWith('Choice')?4:defensive?2:3);slot++){let winner,bestGain=-Infinity;for(const [id,values]of ranges){if(selected.includes(id))continue;const move=e.dex.moves.get(id);const gain=values.reduce((sum,value,i)=>sum+(value===null?0:Math.max(0,Math.min(1.5,value)-Math.min(1.5,best[i]))),0)+(slot===0&&s.types.includes(move.type)?0.02:0);if(gain>bestGain){winner=id;bestGain=gain;}}
    if(!winner)break;selected.push(winner);ranges.get(winner).forEach((value,i)=>{if(value!==null)best[i]=Math.max(best[i],value);});}
  if(mixed){const categories=selected.map(id=>e.dex.moves.get(id).category);if(!categories.includes('Physical')||!categories.includes('Special'))return null;}
  const options=defensive?[...recovery,...utility]:[...utility,...recovery,'swordsdance','nastyplot','calmmind','dragondance','coil','quiverdance','shellsmash'];
  for(const id of options)if(pool.includes(id)&&!selected.includes(id)&&selected.length<4&&!(recovery.includes(id)&&selected.some(m=>recovery.includes(m))))selected.push(id);
  for(const id of ranges.keys())if(selected.length<4&&!selected.includes(id))selected.push(id);
  if(selected.length<4)return null;base.moves=selected;
  base.ivs.atk=e.rules.physical(base)?31:0;
  // Choose a nature that doesn't weaken a used offensive stat on a purely physical defender.
  if(defensive&&base.moves.every(id=>e.dex.moves.get(id).category!=='Special'))base.nature=kind==='defense'?'impish':'careful';
  return e.validator.validateTeam([clone(base)])?null:base;
}
function optimizeInvestment(guide,e,set,target,role){let result=clone(set),tested=0;const attack=e.rules.physical(set)&&!set.moves.some(m=>e.dex.moves.get(m).category==='Special')?'atk':'spa';
  const goal=role==='defensive'?'check':'revenge';const objective={...target,role:goal,surviveHits:role==='defensive'?2:1};
  const meets=s=>{tested++;const p=guide.profile(s,objective);return !p.unavailable&&p.objectiveMet;};
  if(!meets(result))return {set:result,objective,tested,met:false};
  // Search every 4-EV increment along the selected stat, with the other starting investments fixed.
  const varying=role==='defensive'?(result.evs.def>=result.evs.spd?'def':'spd'):attack;
  for(let value=0;value<=252;value+=4){const candidate=clone(result);candidate.evs[varying]=value;if(meets(candidate)){result=candidate;break;}}
  if(role!=='defensive'){for(let value=0;value<=252;value+=4){const candidate=clone(result);candidate.evs.spe=value;if(speed(guide,candidate)>speed(guide,target.set)){result=candidate;break;}}}
  const used=Object.values(result.evs).reduce((a,b)=>a+b,0);let spare=508-used;
  for(const stat of role==='defensive'?[attack,'spe']:['hp','spd','def']){const add=Math.min(spare,252-(result.evs[stat]||0));if(add>0){result.evs[stat]=(result.evs[stat]||0)+add;spare-=add;}}
  const met=meets(result)&&!e.validator.validateTeam([clone(result)]);
  if(met){result.benchmark={target:clone(target.set),role:goal,surviveHits:objective.surviveHits,method:'4-EV coordinate threshold search; not global optimum'};result.benchmark.signature=signature(result);}
  return {set:met?result:clone(set),objective,tested,met};
}
async function baseline({bank,calculatorEngine,output,seed=2201,targetCount=24,species:speciesFilter,results,mechanicsReport,checkpoint}){
  if(fs.existsSync(output))throw Error('Use a new output directory');if(!Number.isInteger(targetCount)||targetCount<2||targetCount>115)throw Error('targetCount must be 2–115');
  const e=new SetExplorer(seed),data=JSON.parse(fs.readFileSync(bank,'utf8'));if(data.schema!==1||data.format!=='gen7ou')throw Error('Invalid bank');
  let mechanics;
  if(mechanicsReport){mechanics=JSON.parse(fs.readFileSync(mechanicsReport,'utf8'));if(!mechanics.complete||mechanics.limited||mechanics.legalSHA256!==hash(e.data))throw Error('Mechanics report is incomplete, limited or belongs to different legality data');
    const grouped=new Map();for(const row of mechanics.results.filter(r=>e.dex.abilities.get(r.ability).rating>=0)){if(!grouped.has(row.move))grouped.set(row.move,[]);grouped.get(row.move).push(row);}
    e.mechanics={safeMoves:new Set([...grouped].filter(([,rows])=>rows.every(r=>r.status==='no-disagreement-observed')).map(([id])=>id))};
  }
  const targets=targetPanel(data,e,targetCount,results),guide=new MatchupGuide({enginePath:calculatorEngine,targets});
  const names=speciesFilter?speciesFilter.split(',').map(n=>e.dex.species.get(n).id):e.pool;
  if(names.some(n=>!e.pool.includes(n)))throw Error('Species outside selectable custom pool');
  fs.mkdirSync(output,{recursive:true});const records=[];
  const manifest={schema:1,complete:false,mechanicsReport:mechanicsReport?path.resolve(mechanicsReport):undefined,mechanicsSHA256:mechanics?hash(mechanics):undefined,mechanicsCoverage:mechanics?.coverage,format:'gen7ou',seed,targets,engineSHA256:guide.calc.sha,legalSHA256:hash(e.data),bankSHA256:hash(data),limitations:['Neutral-field finite target panel, not a solved metagame.','Support, trapping, setup, weather, hazards and team synergy need battle evaluation.','Equal target weights; observed team success does not establish individual species strength.','Role scores describe tested sets, not permanent species categories.','Damage ranges are conditional on hits. Greedy coverage weights accuracy; not a full probabilistic duel.']};fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  for(const name of names){const s=e.data.species[name],tested=[],failures=[];
    for(const ability of s.abilities.filter(a=>a!=='moody'&&e.data.nativeAbilities.includes(a)))for(const kind of ['physical','special','mixed','defense','specialDefense'])for(const item of kind==='physical'?['Life Orb','Choice Band','Choice Scarf']:kind==='special'?['Life Orb','Choice Specs','Choice Scarf']:kind==='mixed'?['Life Orb']:e.dex.species.get(name).nfe?['Leftovers','Eviolite']:['Leftovers']){
      await checkpoint?.();
      try{const set=coverageSet(e,guide,name,ability,kind,targets,item);if(!set)continue;const role=kind==='defense'||kind==='specialDefense'?'defensive':kind==='mixed'?'mixed':'offensive';const profiles=targets.map(t=>guide.profile(set,t));const eligible=profiles.filter(p=>!p.unavailable);const score=eligible.length?eligible.filter(p=>scoreProfile(p,role)).length/targets.length:0;tested.push({kind,role,set,score,profiles,available:eligible.length});}catch(error){failures.push({ability,kind,item,error:error.message});}}
    const selected=[];for(const role of ['offensive','mixed','defensive']){const leader=tested.filter(r=>r.role===role&&r.available>0).sort((a,b)=>b.score-a.score)[0];if(leader){selected.push(leader);const candidates=targets.map((t,i)=>({t,p:leader.profiles[i]})).filter(({p})=>!p.unavailable&&(role==='defensive'?scoreProfile(p,role):p.outspeeds&&p.minimumDamagePercent>=100));
      candidates.sort((a,b)=>Number(b.t.source==='observed-successful-team')-Number(a.t.source==='observed-successful-team')||(role==='defensive'?Math.max(...b.p.incoming.map(m=>m.range[1]))/b.p.hp-Math.max(...a.p.incoming.map(m=>m.range[1]))/a.p.hp:a.p.minimumDamagePercent-b.p.minimumDamagePercent));
      const target=candidates[0]?.t;
      if(target&&role!=='mixed'){const investment=optimizeInvestment(guide,e,leader.set,target,role);leader.investment=investment;if(investment.met){const profiles=targets.map(t=>guide.profile(investment.set,t));selected.push({...leader,set:investment.set,kind:leader.kind+'-threshold',profiles,score:profiles.filter(p=>scoreProfile(p,role)).length/targets.length});}}}}
    const roles=Object.fromEntries(['offensive','mixed','defensive'].map(role=>{const values=tested.filter(r=>r.role===role&&r.available>0).map(r=>r.score);return [role,values.length?Math.max(...values):null];}));
    const support=s.moves.filter(m=>utility.includes(m)||recovery.includes(m));
    let supportBase=selected.find(r=>r.role==='defensive')||selected[0];
    if(!supportBase&&support.length>=2){try{const set=e.set(name);set.evs={hp:252,atk:0,def:252,spa:0,spd:4,spe:0};set.nature=e.rules.physical(set)?'impish':'bold';set.item='Leftovers';supportBase={set};}catch{}}
    if(supportBase&&support.length>=2){const set=clone(supportBase.set);delete set.benchmark;
      const options=[];const add=id=>{if(id&&options.length<3&&!options.includes(id))options.push(id);};
      add(support.find(id=>recovery.includes(id)));add(support.find(id=>['stealthrock','spikes','toxicspikes','stickyweb'].includes(id)));add(support.find(id=>['defog','rapidspin','taunt','encore','uturn','voltswitch','wish','thunderwave','toxic','willowisp'].includes(id)));for(const id of support)add(id);
      const attack=set.moves.find(id=>e.dex.moves.get(id).category!=='Status');
      if(options.length===3){set.moves=attack?[attack,...options]:[...options,support.find(id=>!options.includes(id))||set.moves.find(id=>!options.includes(id))];set.ivs.atk=e.rules.physical(set)?31:0;if(!e.rules.itemWorks(set,set.item))set.item='Leftovers';if(!e.validator.validateTeam([clone(set)]))selected.push({set,role:'support',score:0,kind:'unmeasured-support-exploration'});}}
    const deferredMoves=e.mechanics?s.moves.filter(m=>e.data.moves[m]?.category!=='Status'&&!e.mechanics.safeMoves.has(m)):[];
    const record={species:name,deferredMoves,deferredAbilities:e.mechanics?s.abilities.filter(a=>e.dex.abilities.get(a).rating<0):[],roleEvidence:{...roles,support:null},support:{moves:support,abilities:s.abilities.filter(a=>['shadowtag','arenatrap','magnetpull','prankster','magicbounce','unaware','intimidate','drizzle','drought','sandstream','snowwarning','regenerator','naturalcure'].includes(a)),status:'potential only; not evaluated by direct-damage score'},proposals:selected.map(r=>{const set=clone(r.set);if(!set.benchmark){set.benchmark={role:r.role,method:'calculator role profile; not an optimized global set'};set.benchmark.signature=signature(set);}return {set,role:r.role,score:r.score,kind:r.kind};}),tested,failures};records.push(record);
    fs.appendFileSync(path.join(output,'species.jsonl'),JSON.stringify(record)+'\n');
    // Partial checkpoints allow inspection during a long calculator pass.
    fs.writeFileSync(path.join(output,'baseline.json'),JSON.stringify({...manifest,species:records.map(r=>({species:r.species,deferredMoves:r.deferredMoves,deferredAbilities:r.deferredAbilities,roleEvidence:r.roleEvidence,support:r.support,proposals:r.proposals}))},null,2)+'\n');
    guide.cache.clear();
    console.log(`Calculator baseline ${records.length}/${names.length}: ${name}; ${tested.length} role/set probes`);
    await new Promise(resolve=>setImmediate(resolve));
  }
  manifest.complete=true;fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  fs.writeFileSync(path.join(output,'baseline.json'),JSON.stringify({...manifest,species:records.map(r=>({species:r.species,deferredMoves:r.deferredMoves,deferredAbilities:r.deferredAbilities,roleEvidence:r.roleEvidence,support:r.support,proposals:r.proposals}))},null,2)+'\n');
  return {species:records.length,proposals:records.reduce((n,r)=>n+r.proposals.length,0),failedProbes:records.reduce((n,r)=>n+r.failures.length,0),baseline:path.resolve(output,'baseline.json')};
}
function loadBaseline(file){const data=JSON.parse(fs.readFileSync(file,'utf8'));const e=new SetExplorer(1);if(data.complete!==true||data.schema!==1||data.format!=='gen7ou'||data.legalSHA256!==hash(e.data)||!Array.isArray(data.species)||!Array.isArray(data.targets))throw Error('Baseline belongs to different legality data');
  for(const record of data.species){if(!e.pool.includes(record.species)||!Array.isArray(record.proposals))throw Error('Invalid baseline species');for(const p of record.proposals){if(e.dex.species.get(p.set.species).id!==record.species||!Number.isFinite(p.score)||p.score<0||p.score>1||e.validator.validateTeam([clone(p.set)]))throw Error('Invalid baseline proposal');require('./foul-play-team.cjs').validateCustomTeam(Array.from({length:6},()=>clone(p.set)));}}
  return data;}
if(require.main===module){const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i+=2){const k=args[i].replace(/^--/,'');if(!['bank','calculatorEngine','output','seed','targetCount','species','results','mechanicsReport'].includes(k)||args[i+1]===undefined)throw Error('Invalid option');options[k]=['seed','targetCount'].includes(k)?Number(args[i+1]):args[i+1];}baseline(options).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1;});}
module.exports={baseline,coverageSet,optimizeInvestment,loadBaseline,signature,scoreProfile};
