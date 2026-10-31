'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {Dex, TeamValidator} = require('../../dist/sim');
const {loadMetagame} = require('./metagame.cjs');
const {id} = require('./memory.cjs');
const {fraction} = require('./policy.cjs');
const engines = new Map();
const banks = new Map();
class Calculator {
  constructor({enginePath, bankFile, maxHypotheses = 3}) {
    if (!Number.isInteger(maxHypotheses) || maxHypotheses < 1 || maxHypotheses > 32) throw new Error('Invalid calculator hypothesis limit');
    this.enginePath = path.resolve(enginePath);
    if (!engines.has(this.enginePath)) {
      const api = require(this.enginePath);
      if (!api.calculate || !api.Pokemon || !api.Move || !api.Field) throw new Error('Invalid calculator engine');
      engines.set(this.enginePath, {api, sha: crypto.createHash('sha256').update(fs.readFileSync(this.enginePath)).digest('hex')});
    }
    const {api, sha} = engines.get(this.enginePath);
    this.api = api; this.sha = sha; this.gen = api.Generations.get(7); this.dex = Dex.forFormat('gen7ou'); this.maxHypotheses = maxHypotheses;
    this.sets = new Map();
    if (bankFile) {
      const file = path.resolve(bankFile);
      if (!banks.has(file)) {
        const species = this.dex.species.all();const start = species.findIndex(s => s.id === 'carletto');
        const allowed = new Set(species.slice(start).filter(s => s.num < 0).map(s => s.id));
        banks.set(file, loadMetagame(file, this.dex, TeamValidator.get('gen7ou'), allowed).sets);
      }
      this.sets = banks.get(file);
    }
    this.ownTeam = []; this.last = []; this.cache = new Map(); this.failures = 0;
  }
  setTeam(team) {this.ownTeam = JSON.parse(JSON.stringify(team));}
  hypotheses(enemy) {
    if (!enemy?.species) return [];
    const species = this.dex.species.get(enemy.species);
    if (!species.exists) return [];
    let candidates = (this.sets.get(species.id) || []).filter(s =>
      [...enemy.moves].every(m => s.moves.some(x => id(x) === m)) &&
      (!enemy.ability || id(s.ability) === enemy.ability) &&
      (enemy.item === null || enemy.item === '' || id(s.item) === enemy.item));
    const matched = candidates.length;
    if (!matched) {
      const abilities = enemy.ability ? [enemy.ability] : Object.values(species.abilities);
      candidates = abilities.flatMap(ability => [{hp: 0, def: 0, spd: 0}, {hp: 252, def: 252, spd: 4}, {hp: 252, def: 4, spd: 252}].map(evs => ({species: species.name, ability, item: enemy.item || '', nature: 'Serious', evs, moves: [...enemy.moves]})));
    }
    const count = Math.min(this.maxHypotheses, candidates.length);
    return Array.from({length: count}, (_, i) => ({...candidates[Math.floor(i * candidates.length / count)], hypothesisSource: matched ? 'matching-human-set' : 'generic-assumption', item: enemy.item !== null ? (enemy.item || '') : candidates[Math.floor(i * candidates.length / count)].item, ability: enemy.ability || candidates[Math.floor(i * candidates.length / count)].ability}));
  }
  pokemon(set, condition, boosts = {}) {
    const species = this.dex.species.get(set.species);
    const ability = this.dex.abilities.get(set.ability).name;
    const item = set.item ? this.dex.items.get(set.item).name : '';
    // Preserve moveslot order for the fork's slot-dependent mechanics.
    const mon = new this.api.Pokemon(this.gen, species.name, {...set, name: species.name, ability, item, boosts,
      overrides: {baseStats: species.baseStats, types: species.types, weightkg: species.weightkg}});
    if (condition) {
      mon.status = condition.split(' ')[1] || '';
      mon.originalCurHP = Math.max(1, Math.round(fraction(condition) * mon.maxHP()));
    }
    return mon;
  }
  field(policy, reverse = false) {
    const weather = {raindance: 'Rain', sunnyday: 'Sun', sandstorm: 'Sand', hail: 'Hail', primordialsea: 'Heavy Rain', desolateland: 'Harsh Sunshine'}[policy.memory.weather];
    const terrain = {electricterrain: 'Electric', grassyterrain: 'Grassy', mistyterrain: 'Misty', psychicterrain: 'Psychic'}[policy.memory.terrain];
    const sides = reverse ? ['foe', 'own'] : ['own', 'foe'];
    const side = key => ({isReflect: policy.hazards[key].has('reflect'), isLightScreen: policy.hazards[key].has('lightscreen'), isAuroraVeil: policy.hazards[key].has('auroraveil')});
    return new this.api.Field({gameType: 'Singles', weather, terrain, attackerSide: side(sides[0]), defenderSide: side(sides[1])});
  }
  range(attacker, defender, move, field) {
    // Known fork/server discrepancy: do not silently use the fork's hard-coded Judgment type.
    if (id(attacker.ability) === 'finalverdict' && move.id === 'judgment') throw new Error('Unsupported: Final Verdict slot-dependent Judgment differs in calculator');
    if (!this.gen.species.get(id(attacker.name)) || !this.gen.species.get(id(defender.name))) throw new Error('Species missing from calculator');
    const calculated = new this.api.Move(this.gen, move.name, {overrides: {basePower: move.basePower, type: move.type, category: move.category}, ...(typeof move.multihit === 'number' ? {hits: move.multihit} : {})});
    return this.api.calculate(this.gen, attacker, defender, calculated, field).range();
  }
  begin() {this.last = []; this.cache.clear();}
  incoming(policy, target) {
    const enemy = policy.memory.opponent(policy.side);
    const hypotheses = this.hypotheses(enemy);
    const own = this.ownTeam.find(s => id(s.species) === id(policy.species(target).name));
    if (!own || !hypotheses.length) return null;
    try {
      const values = hypotheses.map(h => {
        const moves = (enemy.moves.size ? [...enemy.moves] : h.moves).map(m => this.dex.moves.get(m)).filter(m => m.exists && m.category !== 'Status');
        const maximum = moves.map(move => {
          const a = this.pokemon(h, policy.foe?.condition, policy.foe?.boosts);
          const b = this.pokemon({...own, item: target.item === undefined ? own.item : target.item, ability: target.ability || target.baseAbility || own.ability}, target.condition);
          const range = this.range(a, b, move, this.field(policy, true));
          return range[1] / b.maxHP() * 100;
        });
        return maximum.length ? Math.max(...maximum) : null;
      }).filter(x => x !== null);
      if (!values.length) return null;
      const report = {switchTo: own.species, incomingWorstPercent: Math.max(...values), incomingMeanPercent: values.reduce((a, b) => a + b, 0) / values.length, assumptions: values.length, engineSha: this.sha};
      this.last.push(report);return report;
    } catch (error) {this.failures++;this.last.push({switchTo: own.species, unavailable: error.message});return null;}
  }
  estimate(policy, own, move) {
    const enemy = policy.memory.opponent(policy.side);
    const hypotheses = this.hypotheses(enemy);
    if (!hypotheses.length) return null;
    const known = this.ownTeam.find(s => id(s.name || s.species) === id((own.ident || '').split(': ').slice(1).join(': '))) || this.ownTeam.find(s => id(s.species) === id(policy.species(own).name));
    if (!known) return null; // No invented IV/EV/nature for our own team.
    try {
      const outcomes = hypotheses.map(h => {
        const attacker = this.pokemon({...known, species: policy.species(own).name, item: own.item === undefined ? known.item : own.item, ability: own.ability || own.baseAbility || known.ability}, own.condition, policy.ownBoosts);
        const defender = this.pokemon(h, policy.foe?.condition, policy.foe?.boosts);
        const range = this.range(attacker, defender, move, this.field(policy));
        return {min: range[0], max: range[1], maxHP: defender.maxHP(), curHP: defender.curHP(), source: h.hypothesisSource};
      });
      const value = {move: move.name, assumptions: outcomes.length, minPercent: Math.min(...outcomes.map(o => o.min / o.maxHP * 100)), maxPercent: Math.max(...outcomes.map(o => o.max / o.maxHP * 100)), meanPercent: outcomes.reduce((s, o) => s + (o.min + o.max) / 2 / o.maxHP * 100, 0) / outcomes.length, onHitKOScenarios: outcomes.filter(o => o.min >= o.curHP).length, hypotheses: hypotheses.map(h => ({species: h.species, ability: h.ability, item: h.item, nature: h.nature, evs: h.evs, moves: h.moves, source: h.hypothesisSource})), engineSha: this.sha};
      this.last.push(value);
      return value;
    } catch (error) {
      this.failures++;
      this.last.push({move: move.name, unavailable: error.message, engineSha: this.sha});
      return null;
    }
  }
}
module.exports = {Calculator};
