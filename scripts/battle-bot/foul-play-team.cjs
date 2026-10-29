'use strict';
const {Dex} = require('../../dist/sim');
const {speciesData} = require('./prepare-foul-play.cjs');
function validateCustomTeam(team) {
  const allowed = new Set(speciesData().pool.map(s => s.id));
  const dex = Dex.forFormat('gen7ou');
  if(!Array.isArray(team)||team.length!==6)throw new Error('Expected six Fakemon');
  for(const set of team) {
    if(!allowed.has(dex.species.get(set.species).id))throw new Error('Species outside Carletto–Lugamon');
    if(dex.abilities.get(set.ability).id==='moody')throw new Error('Moody excluded from bot teams');
    const item=dex.items.get(set.item);
    if(item.zMove||item.zMoveType||item.megaStone)throw new Error('Megas and Z-Moves excluded');
  }
}
module.exports={validateCustomTeam};
