'use strict';
const fs = require('node:fs');
const {BattleStream, getPlayerStreams, Teams, Dex} = require('../../dist/sim');
const {Policy} = require('./policy.cjs');
async function play(format, team1, team2, seed = [1, 2, 3, 4], options = {}) {
  const names = options.names || ['Heuristic', 'Baseline'];
  const events = [];
  const decisions = [];
  let turns = 0;
  let capped = false;
  const started = Date.now();
  const battle = new BattleStream();
  const streams = getPlayerStreams(battle);
  async function player(stream, random, side) {
    const policy = options.policyFactory ? options.policyFactory(side) : new Policy(format, () => 0.5);
    let pending = [];
    for await (const chunk of stream) {
      for (const line of chunk.split('\n')) {
        if (line.startsWith('|request|')) {
          const request = JSON.parse(line.slice(9));
          if (request?.side) policy.side = request.side.id;
          for (const event of pending) policy.observe(event);
          pending = [];
          let choice = policy.choose(request);
          if (random && request?.active && !request.wait) {
            const moves = request.active[0].moves.map((m, i) => m.disabled ? null : i + 1).filter(Boolean);
            if (moves.length) choice = `move ${moves[Math.floor(policy.random() * moves.length)]}`;
          }
          if (choice) {
            if (options.logFile) decisions.push({side, rqid: request.rqid, choice});
            await stream.write(choice);
          }
        } else if (line.startsWith('|error|')) {
          throw new Error(line);
        } else pending.push(line);
      }
    }
  }
  const players = [player(streams.p1, false, 'p1'), player(streams.p2, options.baseline !== false, 'p2')];
  let winner = 'tie';
  const watch = (async () => {
    for await (const chunk of streams.omniscient) {
      for (const line of chunk.split('\n')) {
        if (options.logFile) events.push(line);
        if (line.startsWith('|turn|')) turns = Number(line.slice(6));
        if (line.startsWith('|win|')) winner = line.slice(5);
        if (line.startsWith('|turn|') && turns >= (options.maxTurns || 300)) {
          capped = true;
          await battle.write('>forcetie');
        }
      }
    }
  })();
  await battle.write(`>start ${JSON.stringify({formatid: format, seed})}\n>player p1 ${JSON.stringify({name: names[0], team: Teams.pack(team1)})}\n>player p2 ${JSON.stringify({name: names[1], team: Teams.pack(team2)})}`);
  try {
    await Promise.all([...players, watch]);
  } finally {
    await battle.writeEnd();
  }
  const result = {format, seed, names, winner, turns, capped, durationMs: Date.now() - started};
  if (options.logFile) {
    fs.mkdirSync(require('node:path').dirname(options.logFile), {recursive: true});
    fs.writeFileSync(options.logFile, events.join('\n') + '\n');
    fs.writeFileSync(options.logFile + '.json', JSON.stringify({...result, teams: [team1, team2], decisions}, null, 2));
  }
  if (options.onResult) options.onResult(result);
  return winner;
}
if (require.main === module) {
  const [format = 'gen7customgame', file1, file2, n = '10'] = process.argv.slice(2);
  if (!file1 || !file2) throw new Error('Usage: node scripts/battle-bot/evaluate.cjs FORMAT TEAM1.txt TEAM2.txt [GAMES]');
  if (Dex.formats.get(format).gameType !== 'singles') throw new Error('Singles only');
  const teams = [file1, file2].map(f => Teams.import(fs.readFileSync(f, 'utf8')));
  (async () => {
    const results = {};
    for (let i = 0; i < Number(n); i++) {
      const winner = await play(format, ...teams, [i + 1, 2, 3, 4]);
      results[winner] = (results[winner] || 0) + 1;
      console.log(`Battle ${i + 1}: ${winner}`);
    }
    console.log(JSON.stringify(results));
  })().catch(err => {console.error(err); process.exitCode = 1;});
}
module.exports = {play};
