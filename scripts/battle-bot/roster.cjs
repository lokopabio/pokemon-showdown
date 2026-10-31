'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {Teams} = require('../../dist/sim');
const {Breeder} = require('./breed.cjs');
const {Model, LearnedPolicy} = require('./learned.cjs');
const {play} = require('./evaluate.cjs');
const NAMES = ['Roman-0009', 'Roman-003', 'Roman-016', 'Roman-021', 'Roman-062', 'Roman-162'];
async function roster(trainingDirectory, {output = 'scripts/battle-bot/results/roman-roster-001', pairs = 4, seed = 725, maxTurns = 150, server = 'ws://localhost:8000/showdown/websocket', calculatorEngine, bankFile} = {}) {
  if (!Number.isSafeInteger(pairs) || pairs < 1 || pairs > 1000) throw new Error('Invalid pairs');
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 65535) throw new Error('Invalid seed');
  if (!Number.isSafeInteger(maxTurns) || maxTurns < 1) throw new Error('Invalid maxTurns');
  if (fs.existsSync(output) && fs.readdirSync(output).length) throw new Error('Use a new or empty output directory');
  const calculator = calculatorEngine ? {enginePath: path.resolve(calculatorEngine), bankFile: bankFile && path.resolve(bankFile)} : undefined;
  const source = path.join(trainingDirectory, 'checkpoints');
  const files = fs.readdirSync(source).filter(f => /^episode-[1-9][0-9]*\.json$/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  if (files.length < 6) throw new Error('Need at least six trained checkpoints. Train at least 6 evaluation intervals.');
  // Sample six checkpoints across the full run when more are available.
  const candidates = NAMES.map((_, i) => {
    const file = path.join(source, files[Math.round(i * (files.length - 1) / 5)]);
    const model = Model.load(file);
    return {id: `Policy-${i}`, file, model, points: 0, wins: 0, losses: 0, ties: 0, games: 0};
  });
  if (new Set(candidates.map(c => JSON.stringify(c.model.weights))).size !== 6) throw new Error('Training did not yield six distinct policies; continue training.');
  const builder = new Breeder(seed);
  const teams = Array.from({length: pairs}, () => [builder.team(), builder.team()]);
  fs.mkdirSync(path.join(output, 'battles'), {recursive: true});
  fs.writeFileSync(path.join(output, 'evaluation-teams.json'), JSON.stringify(teams, null, 2));
  for (let i = 0; i < 6; i++) {
    for (let j = i + 1; j < 6; j++) {
      for (let k = 0; k < pairs; k++) {
        // Cross team ownership independently of player position: four games.
        for (const [reverse, swapTeams] of [[false,false],[true,false],[false,true],[true,true]]) {
          const a = candidates[reverse ? j : i];
          const b = candidates[reverse ? i : j];
          const pair = reverse !== swapTeams ? [...teams[k]].reverse() : teams[k];
          const winner = await play('gen7ou', ...pair, [seed, k + 1, 53, 61], {
            baseline: false, maxTurns, names: [a.id, b.id],
            policyFactory: id => new LearnedPolicy('gen7ou', id === 'p1' ? a.model : b.model, {calculator}),
            logFile: path.join(output, 'battles', `${i}-${j}-${k}-${reverse ? 'reverse' : 'forward'}-${swapTeams ? 'swapped' : 'original'}.log`),
            onResult: r => fs.appendFileSync(path.join(output, 'battles.jsonl'), JSON.stringify(r) + '\n'),
          });
          a.games++; b.games++;
          if (winner === 'tie') {a.points += 0.5; b.points += 0.5; a.ties++; b.ties++;}
          else {
            const win = winner === a.id ? a : b;
            const loss = winner === a.id ? b : a;
            win.points++; win.wins++; loss.losses++;
          }
        }
      }
      console.log(`Ranked matchup ${i + 1} vs ${j + 1}`);
    }
  }
  candidates.sort((a, b) => a.points - b.points || a.model.episodes - b.model.episodes);
  const ranking = candidates.map((c, i) => ({name: NAMES[i], source: c.id, episodes: c.model.episodes, points: c.points, games: c.games, wins: c.wins, losses: c.losses, ties: c.ties, scoreRate: c.points / c.games}));
  const report = {createdAt: new Date().toISOString(), format: 'gen7ou', seed, pairs, maxTurns,
    games: 15 * pairs * 4, ranking, provisional: true, evaluationVersion: 2,
    limitation: 'Each checkpoint pair uses both teams in both player positions. Ties use training age. Small differences are not proven strength differences or guaranteed head-to-head wins.'};
  const config = [];
  for (let i = 0; i < 6; i++) {
    fs.copyFileSync(candidates[i].file, path.join(output, `${NAMES[i]}.json`));
    // Same deployed team keeps initial difficulty comparisons focused on policy.
    fs.writeFileSync(path.join(output, `${NAMES[i]}.txt`), Teams.export(teams[0][0]));
    config.push({server, ...(calculator ? {calculator} : {}), username: NAMES[i], model: `${NAMES[i]}.json`, logDirectory: `live/${NAMES[i]}`, maxBattles: 1, allowedUsers: [], teams: {gen7ou: `${NAMES[i]}.txt`}});
  }
  fs.writeFileSync(path.join(output, 'bots.json'), JSON.stringify(config, null, 2));
  fs.writeFileSync(path.join(output, 'ranking.json'), JSON.stringify(report, null, 2));
  console.log(`Six-bot config: ${path.join(output, 'bots.json')}`);
  return report;
}
if (require.main === module) {
  const [directory, ...args] = process.argv.slice(2);
  if (!directory) throw new Error('Usage: node scripts/battle-bot/roster.cjs TRAINING_DIR [--output PATH --pairs 4 --server ws://HOST:PORT/showdown/websocket]');
  const options = {};
  const keys = {output: 'output', pairs: 'pairs', seed: 'seed', 'max-turns': 'maxTurns', server: 'server', 'calculator-engine': 'calculatorEngine', 'metagame-bank': 'bankFile'};
  for (let i = 0; i < args.length; i += 2) {
    const key = keys[args[i].replace(/^--/, '')];
    if (!key || args[i + 1] === undefined) throw new Error('Unknown argument or missing value');
    options[key] = ['output', 'server', 'calculatorEngine', 'bankFile'].includes(key) ? args[i + 1] : Number(args[i + 1]);
  }
  roster(directory, options).catch(error => {console.error(error); process.exitCode = 1;});
}
module.exports = {roster, NAMES};
