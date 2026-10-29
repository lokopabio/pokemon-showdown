'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const {connect}=require('./connect.cjs');
const {prepareLive}=require('./prepare-foul-play-live.cjs');
const {BattleStream,getPlayerStreams,Teams}=require('../../dist/sim');
const {Policy}=require('./policy.cjs');
const python=process.env.ROMAN_TEST_PYTHON||'/tmp/roman-fp-venv/bin/python';
const foul=process.env.ROMAN_TEST_FOUL||path.resolve(__dirname,'../../../foul-play');
const bank=process.env.ROMAN_TEST_BANK||path.resolve(__dirname,'../../../metagame-bank/metagame-bank.json');
for(const side of ['p1','p2'])test(`Foul Play accepts a WebSocket challenge and completes a real simulator battle as ${side}`,{timeout:30000,skip:![python,foul,bank].every(f=>fs.existsSync(f))},async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'roman-live-'));
  const server=http.createServer();const transport=require('sockjs').createServer({log(){}});transport.installHandlers(server,{prefix:'/showdown'});
  let stop,connection,stream;
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const output=path.join(temp,'config');
    const config=prepareLive({server:`ws://127.0.0.1:${server.address().port}/showdown/websocket`,username:'LiveFoul',python,foul,bank,output,searchMs:5});
    assert(!fs.readFileSync(path.join(output,'config.json'),'utf8').includes('pass":'));
    let choices=0,started=false;
    const completed=new Promise((resolve,reject)=>{
      transport.on('connection',conn=>{
        connection=conn;conn.write('|challstr|1|test');
        conn.on('data',async text=>{
          try {
            if(text.startsWith('|/trn')){conn.write('|updateuser|LiveFoul|1|1');conn.write('|pm| Tester| LiveFoul|/challenge gen7ou|gen7ou|||');}
            if(text==='|/accept tester'&&!started){
              started=true;stream=new BattleStream();const streams=getPlayerStreams(stream);
              conn.write('>battle-gen7ou-live\n|tier|[Gen 7] OU');
              let rqid=0;
              (async()=>{for await(const chunk of streams[side]){const lines=chunk.split('\n').filter(l=>!l.startsWith('|tier|')).map(l=>{if(!l.startsWith('|request|'))return l;const r=JSON.parse(l.slice(9));return '|request|'+JSON.stringify({...r,rqid:++rqid});});conn.write('>battle-gen7ou-live\n'+lines.join('\n'));}})().catch(reject);
              (async()=>{const policy=new Policy('gen7ou');const other=side==='p1'?'p2':'p1';policy.side=other;let events=[];for await(const chunk of streams[other])for(const line of chunk.split('\n')){if(line.startsWith('|request|')){for(const e of events)policy.observe(e);events=[];const c=policy.choose(JSON.parse(line.slice(9)));if(c)await streams[other].write(c);}else events.push(line);}})().catch(reject);
              (async()=>{for await(const chunk of streams.omniscient)if(chunk.split('\n').some(l=>l.startsWith('|turn|')&&Number(l.slice(6))>=100))await stream.write('>forcetie');})().catch(reject);
              const team=Teams.import(fs.readFileSync(path.join(output,'team.txt'),'utf8'));
              conn.stream=streams[side];
              await stream.write(`>start ${JSON.stringify({formatid:'gen7ou',seed:[1,2,3,4]})}\n>player p1 ${JSON.stringify({name:side==='p1'?'LiveFoul':'Tester',team:Teams.pack(team)})}\n>player p2 ${JSON.stringify({name:side==='p2'?'LiveFoul':'Tester',team:Teams.pack(team)})}`);
            }
            if(text.startsWith('battle-gen7ou-live|/choose ')){choices++;await connection.stream.write(text.split('|/choose ')[1].split('|')[0]);}
            if(text==='battle-gen7ou-live|/forfeit')reject(new Error('Foul Play forfeited after an adapter error'));
            if(text==='battle-gen7ou-live|/leave')resolve();
          } catch(e){reject(e);}
        });
      });
    });
    stop=connect({...config,passwordEnv:undefined},output,{fetchImpl:async()=>({ok:true,text:async()=> 'signed,test-token'})});
    await completed;assert(choices>1);
    assert(fs.readFileSync(path.join(output,'logs','matches.jsonl'),'utf8').includes('LiveFoul'));
  } finally {stop?.();connection?.close();if(stream)await stream.writeEnd();await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
});
