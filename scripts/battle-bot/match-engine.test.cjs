'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const {audit} = require('./match-engine.cjs');
const bank = set => ({schema: 1, format: 'gen7ou', sets: [set]});
test('Gen 7 audit rejects Mega Stones without importing Mega forms', () => {
  const r = audit(bank({species: 'Charizard', ability: 'Blaze', item: 'Charizardite X', moves: ['Flamethrower']}));
  assert.equal(r.target.generation, 7);
  assert.equal(r.target.teamPreview, false);
  assert.equal(r.readyForBenchmark, false);
  assert(!r.coverage.species.records.some(s => s.id === 'charizardmegax'));
  assert(r.coverage.species.records.every(s => s.engineIdentifierPresent));
  assert(r.blockers.includes('Bank contains Z-Crystals or Mega Stones'));
  assert.equal(r.coverage.moves.records[0].mechanicsVerified, false);
});
test('audit reports unknown custom identifiers and Z-Crystals', () => {
  const r = audit(bank({species: 'Carlis', item: 'Electrium Z', moves: ['Thunderbolt']}));
  assert(r.coverage.species.missing.includes('carlis'));
  assert(r.blockers.includes('Bank contains Z-Crystals or Mega Stones'));
  assert.equal(r.target.zMoves, false);
});
test('invalid bank schema is rejected', () => assert.throws(() => audit({schema: 2})));
test('selectable pool is bounded by Carletto and Lugamon and excludes official species', () => {
  const r = audit(bank({species: 'Charizard', moves: ['Flamethrower']}));
  assert(r.target.selectableSpecies.includes('carletto'));
  assert(r.target.selectableSpecies.includes('lugamon'));
  assert(!r.target.selectableSpecies.includes('charizard'));
  assert(r.blockers.some(b => b.includes('outside Carletto–Lugamon')));
  const valid = audit(bank({species: 'Carletto', moves: ['Tackle']}));
  assert(!valid.blockers.some(b => b.includes('outside Carletto–Lugamon')));
});
