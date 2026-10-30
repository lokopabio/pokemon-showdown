'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {assess,teamErrors}=require('./building-policy.cjs');
const s=(species,ability,item,moves,evs={hp:252,def:252,spd:4},extra={})=>({species,ability,item,moves,evs,nature:'Bold',ivs:{spe:31},...extra});
test('ability follows set purpose without altering supplied fields',()=>{
 assert(assess(s('Carlis','Rattled','Leftovers',['Scald'])).errors.length);
 const offensive=s('Carlis','Rattled','Life Orb',['Scald'],{spa:252,spe:252,hp:4});assert.equal(assess(offensive).errors.length,0);assert(assess(offensive).weight<assess({...offensive,ability:'Gooey'}).weight);
 assert(assess(s('Dijeypepe','Competitive','Life Orb',['Flare Blitz'])).errors.length);
 assert.equal(assess(s('Dijeypepe','Reckless','Life Orb',['Flare Blitz'])).errors.length,0);
 assert(assess(s('Angelote','Oblivious','Leftovers',['Quiver Dance'])).errors.length);
 assert.equal(assess(s('Angelote','Oblivious','Focus Sash',['Sticky Web'])).errors.length,0);
 assert(assess(s('Albeerto','Sticky Hold','Leftovers',['Milk Drink'])).errors.length);
 assert(assess(s('Hitmondad','Unburden','Leftovers',['Close Combat'])).errors.length);
 assert.equal(assess(s('Hitmondad','Unburden','White Herb',['Close Combat'])).errors.length,0);
 assert(assess(s('Virodcan','Unburden','Sitrus Berry',['Acrobatics'])).errors.length);
});
test('team dependencies require providers and minimum-speed Trick Room builds',()=>{
 const sun=s('Luppitto','Chlorophyll','Life Orb',['Solar Beam']);assert(teamErrors([sun]).length);assert.equal(teamErrors([sun,s('Pabio','Fur Coat','Leftovers',['Sunny Day'])]).length,0);
 const grass=s('Rafalu','Grass Pelt','Leftovers',['Giga Drain']);assert(teamErrors([grass]).length);assert.equal(teamErrors([grass,s('Pajillero','Grassy Surge','Leftovers',['U-turn'])]).length,0);
 const room=s('Pabio','Fur Coat','Leftovers',['Trick Room']),ab=s('Abicort','Hyper Cutter','Life Orb',['Earthquake'],{hp:252,atk:252,def:4},{nature:'Brave',ivs:{spe:0}});assert(teamErrors([ab]).length);assert.equal(teamErrors([ab,room]).length,0);assert(teamErrors([{...ab,ivs:{spe:31}},room]).length);
 const jam=s('Jamadelpa','Sheer Force','Life Orb',['Thunderbolt'],{hp:252,spa:252,def:4},{nature:'Quiet',ivs:{spe:0}});assert(teamErrors([jam]).length);assert.equal(teamErrors([jam,room]).length,0);
});
