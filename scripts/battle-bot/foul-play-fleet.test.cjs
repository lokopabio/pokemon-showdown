'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {prepare}=require('./prepare-foul-play-fleet.cjs');
const {load,start,isolatedFactory}=require('./start-foul-play-fleet.cjs');
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'foul-fleet-'));
 const team=[{species:'fixture',moves:['attack']}];
 fs.mkdirSync(path.join(root,'runtime'));fs.writeFileSync(path.join(root,'python'),'');fs.writeFileSync(path.join(root,'bank.json'),'{}');fs.writeFileSync(path.join(root,'team.txt'),JSON.stringify(team));
 const config={server:'wss://example.invalid/showdown/websocket',username:'FixtureBotA',passwordEnv:'MBV_PASSWORD',teams:{gen7ou:'team.txt'},
  model:'preserve-this-model.json',password:'do-not-copy',foulPlay:{python:'python',foul:'runtime',bank:'bank.json',searchMs:1000,diagnostics:true}};
 const template=path.join(root,'config.json');fs.writeFileSync(template,JSON.stringify(config));
 const deps={sim:{Teams:{import:s=>JSON.parse(s),export:t=>JSON.stringify(t)},TeamValidator:{get:()=>({validateTeam:t=>t.length?null:['empty']})}},validateCustomTeam:t=>{if(!Array.isArray(t)||!t.length)throw Error('invalid team');}};
 return {root,template,names:'FixtureBotA,FixtureBotB',output:path.join(root,'fleet'),deps,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('separate baseline configs preserve source team/config and exclude experiments',()=>{
 const f=fixture();try{
  const before=fs.readFileSync(f.template,'utf8'),team=fs.readFileSync(path.join(f.root,'team.txt'),'utf8');
  const m=prepare(f,f.deps);assert.deepEqual(m.accounts.map(a=>a.username),['FixtureBotA','FixtureBotB']);assert.equal(m.searchMs,1000);
  const entries=load(path.join(f.output,'fleet.json'));
  for(const {config}of entries){assert.equal(config.foulPlay.searchMs,1000);for(const key of ['model','password','teamPool','foulRoster','calculator'])assert.equal(config[key],undefined);}
  assert.equal(fs.readFileSync(f.template,'utf8'),before);assert.equal(fs.readFileSync(path.join(f.root,'team.txt'),'utf8'),team);
  assert(!m.accounts.some(a=>a.username==='UnlistedFixtureBot'));
  assert.throws(()=>prepare(f,f.deps),/Output exists/);
 }finally{f.cleanup();}
});
test('provided account configs keep their existing team selection',()=>{
 const f=fixture();try{
  fs.writeFileSync(path.join(f.root,'other.txt'),JSON.stringify([{species:'other',moves:['attack']}]));
  const accounts=path.join(f.root,'old-bots.json');const source=JSON.stringify([{username:'FixtureBotB',teams:{gen7ou:'other.txt'},model:'keep.json'}]);fs.writeFileSync(accounts,source);
  prepare({...f,accounts},f.deps);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.output,'fixturebotb/team.txt'),'utf8'))[0].species,'other');
  assert.equal(fs.readFileSync(accounts,'utf8'),source);
 }finally{f.cleanup();}
});
test('duplicate or invalid teams fail before output is written',()=>{
 const f=fixture();try{
  const accounts=path.join(f.root,'old-bots.json');fs.writeFileSync(accounts,JSON.stringify([{username:'FixtureBotB'},{username:'fixturebotb'}]));
  assert.throws(()=>prepare({...f,accounts},f.deps),/duplicate/);assert(!fs.existsSync(f.output));
  fs.writeFileSync(path.join(f.root,'team.txt'),'[]');assert.throws(()=>prepare(f,f.deps),/invalid team/);assert(!fs.existsSync(f.output));
 }finally{f.cleanup();}
});
test('worker constructor cannot inherit any fleet account password; environment restored on failure',()=>{
 const names=['FOULPLAY_TESTA_PASSWORD','FOULPLAY_TESTB_PASSWORD'];for(const n of names)process.env[n]='test-secret';
 try{
  const factory=isolatedFactory(names,class {constructor(){for(const n of names)assert.equal(process.env[n],undefined);throw Error('constructor failure');}});
  assert.throws(()=>factory({}),/constructor failure/);for(const n of names)assert.equal(process.env[n],'test-secret');
 }finally{for(const n of names)delete process.env[n];}
});
test('missing credentials prevent all connections',()=>{
 const f=fixture();try{prepare(f,f.deps);let calls=0;assert.throws(()=>start(path.join(f.output,'fleet.json'),{connect:()=>{calls++;return()=>{};},Factory:class{}}),/Missing password/);assert.equal(calls,0);}finally{f.cleanup();}
});
