'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {SetExplorer}=require('./legal-space.cjs');const {comparable}=require('./mechanics-audit.cjs');const {signature}=require('./calc-baseline.cjs');
test('Klutz blocks passive items, permits deliberate transfer, and signed proposals cannot bypass it',()=>{
 const e=new SetExplorer(5),set={species:'Pabiito',ability:'Klutz',item:'Leftovers',nature:'Adamant',moves:['covet','slackoff','roleplay','rest'],evs:{hp:252,atk:252,spd:4},ivs:{hp:31,atk:31,def:31,spa:31,spd:31,spe:31}};
 assert.equal(e.rules.itemWorks(set,'Leftovers'),false);assert.equal(e.rules.itemWorks({...set,moves:['trick']},'Leftovers'),true);assert.equal(e.rules.itemWorks(set,''),true);
 set.benchmark={role:'support'};set.benchmark.signature=signature(set);const repaired=e.rules.repair(set);assert(e.rules.itemWorks(repaired,repaired.item));
});
test('fainted state ignores cleared boosts/types but preserves death, item and status comparisons',()=>{
 const mon={hp:100,item:'none',status:'none',types:['normal'],boosts:{atk:0,def:0}};const before={one:mon,two:mon};
 const result=comparable(before,{one:{...mon,hp:0,boosts:{atk:0,def:0}},two:mon});assert.equal(result.oneDead,true);assert(!('oneTypes'in result));assert(!('one_def'in result));assert.equal(result.oneItem,'none');assert.equal(result.two_def,0);
});
test('generic calculator profiles omit unplanned Trick Room and reject ineffective Klutz items',()=>{
 const e=new SetExplorer(3);const {coverageSet}=require('./calc-baseline.cjs');const guide={calc:{pokemon:()=>({maxHP:()=>300})},profile:()=>({unavailable:false,outgoing:[{range:[100,120]}]})};const targets=[{set:{species:'Pabio'}}];
 const set=coverageSet(e,guide,'rickymartin','colorchange','defense',targets,'Leftovers');assert(set);assert(!set.moves.includes('trickroom'));
 assert.equal(coverageSet(e,guide,'pabiito','klutz','defense',targets,'Leftovers'),null);
});
