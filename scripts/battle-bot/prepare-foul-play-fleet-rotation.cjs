'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {load}=require('./start-foul-play-fleet.cjs');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
function prepareRotation({fleet,output,archive,player},deps={}){
 const sim=deps.sim||require('../../dist/sim');
 const guard=deps.validateCustomTeam||require('./foul-play-team.cjs').validateCustomTeam;
 const target=path.resolve(output);if(fs.existsSync(target))throw Error('Output exists; use a new directory');
 const entries=load(fleet),banks=new Set(entries.map(e=>path.resolve(e.base,e.config.foulPlay.bank)));
 if(banks.size!==1)throw Error('This fleet must use one shared bank');
 const bankFile=[...banks][0],bank=read(bankFile);
 if(bank.schema!==1||bank.format!=='gen7ou'||!Array.isArray(bank.teams))throw Error('Invalid team bank');
 const teamId=t=>crypto.createHash('sha256').update(sim.Teams.pack(t)).digest('hex').slice(0,20);
 const records=[],skipped=[],byId=new Map();
 const sourceRows=bank.teams.map((row,index)=>({row,index,origin:'bank'}));
 let archiveSelected=0;
 if(archive){
  if(!player)throw Error('--player is required with --archive');
  const data=read(archive);if(!Array.isArray(data))throw Error('Expected unique-team archive array');
  const selected=data.map((row,index)=>({row,index})).filter(x=>String(x.row.player||'').toLowerCase()===player.toLowerCase());
  archiveSelected=selected.length;if(!archiveSelected)throw Error('No teams found for the requested archive player');
  sourceRows.push(...selected.map(x=>({...x,origin:'human-battle-archive'})));
 }
 for(const {row,index,origin}of sourceRows){
  const team=structuredClone(row.team||row);
  try{guard(team);const problems=sim.TeamValidator.get('gen7ou').validateTeam(structuredClone(team));if(problems)throw Error(problems.join('; '));}
  catch(error){skipped.push({origin,index,label:row.label||null,player:row.player||null,reason:error.message});continue;}
  const id=teamId(team);
  const provenance={origin,index,label:row.label||null};
  if(origin==='human-battle-archive'){provenance.player=row.player;provenance.teamId=row.team_id||null;provenance.battles=row.battles||[];}
  if(byId.has(id)){byId.get(id).provenance.push(provenance);continue;}
  const record={id,team,source:'bank',label:row.label||row.team_id||null,provenance:[provenance]};byId.set(id,record);records.push(record);
 }
 if(archive){
  const archived=records.filter(r=>r.provenance.some(p=>p.origin==='human-battle-archive'));
  const other=records.filter(r=>!r.provenance.some(p=>p.origin==='human-battle-archive'));
  const mixed=[];for(let i=0;i<Math.max(archived.length,other.length);i++){if(other[i])mixed.push(other[i]);if(archived[i])mixed.push(archived[i]);}
  records.splice(0,records.length,...mixed);
 }
 if(records.length<2)throw Error('Need at least two distinct legal existing bank teams');
 const accounts=entries.map((e,index)=>{
  const key=e.config.username.toLowerCase().replace(/[^a-z0-9]/g,'');
  if(!key)throw Error('Invalid account');
  const team=sim.Teams.import(fs.readFileSync(path.resolve(e.base,e.config.teams.gen7ou),'utf8').replace(/^\uFEFF/,''));guard(team);
  let last=teamId(team),results=[];
  if(e.config.foulRoster){
   const stateFile=path.resolve(e.base,e.config.foulRoster.state);
   if(fs.existsSync(stateFile)){const state=read(stateFile);if(state.owner!==key||!Array.isArray(state.results))throw Error('Invalid existing account rotation state');last=state.last||last;results=state.results.slice(-10000);}
  }
  const previous=records.findIndex(r=>r.id===last);
  const config=structuredClone(e.config);
  for(const k of ['python','foul','bank'])config.foulPlay[k]=path.resolve(e.base,config.foulPlay[k]);
  config.teams={gen7ou:'team.txt'};config.logDirectory='logs';
  config.foulRoster={file:'../roster.json',state:'rotation-state.json'};
  const state={owner:key,cursor:((previous<0?0:previous+1)+index)%records.length,last,results};
  return {key,config,team:sim.Teams.export(team),state};
 });
 if(new Set(accounts.map(a=>a.key)).size!==accounts.length)throw Error('Account identifier collision');
 fs.mkdirSync(target,{recursive:true});
 fs.writeFileSync(path.join(target,'roster.json'),JSON.stringify({schema:1,format:'gen7ou',records},null,2)+'\n',{flag:'wx'});
 for(const a of accounts){const folder=path.join(target,a.key);fs.mkdirSync(folder);for(const [file,value]of [['config.json',JSON.stringify(a.config,null,2)+'\n'],['team.txt',a.team],['rotation-state.json',JSON.stringify(a.state,null,2)+'\n']])fs.writeFileSync(path.join(folder,file),value,{flag:'wx'});}
 const manifest={schema:1,policy:'custom-adapted-foul-play-baseline',rotation:'existing-bank-only',sourceFleet:path.resolve(fleet),
  rosterTeams:records.length,archive:archive?{file:path.resolve(archive),player,selected:archiveSelected,eligibleUniqueTeams:records.filter(r=>r.provenance.some(p=>p.origin==='human-battle-archive')).length}:null,skipped,accounts:accounts.map(a=>({username:a.config.username,passwordEnv:a.config.passwordEnv,config:a.key+'/config.json'}))};
 fs.writeFileSync(path.join(target,'fleet.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 return manifest;
}
if(require.main===module){const o={},args=process.argv.slice(2);for(let i=0;i<args.length;i+=2){const k=args[i].replace(/^--/,'');if(!['fleet','output','archive','player'].includes(k)||!args[i+1])throw Error('Expected --fleet FILE --output NEW_DIRECTORY');o[k]=args[i+1];}if(!o.fleet||!o.output)throw Error('--fleet and --output required');const m=prepareRotation(o);console.log('Prepared '+m.accounts.length+' accounts rotating '+m.rosterTeams+' distinct existing teams; '+m.skipped.length+' ineligible entries skipped. Source fleet untouched.');}
module.exports={prepareRotation};
