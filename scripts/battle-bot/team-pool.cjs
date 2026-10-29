'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {Teams} = require('../../dist/sim');
const {Breeder, rng} = require('./breed.cjs');
const {fingerprint} = require('./learned.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
const key = team => crypto.createHash('sha256').update(Teams.pack(team)).digest('hex').slice(0, 20);
const ownerID = name => name.toLowerCase().replace(/[^a-z0-9]/g, '');
function trainingTeams(value, found = []) {
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value) && value.length === 6 && value.every(v => v && typeof v.species === 'string')) found.push(value);
  else for (const child of Object.values(value)) trainingTeams(child, found);
  return found;
}
class TeamPool {
  constructor({file, owner, model, seedTeam, size = 12, seed = 1, exploration = 0.2, mutateEvery = 5, random = Math.random, sourceTeams = [], bankFile}) {
    if (!Number.isInteger(size) || size < 2 || size > 64) throw new Error('Team pool size must be 2–64');
    if (!Number.isFinite(exploration) || exploration < 0 || exploration > 1) throw new Error('Invalid team exploration probability');
    if (!Number.isInteger(mutateEvery) || mutateEvery < 0) throw new Error('Invalid mutateEvery');
    this.file = file;
    this.builder = new Breeder(seed, {bankFile});
    this.random = random;
    this.options = {exploration, mutateEvery};
    const modelKey = crypto.createHash('sha256').update(JSON.stringify(model.weights)).digest('hex');
    if (fs.existsSync(file)) {
      this.state = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (this.state.schema !== 1 || this.state.owner !== ownerID(owner) || this.state.modelKey !== modelKey || this.state.fingerprint !== fingerprint()) throw new Error('Team pool belongs to a different account/model/simulator. Use a new teamPool.state path.');
      if (!Array.isArray(this.state.records) || this.state.records.length < 2 || !this.state.records.every(r => this.validRecord(r))) throw new Error('Invalid saved team pool');
    } else {
      const crystal = team => team.some(s => {const item = this.builder.dex.items.get(s.item); return item.zMove || item.zMoveType;});
      if (crystal(seedTeam)) {
        if (!this.builder.bank.teams.length) throw new Error('Seed team has a Z-Crystal; supply a no-Z seed team or metagame bank');
        seedTeam = this.builder.sample(this.builder.bank.teams);
      }
      if (!this.builder.legal(seedTeam)) throw new Error('Seed team must be a legal custom-only Gen 7 OU team');
      this.state = {schema: 1, owner: ownerID(owner), modelKey, fingerprint: fingerprint(), seed, games: 0, lastTeamId: null, completed: [], archive: [], records: []};
      this.add(seedTeam, 'configured-seed');
      for (const team of this.builder.shuffle([...this.builder.bank.teams, ...sourceTeams])) {
        if (this.state.records.length >= size) break;
        if (this.builder.legal(team)) this.add(team, 'training-record');
      }
      for (let i = 0; this.state.records.length < size && i < size * 100; i++) this.add(this.builder.mutate(this.builder.sample(this.state.records).team), 'mutation');
      if (this.state.records.length < size) throw new Error('Could not generate enough distinct legal teams');
      this.save();
    }
  }
  validRecord(record) {
    return record && record.id === key(record.team) && this.builder.legal(record.team) && !record.team.some(s => {const item = this.builder.dex.items.get(s.item); return item.zMove || item.zMoveType;}) &&
      ['wins', 'losses', 'ties'].every(k => Number.isSafeInteger(record[k]) && record[k] >= 0) &&
      Number.isFinite(record.priorScore) && record.priorScore >= 0 && record.priorScore <= 1 &&
      Number.isFinite(record.priorStrength) && record.priorStrength >= 0 && record.priorStrength <= 2;
  }
  add(team, source) {
    const id = key(team);
    if (this.state.records.some(r => r.id === id)) return false;
    this.state.records.push({id, team: clone(team), source, wins: 0, losses: 0, ties: 0, priorScore: 0.5, priorStrength: 0});
    return true;
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), {recursive: true});
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.state, null, 2));
    fs.renameSync(this.file + '.tmp', this.file);
  }
  mean(record) {
    return (record.wins + 0.5 * record.ties + record.priorScore * record.priorStrength + 1) /
      (record.wins + record.losses + record.ties + record.priorStrength + 2);
  }
  choose() {
    // Consecutive accepted challenges get different teams, including across restarts.
    const choices = this.state.records.filter(r => r.id !== this.state.lastTeamId);
    let selected;
    if (this.random() < this.options.exploration) selected = choices[Math.floor(this.random() * choices.length)];
    else selected = [...choices].sort((a, b) => {
      const score = r => this.mean(r) + 0.35 * Math.sqrt(Math.log(this.state.games + 2) / (r.wins + r.losses + r.ties + r.priorStrength + 1));
      return score(b) - score(a) || a.id.localeCompare(b.id);
    })[0];
    this.state.lastTeamId = selected.id;
    this.save();
    return {id: selected.id, team: clone(selected.team), packed: Teams.pack(selected.team), estimatedScore: this.mean(selected)};
  }
  record(id, outcome, matchKey) {
    if (!['win', 'loss', 'tie'].includes(outcome)) throw new Error('Invalid match outcome');
    if (this.state.completed.includes(matchKey)) return false;
    const record = this.state.records.find(r => r.id === id);
    if (!record) throw new Error('Team result has no matching candidate');
    record[{win: 'wins', loss: 'losses', tie: 'ties'}[outcome]]++;
    this.state.completed.push(matchKey);
    if (this.state.completed.length > 10000) this.state.completed.shift();
    this.state.games++;
    if (this.options.mutateEvery && this.state.games % this.options.mutateEvery === 0) this.evolve();
    this.save();
    return true;
  }
  evolve() {
    const sorted = [...this.state.records].sort((a, b) => this.mean(b) - this.mean(a));
    const parent = sorted[0];
    const victim = [...sorted].reverse().find(r => r.id !== parent.id && r.wins + r.losses + r.ties > 0);
    if (!victim) return;
    for (let attempt = 0; attempt < 30; attempt++) {
      const child = this.builder.mutate(parent.team);
      if (!this.add(child, `live-mutation:${parent.id}`)) continue;
      this.state.records = this.state.records.filter(r => r.id !== victim.id);
      this.state.archive.push({...victim, retiredAfterGame: this.state.games});
      if (this.state.archive.length > 100) this.state.archive.shift();
      break;
    }
  }
}
module.exports = {TeamPool, trainingTeams, key};
