'use strict';
const fs = require('node:fs');
const {Teams} = require('../../dist/sim');
const clone = value => JSON.parse(JSON.stringify(value));
function loadMetagame(file, dex, validator, allowed) {
  const result = {sets: new Map(), teams: [], setCount: 0};
  if (!file) return result;
  const input = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (input.schema !== 1 || input.format !== 'gen7ou' || !Array.isArray(input.sets) || !Array.isArray(input.teams || [])) throw new Error('Invalid metagame bank schema');
  const seen = new Set();
  const checkSet = raw => {
    const set = clone(raw);
    const species = dex.species.get(set.species);
    if (!allowed.has(species.id)) throw new Error(`Metagame species outside custom pool: ${set.species}`);
    const item = dex.items.get(set.item);
    if (item.zMove || item.zMoveType) throw new Error('Z-Crystals are disabled for metagame candidates');
    const issues = validator.validateTeam([clone(set)]);
    if (issues) throw new Error(`Invalid metagame set ${set.species}: ${issues.join('; ')}`);
    const key = Teams.pack([{...set, name: set.species, shiny: false}]);
    if (!seen.has(key)) {
      seen.add(key);
      if (!result.sets.has(species.id)) result.sets.set(species.id, []);
      result.sets.get(species.id).push(set);
      result.setCount++;
    }
    return set;
  };
  for (const record of input.sets) checkSet(record.set || record);
  for (const record of input.teams || []) {
    const team = record.team || record;
    if (!Array.isArray(team) || team.length !== 6 || new Set(team.map(s => dex.species.get(s.species).num)).size !== 6) throw new Error('Metagame team requires six distinct species');
    for (const set of team) checkSet(set);
    const issues = validator.validateTeam(clone(team));
    if (issues) throw new Error(`Invalid metagame team: ${issues.join('; ')}`);
    result.teams.push(clone(team));
  }
  return result;
}
module.exports = {loadMetagame};
