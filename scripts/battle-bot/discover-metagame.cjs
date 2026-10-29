'use strict';
// Empirical team search. Human teams are observations and comparison opponents.
const fs=require('node:fs');const path=require('node:path');
const {rng}=require('./breed.cjs');
const {legal,id,roles}=require('./foul-play-roster.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
function assemble(bank,random){return new (require('./legal-space.cjs').SetExplorer)(1,random).team();}

async function discover({bank,python,foul,output,population=8,generations=2,seed=1909,searchMs=10,maxTurns=150,calculatorEngine,matchupTargets,baselineFile},battle=require('./foul-play-smoke.cjs').smoke){
  for(const [name,value,max]of [['population',population,64],['generations',generations,20]])if(!Number.isInteger(value)||value<2||value>max)throw new Error('Invalid '+name);
  if(fs.existsSync(output))throw new Error('Use a new output directory');
  const data=JSON.parse(fs.readFileSync(bank,'utf8'));if(data.schema!==1||data.format!=='gen7ou')throw new Error('Invalid bank');
  const random=rng(seed),explorer=new (require('./legal-space.cjs').SetExplorer)(seed,random),seen=new Set(),teams=new Map(),games=[],history=[];
  if(baselineFile)explorer.baseline=require('./calc-baseline.cjs').loadBaseline(baselineFile);
  const add=(team,source)=>{const key=id(team);if(!teams.has(key))teams.set(key,{id:key,team:clone(team),source});return key;};
  const bankIds=[];for(const r of data.teams||[]){const t=r.team||r;if(legal(t)){const key=add(t,'human-bank');if(!bankIds.includes(key))bankIds.push(key);}}
  if(bankIds.length<4)throw new Error('Need four distinct comparison teams');
  // Disjoint held-out opponents are never used to guide candidate generation.
  const shuffled=bankIds.map(key=>({key,r:random()})).sort((a,b)=>a.r-b.r).map(x=>x.key);
  const baselineTargetSets=new Set((explorer.baseline?.targets||[]).map(t=>require('../../dist/sim').Teams.pack([t.set])));
  const holdoutEligible=shuffled.filter(key=>teams.get(key).team.every(s=>!baselineTargetSets.has(require('../../dist/sim').Teams.pack([s]))));
  if(holdoutEligible.length<2)throw new Error('Baseline overlaps too many bank opponents for an unexposed holdout panel');
  const holdout=holdoutEligible.slice(0,2),training=shuffled.filter(key=>!holdout.includes(key));
  const targets=matchupTargets?JSON.parse(fs.readFileSync(matchupTargets,'utf8')):training.slice(0,2).flatMap(key=>teams.get(key).team).map(set=>({set,role:'profile'}));
  if(matchupTargets&&!calculatorEngine)throw new Error('matchupTargets requires calculatorEngine');
  const targetValidator=require('../../dist/sim').TeamValidator.get('gen7ou');
  if(!Array.isArray(targets)||targets.some(t=>!t.set||targetValidator.validateTeam([clone(t.set)])||!['profile','check','breaker','revenge'].includes(t.role||'profile')||(t.surviveHits!==undefined&&(!Number.isInteger(t.surviveHits)||t.surviveHits<1))||(t.damagePercent!==undefined&&(!Number.isFinite(t.damagePercent)||t.damagePercent<0))))throw new Error('Invalid matchup target specification');
  const guide=calculatorEngine?new (require('./matchup-guide.cjs').MatchupGuide)({enginePath:calculatorEngine,targets}):null;
  if(guide&&explorer.baseline&&guide.calc.sha!==explorer.baseline.engineSHA256)throw new Error('Calculator engine differs from baseline; rebuild the baseline');
  const calculations=[];
  fs.mkdirSync(output,{recursive:true});
  require('./legal-space.cjs').writeCatalog(path.join(output,'legal-space.json'));
  const write=(file,value)=>fs.writeFileSync(path.join(output,file),JSON.stringify(value,null,2)+'\n');
  write('manifest.json',{schema:1,seed,population,generations,searchMs,maxTurns,bank:path.resolve(bank),bankSHA256:require('node:crypto').createHash('sha256').update(fs.readFileSync(bank)).digest('hex'),policy:'FoulPlay versus FoulPlay',generatorVersion:4,baselineFile:baselineFile?path.resolve(baselineFile):undefined,baselineEngineSHA256:explorer.baseline?.engineSHA256,baselineExploration:'75% calculator proposal attempt per set; score floors retain unpromising roles, 25% independent generator',ivPolicy:'31 in every stat; Attack 0 only with no physical moves; Speed 0 only on explicitly constructed slow Trick Room sets with 0 Speed EVs and a Speed-lowering nature',trainingPanel:training.slice(0,2),calculatorSHA256:guide?.calc.sha,matchupTargets:guide?targets:undefined,holdout,limitation:'Explores full learnsets, native-supported abilities/items, natures, EVs/IVs and lead order. Bank sets are optional proposals, not legality boundaries. Results depend on search policy and simulator parity.'});
  const play=async(candidate,rivals,phase,generation)=>{
    const results=[];
    for(let rival=0;rival<rivals.length;rival++)for(let side=0;side<2;side++){
      const row={candidate,rival:rivals[rival],phase,generation,side:side?'p2':'p1',seed:[seed,phase==='holdout'?500:1,rival+1,side+1]};
      row.attemptErrors=[];
      for(let attempt=0;attempt<2;attempt++){
        try{const result=await battle({python,foul,bank,foulBoth:true,team1:teams.get(side?rivals[rival]:candidate).team,team2:teams.get(side?candidate:rivals[rival]).team,foulSide:row.side,seed:row.seed,searchMs,maxTurns});row.result=result;row.points=result.winner==='FoulPlay'?1:result.winner==='FoulPlayOpponent'?0:0.5;results.push(row);break;}
        catch(error){row.attemptErrors.push(error.message);}
      }
      if(!row.result)row.error=row.attemptErrors.at(-1);
      games.push(row);fs.appendFileSync(path.join(output,'games.jsonl'),JSON.stringify(row)+'\n');
    }
    return {id:candidate,points:results.reduce((n,r)=>n+r.points,0),games:results.length,errors:2*rivals.length-results.length,capped:results.filter(r=>r.result.capped).length};
  };
  let leaders=[],archive=[];
  for(let generation=0;generation<generations;generation++){
    const cohort=[];let attempts=0;
    while(cohort.length<population&&attempts++<population*100){let team=explorer.team();
      if(leaders.length&&cohort.length<Math.ceil(population/2)){
        const parent=teams.get(leaders[Math.floor(random()*leaders.length)]).team;
        team=guide&&random()<0.75?guide.propose(parent,explorer):explorer.mutate(parent);
        if(!legal(team))continue;
      }
      const key=id(team);if(seen.has(key))continue;seen.add(key);add(team,'discovery');if(guide)calculations.push({id:key,...guide.team(team)});cohort.push(key);}
    if(cohort.length<population)throw new Error('Insufficient distinct candidates');
    // The fixed control panel and seeds allow comparisons across generations.
    const rivals=training.slice(0,2); // Fixed human controls across every generation; no weak-offspring replacement.
    const standings=[];
    const evaluated=[...new Set([...cohort,...archive])].filter(key=>!rivals.includes(key));
    for(const key of evaluated){const result=await play(key,rivals,'search',generation);standings.push(result);console.log(`Generation ${generation+1}: ${standings.length}/${evaluated.length}; ${result.points}/${result.games}; ${result.errors} errors`);}
    standings.sort((a,b)=>(a.errors>0)-(b.errors>0)||b.points-a.points||a.id.localeCompare(b.id));
    leaders=standings.filter(r=>!r.errors&&r.games===4).slice(0,4).map(r=>r.id);
    archive=[...new Set([...archive,...leaders])];
    if(guide)write('calculations.json',{targets,calculations});
    history.push({generation,rivals,standings,archive:[...archive]});write('search.json',{history});write('teams.json',[...teams.values()]);
  }
  const heldout=[];for(const key of archive)heldout.push(await play(key,holdout,'holdout',generations));
  // Admission is compatibility gated. Scores remain provisional, including losing teams.
  const records=heldout.filter(r=>!r.errors&&r.games===4&&!r.capped&&r.points/r.games>=0.5).map(r=>({...teams.get(r.id),roles:roles(teams.get(r.id).team),screen:{games:r.games,wins:games.filter(g=>g.candidate===r.id&&g.phase==='holdout'&&g.points===1).length,selfPlay:true},heldout:r}));
  // Always keep independently identified bank controls available for comparison and rotation.
  for(const key of training.slice(0,2))records.push({...teams.get(key),source:'bank',roles:roles(teams.get(key).team)});
  const species={};
  for(const game of games.filter(g=>g.result))for(const [key,points]of [[game.candidate,game.points],[game.rival,1-game.points]])for(const set of teams.get(key).team){const name=set.species;const row=species[name]||(species[name]={appearances:0,points:0});row.appearances++;row.points+=points;}
  write('proposal-sources.json',{calculator:explorer.baselineProposals,independent:explorer.independentProposals,note:'Counts include rejected proposals and probes; not usage rates.'});
  write('metagame.json',{species,interpretation:'Self-play exposure and team score associations, not causal individual strength or human usage. Search and holdout games are separately identifiable in games.jsonl.'});
  write('holdout.json',{results:heldout,limitation:'Four held-out games per candidate are provisional. Admission requires no errors/caps and at least 50% held-out score; four games do not establish superiority. Archived leaders from earlier generations are retained.'});
  write('roster.json',{schema:1,format:'gen7ou',records});write('teams.json',[...teams.values()]);
  return {tested:seen.size,completed:games.filter(g=>g.result).length,errors:games.filter(g=>g.error).length,discoveredTeams:records.filter(r=>r.source==='discovery').length,roster:path.resolve(output,'roster.json')};
}
if(require.main===module){const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i+=2){const k=args[i].replace(/^--/,'');if(!['bank','python','foul','output','population','generations','seed','searchMs','maxTurns','calculatorEngine','matchupTargets','baselineFile'].includes(k)||args[i+1]===undefined)throw new Error('Invalid option');options[k]=['population','generations','seed','searchMs','maxTurns'].includes(k)?Number(args[i+1]):args[i+1];}discover(options).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1;});}
module.exports={assemble,discover};
