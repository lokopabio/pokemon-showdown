'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {BattleStream, getPlayerStreams, Teams, TeamValidator} = require('../../dist/sim');
const {Policy} = require('./policy.cjs');
async function smoke({python, foul, bank, team1, team2, maxTurns = 150, foulSide = 'p1', seed = [29,303,7,1], modelFile, calculator, searchMs = 10, foulBoth = false, onDecision, onEvent, diagnostics=false}) {
  if(!['p1','p2'].includes(foulSide))throw new Error('Invalid Foul Play side');
  const {Model,LearnedPolicy}=require('./learned.cjs');
  const model=modelFile?Model.load(modelFile):null;
  const opponentName=foulBoth?'FoulPlayOpponent':model?'Learned':'Heuristic';
  const {validateCustomTeam} = require('./foul-play-team.cjs');
  for (const team of [team1, team2]) {
    validateCustomTeam(team);
    const problems = TeamValidator.get('gen7ou').validateTeam(JSON.parse(JSON.stringify(team)));
    if (problems) throw new Error(problems.join('\n'));
  }
  const bridges=[];
  const stream = new BattleStream(); const streams = getPlayerStreams(stream);
  let decisions=0, turns=0, winner='tie';
  const timings={FoulPlay:[],[opponentName]:[]};
  const run = async (side, team, useFoul) => {
    const policy = !useFoul&&model?new LearnedPolicy('gen7ou',model,{calculator}):new Policy('gen7ou'); policy.side=side;
    policy.setTeam?.(team);
    const bridge=useFoul?new (require('./foul-play-live.cjs').FoulPlayLive)({python,foul,bank,searchMs,diagnostics}):null;
    if(bridge)bridges.push(bridge);
    let events=[];
    for await(const chunk of streams[side]) {
      for(const line of chunk.split('\n')) {
        if(line.startsWith('|error|')) throw new Error(line);
        if(!line.startsWith('|request|')) {events.push(line);continue;}
        const request=JSON.parse(line.slice(9));
        let choice;
        const started=performance.now();
        if(useFoul) {for(const event of events)bridge.observe(event);choice=await bridge.choose(request);if(choice&&side===foulSide)decisions++;}
        else {for(const event of events)policy.observe(event);choice=policy.choose(request);}
        if(choice)onDecision?.({side,turn:turns,choice,request,search:bridge?.lastDecision});
        if(choice)timings[side===foulSide?'FoulPlay':opponentName].push(performance.now()-started);
        events=[];
        if(choice)await streams[side].write(choice);
      }
    }
  };
  const watch = async () => {for await(const chunk of streams.omniscient)for(const line of chunk.split('\n')) {
    onEvent?.(line);
    if(line.startsWith('|win|'))winner=line.slice(5);
    if(line.startsWith('|turn|')) {turns=Number(line.slice(6));if(turns>=maxTurns)await stream.write('>forcetie');}
  }};
  const jobs=[run('p1',team1,foulBoth||foulSide==='p1'),run('p2',team2,foulBoth||foulSide==='p2'),watch()];
  await stream.write(`>start ${JSON.stringify({formatid:'gen7ou',seed})}\n>player p1 ${JSON.stringify({name:foulSide==='p1'?'FoulPlay':opponentName,team:Teams.pack(team1)})}\n>player p2 ${JSON.stringify({name:foulSide==='p2'?'FoulPlay':opponentName,team:Teams.pack(team2)})}`);
  try {await Promise.all(jobs);} finally {for(const bridge of bridges)bridge.close();await stream.writeEnd();}
  return {winner,turns,decisions,foulSide,seed,capped:turns>=maxTurns,opponent:opponentName,episodes:model?.episodes,
    decisionTimes:Object.fromEntries(Object.entries(timings).map(([name,t])=>[name,{count:t.length,totalMs:t.reduce((a,b)=>a+b,0),maxMs:t.length?Math.max(...t):0}]))};
}
if(require.main===module) {
  const [python,foul,bank,first,second]=process.argv.slice(2);
  if(!second)throw new Error('Usage: node scripts/battle-bot/foul-play-smoke.cjs PYTHON FOUL_DIR BANK TEAM1.txt TEAM2.txt');
  const [team1,team2]=[first,second].map(f=>Teams.import(fs.readFileSync(f,'utf8')));
  smoke({python,foul,bank,team1,team2}).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1;});
}
module.exports={smoke};
