'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const readline = require('node:readline');
const {BattleStream, getPlayerStreams, Teams, TeamValidator} = require('../../dist/sim');
const {Policy} = require('./policy.cjs');
async function smoke({python, foul, bank, team1, team2, maxTurns = 150, foulSide = 'p1', seed = [29,303,7,1]}) {
  if(!['p1','p2'].includes(foulSide))throw new Error('Invalid Foul Play side');
  const {validateCustomTeam} = require('./foul-play-team.cjs');
  for (const team of [team1, team2]) {
    validateCustomTeam(team);
    const problems = TeamValidator.get('gen7ou').validateTeam(JSON.parse(JSON.stringify(team)));
    if (problems) throw new Error(problems.join('\n'));
  }
  const proc = spawn(python, [path.join(__dirname,'foul-play-bridge.py')], {env: {...process.env, ROMAN_FOUL_PLAY: path.resolve(foul), ROMAN_METAGAME_BANK: path.resolve(bank)}, stdio:['pipe','pipe','pipe']});
  let stderr = '', pending, exited = false;
  proc.stderr.on('data', data => {stderr += data;});
  readline.createInterface({input:proc.stdout}).on('line', line => {const value=JSON.parse(line); if(pending) {pending.resolve(value); pending=undefined;}});
  proc.on('error', error => {exited=true;if(pending)pending.reject(error);});
  proc.on('exit', code => {exited=true;if(pending) pending.reject(new Error(`Foul Play exited ${code}: ${stderr}`));});
  const ask = value => new Promise((resolve,reject) => {
    if(exited)return reject(new Error('Foul Play already exited: '+stderr));
    const timer=setTimeout(()=>reject(new Error('Foul Play decision timed out: '+stderr)),30000);
    pending={resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}};
    proc.stdin.write(JSON.stringify(value)+'\n');
  });
  const stream = new BattleStream(); const streams = getPlayerStreams(stream);
  let decisions=0, turns=0, winner='tie';
  const run = async (side, team, useFoul) => {
    const policy = new Policy('gen7ou'); policy.side=side;
    let events=[];
    for await(const chunk of streams[side]) {
      for(const line of chunk.split('\n')) {
        if(line.startsWith('|error|')) throw new Error(line);
        if(!line.startsWith('|request|')) {events.push(line);continue;}
        const request=JSON.parse(line.slice(9));
        let choice;
        if(useFoul) {const result=await ask({events,request});choice=result.choice;if(choice)decisions++;}
        else {for(const event of events)policy.observe(event);choice=policy.choose(request);}
        events=[];
        if(choice)await streams[side].write(choice);
      }
    }
  };
  const watch = async () => {for await(const chunk of streams.omniscient)for(const line of chunk.split('\n')) {
    if(line.startsWith('|win|'))winner=line.slice(5);
    if(line.startsWith('|turn|')) {turns=Number(line.slice(6));if(turns>=maxTurns)await stream.write('>forcetie');}
  }};
  const jobs=[run('p1',team1,foulSide==='p1'),run('p2',team2,foulSide==='p2'),watch()];
  await stream.write(`>start ${JSON.stringify({formatid:'gen7ou',seed})}\n>player p1 ${JSON.stringify({name:foulSide==='p1'?'FoulPlay':'Heuristic',team:Teams.pack(team1)})}\n>player p2 ${JSON.stringify({name:foulSide==='p2'?'FoulPlay':'Heuristic',team:Teams.pack(team2)})}`);
  try {await Promise.all(jobs);} finally {proc.kill();await stream.writeEnd();}
  return {winner,turns,decisions,foulSide,seed,capped:turns>=maxTurns};
}
if(require.main===module) {
  const [python,foul,bank,first,second]=process.argv.slice(2);
  if(!second)throw new Error('Usage: node scripts/battle-bot/foul-play-smoke.cjs PYTHON FOUL_DIR BANK TEAM1.txt TEAM2.txt');
  const [team1,team2]=[first,second].map(f=>Teams.import(fs.readFileSync(f,'utf8')));
  smoke({python,foul,bank,team1,team2}).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1;});
}
module.exports={smoke};
