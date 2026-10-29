'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {Policy, fraction} = require('./policy.cjs');
const {play} = require('./evaluate.cjs');
const mon = (name, active = true, condition = '300/300') => ({ident: `p1: ${name}`, details: name, active, condition, stats: {atk: 100, spa: 100}, moves: []});
function request(moves, extra = {}) {
  return {side: {id: 'p1', pokemon: [mon('Pikachu'), mon('Blastoise', false)]}, active: [{moves}], ...extra};
}
test('wait, fainting, forced switches and disabled moves', () => {
  const p = new Policy();
  assert.equal(p.choose({wait: true}), null);
  assert.equal(fraction('0 fnt'), 0);
  assert.equal(p.choose(request([], {forceSwitch: [true], active: undefined})), 'switch 2');
  assert.equal(p.choose(request([{id: 'thunderbolt', disabled: true}, {id: 'tackle'}])), 'move 2');
});
test('public opponent tracking and type immunity', () => {
  const p = new Policy();
  p.side = 'p1';
  p.observe('|switch|p2a: Garchomp|Garchomp, L100|100/100');
  assert.equal(p.choose(request([{id: 'thunderbolt'}, {id: 'hiddenpowerice'}])), 'move 2');
  p.observe('|-status|p2a: Garchomp|par');
  assert.equal(p.foe.status, 'par');
  p.observe('|switch|p1a: Pikachu|Pikachu|100/100');
  assert.equal(p.foe.species, 'Garchomp');
});
test('reads custom species and handles mega and Z choices', () => {
  const p = new Policy();
  assert.equal(p.dex.species.get('carletto').exists, true);
  const r = request([{id: 'tackle'}]);
  r.active[0].canMegaEvo = 'Pikachu-Mega';
  assert.equal(p.choose(r), 'move 1 mega');
  delete r.active[0].canMegaEvo;
  r.active[0].canZMove = [{move: 'Breakneck Blitz'}];
  assert.equal(p.choose(r), 'move 1 zmove');
});
test('full battles finish through player-specific simulator streams', {timeout: 30000}, async () => {
  const team1 = [{species: 'Pikachu', ability: 'Static', moves: ['Thunderbolt', 'Quick Attack']}];
  const team2 = [{species: 'Blastoise', ability: 'Torrent', moves: ['Surf', 'Tackle']}];
  for (let i = 0; i < 5; i++) assert.ok(['Heuristic', 'Baseline', 'tie'].includes(await play('gen7customgame', team1, team2, [i + 1, 2, 3, 4])));
  const custom = [{species: 'Carletto', moves: ['Tackle'], ability: 'Pressure'}];
  assert.ok(['Heuristic', 'Baseline', 'tie'].includes(await play('gen7customgame', custom, team2)));
});
test('WebSocket login, challenge acceptance and battle choice', {timeout: 10000}, async () => {
  const http = require('node:http');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const sockjs = require('sockjs');
  const {connect} = require('./connect.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-bot-'));
  fs.writeFileSync(path.join(directory, 'team.txt'), 'Pikachu\nAbility: Static\nEVs: 252 SpA / 4 SpD / 252 Spe\nTimid Nature\n- Thunderbolt\n');
  const server = http.createServer();
  const transport = sockjs.createServer({log() {}});
  transport.installHandlers(server, {prefix: '/showdown'});
  let stop;
  let connection;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const completed = new Promise((resolve, reject) => {
      transport.on('connection', conn => {
        connection = conn;
        conn.write('|challstr|1|test');
        conn.on('data', text => {
          try {
            if (text.startsWith('|/trn')) conn.write('|updatechallenges|{"challengesFrom":{"Tester":"gen7ou"}}');
            if (text === '|/accept Tester') {
              conn.write('>battle-gen7ou-1\n|tier|[Gen 7] OU\n|switch|p2a: Blastoise|Blastoise|100/100');
              conn.write('>battle-gen7ou-1\n|request|' + JSON.stringify({...request([{id: 'thunderbolt'}]), rqid: 1}));
            }
            if (text.startsWith('battle-gen7ou-1|/choose')) {
              assert.equal(text, 'battle-gen7ou-1|/choose move 1|1');
              resolve();
            }
          } catch (error) {reject(error);}
        });
      });
    });
    stop = connect({server: `ws://127.0.0.1:${server.address().port}/showdown/websocket`, username: 'TestBot', teams: {gen7ou: 'team.txt'}}, directory);
    await completed;
  } finally {
    stop?.();
    connection?.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, {recursive: true});
  }
});
test('breeder restricts species, enforces Gen 7 OU and reproduces seeded teams', {timeout: 30000}, () => {
  const {Breeder} = require('./breed.cjs');
  const {Teams} = require('../../dist/sim');
  const a = new Breeder(42);
  const b = new Breeder(42);
  const team = a.team();
  assert.equal(Teams.pack(team), Teams.pack(b.team()));
  assert.equal(a.allowed.has('pikachu'), false);
  const first = a.dex.species.all().findIndex(s => s.id === 'carletto');
  const boundary = new Set(a.dex.species.all().slice(first).filter(s => s.num < 0).map(s => s.id));
  for (let i = 0; i < 10; i++) {
    const child = a.mutate(team);
    assert.equal(a.legal(child), true);
    assert.equal(child.length, 6);
    assert.ok(child.every(s => boundary.has(a.dex.species.get(s.species).id)));
  }
  const bad = structuredClone(team);
  bad[0].species = 'Pikachu';
  assert.equal(a.legal(bad), false);
});
test('evolution runs actual battles and exports a legal champion and held-out report', {timeout: 30000}, async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const {evolve, Breeder} = require('./breed.cjs');
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-breed-'));
  try {
    const {champion, report} = await evolve({seed: 7, population: 4, generations: 2, opponents: 1, maxTurns: 30, output});
    assert.equal(new Breeder(7).legal(champion), true);
    assert.equal(report.name, 'Roman-016');
    assert.equal(report.history.length, 2);
    const records = fs.readFileSync(path.join(output, 'battles.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.equal(records.length, 18);
    assert.equal(records.filter(r => r.phase === 'heldout').length, 2);
    assert.ok(records.every(r => r.names.includes('Roman-016')));
    assert.ok(records.some(r => r.candidateSide === 'p1'));
    assert.ok(records.some(r => r.candidateSide === 'p2'));
    assert.equal(fs.readFileSync(path.join(output, 'battles.csv'), 'utf8').trim().split('\n').length, 19);
    const logFile = path.join(output, 'battles', 'gen-1-team-1-opponent-1-p1.log');
    assert.match(fs.readFileSync(logFile, 'utf8'), /\|turn\|/);
    const metadata = JSON.parse(fs.readFileSync(logFile + '.json', 'utf8'));
    assert.equal(metadata.teams.length, 2);
    assert.ok(metadata.decisions.length > 0);
    await assert.rejects(evolve({output}), /not empty/);
    assert.equal(report.heldout.games, 2);
    assert.equal(report.heldout.wins + report.heldout.losses + report.heldout.ties, 2);
    assert.ok(report.history[1].best.points >= report.history[0].best.points);
    assert.ok(fs.statSync(path.join(output, 'best.txt')).size > 0);
    assert.ok(fs.statSync(path.join(output, 'checkpoint.json')).size > 0);
  } finally {fs.rmSync(output, {recursive: true});}
});
