'use strict';
const id = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// This tracker consumes player-visible protocol only. Unknown enemy fields stay unknown.
class BattleMemory {
  constructor() {
    this.pokemon = new Map();
    this.active = new Map();
    this.weather = '';
    this.terrain = '';
    this.trickRoom = false;
  }
  key(ident) { return String(ident || '').replace(/^(p[12])[a-z]:/, '$1:'); }
  get(ident) {
    const key = this.key(ident);
    if (!this.pokemon.has(key)) this.pokemon.set(key, {moves: new Set(), item: null, ability: null, status: '', species: '', volatiles: new Set()});
    return this.pokemon.get(key);
  }
  opponent(side) { const key = this.active.get(side === 'p1' ? 'p2' : 'p1'); return key ? this.get(key) : null; }
  observe(line) {
    const p = line.split('|');
    const command = p[1];
    const ident = p[2];
    if (command === '-weather') {this.weather = id(p[2]) === 'none' ? '' : id(p[2]); return;}
    if (['-fieldstart', '-fieldend'].includes(command)) {
      const field = id((p[2] || '').replace(/^move: /, ''));
      if (field.endsWith('terrain')) this.terrain = command === '-fieldstart' ? field : '';
      if (field === 'trickroom') this.trickRoom = command === '-fieldstart';
      return;
    }
    if (command === '-cureteam') {
      for (const [key, value] of this.pokemon) if (key.startsWith((ident || '').slice(0, 2))) value.status = '';
      return;
    }
    if (!/^p[12][a-z]?:/.test(ident || '')) return;
    const mon = this.get(ident);
    if (['switch', 'drag', 'replace'].includes(command)) {
      mon.species = (p[3] || '').split(',')[0];
      mon.status = (p[4] || '').split(' ')[1] || '';
      mon.volatiles.clear();
      this.active.set(ident.slice(0, 2), this.key(ident));
    }
    if (command === 'detailschange') mon.species = (p[3] || '').split(',')[0];
    if (command === 'move') {mon.moves.add(id(p[3])); mon.lastMove = id(p[3]);}
    if (command === '-item') mon.item = id(p[3]);
    if (command === '-enditem') {mon.consumedItem = id(p[3]); mon.item = '';}
    if (command === '-ability') mon.ability = id(p[3]);
    if (command === '-status') mon.status = p[3];
    if (command === '-curestatus') mon.status = '';
    if (command === '-cureteam') for (const [key, value] of this.pokemon) if (key.startsWith(ident.slice(0, 2))) value.status = '';
    if (['-damage', '-heal'].includes(command)) mon.status = (p[3] || '').split(' ')[1] || '';
    if (command === '-start') mon.volatiles.add(id((p[3] || '').replace(/^move: /, '')));
    if (command === '-end') mon.volatiles.delete(id((p[3] || '').replace(/^move: /, '')));
    const from = p.find(s => s.startsWith('[from] '));
    if (from) {
      const owner = p.find(s => s.startsWith('[of] '));
      const source = owner ? this.get(owner.slice(5)) : mon;
      if (from.startsWith('[from] item: ')) source.item = id(from.slice(13));
      if (from.startsWith('[from] ability: ')) source.ability = id(from.slice(16));
    }
  }
}
module.exports = {BattleMemory, id};
