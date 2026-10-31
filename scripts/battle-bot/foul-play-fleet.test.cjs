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
test('rotation copies only existing legal distinct teams and preserves source fleet',()=>{
 const {prepareRotation}=require('./prepare-foul-play-fleet-rotation.cjs');
 const f=fixture();try{
  f.deps.sim.Teams.pack=t=>JSON.stringify(t);
  const first=[{species:'fixture',moves:['attack']}],second=[{species:'other',moves:['attack']}];
  fs.writeFileSync(path.join(f.root,'bank.json'),JSON.stringify({schema:1,format:'gen7ou',teams:[{team:first},{team:second},{team:structuredClone(first)},{team:[]}]}));
  prepare(f,f.deps);const sourceFile=path.join(f.output,'fleet.json'),before=fs.readFileSync(sourceFile,'utf8');
  const output=path.join(f.root,'rotating'),m=prepareRotation({fleet:sourceFile,output},f.deps);
  assert.equal(m.rosterTeams,2);assert.equal(m.skipped.length,1);assert.equal(m.accounts.length,2);
  assert.equal(fs.readFileSync(sourceFile,'utf8'),before);
  const entries=load(path.join(output,'fleet.json'));
  for(const e of entries){assert.equal(e.config.foulPlay.searchMs,1000);assert(e.config.foulRoster);assert.equal(e.config.model,undefined);}
  assert.notEqual(entries[0].config.username,entries[1].config.username);
  assert.throws(()=>prepareRotation({fleet:sourceFile,output},f.deps),/Output exists/);
  const rosterFile=path.join(output,'roster.json'),r=JSON.parse(fs.readFileSync(rosterFile));r.records[0].source='variant';fs.writeFileSync(rosterFile,JSON.stringify(r));
  assert.throws(()=>load(path.join(output,'fleet.json')),/bank teams only/);
 }finally{f.cleanup();}
});
test('archive imports preserve player provenance, exact sets and deduplicate originals',()=>{
 const {prepareRotation}=require('./prepare-foul-play-fleet-rotation.cjs');const f=fixture();try{
  f.deps.sim.Teams.pack=t=>JSON.stringify(t);
  const a=[{species:'fixture',moves:['attack']}],b=[{species:'second',moves:['attack']}],c=[{species:'archived',moves:['second','first'],item:'original'}];
  fs.writeFileSync(path.join(f.root,'bank.json'),JSON.stringify({schema:1,format:'gen7ou',teams:[{team:a},{team:b}]}));prepare(f,f.deps);
  const archive=path.join(f.root,'archive.json'),raw=JSON.stringify([{player:'FixturePlayer',team_id:'T1',team:a,battles:['b1']},{player:'FixturePlayer',team_id:'T2',team:c,battles:['b2']},{player:'OtherPlayer',team_id:'T3',team:[{species:'excluded',moves:['attack']}]}]);fs.writeFileSync(archive,raw);
  const output=path.join(f.root,'augmented'),m=prepareRotation({fleet:path.join(f.output,'fleet.json'),output,archive,player:'FixturePlayer'},f.deps);
  assert.equal(m.rosterTeams,3);assert.equal(m.archive.eligibleUniqueTeams,2);
  const r=JSON.parse(fs.readFileSync(path.join(output,'roster.json'),'utf8')).records;
  assert.deepEqual(r.find(x=>x.team[0].species==='archived').team,c);
  assert.equal(r.find(x=>x.team[0].species==='fixture').provenance.length,2);
  assert.equal(fs.readFileSync(archive,'utf8'),raw);assert(!r.some(x=>x.team[0].species==='excluded'));
 }finally{f.cleanup();}
});
test('augmenting a rotating fleet retains account last-team and recorded results',()=>{
 const {prepareRotation}=require('./prepare-foul-play-fleet-rotation.cjs');const f=fixture();try{
  f.deps.sim.Teams.pack=t=>JSON.stringify(t);
  const teams=[[{species:'fixture',moves:['attack']}],[{species:'other',moves:['attack']}]];
  fs.writeFileSync(path.join(f.root,'bank.json'),JSON.stringify({schema:1,format:'gen7ou',teams:teams.map(team=>({team}))}));prepare(f,f.deps);
  const rotation=path.join(f.root,'rotation');prepareRotation({fleet:path.join(f.output,'fleet.json'),output:rotation},f.deps);
  const stateFile=path.join(rotation,'fixturebota/rotation-state.json'),old=JSON.parse(fs.readFileSync(stateFile,'utf8'));old.results=[{matchKey:'kept',outcome:'win'}];fs.writeFileSync(stateFile,JSON.stringify(old));
  const archive=path.join(f.root,'archive.json');fs.writeFileSync(archive,JSON.stringify([{player:'FixturePlayer',team:[{species:'new',moves:['attack']}]}]));
  const output=path.join(f.root,'augmented');prepareRotation({fleet:path.join(rotation,'fleet.json'),output,archive,player:'FixturePlayer'},f.deps);
  const next=JSON.parse(fs.readFileSync(path.join(output,'fixturebota/rotation-state.json'),'utf8'));assert.equal(next.last,old.last);assert.deepEqual(next.results,old.results);
 }finally{f.cleanup();}
});
test('ladder enable/disable preserves battle settings, rotation and original backup',()=>{
 const {enable}=require('./enable-foul-play-fleet-ladder.cjs');const f=fixture();try{
  prepare(f,f.deps);const file=path.join(f.output,'fixturebota/config.json'),before=fs.readFileSync(file,'utf8');
  assert.equal(enable({fleet:path.join(f.output,'fleet.json')}),2);
  const active=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(active.ladder.format,'gen7ou');assert.equal(active.foulPlay.searchMs,1000);assert.deepEqual(active.teams,{gen7ou:'team.txt'});
  assert.equal(fs.readFileSync(file+'.before-ladder','utf8'),before);
  enable({fleet:path.join(f.output,'fleet.json'),mode:'off'});assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).ladder,undefined);assert.equal(fs.readFileSync(file+'.before-ladder','utf8'),before);
 }finally{f.cleanup();}
});
