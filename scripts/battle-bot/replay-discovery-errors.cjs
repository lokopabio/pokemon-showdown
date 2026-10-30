'use strict';
const fs=require('node:fs');const path=require('node:path');
async function replay({run,python='../roman-foul-play/.venv/Scripts/python.exe',foul='../roman-foul-play',bank='metagame/metagame-bank.json',output},battle=require('./foul-play-smoke.cjs').smoke){
 if(fs.existsSync(output))throw Error('Use a new output directory');
 const manifest=JSON.parse(fs.readFileSync(path.join(run,'manifest.json'))),teams=new Map(JSON.parse(fs.readFileSync(path.join(run,'teams.json'))).map(r=>[r.id,r.team]));
 const failures=fs.readFileSync(path.join(run,'games.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).filter(r=>r.error);
 fs.mkdirSync(output,{recursive:true});const rows=[];
 for(const old of failures){const candidate=teams.get(old.candidate),rival=teams.get(old.rival);if(!candidate||!rival)throw Error('Missing frozen team');const row={candidate:old.candidate,rival:old.rival,side:old.side,seed:old.seed};try{row.result=await battle({python,foul,bank,team1:old.side==='p1'?candidate:rival,team2:old.side==='p1'?rival:candidate,foulSide:old.side,foulBoth:true,seed:old.seed,searchMs:manifest.searchMs,maxTurns:manifest.maxTurns});}catch(error){row.error=error.message;}rows.push(row);fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify({live:false,limitation:'Replays frozen teams, sides and simulator seeds; native search and inference remain stochastic. Original scores and roster are unchanged.',rows},null,2));console.log(`Replay ${rows.length}/${failures.length}: ${row.error?'error':row.result.capped?'capped':'completed'}`);}
 return {planned:failures.length,completed:rows.filter(r=>r.result).length,errors:rows.filter(r=>r.error).length,capped:rows.filter(r=>r.result?.capped).length,output};
}
if(require.main===module){const a=process.argv.slice(2),o={};for(let i=0;i<a.length;i+=2){const k=a[i].replace(/^--/,'');if(!['run','python','foul','bank','output'].includes(k)||!a[i+1])throw Error('Invalid option');o[k]=a[i+1];}if(!o.run||!o.output)throw Error('--run and --output required');replay(o).then(r=>{console.log(JSON.stringify(r,null,2));if(r.errors||r.capped)process.exitCode=1;}).catch(e=>{console.error(e);process.exitCode=1;});}
module.exports={replay};
