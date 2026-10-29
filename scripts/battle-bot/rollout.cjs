'use strict';
const {parentPort} = require('node:worker_threads');
const {Policy} = require('./policy.cjs');
const {Model, LearnedPolicy} = require('./learned.cjs');
const {rng} = require('./breed.cjs');
const {play} = require('./evaluate.cjs');
async function rollout(job) {
  const random = rng(job.randomSeed);
  const model = new Model(job.weights);
  model.baseline = job.baseline;
  const learning = new LearnedPolicy('gen7ou', model, {training: true, random});
  const opponent = job.opponentKind === 'heuristic' ? new Policy('gen7ou', random) :
    new LearnedPolicy('gen7ou', new Model(job.opponentWeights), {training: true, random});
  let result;
  const winner = await play('gen7ou', ...job.teams, job.battleSeed, {
    baseline: false, maxTurns: job.maxTurns,
    names: job.learnerSide === 'p1' ? [job.name, 'Opponent'] : ['Opponent', job.name],
    policyFactory: side => side === job.learnerSide ? learning : opponent,
    logFile: job.logFile,
    onResult: r => {result = {...r, phase: 'training', episode: job.episode, learnerSide: job.learnerSide, opponentKind: job.opponentKind, teamPoolVersion: job.teamPoolVersion};},
  });
  const reward = winner === 'tie' ? 0 : winner === job.name ? 1 : -1;
  return {result, reward, gradient: model.gradient(learning.trajectory, reward), decisions: learning.trajectory.length};
}
if (parentPort) parentPort.on('message', async ({id, job}) => {
  try {parentPort.postMessage({id, value: await rollout(job)});} catch (error) {parentPort.postMessage({id, error: error.stack || String(error)});}
});
module.exports = {rollout};
