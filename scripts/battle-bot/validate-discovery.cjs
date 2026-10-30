'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {legal,id}=require('./foul-play-roster.cjs');const {rng}=require('./breed.cjs');const clone=x=>JSON.parse(JSON.stringify(x));
async function validate({run,bank,python,foul,output,opponents=12,repeats=2,seed=3301,searchMs=30,maxTurns=150,hours=8,pauseMs=100,minFreeGB=10},battle=require('./foul-play-smoke.cjs').smoke){
 for(const [k,v,max]of [['opponents',opponents,64],['repeats',repeats,20],['searchMs',searchMs,10000],['maxTurns',maxTurns,1000],['seed',seed,65535]])if(!Number.isInteger(v)||v<1||v>max)throw Error('Invalid '+k);
 if(fs.existsSync(output))throw Error('Use a fresh output directory');
 const read=f=>JSON.parse(fs.readFileSync(path.join(run,f),'utf8'));const teams=read('teams.json'),held=read('holdout.json'),oldGames=fs.readFileSync(path.join(run,'games.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
 const byId=new Map(teams.map(r=>[r.id,r]));const candidates=held.results.map(r=>byId.get(r.id));if(!candidates.length||candidates.some(r=>!r||!legal(r.team)))throw Error('Invalid frozen finalists');
 const used=new Set(oldGames.flatMap(g=>[g.candidate,g.rival]));const data=JSON.parse(fs.readFileSync(bank,'utf8'));if(data.schema!==1||data.format!=='gen7ou')throw Error('Invalid bank');
 const unique=new Map();for(const r of data.teams||[]){const team=r.team||r;if(legal(team)&&!used.has(id(team)))unique.set(id(team),{id:id(team),team:clone(team)});}
 const random=rng(seed),pool=[...unique.values()];for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
 if(pool.length<opponents)throw Error('Not enough previously unused bank teams');const panel=pool.slice(0,opponents),planned=candidates.length*opponents*repeats*2;
 const guard=require('./research-limits.cjs').createLimits({output,hours,pauseMs,minFreeGB,maxMemoryMB:2048,maxDiskMB:1024});
 fs.mkdirSync(path.join(output,'traces'),{recursive:true});const write=(file,value)=>fs.writeFileSync(path.join(output,file),JSON.stringify(value,null,2)+'\n');
 write('manifest.json',{schema:1,run:path.resolve(run),seed,opponents,repeats,searchMs,maxTurns,planned,candidates,panel,bankSHA256:crypto.createHash('sha256').update(fs.readFileSync(bank)).digest('hex'),liveChanges:false,limitations:['Previously unused team combinations, not unseen individual sets.','Foul Play search is stochastic despite fixed simulator seeds.','No policy training or automatic live admission.','Resource guards run between battles and cap Node RSS, not total Python memory.','Trace limit 4 MiB per game; remaining trace entries omitted after limit.']});
 const standings=candidates.map(r=>({id:r.id,games:0,wins:0,losses:0,ties:0,errors:0,capped:0}));let completed=0,attempted=0,stopReason;const stop=()=>guard.requestStop();process.on('SIGINT',stop);process.on('SIGTERM',stop);
 const summary=complete=>({complete,validForScore:complete&&standings.every(s=>!s.errors&&!s.capped),planned,attempted,completed,stopReason,standings,liveChanges:false});
 try{for(let c=0;c<candidates.length;c++)for(let o=0;o<panel.length;o++)for(let repeat=0;repeat<repeats;repeat++)for(let side=0;side<2;side++){
  await guard.checkpoint();const row={candidate:candidates[c].id,rival:panel[o].id,repeat,side:side?'p2':'p1',seed:[seed,o+1,repeat+1,side+1]},stat=standings[c],trace=path.join(output,'traces',String(++attempted).padStart(5,'0')+'.jsonl');let traceBytes=0;
  const record=value=>{const line=JSON.stringify(value)+'\n';if(traceBytes+Buffer.byteLength(line)<=4*1024*1024){fs.appendFileSync(trace,line);traceBytes+=Buffer.byteLength(line);}else row.traceTruncated=true;};
  try{row.result=await battle({python,foul,bank,team1:clone(side?panel[o].team:candidates[c].team),team2:clone(side?candidates[c].team:panel[o].team),foulBoth:true,foulSide:row.side,seed:row.seed,searchMs,maxTurns,onEvent:event=>record({type:'event',event}),onDecision:decision=>record({type:'decision',...decision})});
   stat.games++;completed++;stat.capped+=Number(!!row.result.capped);if(row.result.winner==='FoulPlay')stat.wins++;else if(row.result.winner==='FoulPlayOpponent')stat.losses++;else stat.ties++;
  }catch(error){row.error=error.message;stat.errors++;}
  row.trace=path.relative(output,trace);fs.appendFileSync(path.join(output,'games.jsonl'),JSON.stringify(row)+'\n');write('summary.json',summary(false));console.log(`Validation ${attempted}/${planned}: ${stat.id} ${stat.wins}W ${stat.losses}L ${stat.ties}T; ${stat.errors} errors`);
 }}catch(error){if(error.code==='RESEARCH_LIMIT')stopReason=error.message;else throw error;}finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);write('summary.json',summary(attempted===planned));}
 return summary(attempted===planned);
}
if(require.main===module){const a=process.argv.slice(2),o={};for(let i=0;i<a.length;i+=2){const k=a[i].replace(/^--/,'');if(!['run','bank','python','foul','output','opponents','repeats','seed','searchMs','maxTurns','hours','pauseMs','minFreeGB'].includes(k)||a[i+1]===undefined)throw Error('Invalid option');o[k]=['run','bank','python','foul','output'].includes(k)?a[i+1]:Number(a[i+1]);}validate(o).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1;});}
module.exports={validate};
