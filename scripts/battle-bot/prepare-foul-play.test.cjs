'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {prepare}=require('./prepare-foul-play.cjs');
const {prepareBank}=require('./prepare-foul-play-bank.cjs');
const sibling=name=>[path.resolve(__dirname,'../../..',name),path.resolve(__dirname,'../../..','roman-'+name)].find(p=>fs.existsSync(path.join(p,'.git')));
const sourceEngine=process.env.ROMAN_TEST_ENGINE||sibling('poke-engine');
const sourceFoul=process.env.ROMAN_TEST_FOUL||sibling('foul-play');
for(const newline of ['\n','\r\n'])test(`preparation accepts ${newline==='\n'?'LF':'Windows CRLF'} checkouts and remains repeatable`,{skip:!sourceEngine||!sourceFoul},()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'roman-prep-'));
  try {
    const engine=path.join(temp,'engine'),foul=path.join(temp,'foul');
    for(const [source,target]of [[sourceEngine,engine],[sourceFoul,foul]])execFileSync('git',['clone','--quiet','--shared',source,target],{stdio:'pipe'});
    const files=[path.join(engine,'src/pokemon.rs'),path.join(engine,'src/genx/base_stats.rs'),path.join(engine,'src/genx/state.rs'),path.join(engine,'src/genx/abilities.rs'),
      ...['fp/data/pokedex.json','fp/teams/load_team.py','fp/battle/protocol.py','fp/modes/standard_battle.py','fp/search/standard_battles.py','fp/generations.py'].map(p=>path.join(foul,p))];
    for(const file of files)fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n').replace(/\n/g,newline));
    const result=prepare(engine,foul);prepareBank(foul);
    assert(result.selectableSpecies.includes('carletto'));
    assert(result.selectableSpecies.includes('lugamon'));
    assert(!result.selectableSpecies.includes('fidbuelunabusted'));
    assert(fs.readFileSync(path.join(engine,'src/pokemon.rs'),'utf8').includes('FIDBUELUNABUSTED,'));
    assert(JSON.parse(fs.readFileSync(path.join(foul,'fp/data/pokedex.json'),'utf8')).fidbuelunabusted);
    assert(fs.readFileSync(path.join(engine,'src/pokemon.rs'),'utf8').includes('CARLETTO,'));
    assert(fs.readFileSync(path.join(foul,'fp/battle/protocol.py'),'utf8').includes('roman_item_changed'));
    const before=files.map(p=>fs.readFileSync(p,'utf8'));
    prepare(engine,foul);prepareBank(foul);
    assert.deepEqual(files.map(p=>fs.readFileSync(p,'utf8')),before);
  } finally {fs.rmSync(temp,{recursive:true,force:true});}
});
