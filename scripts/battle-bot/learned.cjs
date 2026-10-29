'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {Policy, fraction} = require('./policy.cjs');
const {BattleMemory, id} = require('./memory.cjs');
const BASE = ['bias', 'damage', 'switch', 'switchMatchup', 'hp', 'foeHp', 'healMissingHp', 'healWaste', 'setupHealthy', 'setupAlreadyBoosted', 'statusUseful', 'statusWasted', 'hazardNew', 'hazardRepeated', 'priorityFinish', 'recoilLowHp', 'mega', 'zmove', 'speedAdvantage', 'removalNeeded', 'switchHazardRisk', 'immunity', 'boostedDamage', 'switchLosesBoosts'];
const V1_FEATURES = [...BASE, ...Array.from({length: 64}, (_, i) => `actionBucket${i}`)];
const EXTRA = ['leftoversProtect', 'lifeOrbAttack', 'choiceAttack', 'choiceStatus', 'burnPhysical', 'poisonHealProtect', 'gutsStatusAttack', 'technicianAttack', 'weatherDamage', 'weatherAccuracy', 'terrainDamage', 'revealedImmunity', 'foeContactRisk', 'contactAttack', 'revealedMoveSwitchRisk', 'revealedMoveSwitchSafe', 'trickRoomMove', 'trickRoomSwitch', 'foeSubstituteStatus', 'tauntedStatus', 'statusRecovery', 'switchStatus', 'switchRecovery', 'switchBoots', 'ownItemKnownAttack', 'foeItemKnownAttack', 'ownAbilityKnownAttack', 'foeAbilityKnownAttack', 'revealedFoeMovesAttack', 'ownAliveSwitch', 'foeRevealedSwitch', 'itemlessKnockOff'];
const FEATURES = [...V1_FEATURES, ...EXTRA, ...Array.from({length: 128}, (_, i) => `contextBucket${i}`)];
function fingerprint(nativePaths = false) {
  const root = path.resolve(__dirname, '../..');
  const hash = crypto.createHash('sha256');
  function visit(directory) {
    if (!fs.existsSync(directory)) return;
    for (const file of fs.readdirSync(directory).sort()) {
      const full = path.join(directory, file);
      if (fs.statSync(full).isDirectory()) visit(full);
      else if (file.endsWith('.ts')) {hash.update(nativePaths ? path.relative(root, full) : path.relative(root, full).split(path.sep).join('/')); hash.update(nativePaths ? fs.readFileSync(full) : fs.readFileSync(full, 'utf8').replace(/\r\n/g, '\n'));}
    }
  }
  visit(path.join(root, 'data'));
  visit(path.join(root, 'sim'));
  for (const name of ['formats.ts', 'custom-formats.ts']) {
    const file = path.join(root, 'config', name);
    if (fs.existsSync(file)) hash.update(nativePaths ? fs.readFileSync(file) : fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
  }
  return hash.digest('hex');
}
class Model {
  constructor(weights) {
    this.weights = weights ? [...weights] : FEATURES.map((_, i) => i === 1 ? 1 : 0);
    if (this.weights.length === V1_FEATURES.length) this.weights.push(...Array(FEATURES.length - V1_FEATURES.length).fill(0));
    if (this.weights.length !== FEATURES.length || this.weights.some(x => !Number.isFinite(x))) throw new Error('Invalid model weights');
    this.episodes = 0;
    this.baseline = 0;
  }
  probabilities(actions) {
    const scores = actions.map(a => a.features.reduce((s, x, i) => s + x * this.weights[i], 0));
    const max = Math.max(...scores);
    const values = scores.map(s => Math.exp(s - max));
    const total = values.reduce((s, x) => s + x, 0);
    return values.map(v => v / total);
  }
  gradient(trajectory, reward, baseline = this.baseline) {
    const gradient = FEATURES.map(() => 0);
    if (!trajectory.length) return gradient;
    const advantage = reward - baseline;
    for (const step of trajectory) {
      const expected = FEATURES.map(() => 0);
      for (let j = 0; j < step.actions.length; j++) {
        const features = step.actions[j].features;
        for (let i = 0; i < FEATURES.length; i++) expected[i] += step.probabilities[j] * features[i];
      }
      for (let i = 0; i < FEATURES.length; i++) gradient[i] += advantage * (step.actions[step.selected].features[i] - expected[i]) / trajectory.length;
    }
    return gradient;
  }
  applyGradient(gradient, reward, rate = 0.03, count = 1) {
    const norm = Math.hypot(...gradient);
    const scale = rate / Math.max(1, norm);
    this.weights = this.weights.map((w, i) => Math.max(-20, Math.min(20, w + scale * gradient[i])));
    this.baseline = 0.95 * this.baseline + 0.05 * reward;
    this.episodes += count;
  }
  update(trajectory, reward, rate = 0.03) {
    this.applyGradient(this.gradient(trajectory, reward), reward, rate);
  }
  snapshot() { return {schema: 2, kind: 'linear-softmax-reinforce', format: 'gen7ou', features: FEATURES, weights: [...this.weights], episodes: this.episodes, baseline: this.baseline}; }
  save(file, metadata = {}) {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    const temp = file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify({...this.snapshot(), metadata, fingerprint: fingerprint()}, null, 2));
    fs.renameSync(temp, file);
  }
  static load(file, checkFingerprint = true) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (![1, 2].includes(data.schema) || data.kind !== 'linear-softmax-reinforce' || data.format !== 'gen7ou' || JSON.stringify(data.features) !== JSON.stringify(data.schema === 1 ? V1_FEATURES : FEATURES)) throw new Error('Unsupported model schema or format');
    if (checkFingerprint && data.fingerprint !== fingerprint() && !(data.schema === 1 && data.fingerprint === fingerprint(true))) throw new Error('Model simulator fingerprint differs. Rebuild and retrain for the current server data.');
    const model = new Model(data.weights);
    if (!Number.isSafeInteger(data.episodes) || data.episodes < 0 || !Number.isFinite(data.baseline)) throw new Error('Invalid training metadata');
    model.episodes = data.episodes;
    model.baseline = data.baseline;
    return model;
  }
}
class LearnedPolicy extends Policy {
  constructor(format, model, {random = Math.random, training = false} = {}) {
    super(format, random);
    this.model = model;
    this.training = training;
    this.trajectory = [];
    this.memory = new BattleMemory();
    this.ownBoosts = {};
    this.hazards = {own: new Set(), foe: new Set()};
  }
  observe(line) {
    super.observe(line);
    this.memory.observe(line);
    const p = line.split('|');
    if (!this.side) return;
    const own = p[2]?.startsWith(this.side);
    if (own && ['switch', 'drag'].includes(p[1])) this.ownBoosts = {};
    if (own && ['-boost', '-unboost'].includes(p[1])) this.ownBoosts[p[3]] = (this.ownBoosts[p[3]] || 0) + Number(p[4]) * (p[1] === '-boost' ? 1 : -1);
    if (p[1] === '-clearallboost' || own && p[1] === '-clearboost') this.ownBoosts = {};
    if (['-sidestart', '-sideend'].includes(p[1])) {
      const id = (p[3] || '').replace(/^move: /, '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const set = own ? this.hazards.own : this.hazards.foe;
      if (p[1] === '-sidestart') set.add(id); else set.delete(id);
    }
  }
  candidates(request) {
    if (!request || request.wait || request.teamPreview || request.forceSwitch) return [];
    if (request.active?.length !== 1) throw new Error('Learned policy supports singles only');
    this.side = request.side.id;
    const own = request.side.pokemon.find(p => p.active) || request.side.pokemon[0];
    const species = this.species(own);
    const foe = this.foe && this.dex.species.get(this.foe.species);
    const active = request.active[0];
    const actions = [];
    const add = (choice, data, target) => {
      const x = FEATURES.map(() => 0);
      const put = (name, value) => {x[BASE.indexOf(name)] = value;};
      put('bias', 1);
      put('hp', fraction(own.condition));
      put('foeHp', fraction(this.foe?.condition));
      let bucket;
      if (target) {
        const candidate = this.species(target);
        const offense = Math.max(...candidate.types.map(t => this.effectiveness(t, foe)));
        const threat = foe?.exists ? Math.max(...foe.types.map(t => this.effectiveness(t, candidate))) : 1;
        put('switch', 1);
        put('switchMatchup', Math.min(4, offense / Math.max(0.25, threat)) * fraction(target.condition) / 4);
        put('switchHazardRisk', Math.min(3, this.hazards.own.size) / 3);
        put('switchLosesBoosts', Math.min(6, Object.values(this.ownBoosts).reduce((s, v) => s + Math.max(0, v), 0)) / 6);
        bucket = 'switch:' + candidate.id;
      } else {
        const move = this.dex.moves.get(data.id || data.move);
        const missing = 1 - fraction(own.condition);
        put('damage', Math.max(-1, Math.min(4, this.scoreMove(data, own) / 100)));
        put('healMissingHp', move.heal ? missing : 0);
        put('healWaste', move.heal && missing < 0.2 ? 1 : 0);
        put('setupHealthy', move.boosts && move.target === 'self' ? fraction(own.condition) : 0);
        put('setupAlreadyBoosted', move.boosts && move.target === 'self' ? Math.min(1, Object.values(this.ownBoosts).filter(v => v > 0).length / 2) : 0);
        put('statusUseful', move.status && this.foe && !this.foe.status ? 1 : 0);
        put('statusWasted', move.status && this.foe?.status ? 1 : 0);
        put('hazardNew', move.sideCondition && !this.hazards.foe.has(move.sideCondition) ? 1 : 0);
        put('hazardRepeated', move.sideCondition && this.hazards.foe.has(move.sideCondition) ? 1 : 0);
        put('priorityFinish', move.priority > 0 && fraction(this.foe?.condition) < 0.3 ? 1 : 0);
        put('recoilLowHp', move.recoil ? missing : 0);
        put('mega', / (mega|ultra)$/.test(choice) ? 1 : 0);
        put('zmove', choice.endsWith(' zmove') ? 1 : 0);
        put('speedAdvantage', foe?.exists && species.baseStats.spe > foe.baseStats.spe ? 1 : 0);
        put('removalNeeded', ['rapidspin', 'defog'].includes(move.id) ? Math.min(1, this.hazards.own.size / 2) : 0);
        put('immunity', move.category !== 'Status' && this.effectiveness(move.type, foe) === 0 ? 1 : 0);
        put('boostedDamage', move.category !== 'Status' ? Math.max(-1, Math.min(1, (this.ownBoosts[move.category === 'Physical' ? 'atk' : 'spa'] || 0) / 6)) : 0);
        bucket = move.id;
      }
      let hash = 2166136261;
      for (const char of bucket) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
      x[BASE.length + (hash >>> 0) % 64] = 1;
      this.addContext(x, choice, data, own, target, request);
      actions.push({choice, features: x});
    };
    active.moves.forEach((move, i) => {
      if (move.disabled) return;
      add(`move ${i + 1}`, move);
      if (active.canMegaEvo) add(`move ${i + 1} mega`, move);
      else if (active.canUltraBurst) add(`move ${i + 1} ultra`, move);
      const z = active.canZMove?.[i];
      if (z) add(`move ${i + 1} zmove`, {...z, basePower: this.dex.moves.get(move.id || move.move).zMove?.basePower || 100});
    });
    if (!active.trapped && !active.maybeTrapped) request.side.pokemon.forEach((p, i) => {
      if (!p.active && fraction(p.condition) > 0) add(`switch ${i + 1}`, null, p);
    });
    return actions;
  }
  addContext(x, choice, data, own, target, request) {
    const set = (key, value) => {x[V1_FEATURES.length + EXTRA.indexOf(key)] = Math.max(-4, Math.min(4, Number(value) || 0));};
    const enemy = this.memory.opponent(this.side);
    const current = this.memory.get(own.ident || `${this.side}: ${this.species(own).name}`);
    const item = id(own.item);
    const ability = id(own.ability || own.baseAbility || current.ability);
    const status = (own.condition || '').split(' ')[1] || '';
    const contexts = [];
    const hashContext = text => {
      let hash = 2166136261;
      for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
      x[V1_FEATURES.length + EXTRA.length + (hash >>> 0) % 128] += 0.25;
    };
    if (target) {
      const species = this.species(target);
      const known = [...(enemy?.moves || [])].map(m => this.dex.moves.get(m)).filter(m => m.category !== 'Status');
      const risk = known.length ? Math.max(...known.map(m => this.effectiveness(m.type, species))) : 1;
      set('revealedMoveSwitchRisk', known.length ? Math.min(4, risk) / 4 : 0);
      set('revealedMoveSwitchSafe', known.length && risk <= 0.5 ? 1 : 0);
      set('switchStatus', (target.condition || '').includes(' ') ? 1 : 0);
      set('switchRecovery', id(target.ability || target.baseAbility) === 'regenerator' ? 1 - fraction(target.condition) : 0);
      set('switchBoots', id(target.item) === 'heavydutyboots' ? this.hazards.own.size : 0);
      set('trickRoomSwitch', this.memory.trickRoom ? (this.species(own).baseStats.spe - species.baseStats.spe) / 200 : 0);
      set('ownAliveSwitch', request.side.pokemon.filter(p => fraction(p.condition) > 0).length / 6);
      set('foeRevealedSwitch', [...this.memory.pokemon.keys()].filter(k => !k.startsWith(this.side)).length / 6);
      contexts.push(`switch:${id(target.ability || target.baseAbility)}:${this.memory.weather}`, `switch:${id(target.item)}:${status}`);
    } else {
      const move = this.dex.moves.get(data.id || data.move);
      const attack = move.category !== 'Status';
      const physical = move.category === 'Physical';
      const contact = !!move.flags?.contact;
      const protect = ['protect', 'detect', 'kingsshield', 'spikyshield', 'banefulbunker', 'silktrap', 'burningbulwark'].includes(move.id);
      const type = move.type;
      set('leftoversProtect', protect && item === 'leftovers' ? 1 - fraction(own.condition) : 0);
      set('lifeOrbAttack', attack && item === 'lifeorb' ? fraction(own.condition) : 0);
      set('choiceAttack', attack && item.startsWith('choice') ? 1 : 0);
      set('choiceStatus', !attack && item.startsWith('choice') ? 1 : 0);
      set('burnPhysical', physical && status === 'brn' ? 1 : 0);
      set('poisonHealProtect', protect && ability === 'poisonheal' && ['psn', 'tox'].includes(status) ? 1 : 0);
      set('gutsStatusAttack', physical && ability === 'guts' && status ? 1 : 0);
      set('technicianAttack', attack && ability === 'technician' && move.basePower > 0 && move.basePower <= 60 ? 1 : 0);
      const rain = ['raindance', 'primordialsea'].includes(this.memory.weather);
      const sun = ['sunnyday', 'desolateland'].includes(this.memory.weather);
      set('weatherDamage', attack ? (rain ? (type === 'Water' ? 1 : type === 'Fire' ? -1 : 0) : sun ? (type === 'Fire' ? 1 : type === 'Water' ? -1 : 0) : 0) : 0);
      set('weatherAccuracy', ['thunder', 'hurricane'].includes(move.id) ? (rain ? 1 : sun ? -1 : 0) : 0);
      set('terrainDamage', attack && ({electricterrain: 'Electric', grassyterrain: 'Grass', psychicterrain: 'Psychic'})[this.memory.terrain] === type ? 1 : 0);
      const immunities = {levitate: 'Ground', flashfire: 'Fire', waterabsorb: 'Water', stormdrain: 'Water', dryskin: 'Water', voltabsorb: 'Electric', lightningrod: 'Electric', motordrive: 'Electric', sapsipper: 'Grass'};
      set('revealedImmunity', attack && enemy?.ability && immunities[enemy.ability] === type ? 1 : 0);
      set('foeContactRisk', contact && (enemy?.item === 'rockyhelmet' || ['roughskin', 'ironbarbs', 'flamebody', 'static'].includes(enemy?.ability)) ? 1 : 0);
      set('contactAttack', contact ? 1 : 0);
      const foe = this.foe && this.dex.species.get(this.foe.species);
      set('trickRoomMove', attack && this.memory.trickRoom && foe?.exists ? (foe.baseStats.spe - this.species(own).baseStats.spe) / 200 : 0);
      set('foeSubstituteStatus', move.status && enemy?.volatiles.has('substitute') ? 1 : 0);
      set('tauntedStatus', !attack && current.volatiles.has('taunt') ? 1 : 0);
      set('statusRecovery', ['rest', 'refresh', 'aromatherapy', 'healbell'].includes(move.id) && status ? 1 : 0);
      set('ownItemKnownAttack', attack && item ? 1 : 0);
      set('foeItemKnownAttack', attack && enemy?.item !== null && enemy?.item !== undefined ? 1 : 0);
      set('ownAbilityKnownAttack', attack && ability ? 1 : 0);
      set('foeAbilityKnownAttack', attack && enemy?.ability ? 1 : 0);
      set('revealedFoeMovesAttack', attack ? (enemy?.moves.size || 0) / 4 : 0);
      set('itemlessKnockOff', move.id === 'knockoff' && enemy?.item === '' ? 1 : 0);
      contexts.push(`item:${item}:${move.id}`, `ability:${ability}:${type}:${move.category}`, `foeitem:${enemy?.item ?? 'unknown'}:${move.id}`, `foeability:${enemy?.ability ?? 'unknown'}:${type}`, `field:${this.memory.weather}:${this.memory.terrain}:${type}`, `status:${status}:${move.category}`);
    }
    for (const context of contexts) hashContext(context);
  }
  choose(request) {
    const actions = this.candidates(request);
    if (!actions.length) return super.choose(request);
    const probabilities = this.model.probabilities(actions);
    let selected = 0;
    if (this.training) {
      let sample = this.random();
      selected = probabilities.length - 1;
      for (let i = 0; i < probabilities.length; i++) {sample -= probabilities[i]; if (sample <= 0) {selected = i; break;}}
      this.trajectory.push({actions, probabilities, selected});
    } else {
      for (let i = 1; i < probabilities.length; i++) if (probabilities[i] > probabilities[selected]) selected = i;
    }
    return actions[selected].choice;
  }
}
module.exports = {Model, LearnedPolicy, FEATURES, V1_FEATURES, fingerprint};
