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
test('reads custom species and handles Mega Evolution and ignores Z-Moves', () => {
  const p = new Policy();
  assert.equal(p.dex.species.get('carletto').exists, true);
  const r = request([{id: 'tackle'}]);
  r.active[0].canMegaEvo = 'Pikachu-Mega';
  assert.equal(p.choose(r), 'move 1 mega');
  delete r.active[0].canMegaEvo;
  r.active[0].canZMove = [{move: 'Breakneck Blitz'}];
  assert.equal(p.choose(r), 'move 1');
});
test('full battles finish through player-specific simulator streams', {timeout: 30000}, async () => {
  const team1 = [{species: 'Pikachu', ability: 'Static', moves: ['Thunderbolt', 'Quick Attack']}];
  const team2 = [{species: 'Blastoise', ability: 'Torrent', moves: ['Surf', 'Tackle']}];
  for (let i = 0; i < 5; i++) assert.ok(['Heuristic', 'Baseline', 'tie'].includes(await play('gen7customgame', team1, team2, [i + 1, 2, 3, 4])));
  const custom = [{species: 'Carletto', moves: ['Tackle'], ability: 'Pressure'}];
  assert.ok(['Heuristic', 'Baseline', 'tie'].includes(await play('gen7customgame', custom, team2)));
});
test('WebSocket learned checkpoint login, challenge, choice and live logs', {timeout: 10000}, async () => {
  const http = require('node:http');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const sockjs = require('sockjs');
  const {connect} = require('./connect.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-bot-'));
  const {Teams} = require('../../dist/sim');
  const {Breeder} = require('./breed.cjs');
  const {Model} = require('./learned.cjs');
  fs.writeFileSync(path.join(directory, 'team.txt'), Teams.export(new Breeder(11).team()));
  new Model().save(path.join(directory, 'model.json'));
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
            if (text.startsWith('|/trn')) {assert.match(text, /,0,signed,test-token$/);} 
            if (text.startsWith('|/trn')) conn.write('|pm| Tester| Roman-016|/challenge gen7ou|gen7ou|||');
            if (text === '|/accept tester') {
              conn.write('>battle-gen7ou-1\n|tier|[Gen 7] OU\n|switch|p2a: Blastoise|Blastoise|100/100');
              conn.write('>battle-gen7ou-1\n|request|' + JSON.stringify({...request([{id: 'thunderbolt'}]), rqid: 1}));
            }
            if (text.startsWith('battle-gen7ou-1|/choose')) {
              assert.equal(text, 'battle-gen7ou-1|/choose move 1|1');
              conn.write('>battle-gen7ou-1\n|win|Roman-016');
            }
            if (text === 'battle-gen7ou-1|/leave') resolve();
          } catch (error) {reject(error);}
        });
      });
    });
    stop = connect({server: `ws://127.0.0.1:${server.address().port}/showdown/websocket`, username: 'Roman-016', model: 'model.json', logDirectory: 'live', teams: {gen7ou: 'team.txt'}}, directory, {fetchImpl: async () => ({ok: true, text: async () => 'signed,test-token'})});
    await completed;
    const matches = fs.readFileSync(path.join(directory, 'live', 'matches.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(matches[0].result, 'win');
    assert.equal(matches[0].model, 'model.json');
    assert.match(fs.readFileSync(matches[0].logFile, 'utf8'), /botchoice/);
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
test('policy gradient increases rewarded action probability and checkpoints roundtrip', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const os = require('node:os');
  const {Model, FEATURES} = require('./learned.cjs');
  const model = new Model(FEATURES.map(() => 0));
  const a = FEATURES.map(() => 0); a[2] = 1;
  const b = FEATURES.map(() => 0); b[2] = -1;
  const actions = [{features: a}, {features: b}];
  const before = model.probabilities(actions)[0];
  for (let i = 0; i < 10; i++) model.update([{actions, probabilities: model.probabilities(actions), selected: 0}], 1, 0.1);
  assert.ok(model.probabilities(actions)[0] > before);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-model-'));
  try {
    const file = path.join(dir, 'model.json');
    model.save(file);
    assert.deepEqual(Model.load(file).weights, model.weights);
    const corrupt = JSON.parse(fs.readFileSync(file, 'utf8')); corrupt.fingerprint = 'wrong';
    fs.writeFileSync(file, JSON.stringify(corrupt));
    assert.throws(() => Model.load(file), /fingerprint/);
  } finally {fs.rmSync(dir, {recursive: true});}
});
test('learned policy masks unavailable moves and generates transformation choices', () => {
  const {Model, LearnedPolicy} = require('./learned.cjs');
  const p = new LearnedPolicy('gen7ou', new Model());
  const r = request([{id: 'thunderbolt', disabled: true}, {id: 'tackle'}]);
  r.active[0].canMegaEvo = 'test';
  r.active[0].canZMove = [null, {move: 'Breakneck Blitz'}];
  const choices = p.candidates(r).map(a => a.choice);
  assert.ok(!choices.some(c => c.startsWith('move 1')));
  assert.ok(choices.includes('move 2 mega'));
  assert.ok(!choices.some(c => c.endsWith(' zmove')));
  r.active[0].trapped = true;
  assert.ok(!p.candidates(r).some(a => a.choice.startsWith('switch')));
});
test('RL updates weights from real battles, saves loadable policies and resumes', {timeout: 30000}, async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const os = require('node:os');
  const {train} = require('./train.cjs');
  const {Model} = require('./learned.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-train-'));
  try {
    const first = path.join(dir, 'first');
    const result = await train({episodes: 3, seed: 3, evalEvery: 3, evalPairs: 1, maxTurns: 30, output: first});
    const initial = Model.load(path.join(first, 'initial.json'));
    const latest = Model.load(path.join(first, 'latest.json'));
    assert.notDeepEqual(initial.weights, latest.weights);
    assert.equal(latest.episodes, 3);
    assert.equal(result.report.validation.length, 2);
    const config = JSON.parse(fs.readFileSync(path.join(first, 'bot.json'), 'utf8'));
    assert.equal(config.username, 'Roman-016');
    assert.equal(config.model, 'best.json');
    assert.equal(config.logDirectory, 'live');
    const resumed = await train({episodes: 1, seed: 3, evalEvery: 1, evalPairs: 1, maxTurns: 30, output: path.join(dir, 'second'), resume: path.join(first, 'latest.json')});
    assert.equal(resumed.model.episodes, 4);
  } finally {fs.rmSync(dir, {recursive: true});}
});
test('roster exports all six names with measured ordering and loadable models', {timeout: 30000}, async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const os = require('node:os');
  const {Model} = require('./learned.cjs');
  const {roster, NAMES} = require('./roster.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-roster-'));
  try {
    fs.mkdirSync(path.join(dir, 'input', 'checkpoints'), {recursive: true});
    for (let i = 1; i <= 6; i++) {
      const model = new Model(); model.weights[1] = i / 5; model.episodes = i;
      model.save(path.join(dir, 'input', 'checkpoints', `episode-${i}.json`));
    }
    const output = path.join(dir, 'output');
    const report = await roster(path.join(dir, 'input'), {output, pairs: 1, maxTurns: 20});
    assert.deepEqual(report.ranking.map(r => r.name), NAMES);
    assert.equal(report.games, 30);
    assert.ok(report.ranking.every((r, i, arr) => i === 0 || r.points >= arr[i - 1].points));
    const config = JSON.parse(fs.readFileSync(path.join(output, 'bots.json'), 'utf8'));
    assert.deepEqual(config.map(c => c.username), NAMES);
    for (const bot of config) assert.ok(Model.load(path.join(output, bot.model)));
  } finally {fs.rmSync(dir, {recursive: true});}
});

test('guest authentication requests a signed assertion and handles registered names', async () => {
  const {getAssertion} = require('./auth.cjs');
  let request;
  const fake = async (url, options) => {request = {url: String(url), body: options.body}; return {ok: true, text: async () => 'userid,token,signature'};};
  assert.equal(await getAssertion({username: 'Roman-016'}, '1|challenge', fake), 'userid,token,signature');
  assert.equal(request.body.get('act'), 'getassertion');
  assert.equal(request.body.get('userid'), 'roman016');
  assert.equal(request.body.get('challstr'), '1|challenge');
  assert.equal(request.body.has('pass'), false);
  await assert.rejects(getAssertion({username: 'Roman-016'}, 'test', async () => ({ok: true, text: async () => ';'})), /password/);
  await assert.rejects(getAssertion({username: 'Roman-016'}, 'test', async () => ({ok: true, text: async () => '<html>error</html>'})), /Invalid assertion/);
  await assert.rejects(getAssertion({username: 'Roman-016'}, 'test', async () => ({ok: false, status: 503})), /503/);
});
test('registered authentication parses standard Showdown login responses', async () => {
  const {getAssertion} = require('./auth.cjs');
  process.env.ROMAN_TEST_PASSWORD = 'test-only';
  try {
    const assertion = await getAssertion({username: 'Roman-016', passwordEnv: 'ROMAN_TEST_PASSWORD'}, '1|challenge', async (_url, options) => {
      assert.equal(options.body.get('act'), 'login');
      assert.equal(options.body.get('pass'), 'test-only');
      return {ok: true, text: async () => ']'+JSON.stringify({curuser: {loggedin: true}, assertion: 'userid,token,signature'})};
    });
    assert.equal(assertion, 'userid,token,signature');
  } finally {delete process.env.ROMAN_TEST_PASSWORD;}
});

test('challenge parser supports server PM challenges and legacy events', () => {
  const {incomingChallenges} = require('./connect.cjs');
  assert.deepEqual(incomingChallenges('|pm|+loko1| Roman-016|/challenge gen7ou|gen7ou|||', 'Roman-016'), {loko1: 'gen7ou'});
  assert.deepEqual(incomingChallenges('|pm| Roman-016|+loko1|/challenge gen7ou|gen7ou|||', 'Roman-016'), {});
  assert.deepEqual(incomingChallenges('|pm|+loko1| Roman-016|/challenge', 'Roman-016'), {});
  assert.deepEqual(incomingChallenges('|pm|+loko1| Roman-003|/challenge gen7ou|gen7ou|||', 'Roman-016'), {});
  assert.deepEqual(incomingChallenges('|updatechallenges|{"challengesFrom":{"loko1":"gen7ou"}}', 'Roman-016'), {loko1: 'gen7ou'});
});
test('memory preserves public reveals without guessing unrevealed opponent attributes', () => {
  const {BattleMemory} = require('./memory.cjs');
  const m = new BattleMemory();
  m.observe('|switch|p2a: Enemy|Gengar, L100|100/100 par');
  assert.equal(m.opponent('p1').item, null);
  assert.equal(m.opponent('p1').ability, null);
  assert.equal(m.opponent('p1').status, 'par');
  m.observe('|move|p2a: Enemy|Shadow Ball|p1a: Us');
  m.observe('|-heal|p2a: Enemy|90/100 par|[from] item: Leftovers');
  m.observe('|-ability|p2a: Enemy|Levitate');
  assert.equal(m.opponent('p1').item, 'leftovers');
  assert.equal(m.opponent('p1').ability, 'levitate');
  assert.ok(m.opponent('p1').moves.has('shadowball'));
  m.observe('|switch|p2a: Other|Pikachu|100/100');
  assert.equal(m.opponent('p1').item, null);
  m.observe('|switch|p2a: Enemy|Gengar|100/100');
  assert.ok(m.opponent('p1').moves.has('shadowball'));
  m.observe('|-enditem|p2a: Enemy|Leftovers');
  assert.equal(m.opponent('p1').item, '');
  m.observe('|-weather|RainDance');
  m.observe('|-fieldstart|move: Electric Terrain');
  m.observe('|-fieldstart|move: Trick Room');
  assert.equal(m.weather, 'raindance');
  assert.equal(m.terrain, 'electricterrain');
  assert.equal(m.trickRoom, true);
  m.observe('|-fieldend|move: Trick Room');
  assert.equal(m.trickRoom, false);
});
test('context features distinguish item tactics and revealed ability immunities', () => {
  const {Model, LearnedPolicy, FEATURES} = require('./learned.cjs');
  const p = new LearnedPolicy('gen7ou', new Model());
  p.side = 'p1';
  p.observe('|switch|p2a: Enemy|Gengar|100/100');
  const r = request([{id: 'protect'}, {id: 'earthquake'}]);
  r.side.pokemon[0].item = 'leftovers';
  r.side.pokemon[0].condition = '150/300';
  const value = (actions, choice, feature) => actions.find(a => a.choice === choice).features[FEATURES.indexOf(feature)];
  let actions = p.candidates(r);
  assert.equal(value(actions, 'move 1', 'leftoversProtect'), 0.5);
  assert.equal(value(actions, 'move 2', 'revealedImmunity'), 0);
  p.observe('|-ability|p2a: Enemy|Levitate');
  actions = p.candidates(r);
  assert.equal(value(actions, 'move 2', 'revealedImmunity'), 1);
  r.side.pokemon[0].item = 'Choice Band';
  actions = p.candidates(r);
  assert.equal(value(actions, 'move 1', 'choiceStatus'), 1);
  assert.equal(value(actions, 'move 2', 'choiceAttack'), 1);
});
test('schema 1 policies upgrade with zero new weights and retain identical logits', () => {
  const {Model, FEATURES, V1_FEATURES, fingerprint} = require('./learned.cjs');
  const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-legacy-'));
  try {
    const weights = V1_FEATURES.map((_, i) => i / 100);
    const file = path.join(dir, 'old.json');
    fs.writeFileSync(file, JSON.stringify({schema: 1, kind: 'linear-softmax-reinforce', format: 'gen7ou', features: V1_FEATURES, weights, episodes: 160, baseline: 0, fingerprint: fingerprint()}));
    const model = Model.load(file);
    assert.deepEqual(model.weights.slice(0, V1_FEATURES.length), weights);
    assert.ok(model.weights.slice(V1_FEATURES.length).every(x => x === 0));
    const a = FEATURES.map((_, i) => i === 1 ? 1 : i > V1_FEATURES.length ? 3 : 0);
    const b = FEATURES.map(() => 0);
    assert.ok(Math.abs(model.probabilities([{features: a}, {features: b}])[0] - 1 / (1 + Math.exp(-weights[1]))) < 1e-12);
    assert.equal(model.episodes, 160);
  } finally {fs.rmSync(dir, {recursive: true});}
});
test('Gen 7 OU starts the supplied slot-1 leads without Team Preview', {timeout: 30000}, async () => {
  const {Breeder} = require('./breed.cjs');
  const {Policy} = require('./policy.cjs');
  const builder = new Breeder(57);
  const pair = [builder.team(), builder.team()];
  const first = new Map();
  await play('gen7ou', ...pair, [1, 2, 3, 4], {baseline: false, maxTurns: 15, policyFactory: side => {
    const p = new Policy('gen7ou', () => 0.5);
    const choose = p.choose.bind(p);
    p.choose = r => {
      assert.ok(!r.teamPreview);
      if (r.active && !first.has(side)) first.set(side, r.side.pokemon.find(x => x.active).details.split(',')[0]);
      return choose(r);
    };
    return p;
  }});
  assert.equal(first.get('p1'), pair[0][0].species);
  assert.equal(first.get('p2'), pair[1][0].species);
});
test('worker rollouts match direct gradients and training rotates legal teams', {timeout: 30000}, async () => {
  const {rollout} = require('./rollout.cjs');
  const {RolloutPool} = require('./workers.cjs');
  const {Model} = require('./learned.cjs');
  const {Breeder} = require('./breed.cjs');
  const {train} = require('./train.cjs');
  const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
  const model = new Model(); const builder = new Breeder(19);
  const job = {name: 'Roman-016', episode: 1, weights: model.weights, baseline: 0, opponentKind: 'heuristic', opponentWeights: model.weights, learnerSide: 'p1', teams: [builder.team(), builder.team()], randomSeed: 7, battleSeed: [1, 2, 3, 4], maxTurns: 20};
  const pool = new RolloutPool(2);
  try {
    const [a, b] = await Promise.all([rollout(job), pool.run(job)]);
    assert.deepEqual(a.gradient, b.gradient);
    assert.equal(a.reward, b.reward);
  } finally {await pool.close();}
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-parallel-'));
  try {
    const {report} = await train({episodes: 4, workers: 2, teamPool: 6, refreshEvery: 2, logEvery: 2, evalEvery: 4, evalPairs: 1, maxTurns: 20, output: dir});
    assert.equal(report.teamRefreshes, 1);
    const versions = fs.readFileSync(path.join(dir, 'team-pools.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(versions.length, 2);
    assert.ok(versions.flatMap(v => v.teams).every(team => builder.legal(team)));
    assert.equal(fs.existsSync(path.join(dir, 'battles', 'train-1.log')), false);
    assert.equal(fs.existsSync(path.join(dir, 'battles', 'train-2.log')), true);
    assert.equal(Model.load(path.join(dir, 'latest.json')).episodes, 4);
  } finally {fs.rmSync(dir, {recursive: true});}
});
test('canonical simulator fingerprint ignores Windows CRLF line endings', () => {
  const fs = require('node:fs');
  const {fingerprint} = require('./learned.cjs');
  const expected = fingerprint();
  const original = fs.readFileSync;
  try {
    fs.readFileSync = function (file, encoding) {
      const value = original.apply(this, arguments);
      if (String(file).endsWith('.ts') && encoding === 'utf8') return value.replace(/\r?\n/g, '\r\n');
      return value;
    };
    assert.equal(fingerprint(), expected);
  } finally {fs.readFileSync = original;}
});
