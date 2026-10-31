'use strict';
const fs=require('node:fs'),path=require('node:path');
function load(file){
 const location=path.resolve(file),base=path.dirname(location),manifest=JSON.parse(fs.readFileSync(location,'utf8').replace(/^\uFEFF/,''));
 if(manifest.schema!==1||manifest.policy!=='custom-adapted-foul-play-baseline'||!manifest.accounts?.length)throw Error('Invalid baseline fleet manifest');
 const seen=new Set();
 return manifest.accounts.map(row=>{
  const configFile=path.resolve(base,row.config),config=JSON.parse(fs.readFileSync(configFile,'utf8').replace(/^\uFEFF/,''));
  if(config.username!==row.username||config.passwordEnv!==row.passwordEnv||seen.has(config.username.toLowerCase()))throw Error('Fleet account mismatch or duplicate');
  seen.add(config.username.toLowerCase());
  if(!config.foulPlay||config.maxBattles!==1||Object.keys(config.teams||{}).join(',')!=='gen7ou'||['model','teamPool','calculator'].some(k=>config[k]))throw Error('Fleet requires baseline Foul Play, one Gen7 OU battle per account');
  if(config.foulRoster){
   const roster=JSON.parse(fs.readFileSync(path.resolve(path.dirname(configFile),config.foulRoster.file),'utf8').replace(/^\uFEFF/,''));
   if(roster.schema!==1||roster.format!=='gen7ou'||!Array.isArray(roster.records)||roster.records.length<2||roster.records.some(r=>r.source!=='bank'))throw Error('Fleet rotation accepts existing bank teams only');
  }
  for(const key of ['python','foul','bank'])if(!fs.existsSync(path.resolve(path.dirname(configFile),config.foulPlay[key])))throw Error('Missing runtime path for '+config.username);
  if(!fs.existsSync(path.resolve(path.dirname(configFile),config.teams.gen7ou)))throw Error('Missing team for '+config.username);
  return {config,base:path.dirname(configFile)};
 });
}
function isolatedFactory(envNames,Factory){return options=>{
 const saved=new Map();
 // Synchronous constructor copies its child environment before returning.
 // Each Python worker receives none of the fleet's account passwords.
 for(const name of new Set([...envNames,'MBV_PASSWORD','BENITO_PASSWORD']))if(Object.hasOwn(process.env,name)){saved.set(name,process.env[name]);delete process.env[name];}
 try{return new Factory(options);}finally{for(const [name,value]of saved)process.env[name]=value;}
};}
function start(file,{connect,Factory}={}){
 const entries=load(file),missing=entries.filter(e=>!process.env[e.config.passwordEnv]);
 if(missing.length)throw Error('Missing password variables: '+missing.map(e=>e.config.passwordEnv).join(', '));
 connect=connect||require('./connect.cjs').connect;
 Factory=Factory||require('./foul-play-live.cjs').FoulPlayLive;
 const factory=isolatedFactory(entries.map(e=>e.config.passwordEnv),Factory),stops=[];
 try{for(const e of entries)stops.push(connect(e.config,e.base,{foulFactory:factory}));}
 catch(error){for(const stop of stops)stop();throw error;}
 let closed=false;return()=>{if(closed)return;closed=true;for(const stop of stops)stop();};
}
if(require.main===module){if(!process.argv[2])throw Error('Supply generated fleet.json');const stop=start(process.argv[2]);for(const signal of ['SIGINT','SIGTERM'])process.on(signal,stop);}
module.exports={load,start,isolatedFactory};
