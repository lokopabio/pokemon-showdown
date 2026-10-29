'use strict';
// Empirical team search. Human teams are observations and comparison opponents.
const fs=require('node:fs');const path=require('node:path');
const {rng}=require('./breed.cjs');
const {legal,id,roles}=require('./foul-play-roster.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
function assemble(bank,random){
  const bySpecies=new Map();
  for(const s of [...(bank.sets||[]).map(r=>r.set||r),...(bank.teams||[]).flatMap(r=>r.team||r)]){const name=s.species.toLowerCase();if(!bySpecies.has(name))bySpecies.set(name,[]);bySpecies.get(name).push(s);}
  const names=[...bySpecies.keys()],sample=a=>a[Math.floor(random()*a.length)];
  for(let attempt=0;attempt<1000;attempt++){
    const picked=[...names].map(n=>({n,key:random()})).sort((a,b)=>a.key-b.key).slice(0,6);
    const team=picked.map(({n})=>clone(sample(bySpecies.get(n))));
    if(legal(team))return team;
  }
  throw new Error('Could not assemble a legal independent team');
}
async function discover({bank,python,foul,output,population=8,generations=2,seed=1909,searchMs=10,maxTurns=150},battle=require('./foul-play-smoke.cjs').smoke){
  for(const [name,value,max]of [['population',population,64],['generations',generations,20]])if(!Number.isInteger(value)||value<2||value>max)throw new Error('Invalid '+name);
  if(fs.existsSync(output))throw new Error('Use a new output directory');
  const data=JSON.parse(fs.readFileSync(bank,'utf8'));if(data.schema!==1||data.format!=='gen7ou')throw new Error('Invalid bank');
  const random=rng(seed),seen=new Set(),teams=new Map(),games=[],history=[];
  const add=(team,source)=>{const key=id(team);if(!teams.has(key))teams.set(key,{id:key,team:clone(team),source});return key;};
  const bankIds=[];for(const r of data.teams||[]){const t=r.team||r;if(legal(t)){const key=add(t,'human-bank');if(!bankIds.includes(key))bankIds.push(key);}}
  if(bankIds.length<4)throw new Error('Need four distinct comparison teams');
  // Disjoint held-out opponents are never used to guide candidate generation.
  const shuffled=bankIds.map(key=>({key,r:random()})).sort((a,b)=>a.r-b.r).map(x=>x.key);
  const holdout=shuffled.slice(0,2),training=shuffled.slice(2);
  fs.mkdirSync(output,{recursive:true});
  const write=(file,value)=>fs.writeFileSync(path.join(output,file),JSON.stringify(value,null,2)+'\n');
  write('manifest.json',{schema:1,seed,population,generations,searchMs,maxTurns,bank:path.resolve(bank),bankSHA256:require('node:crypto').createHash('sha256').update(fs.readFileSync(bank)).digest('hex'),policy:'FoulPlay versus FoulPlay',holdout,limitation:'Explores compositions from bank sets. Does not yet discover new movesets. Results depend on search policy and simulator parity.'});
  const play=async(candidate,rivals,phase,generation)=>{
    const results=[];
    for(let rival=0;rival<rivals.length;rival++)for(let side=0;side<2;side++){
      const row={candidate,rival:rivals[rival],phase,generation,side:side?'p2':'p1',seed:[seed,generation+1,rival+1,side+1]};
      try{const result=await battle({python,foul,bank,foulBoth:true,team1:teams.get(side?rivals[rival]:candidate).team,team2:teams.get(side?candidate:rivals[rival]).team,foulSide:row.side,seed:row.seed,searchMs,maxTurns});row.result=result;row.points=result.winner==='FoulPlay'?1:result.winner==='FoulPlayOpponent'?0:0.5;results.push(row);}
      catch(error){row.error=error.message;}
      games.push(row);fs.appendFileSync(path.join(output,'games.jsonl'),JSON.stringify(row)+'\n');
    }
    return {id:candidate,points:results.reduce((n,r)=>n+r.points,0),games:results.length,errors:2*rivals.length-results.length,capped:results.filter(r=>r.result.capped).length};
  };
  let leaders=[];
  for(let generation=0;generation<generations;generation++){
    const cohort=[];let attempts=0;
    while(cohort.length<population&&attempts++<population*100){let team=assemble(data,random);
      if(leaders.length&&cohort.length<Math.ceil(population/2)){
        const donor=team;team=clone(teams.get(leaders[Math.floor(random()*leaders.length)]).team);
        for(let swap=0;swap<1+Math.floor(random()*2);swap++)team[Math.floor(random()*6)]=clone(donor[Math.floor(random()*6)]);
        if(!legal(team))continue;
      }
      const key=id(team);if(seen.has(key))continue;seen.add(key);add(team,'discovery');cohort.push(key);}
    if(cohort.length<population)throw new Error('Insufficient distinct candidates');
    // Common rivals and seeds within a generation; later generations face a discovered leader too.
    const rivals=[training[generation%training.length],leaders[0]||training[(generation+1)%training.length]];
    const standings=[];
    for(const key of cohort){const result=await play(key,rivals,'search',generation);standings.push(result);console.log(`Generation ${generation+1}: ${standings.length}/${population}; ${result.points}/${result.games}; ${result.errors} errors`);}
    standings.sort((a,b)=>(a.errors>0)-(b.errors>0)||b.points-a.points||a.id.localeCompare(b.id));
    leaders=standings.filter(r=>!r.errors&&r.games===4).slice(0,4).map(r=>r.id);
    history.push({generation,rivals,standings});write('search.json',{history});write('teams.json',[...teams.values()]);
  }
  const heldout=[];for(const key of leaders)heldout.push(await play(key,holdout,'holdout',generations));
  // Admission is compatibility gated. Scores remain provisional, including losing teams.
  const records=heldout.filter(r=>!r.errors&&r.games===4&&!r.capped).map(r=>({...teams.get(r.id),roles:roles(teams.get(r.id).team),screen:{games:r.games,wins:games.filter(g=>g.candidate===r.id&&g.phase==='holdout'&&g.points===1).length,selfPlay:true},heldout:r}));
  // Always keep independently identified bank controls available for comparison and rotation.
  for(const key of training.slice(0,2))records.push({...teams.get(key),source:'bank',roles:roles(teams.get(key).team)});
  const species={};
  for(const game of games.filter(g=>g.result))for(const [key,points]of [[game.candidate,game.points],[game.rival,1-game.points]])for(const set of teams.get(key).team){const name=set.species;const row=species[name]||(species[name]={appearances:0,points:0});row.appearances++;row.points+=points;}
  write('metagame.json',{species,interpretation:'Self-play exposure and team score associations, not causal individual strength or human usage. Search and holdout games are separately identifiable in games.jsonl.'});
  write('holdout.json',{results:heldout,limitation:'Four held-out games per candidate are provisional; not evidence of a settled metagame.'});
  write('roster.json',{schema:1,format:'gen7ou',records});write('teams.json',[...teams.values()]);
  return {tested:seen.size,completed:games.filter(g=>g.result).length,errors:games.filter(g=>g.error).length,discoveredTeams:records.filter(r=>r.source==='discovery').length,roster:path.resolve(output,'roster.json')};
}
if(require.main===module){const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i+=2){const k=args[i].replace(/^--/,'');if(!['bank','python','foul','output','population','generations','seed','searchMs','maxTurns'].includes(k)||args[i+1]===undefined)throw new Error('Invalid option');options[k]=['population','generations','seed','searchMs','maxTurns'].includes(k)?Number(args[i+1]):args[i+1];}discover(options).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1;});}
module.exports={assemble,discover};
