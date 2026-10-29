'use strict';
// Evolutionary team search. Battle policy is fixed; team compositions and sets evolve.
const fs = require('node:fs');
const path = require('node:path');
const {Dex, Teams, TeamValidator} = require('../../dist/sim');
const {play} = require('./evaluate.cjs');
const FORMAT = 'gen7ou';
const clone = value => JSON.parse(JSON.stringify(value));
function rng(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let n = value;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}
class Breeder {
  constructor(seed = 1) {
    this.random = rng(seed);
    this.dex = Dex.forFormat(FORMAT);
    this.validator = TeamValidator.get(FORMAT);
    const all = this.dex.species.all();
    const start = all.findIndex(s => s.id === 'carletto');
    if (start < 0) throw new Error('Carletto is missing; refusing to use the standard dex.');
    // The source file order defines the requested boundary. Negative numbers exclude official species.
    this.pool = all.slice(start).filter(s => s.num < 0 && !s.battleOnly && !s.isMega && !s.requiredItem && s.exists);
    this.allowed = new Set(this.pool.map(s => s.id));
    this.sets = new Map();
  }
  sample(values) { return values[Math.floor(this.random() * values.length)]; }
  shuffle(values) { return values.map(value => ({value, key: this.random()})).sort((a, b) => a.key - b.key).map(x => x.value); }
  legal(team) {
    if (team.length !== 6 || new Set(team.map(s => this.dex.species.get(s.species).num)).size !== 6) return false;
    if (team.some(s => !this.allowed.has(this.dex.species.get(s.species).id))) return false;
    return !this.validator.validateTeam(clone(team));
  }
  moves(species) {
    const ids = new Set();
    let current = species;
    const seen = new Set();
    while (current?.exists && !seen.has(current.id)) {
      seen.add(current.id);
      const learnset = this.dex.species.getLearnsetData(current.id).learnset || {};
      for (const id of Object.keys(learnset)) ids.add(id);
      current = current.prevo ? this.dex.species.get(current.prevo) : null;
    }
    return [...ids].map(id => this.dex.moves.get(id)).filter(m => m.exists && !m.isZ && !m.isMax);
  }
  makeSet(species) {
    const physical = species.baseStats.atk > species.baseStats.spa;
    const attack = physical ? 'atk' : 'spa';
    const fast = species.baseStats.spe >= 70;
    const abilities = Object.values(species.abilities);
    const moves = this.moves(species);
    const attacks = moves.filter(m => m.category !== 'Status');
    if (!attacks.length) return null;
    const items = ['Leftovers', 'Life Orb', 'Sitrus Berry', physical ? 'Choice Band' : 'Choice Specs', 'Choice Scarf'];
    if (species.nfe) items.push('Eviolite');
    for (const item of this.dex.items.all()) {
      if (item.megaEvolves === species.name) items.push(item.name);
    }
    for (let attempt = 0; attempt < 50; attempt++) {
      const ranked = moves.map(m => {
        const power = (m.basePower || 50) * (typeof m.multihit === 'number' ? m.multihit : 1);
        let weight = m.category === 'Status' ? (m.heal || m.boosts || m.sideCondition || m.status ? 60 : 10) : power;
        if (species.types.includes(m.type)) weight *= 1.4;
        if (m.category === (physical ? 'Physical' : 'Special')) weight *= 1.4;
        // Weighted sampling without replacement retains exploration beyond the top attacks.
        return {m, key: -Math.log(Math.max(this.random(), 1e-9)) / weight};
      }).sort((a, b) => a.key - b.key);
      const selected = ranked.slice(0, 4).map(x => x.m);
      if (!selected.some(m => m.category !== 'Status')) continue;
      const set = {
        species: species.name, name: species.name, ability: this.sample(abilities), item: this.sample(items),
        moves: selected.map(m => m.name), level: 100,
        nature: physical ? (fast ? 'Jolly' : 'Adamant') : (fast ? 'Timid' : 'Modest'),
        evs: {hp: fast ? 4 : 252, [attack]: 252, spe: fast ? 252 : 4},
        ivs: {hp: 31, atk: physical ? 31 : 0, def: 31, spa: 31, spd: 31, spe: 31},
      };
      if (!this.validator.validateTeam([clone(set)])) return set;
    }
    return null;
  }
  candidates() {
    if (!this.sets.size) {
      for (const species of this.pool) {
        const sets = [];
        for (let i = 0; i < 3; i++) {
          const set = this.makeSet(species);
          if (set) sets.push(set);
        }
        if (sets.length) this.sets.set(species.id, sets);
      }
      if (this.sets.size < 6) throw new Error(`Only ${this.sets.size} species produced legal sets.`);
    }
    return [...this.sets.keys()];
  }
  team() {
    const ids = this.candidates();
    for (let attempt = 0; attempt < 1000; attempt++) {
      // Bias initial population toward evolved species while keeping lower stages eligible.
      const chosen = this.shuffle(ids).sort((a, b) => {
        const score = id => this.dex.species.get(id).bst;
        return score(b) - score(a);
      }).slice(0, 30);
      const team = this.shuffle(chosen).slice(0, 6).map(id => clone(this.sample(this.sets.get(id))));
      if (this.legal(team)) return team;
    }
    throw new Error('Could not build a legal six-Pokemon team.');
  }
  mutate(parent) {
    const ids = this.candidates();
    for (let attempt = 0; attempt < 100; attempt++) {
      const team = clone(parent);
      const slot = Math.floor(this.random() * 6);
      if (this.random() < 0.55) {
        const id = this.sample(ids);
        team[slot] = clone(this.sample(this.sets.get(id)));
      } else {
        const species = this.dex.species.get(team[slot].species);
        team[slot] = this.makeSet(species) || team[slot];
      }
      if (this.random() < 0.2) team.unshift(team.pop()); // Lead selection matters without preview.
      if (this.legal(team)) return team;
    }
    return this.team();
  }
}
async function score(team, opponents, seed, maxTurns = 200, logging = {}) {
  let points = 0;
  const results = {wins: 0, losses: 0, ties: 0};
  for (let i = 0; i < opponents.length; i++) {
    // Reverse sides with the same simulator seed to reduce first-player bias.
    for (const reverse of [false, true]) {
      const winner = await play(FORMAT, reverse ? opponents[i] : team, reverse ? team : opponents[i],
        [seed, i + 1, 17, 29], {baseline: false, maxTurns,
          names: reverse ? ['SparringPartner', logging.name || 'Roman-016'] : [logging.name || 'Roman-016', 'SparringPartner'],
          logFile: logging.directory && path.join(logging.directory, `${logging.label}-opponent-${i + 1}-${reverse ? 'p2' : 'p1'}.log`),
          onResult: result => {
            if (!logging.output) return;
            const record = {...result, phase: logging.phase, generation: logging.generation, candidate: logging.candidate, opponent: i + 1, candidateSide: reverse ? 'p2' : 'p1'};
            fs.appendFileSync(path.join(logging.output, 'battles.jsonl'), JSON.stringify(record) + '\n');
            fs.appendFileSync(path.join(logging.output, 'battles.csv'), [record.phase, record.generation || '', record.candidate || '', record.opponent, record.candidateSide, record.winner, record.turns, record.capped, record.durationMs].join(',') + '\n');
          },
        });
      if (winner === 'tie') {points += 0.5; results.ties++;}
      else if (winner === (logging.name || 'Roman-016')) {points++; results.wins++;}
      else results.losses++;
    }
  }
  return {points, games: opponents.length * 2, ...results};
}
async function evolve({seed = 1, population = 8, generations = 3, opponents = 3, maxTurns = 200, output = 'scripts/battle-bot/results', name = 'Roman-016'} = {}) {
  for (const [key, value, min] of [['seed', seed, 0], ['population', population, 4], ['generations', generations, 1], ['opponents', opponents, 1], ['maxTurns', maxTurns, 1]]) {
    if (!Number.isSafeInteger(value) || value < min || value > 65535) throw new Error(`Invalid ${key}`);
  }
  if (!/^[A-Za-z0-9-]{1,40}$/.test(name) || name === 'SparringPartner') throw new Error('Use a distinct bot name containing letters, digits or hyphens.');
  if (fs.existsSync(output) && fs.readdirSync(output).length) throw new Error('Output directory is not empty. Choose a new --output directory to preserve previous logs.');
  fs.mkdirSync(output, {recursive: true});
  const startedAt = new Date().toISOString();
  fs.writeFileSync(path.join(output, 'run.json'), JSON.stringify({name, format: FORMAT, seed, population, generations, opponents, maxTurns, startedAt, node: process.version}, null, 2));
  fs.writeFileSync(path.join(output, 'battles.csv'), 'phase,generation,candidate,opponent,candidateSide,winner,turns,capped,durationMs\n');
  const builder = new Breeder(seed);
  const training = Array.from({length: opponents}, () => builder.team());
  const holdout = Array.from({length: opponents}, () => builder.team());
  let teams = Array.from({length: population}, () => builder.team());
  const history = [];
  fs.mkdirSync(output, {recursive: true});
  fs.writeFileSync(path.join(output, 'opponents.json'), JSON.stringify({training, holdout}, null, 2));
  for (let generation = 0; generation < generations; generation++) {
    const ranked = [];
    for (let i = 0; i < teams.length; i++) {
      const result = await score(teams[i], training, seed, maxTurns, {name, output, directory: path.join(output, 'battles'), label: `gen-${generation + 1}-team-${i + 1}`, phase: 'selection', generation: generation + 1, candidate: i + 1});
      ranked.push({team: teams[i], result});
      console.log(`Generation ${generation + 1}, team ${i + 1}/${population}: ${result.points}/${result.games}`);
    }
    ranked.sort((a, b) => b.result.points - a.result.points);
    history.push({generation: generation + 1, best: ranked[0].result, meanPoints: ranked.reduce((s, r) => s + r.result.points, 0) / population});
    fs.writeFileSync(path.join(output, 'best.txt'), Teams.export(ranked[0].team));
    fs.writeFileSync(path.join(output, 'checkpoint.json'), JSON.stringify({format: FORMAT, seed, population, opponents, generations, maxTurns, history, ranked}, null, 2));
    const elite = ranked.slice(0, Math.max(2, Math.floor(population / 4))).map(x => x.team);
    teams = elite.map(clone);
    while (teams.length < population) teams.push(builder.mutate(builder.sample(elite)));
  }
  // Held-out teams never affect selection. Report separately to expose overfitting.
  const champion = Teams.import(fs.readFileSync(path.join(output, 'best.txt'), 'utf8'));
  const heldout = await score(champion, holdout, (seed + 97) % 65536, maxTurns, {name, output, directory: path.join(output, 'battles'), label: 'heldout', phase: 'heldout'});
  const report = {name, startedAt, completedAt: new Date().toISOString(), format: FORMAT, seed, population, generations, opponents, maxTurns, eligibleSpecies: builder.sets.size, history, heldout,
    limitation: 'Team evolution with a fixed heuristic battle policy. Results measure this policy matchup, not human competitive strength.'};
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`Held out: ${heldout.points}/${heldout.games}. Team saved to ${path.join(output, 'best.txt')}`);
  return {champion, report};
}
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};
  const keys = {seed: 'seed', population: 'population', generations: 'generations', opponents: 'opponents', 'max-turns': 'maxTurns', output: 'output', name: 'name'};
  for (let i = 0; i < args.length; i += 2) {
    const key = keys[args[i].replace(/^--/, '')];
    if (!key || args[i + 1] === undefined) throw new Error('Usage: node scripts/battle-bot/breed.cjs [--seed 1 --population 8 --generations 3 --opponents 3 --max-turns 200 --output PATH]');
    options[key] = ['output', 'name'].includes(key) ? args[i + 1] : Number(args[i + 1]);
  }
  evolve(options).catch(error => {console.error(error); process.exitCode = 1;});
}
module.exports = {Breeder, rng, score, evolve};
