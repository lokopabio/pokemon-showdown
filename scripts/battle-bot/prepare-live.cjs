'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {Teams} = require('../../dist/sim');
const {Model} = require('./learned.cjs');
const {TeamPool} = require('./team-pool.cjs');
function prepare(input, bankFile, output) {
  input = path.resolve(input); bankFile = path.resolve(bankFile); output = path.resolve(output);
  // Keep relative paths and credentials references intact by keeping the config next to its source.
  if (path.dirname(input) !== path.dirname(output)) throw new Error('Output config must be in the same directory as input');
  if (fs.existsSync(output)) throw new Error('Output config already exists; choose a new filename');
  const base = path.dirname(input);
  const raw = JSON.parse(fs.readFileSync(input, 'utf8'));
  const bots = Array.isArray(raw) ? raw : [raw];
  const relativeBank = path.relative(base, bankFile);
  const namespace = path.basename(output, path.extname(output));
  for (let i = 0; i < bots.length; i++) {
    const bot = bots[i];
    if (!bot.model || Object.keys(bot.teams || {}).join() !== 'gen7ou') throw new Error('Requires learned Gen 7 OU accounts');
    const seedTeam = Teams.import(fs.readFileSync(path.resolve(base, bot.teams.gen7ou), 'utf8'));
    const state = `${namespace}-pools/${bot.username.toLowerCase().replace(/[^a-z0-9]/g, '')}.json`;
    const pool = new TeamPool({file: path.resolve(base, state), owner: bot.username, model: Model.load(path.resolve(base, bot.model)), seedTeam, bankFile, seed: 100 + i, size: 12});
    bot.maxBattles = 1;
    bot.teamPool = {state, bankFile: relativeBank, exploration: 0.2, mutateEvery: 5};
    console.log(`${bot.username}: ${pool.state.records.length} legal team candidates prepared`);
  }
  fs.writeFileSync(output, JSON.stringify(Array.isArray(raw) ? bots : bots[0], null, 2));
  return bots;
}
if (require.main === module) {
  const [input, bankFile, output] = process.argv.slice(2);
  if (!input || !bankFile || !output) throw new Error('Usage: node scripts/battle-bot/prepare-live.cjs BOTS_CONFIG METAGAME_BANK NEW_CONFIG');
  prepare(input, bankFile, output);
}
module.exports = {prepare};
