'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {Teams, TeamValidator, Dex, toID} = require('../../dist/sim');
const {Policy} = require('./policy.cjs');
const {getAssertion} = require('./auth.cjs');
const {Model, LearnedPolicy} = require('./learned.cjs');
const {TeamPool} = require('./team-pool.cjs');
function incomingChallenges(line, username) {
  if (line.startsWith('|updatechallenges|')) return JSON.parse(line.slice(18)).challengesFrom || {};
  if (!line.startsWith('|pm|')) return {};
  const fields = line.split('|');
  if (toID(fields[3]) !== toID(username) || toID(fields[2]) === toID(username)) return {};
  const message = fields[4] || '';
  if (!message.startsWith('/challenge ')) return {};
  const format = message.slice(11).trim();
  return format ? {[toID(fields[2])]: format} : {};
}
function connect(config, base = process.cwd(), {fetchImpl = fetch} = {}) {
  const url = new URL(config.server);
  if (!['ws:', 'wss:'].includes(url.protocol)) throw new Error('server must be a ws:// or wss:// WebSocket URL');
  const formats = Object.keys(config.teams || {});
  if (!formats.length) throw new Error('Configure at least one format and team file.');
  const model = config.model ? Model.load(path.resolve(base, config.model)) : null;
  if (model && formats.some(f => f !== 'gen7ou')) throw new Error('Learned models support gen7ou only');
  const logDirectory = config.logDirectory && path.resolve(base, config.logDirectory);
  if (logDirectory) fs.mkdirSync(logDirectory, {recursive: true});
  const session = `${Date.now()}-${require('node:crypto').randomBytes(3).toString('hex')}`;
  const calculator = config.calculator ? {...config.calculator, enginePath: path.resolve(base, config.calculator.enginePath), bankFile: config.calculator.bankFile && path.resolve(base, config.calculator.bankFile)} : undefined;
  const packed = {};
  const teamSets = {};
  let adaptivePool;
  for (const format of formats) {
    const f = Dex.formats.get(format);
    if (!f.exists || f.gameType !== 'singles') throw new Error(`Unknown or unsupported singles format: ${format}`);
    const team = Teams.import(fs.readFileSync(path.resolve(base, config.teams[format]), 'utf8'));
    if (!team?.length) throw new Error(`Empty team: ${format}`);
    if (model) {
      const {Breeder} = require('./breed.cjs');
      if (!new Breeder().legal(team)) throw new Error('Learned challenge bot requires a legal six-member Fakemon-only Gen 7 OU team.');
    }
    const problems = TeamValidator.get(format).validateTeam(team);
    if (problems) throw new Error(`Invalid ${format} team: ${problems.join('; ')}`);
    packed[format] = Teams.pack(team);
    teamSets[format] = team;
    if (config.teamPool) {
      if (!model || format !== 'gen7ou' || formats.length !== 1 || (config.maxBattles || 1) !== 1) throw new Error('Adaptive teams require a learned Gen 7 OU bot with maxBattles=1.');
      adaptivePool = new TeamPool({...config.teamPool, file: path.resolve(base, config.teamPool.state), owner: config.username, model, seedTeam: team, bankFile: config.teamPool.bankFile && path.resolve(base, config.teamPool.bankFile)});
    }
  }
  if (!config.username || /[|\n\r]/.test(config.username)) throw new Error('Configure a valid username.');
  let stopped = false;
  let socket;
  let reconnect;
  const rooms = new Map();
  let pendingUntil = 0;
  let pendingTeam = null;
  const finishedRooms = new Set();
  const send = (room, command) => socket.readyState === 1 && socket.send(`${room}|${command}`);
  const log = message => console.log(`[${config.username}] ${message}`);
  async function login(challenge) {
    const assertion = await getAssertion(config, challenge, fetchImpl);
    send('', `/trn ${config.username},0,${assertion}`);
  }
  function receive(message) {
    const lines = message.split('\n');
    const room = lines[0].startsWith('>') ? lines.shift().slice(1) : '';
    for (const line of lines) {
      if (line.startsWith('|challstr|')) login(line.slice(10)).catch(err => {log(err.message); stopped = true; socket.close();});
      if (line.startsWith('|updateuser|')) {
        const fields = line.split('|');
        if (fields[3] === '1') {
          log(`Online as ${fields[2]}${model ? ' with learned checkpoint' : ' with heuristic policy'}`);
          send('', '/join lobby');
        }
      }
      if (line.startsWith('|nametaken|')) {
        log(`Login rejected: ${line.split('|').slice(3).join('|')}`);
        stopped = true;
        socket.close();
      }
      const incoming = incomingChallenges(line, config.username);
      for (const [user, format] of Object.entries(incoming)) {
        log(`Challenge from ${user}: ${format}`);
        if (!packed[format]) {log(`Unsupported format: ${format}`); continue;}
        if (config.allowedUsers?.length && !config.allowedUsers.map(toID).includes(toID(user))) continue;
        if (rooms.size >= (config.maxBattles || 1) || Date.now() < pendingUntil) continue;
        pendingUntil = Date.now() + 15000;
        const selected = adaptivePool?.choose();
        pendingTeam = selected ? {selected, opponent: toID(user), format} : null;
        send('', `/utm ${selected?.packed || packed[format]}`);
        if (selected) log(`Selected team ${selected.id} (estimated score ${selected.estimatedScore.toFixed(2)})`);
        send('', `/accept ${user}`);
        log(`Accepting challenge from ${user}`);
        break;
      }
      if (line.startsWith('|popup|') || line.startsWith('|error|')) {
        log(`Server: ${line.slice(line.indexOf('|', 1) + 1).slice(0, 500)}`);
        pendingUntil = 0;
      }
      if (!room.startsWith('battle-') || finishedRooms.has(room)) continue;
      pendingUntil = 0;
      if (!rooms.has(room)) rooms.set(room, {policy: null, history: [], rqid: null, fallback: false, players: {}});
      const state = rooms.get(room);
      if (logDirectory && /^[a-zA-Z0-9-]+$/.test(room)) {
        state.logFile = path.join(logDirectory, `${session}-${room}.log`);
        fs.appendFileSync(state.logFile, line + '\n');
      }
      state.history.push(line);
      if (line.startsWith('|player|')) {
        const fields = line.split('|');
        state.players[fields[2]] = toID(fields[3]);
      }
      if (line.startsWith('|tier|')) state.format = toID(line.slice(6));
      if (pendingTeam && !state.teamSelection && state.format === pendingTeam.format &&
          Object.values(state.players).includes(toID(config.username)) && Object.values(state.players).includes(pendingTeam.opponent)) {
        state.teamSelection = pendingTeam.selected;
        state.policy?.setTeam(state.teamSelection.team);
        state.opponent = pendingTeam.opponent;
        pendingTeam = null;
      }
      if (line.startsWith('|tier|')) {
        const format = toID(line.slice(6));
        if (!packed[format]) {send(room, '/forfeit'); continue;}
        state.policy = model ? new LearnedPolicy(format, model, {calculator}) : new Policy(format);
        state.policy.setTeam?.(state.teamSelection?.team || teamSets[format]);
      }
      if (line.startsWith('|request|')) {
        const request = JSON.parse(line.slice(9));
        if (!request || request.wait || state.rqid === request.rqid) continue;
        if (!state.policy) {log(`No supported format identified for ${room}`); continue;}
        state.policy.side = request.side.id;
        for (const event of state.history) state.policy.observe(event);
        state.history = [];
        const choice = state.policy.choose(request);
        if (choice) {
          state.rqid = request.rqid;
          state.fallback = false;
          send(room, `/choose ${choice}|${request.rqid}`);
          if (state.logFile && state.policy.calculator) fs.appendFileSync(state.logFile, `|botcalc|${JSON.stringify(state.policy.calculator.last)}\n`);
          if (state.logFile) fs.appendFileSync(state.logFile, `|botchoice|${request.rqid}|${choice}\n`);
        }
      }
      if (line.startsWith('|error|[Invalid choice]') || line.startsWith('|error|[Unavailable choice]')) {
        if (!state.fallback) {state.fallback = true; send(room, `/choose default|${state.rqid}`);}
        else log(`Choice rejected in ${room}: ${line}`);
      }
      if (line.startsWith('|win|') || line === '|tie' || line === '|deinit') {
        log(`${room}: ${line}`);
        if (adaptivePool && state.teamSelection && line !== '|deinit') {
          const winner = line.startsWith('|win|') ? line.slice(5) : null;
          const result = winner ? (toID(winner) === toID(config.username) ? 'win' : 'loss') : 'tie';
          adaptivePool.record(state.teamSelection.id, result, `${url.origin}/${room}`);
          log(`Updated team ${state.teamSelection.id}: ${result}`);
        }
        finishedRooms.add(room);
        if (finishedRooms.size > 10000) finishedRooms.delete(finishedRooms.values().next().value);
        if (logDirectory && line !== '|deinit') {
          const winner = line.startsWith('|win|') ? line.slice(5) : null;
          fs.appendFileSync(path.join(logDirectory, 'matches.jsonl'), JSON.stringify({time: new Date().toISOString(), room, username: config.username, winner, result: winner ? (toID(winner) === toID(config.username) ? 'win' : 'loss') : 'tie', model: config.model || null, teamId: state.teamSelection?.id || null, opponent: state.opponent || null, logFile: state.logFile}) + '\n');
        }
        send(room, '/leave');
        rooms.delete(room);
      }
    }
  }
  function open() {
    rooms.clear();
    pendingUntil = 0;
    pendingTeam = null;
    socket = new WebSocket(url);
    socket.addEventListener('open', () => log(`Connected to ${url.origin}`));
    socket.addEventListener('message', event => {
      try {receive(String(event.data));} catch (err) {log(`Protocol error: ${err.message}`);}
    });
    socket.addEventListener('error', () => log('WebSocket error'));
    socket.addEventListener('close', () => {if (!stopped) reconnect = setTimeout(open, 5000);});
  }
  open();
  return () => {stopped = true; clearTimeout(reconnect); socket.close();};
}
if (require.main === module) {
  if (typeof WebSocket === 'undefined') throw new Error('Use Node.js 22 or later.');
  const file = path.resolve(process.argv[2] || 'scripts/battle-bot/config.json');
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  const stop = (Array.isArray(config) ? config : [config]).map(c => connect(c, path.dirname(file)));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {for (const close of stop) close();});
}
module.exports = {connect, incomingChallenges};
