'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {load}=require('./start-foul-play-fleet.cjs');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
function prepareRotation({fleet,output},deps={}){
 const sim=deps.sim||require('../../dist/sim');
 const guard=deps.validateCustomTeam||require('./foul-play-team.cjs').validateCustomTeam;
 const target=path.resolve(output);if(fs.existsSync(target))throw Error('Output exists; use a new directory');
 const entries=load(fleet),banks=new Set(entries.map(e=>path.resolve(e.base,e.config.foulPlay.bank)));
 if(banks.size!==1)throw Error('This fleet must use one shared bank');
 const bankFile=[...banks][0],bank=read(bankFile);
 if(bank.schema!==1||bank.format!=='gen7ou'||!Array.isArray(bank.teams))throw Error('Invalid team bank');
 const teamId=t=>crypto.createHash('sha256').update(sim.Teams.pack(t)).digest('hex').slice(0,20);
 const seen=new Set(),records=[],skipped=[];
 for(const [index,row]of bank.teams.entries()){
  const team=structuredClone(row.team||row);
  try{guard(team);const problems=sim.TeamValidator.get('gen7ou').validateTeam(structuredClone(team));if(problems)throw Error(problems.join('; '));}
  catch(error){skipped.push({index,label:row.label||null,reason:error.message});continue;}
  const id=teamId(team);if(seen.has(id))continue;seen.add(id);records.push({id,team,source:'bank',label:row.label||null});
 }
 if(records.length<2)throw Error('Need at least two distinct legal existing bank teams');
 const accounts=entries.map((e,index)=>{
  const key=e.config.username.toLowerCase().replace(/[^a-z0-9]/g,'');
  if(!key)throw Error('Invalid account');
  const team=sim.Teams.import(fs.readFileSync(path.resolve(e.base,e.config.teams.gen7ou),'utf8').replace(/^\uFEFF/,''));guard(team);
  const last=teamId(team),previous=records.findIndex(r=>r.id===last);
  const config=structuredClone(e.config);
  for(const k of ['python','foul','bank'])config.foulPlay[k]=path.resolve(e.base,config.foulPlay[k]);
  config.teams={gen7ou:'team.txt'};config.logDirectory='logs';
  config.foulRoster={file:'../roster.json',state:'rotation-state.json'};
  const state={owner:key,cursor:((previous<0?0:previous+1)+index)%records.length,last,results:[]};
  return {key,config,team:sim.Teams.export(team),state};
 });
 if(new Set(accounts.map(a=>a.key)).size!==accounts.length)throw Error('Account identifier collision');
 fs.mkdirSync(target,{recursive:true});
 fs.writeFileSync(path.join(target,'roster.json'),JSON.stringify({schema:1,format:'gen7ou',records},null,2)+'\n',{flag:'wx'});
 for(const a of accounts){const folder=path.join(target,a.key);fs.mkdirSync(folder);for(const [file,value]of [['config.json',JSON.stringify(a.config,null,2)+'\n'],['team.txt',a.team],['rotation-state.json',JSON.stringify(a.state,null,2)+'\n']])fs.writeFileSync(path.join(folder,file),value,{flag:'wx'});}
 const manifest={schema:1,policy:'custom-adapted-foul-play-baseline',rotation:'existing-bank-only',sourceFleet:path.resolve(fleet),
  rosterTeams:records.length,skipped,accounts:accounts.map(a=>({username:a.config.username,passwordEnv:a.config.passwordEnv,config:a.key+'/config.json'}))};
 fs.writeFileSync(path.join(target,'fleet.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 return manifest;
}
if(require.main===module){const o={},args=process.argv.slice(2);for(let i=0;i<args.length;i+=2){const k=args[i].replace(/^--/,'');if(!['fleet','output'].includes(k)||!args[i+1])throw Error('Expected --fleet FILE --output NEW_DIRECTORY');o[k]=args[i+1];}if(!o.fleet||!o.output)throw Error('--fleet and --output required');const m=prepareRotation(o);console.log('Prepared '+m.accounts.length+' accounts rotating '+m.rosterTeams+' distinct existing teams; '+m.skipped.length+' ineligible bank entries skipped. Source fleet untouched.');}
module.exports={prepareRotation};
