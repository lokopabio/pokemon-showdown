'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {Battle}=require(path.join(process.env.BENITO_SIM_ROOT||path.resolve(__dirname,'../../..'),'dist/sim'));
function fixture(action,reply,seed=1,item='') {
 const b=new Battle({formatid:'gen7ou',seed:[seed,2,3,4]});
 try {
  b.setPlayer('p1',{name:'Bot',team:[{species:'Ladesaurio',ability:'Adaptability',item:'Leftovers',moves:['Extreme Speed','Dragon Rush','Coil','Substitute']}]});
  b.setPlayer('p2',{name:'Opponent',team:[{species:'Airrivas',ability:'Air Lock',item,nature:'Jolly',evs:{atk:252,spe:252},moves:['Acrobatics','Roost','Defog','Steel Wing']}]});
  const own=b.p1.active[0];own.maxhp=351;own.sethp(79);
  own.storedStats={atk:295,def:186,spa:185,spd:186,spe:210};
  own.boosts.atk=1;own.boosts.def=1;own.boosts.accuracy=1;
  b.makeChoices(`move ${action}`,`move ${reply}`);
  return {log:[...b.log],ownHP:own.hp,opponentHP:b.p2.pokemon[0].hp};
 }finally{b.destroy();}
}
test('itemless Acrobatics defeats every equipped move at recorded final HP',()=>{
 for(let seed=1;seed<=16;seed++)for(let move=1;move<=4;move++)assert.equal(fixture(move,1,seed).ownHP,0);
});
test('priority hits before a terminal loss; slower Dragon Rush never executes',()=>{
 const fast=fixture(1,1),slow=fixture(2,1);
 assert(fast.log.some(l=>l.startsWith('|move|p1a: Ladesaurio|Extreme Speed|')));
 assert(fast.opponentHP<337);
 assert(!slow.log.some(l=>l.startsWith('|move|p1a: Ladesaurio|Dragon Rush|')));
});
test('Roost is a different reply: slower attack can execute and damage afterward',()=>{
 const r=fixture(2,2);
 assert(r.ownHP>0);assert(r.opponentHP<337);
 const moves=r.log.filter(l=>l.startsWith('|move|'));
 assert(moves[0].includes('|Roost|'));assert(moves[1].includes('|Dragon Rush|'));
});
