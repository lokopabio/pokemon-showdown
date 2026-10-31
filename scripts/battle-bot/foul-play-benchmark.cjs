'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {smoke}=require('./foul-play-smoke.cjs');
const {validateCustomTeam}=require('./foul-play-team.cjs');
const {Model,fingerprint}=require('./learned.cjs');
const {rng}=require('./breed.cjs');
function assignments(a,b) {
  return [{team1:a,team2:b,foulSide:'p1',foulTeam:0},{team1:b,team2:a,foulSide:'p2',foulTeam:0},
    {team1:b,team2:a,foulSide:'p1',foulTeam:1},{team1:a,team2:b,foulSide:'p2',foulTeam:1}];
}
async function benchmark({python,foul,bank,modelFile,output,pairs=4,seed=303,searchMs=10,maxTurns=150,calculator}) {
  for(const [key,value] of Object.entries({pairs,seed,searchMs,maxTurns}))if(!Number.isSafeInteger(value)||value<1)throw new Error('Invalid '+key);
  if(pairs>1000||seed>65535||searchMs>10000)throw new Error('Benchmark bounds exceeded');
  const model=Model.load(modelFile);
  if(fs.existsSync(output))throw new Error('Use a new output directory');
  const b=JSON.parse(fs.readFileSync(bank,'utf8'));
  if(b.schema!==1||b.format!=='gen7ou')throw new Error('Invalid bank');
  const teams=(b.teams||[]).map(r=>r.team||r).filter(t=>{try{validateCustomTeam(t);return true;}catch{return false;}});
  if(teams.length<2)throw new Error('Need two eligible complete teams in bank');
  const random=rng(seed);
  const schedule=Array.from({length:pairs},()=>{
    const a=Math.floor(random()*teams.length);let c=Math.floor(random()*(teams.length-1));if(c>=a)c++;
    return {teams:[teams[a],teams[c]],bankIndices:[a,c]};
  });
  fs.mkdirSync(output,{recursive:true});
  const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  const manifest={schema:1,createdAt:new Date().toISOString(),model:path.resolve(modelFile),modelSha256:hash(modelFile),episodes:model.episodes,
    simulatorFingerprint:fingerprint(),bankSha256:hash(bank),pairs,seed,searchMs,maxTurns,calculator:calculator||null,schedule,
    limitation:'Four games per pair balance both team assignment and player position. Search randomness is not seeded. Timing includes Python IPC/startup. This development sample does not establish general playing strength.'};
  fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
  const result={planned:pairs*4,completed:0,wins:0,losses:0,ties:0,capped:0,errors:[],decisionTimes:{},validForScore:false};
  for(let k=0;k<schedule.length;k++)for(const [index,game]of assignments(...schedule[k].teams).entries()) {
    try {
      const r=await smoke({python,foul,bank,modelFile,calculator,searchMs,maxTurns,...game,seed:[seed,k+1,53,61]});
      result.completed++;if(r.winner==='FoulPlay')result.wins++;else if(r.winner==='tie')result.ties++;else result.losses++;
      if(r.capped)result.capped++;
      for(const [name,t]of Object.entries(r.decisionTimes)){const total=result.decisionTimes[name]||{count:0,totalMs:0,maxMs:0};total.count+=t.count;total.totalMs+=t.totalMs;total.maxMs=Math.max(total.maxMs,t.maxMs);result.decisionTimes[name]=total;}
      fs.appendFileSync(path.join(output,'battles.jsonl'),JSON.stringify({pair:k,game:index,foulTeam:game.foulTeam,...r})+'\n');
    }catch(e){result.errors.push({pair:k,game:index,error:e.message});}
    result.validForScore=result.completed===result.planned&&result.errors.length===0;
    fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(result,null,2));
    console.log(`Pair ${k+1}, game ${index+1}: ${result.wins}W ${result.losses}L ${result.ties}T; ${result.errors.length} errors`);
  }
  return result;
}
if(require.main===module){
  const options={};const keys={'python':'python','foul':'foul','bank':'bank','model':'modelFile','output':'output','pairs':'pairs','seed':'seed','search-ms':'searchMs','max-turns':'maxTurns'};
  const args=process.argv.slice(2);for(let i=0;i<args.length;i+=2){const key=keys[args[i].replace(/^--/,'')];if(!key||args[i+1]===undefined)throw new Error('Unknown or missing option');options[key]=['pairs','seed','searchMs','maxTurns'].includes(key)?Number(args[i+1]):args[i+1];}
  for(const key of ['python','foul','bank','modelFile','output'])if(!options[key])throw new Error('Required: --python --foul --bank --model --output');
  benchmark(options).then(r=>{console.log(JSON.stringify(r,null,2));if(r.errors.length)process.exitCode=1;}).catch(e=>{console.error(e);process.exitCode=1;});
}
module.exports={benchmark,assignments};
