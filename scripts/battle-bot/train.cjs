'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {Teams} = require('../../dist/sim');
const {Breeder, rng} = require('./breed.cjs');
const {Policy} = require('./policy.cjs');
const {Model, LearnedPolicy} = require('./learned.cjs');
const {play} = require('./evaluate.cjs');
async function train({episodes = 200, seed = 1, evalEvery = 20, evalPairs = 4, maxTurns = 150, rate = 0.03,
  output = 'scripts/battle-bot/results/roman-learning-001', resume, server = 'ws://localhost:8000/showdown/websocket', name = 'Roman-016'} = {}) {
  for (const [key, value] of Object.entries({episodes, seed, evalEvery, evalPairs, maxTurns})) {
    if (!Number.isSafeInteger(value) || value < (key === 'seed' ? 0 : 1) || value > 10000000) throw new Error(`Invalid ${key}`);
  }
  if (!Number.isFinite(rate) || rate <= 0 || rate > 1) throw new Error('rate must be in (0, 1]');
  if (!/^[A-Za-z0-9-]{1,40}$/.test(name)) throw new Error('Invalid bot name');
  if (fs.existsSync(output) && fs.readdirSync(output).length) throw new Error('Use a new or empty output directory.');
  const model = resume ? Model.load(resume) : new Model();
  const startEpisode = model.episodes;
  const builder = new Breeder(seed);
  const evalBuilder = new Breeder(seed + 1001);
  const teams = Array.from({length: 12}, () => builder.team());
  const validation = Array.from({length: evalPairs}, () => [evalBuilder.team(), evalBuilder.team()]);
  const deployedTeam = validation[0][0];
  const archive = [new Model(model.weights)];
  const report = {name, kind: 'linear-softmax-reinforce', format: 'gen7ou', seed, startEpisode, episodesRequested: episodes, rate, maxTurns,
    startedAt: new Date().toISOString(), validation: [], training: {wins: 0, losses: 0, ties: 0},
    limitation: 'Small feature-based policy trained from terminal results. No pretrained Metamon weights, search, or claim of competitive strength. Validation is reused for checkpoint selection.'};
  fs.mkdirSync(path.join(output, 'battles'), {recursive: true});
  fs.writeFileSync(path.join(output, 'teams.json'), JSON.stringify({training: teams, validation}, null, 2));
  fs.writeFileSync(path.join(output, 'team.txt'), Teams.export(deployedTeam));
  fs.writeFileSync(path.join(output, 'metrics.csv'), 'episode,phase,wins,losses,ties,meanReward\n');
  const emit = result => fs.appendFileSync(path.join(output, 'battles.jsonl'), JSON.stringify(result) + '\n');
  let bestScore = -Infinity;
  const save = file => model.save(path.join(output, file), {name, seed, startedAt: report.startedAt});
  async function evaluate(episode) {
    const results = {episode, wins: 0, losses: 0, ties: 0};
    for (let i = 0; i < validation.length; i++) {
      for (const reverse of [false, true]) {
        const pair = reverse ? [...validation[i]].reverse() : validation[i];
        const side = reverse ? 'p2' : 'p1';
        const winner = await play('gen7ou', ...pair, [seed % 65536, i + 1, 91, 97], {
          baseline: false, maxTurns, names: reverse ? ['Reference', name] : [name, 'Reference'],
          policyFactory: id => id === side ? new LearnedPolicy('gen7ou', model) : new Policy('gen7ou', () => 0.5),
          logFile: path.join(output, 'battles', `eval-${episode}-${i}-${side}.log`),
          onResult: r => emit({...r, phase: 'validation', episode, candidateSide: side}),
        });
        results[winner === 'tie' ? 'ties' : winner === name ? 'wins' : 'losses']++;
      }
    }
    results.meanReward = (results.wins - results.losses) / (evalPairs * 2);
    report.validation.push(results);
    save(`checkpoints/episode-${episode}.json`);
    fs.appendFileSync(path.join(output, 'metrics.csv'), `${episode},validation,${results.wins},${results.losses},${results.ties},${results.meanReward}\n`);
    if (results.meanReward > bestScore) {bestScore = results.meanReward; save('best.json'); report.bestEpisode = episode;}
    save('latest.json');
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`Episode ${episode}: validation ${results.wins}W ${results.losses}L ${results.ties}T; best checkpoint episode ${report.bestEpisode}`);
  }
  save('initial.json');
  await evaluate(startEpisode);
  for (let i = 0; i < episodes; i++) {
    const episode = startEpisode + i + 1;
    const random = rng(seed + episode * 7919);
    const learnerSide = episode % 2 ? 'p1' : 'p2';
    const learning = new LearnedPolicy('gen7ou', model, {training: true, random});
    // Mix heuristic opponents with frozen old policies. Freeze per battle to avoid moving targets mid-episode.
    const opponent = episode % 3 === 0 ? new Policy('gen7ou', random) :
      new LearnedPolicy('gen7ou', archive[Math.floor(random() * archive.length)], {training: true, random});
    const pair = [teams[Math.floor(random() * teams.length)], teams[Math.floor(random() * teams.length)]];
    const winner = await play('gen7ou', ...pair, [episode % 65536, seed % 65536, 31, 43], {
      baseline: false, maxTurns, names: learnerSide === 'p1' ? [name, 'Opponent'] : ['Opponent', name],
      policyFactory: id => id === learnerSide ? learning : opponent,
      logFile: path.join(output, 'battles', `train-${episode}.log`),
      onResult: r => emit({...r, phase: 'training', episode, learnerSide}),
    });
    const reward = winner === 'tie' ? 0 : winner === name ? 1 : -1;
    model.update(learning.trajectory, reward, rate);
    report.training[winner === 'tie' ? 'ties' : winner === name ? 'wins' : 'losses']++;
    fs.appendFileSync(path.join(output, 'metrics.csv'), `${episode},training,${reward === 1 ? 1 : 0},${reward === -1 ? 1 : 0},${reward === 0 ? 1 : 0},${reward}\n`);
    if (episode % 10 === 0) console.log(`Trained episode ${episode}, reward ${reward}, decisions ${learning.trajectory.length}`);
    if ((i + 1) % evalEvery === 0 || i === episodes - 1) {
      archive.push(new Model(model.weights));
      if (archive.length > 6) archive.shift();
      await evaluate(episode);
    }
  }
  report.completedAt = new Date().toISOString();
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  const config = {server, username: name, model: 'best.json', logDirectory: 'live', maxBattles: 1, allowedUsers: [], teams: {gen7ou: 'team.txt'}};
  fs.writeFileSync(path.join(output, 'bot.json'), JSON.stringify(config, null, 2));
  console.log(`Challenge bot config: ${path.join(output, 'bot.json')}`);
  return {model, report};
}
if (require.main === module) {
  const options = {};
  const keys = {episodes: 'episodes', seed: 'seed', 'eval-every': 'evalEvery', 'eval-pairs': 'evalPairs', 'max-turns': 'maxTurns', rate: 'rate', output: 'output', resume: 'resume', server: 'server', name: 'name'};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 2) {
    const key = keys[args[i].replace(/^--/, '')];
    if (!key || args[i + 1] === undefined) throw new Error('Unknown argument or missing value');
    options[key] = ['output', 'resume', 'server', 'name'].includes(key) ? args[i + 1] : Number(args[i + 1]);
  }
  train(options).catch(error => {console.error(error); process.exitCode = 1;});
}
module.exports = {train};
