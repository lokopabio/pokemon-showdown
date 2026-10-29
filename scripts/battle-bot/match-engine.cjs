'use strict';
// Deliberately conservative: identifier coverage never implies mechanics parity.
const fs = require('node:fs');
const crypto = require('node:crypto');
const {Dex} = require('../../dist/sim');
const catalog = require('./compatibility/poke-engine.json');
const id = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function audit(bank) {
  if (bank.schema !== 1 || bank.format !== 'gen7ou' || !Array.isArray(bank.sets)) throw new Error('Expected schema 1 gen7ou bank');
  const dex = Dex.forFormat('gen7ou');
  const rules = dex.formats.getRuleTable(dex.formats.get('gen7ou'));
  const all = dex.species.all();
  const start = all.findIndex(s => s.id === 'carletto');
  const end = all.findIndex(s => s.id === 'lugamon');
  if (start < 0 || end < start) throw new Error('Missing or reversed Carletto–Lugamon boundary');
  const pool = all.slice(start, end + 1).filter(s => s.exists && s.num < 0 && !s.battleOnly && !s.isMega && !s.requiredItem);
  const allowed = new Set(pool.map(s => s.id));
  const sets = [...bank.sets.map(r => r.set || r), ...(bank.teams || []).flatMap(r => r.team || r)];
  const wanted = {species: new Set(), moves: new Set(), abilities: new Set(), items: new Set()};
  const forbidden = [];
  const outsidePool = [];
  for (const set of sets) {
    if (!allowed.has(id(set.species))) outsidePool.push(set.species);
    wanted.species.add(id(set.species));
    for (const move of set.moves || []) wanted.moves.add(id(move));
    if (set.ability) wanted.abilities.add(id(set.ability));
    if (set.item) {
      wanted.items.add(id(set.item));
      const item = dex.items.get(set.item);
      if (item.zMove || item.zMoveType) forbidden.push(set.item);
    }
  }
  // Include transformations reachable through the supplied Mega Stones.
  for (const item of wanted.items) {
    const mega = dex.items.get(item).megaStone;
    if (mega) {
      const species = dex.species.get(mega);
      wanted.species.add(species.id);
      for (const ability of Object.values(species.abilities)) wanted.abilities.add(id(ability));
    }
  }
  const coverage = {};
  for (const [kind, ids] of Object.entries(wanted)) {
    const upstream = new Set(catalog[kind]);
    const accessor = dex[kind];
    const records = [...ids].sort().map(key => {
      const data = accessor.get(key);
      const serialized = JSON.stringify(data, (_, v) => typeof v === 'function' ? v.toString().replace(/\r\n/g, '\n') : v);
      return {id: key, name: data.name, serverExists: !!data.exists,
        engineIdentifierPresent: upstream.has(key), mechanicsVerified: false,
        serverDefinitionHash: crypto.createHash('sha256').update(serialized).digest('hex'),
        ...(kind === 'species' ? {types: data.types, baseStats: data.baseStats, abilities: data.abilities} : {}),
        ...(kind === 'moves' ? {basePower: data.basePower, accuracy: data.accuracy, type: data.type, category: data.category, priority: data.priority, multihit: data.multihit} : {}),
      };
    });
    coverage[kind] = {total: records.length, missing: records.filter(r => !r.engineIdentifierPresent).map(r => r.id), records};
  }
  return {schema: 1, engine: {repository: catalog.repository, commit: catalog.commit, buildFeature: 'gen7'},
    target: {format: 'gen7ou', generation: dex.gen, teamPreview: rules.has('teampreview'), zMoves: false,
      selectableSpecies: pool.map(s => s.id), speciesBoundary: ['carletto', 'lugamon'],
      note: 'Z-Moves disabled for this benchmark only; the live format is not changed.'},
    readyForBenchmark: false, blockers: ['Mechanics parity tests and battle adapter are not implemented',
      ...Object.entries(coverage).filter(([, v]) => v.missing.length).map(([k, v]) => `${v.missing.length} missing ${k} identifiers`),
      ...(forbidden.length ? ['Bank contains Z-Crystals'] : []),
      ...(outsidePool.length ? ['Bank contains species outside Carletto–Lugamon: ' + [...new Set(outsidePool)].join(', ')] : []),
      ...(rules.has('teampreview') ? ['Server format enables Team Preview'] : [])], coverage};
}
if (require.main === module) {
  const [bankFile, output] = process.argv.slice(2);
  if (!bankFile || !output) throw new Error('Usage: node scripts/battle-bot/match-engine.cjs BANK.json NEW-REPORT.json');
  const report = audit(JSON.parse(fs.readFileSync(bankFile, 'utf8')));
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
  for (const [kind, value] of Object.entries(report.coverage)) console.log(`${kind}: ${value.total - value.missing.length}/${value.total} identifiers present`);
  console.log('Not ready for battles. ' + report.blockers.join('; '));
}
module.exports = {audit};
