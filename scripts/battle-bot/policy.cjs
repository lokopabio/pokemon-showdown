'use strict';
const {Dex} = require('../../dist/sim');
const fraction = condition => {
  if (!condition || condition.includes('fnt')) return 0;
  const [hp, max] = condition.split(' ')[0].split('/').map(Number);
  return max ? hp / max : hp > 0 ? 1 : 0;
};
class Policy {
  constructor(format = 'gen7ou', random = Math.random) {
    this.dex = Dex.forFormat(format);
    this.random = random;
    this.foe = null;
    this.side = null;
    this.turns = 0;
  }
  observe(line) {
    const p = line.split('|');
    if (p[1] === 'turn') this.turns = Number(p[2]);
    if (!this.side || !p[2] || p[2].startsWith(this.side)) return;
    if (['switch', 'drag', 'replace', 'detailschange'].includes(p[1])) {
      this.foe = {species: p[3].split(',')[0], condition: p[4] || '100/100', status: '', boosts: {}};
    }
    if (!this.foe) return;
    if (['-damage', '-heal'].includes(p[1])) this.foe.condition = p[3];
    if (p[1] === '-status') this.foe.status = p[3];
    if (p[1] === '-curestatus') this.foe.status = '';
    if (p[1] === '-boost') this.foe.boosts[p[3]] = (this.foe.boosts[p[3]] || 0) + Number(p[4]);
    if (p[1] === '-unboost') this.foe.boosts[p[3]] = (this.foe.boosts[p[3]] || 0) - Number(p[4]);
  }
  species(pokemon) { return this.dex.species.get((pokemon.details || pokemon.species).split(',')[0]); }
  effectiveness(type, target) {
    if (!target?.exists) return 1;
    return this.dex.getImmunity(type, target) ? 2 ** this.dex.getEffectiveness(type, target) : 0;
  }
  scoreMove(data, own) {
    const move = this.dex.moves.get(data.id || data.move);
    const species = this.species(own);
    const foe = this.foe && this.dex.species.get(this.foe.species);
    const hp = fraction(own.condition);
    if (move.category === 'Status') {
      if (move.heal) return hp < 0.65 ? 110 * (1 - hp) : -10;
      if (move.boosts && move.target === 'self') return hp > 0.7 ? 25 : 0;
      if (move.status) return this.foe?.status ? -10 : 26;
      if (move.sideCondition) return this.turns < 3 ? 35 : 2;
      return 4;
    }
    let power = data.basePower || move.basePower || (move.damage ? 70 : 35);
    if (typeof move.multihit === 'number') power *= move.multihit;
    else if (Array.isArray(move.multihit)) power *= 3;
    if (move.ohko) power = 120;
    const attack = own.stats?.[move.category === 'Physical' ? 'atk' : 'spa'] || species.baseStats[move.category === 'Physical' ? 'atk' : 'spa'];
    const defense = foe?.baseStats[move.category === 'Physical' ? 'def' : 'spd'] || 90;
    let score = power * attack / Math.max(defense, 1) * this.effectiveness(move.type, foe);
    if (species.types.includes(move.type)) score *= 1.5;
    if (typeof move.accuracy === 'number') score *= move.accuracy / 100;
    if (move.recoil) score *= 0.85;
    if (move.selfdestruct) score *= 0.5;
    if (move.priority > 0 && fraction(this.foe?.condition) < 0.3) score *= 1.4;
    return score;
  }
  choose(request) {
    if (!request || request.wait) return null;
    this.side = request.side.id;
    const team = request.side.pokemon;
    if (request.teamPreview) return 'default';
    if (request.active?.length > 1 || request.forceSwitch?.length > 1) throw new Error('This first bot supports singles only.');
    const own = team.find(p => p.active) || team[0];
    const switches = team.map((p, i) => ({p, slot: i + 1})).filter(({p}) => !p.active && fraction(p.condition) > 0);
    const foe = this.foe && this.dex.species.get(this.foe.species);
    const switchScore = p => {
      const species = this.species(p);
      const offense = Math.max(...species.types.map(t => this.effectiveness(t, foe)));
      const threat = foe?.exists ? Math.max(...foe.types.map(t => this.effectiveness(t, species))) : 1;
      return offense / Math.max(threat, 0.25) * fraction(p.condition);
    };
    switches.sort((a, b) => switchScore(b.p) - switchScore(a.p));
    if (request.forceSwitch) {
      // Revival Blessing requests select a fainted teammate.
      if (own.reviving || team[0].reviving) {
        const slot = team.findIndex(p => !p.active && fraction(p.condition) === 0);
        return slot >= 0 ? `switch ${slot + 1}` : 'default';
      }
      return switches.length ? `switch ${switches[0].slot}` : 'default';
    }
    const active = request.active?.[0];
    if (!active) return null;
    const choices = active.moves.flatMap((m, i) => m.disabled ? [] : [{choice: `move ${i + 1}`, score: this.scoreMove(m, own)}]);
    for (const [i, z] of (active.canZMove || []).entries()) {
      if (z && !active.moves[i]?.disabled) choices.push({choice: `move ${i + 1} zmove`, score: this.scoreMove({...z, basePower: this.dex.moves.get(active.moves[i].id || active.moves[i].move).zMove?.basePower || 100}, own) * 0.85});
    }
    choices.sort((a, b) => b.score - a.score || this.random() - 0.5);
    if (!active.trapped && !active.maybeTrapped && switches.length && this.foe &&
        switchScore(switches[0].p) > switchScore(own) * 3 && (choices[0]?.score || 0) < 70) {
      return `switch ${switches[0].slot}`;
    }
    let choice = choices[0]?.choice || 'default';
    if (choice.startsWith('move') && !choice.includes('zmove')) {
      if (active.canMegaEvo) choice += ' mega';
      else if (active.canUltraBurst) choice += ' ultra';
    }
    return choice;
  }
}
module.exports = {Policy, fraction};
