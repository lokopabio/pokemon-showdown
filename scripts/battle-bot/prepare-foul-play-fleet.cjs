'use strict';
const fs=require('node:fs'),path=require('node:path');
const id=s=>String(s).toLowerCase().replace(/[^a-z0-9]/g,'');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
function prepare({template,output,accounts,names},deps={}) {
 const sim=deps.sim||require('../../dist/sim');
 const validateCustomTeam=deps.validateCustomTeam||require('./foul-play-team.cjs').validateCustomTeam;
 const source=path.resolve(template),base=path.dirname(source),target=path.resolve(output);
 if(fs.existsSync(target))throw Error('Output exists; choose a new directory.');
 const reference=read(source);
 if(Array.isArray(reference)||!reference.foulPlay||!reference.teams?.gen7ou)throw Error('Template must be the working single-account Foul Play config.');
 const url=new URL(reference.server);if(!['ws:','wss:'].includes(url.protocol))throw Error('Invalid server URL');
 const foulPlay={};
 for(const key of ['python','foul','bank']) {
  if(typeof reference.foulPlay[key]!=='string')throw Error('Missing template Foul Play '+key);
  foulPlay[key]=path.resolve(base,reference.foulPlay[key]);
  if(!fs.existsSync(foulPlay[key]))throw Error('Missing runtime path: '+key);
 }
 const searchMs=reference.foulPlay.searchMs??100;
 if(!Number.isInteger(searchMs)||searchMs<1||searchMs>10000)throw Error('Invalid template search budget');
 foulPlay.searchMs=searchMs;foulPlay.diagnostics=!!reference.foulPlay.diagnostics;
 let rows,teamBase;
 if(accounts){const file=path.resolve(accounts);rows=read(file);if(!Array.isArray(rows))rows=[rows];teamBase=path.dirname(file);}
 else {if(!names)throw Error('Supply --accounts FILE or --names comma-separated account names');rows=names.split(',').map(username=>({username:username.trim()}));teamBase=base;}
 const seen=new Set(),prepared=[];
 for(const row of rows){
  const username=row.username,key=id(username);
  if(!key||typeof username!=='string'||/[|\r\n]/.test(username)||seen.has(key))throw Error('Missing, duplicate or invalid account name');
  seen.add(key);
  const teamFile=row.teams?.gen7ou?path.resolve(teamBase,row.teams.gen7ou):path.resolve(base,reference.teams.gen7ou);
  const team=sim.Teams.import(fs.readFileSync(teamFile,'utf8').replace(/^\uFEFF/,''));
  validateCustomTeam(team);
  const errors=sim.TeamValidator.get('gen7ou').validateTeam(structuredClone(team));
  if(errors)throw Error(username+': '+errors.join('; '));
  const config={server:url.href,username,passwordEnv:'FOULPLAY_'+key.toUpperCase()+'_PASSWORD',maxBattles:1,
   allowedUsers:row.allowedUsers??reference.allowedUsers??[],logDirectory:'logs',teams:{gen7ou:'team.txt'},foulPlay:{...foulPlay}};
  if(reference.loginServer)config.loginServer=reference.loginServer;
  prepared.push({key,username,config,team:sim.Teams.export(team),sourceTeam:teamFile});
 }
 if(!prepared.length)throw Error('No accounts supplied');
 // Validate every account before creating output. Existing files are never overwritten.
 fs.mkdirSync(target,{recursive:true});
 const manifest={schema:1,policy:'custom-adapted-foul-play-baseline',template:source,searchMs,
  accounts:prepared.map(p=>({username:p.username,passwordEnv:p.config.passwordEnv,config:p.key+'/config.json',sourceTeam:p.sourceTeam})),
  notes:'Separate configs and copied existing teams. No registrations, deployments, team generation, model changes, or external Foul Play writes.'};
 for(const p of prepared){const folder=path.join(target,p.key);fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'config.json'),JSON.stringify(p.config,null,2)+'\n',{flag:'wx'});fs.writeFileSync(path.join(folder,'team.txt'),p.team,{flag:'wx'});}
 fs.writeFileSync(path.join(target,'fleet.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 return manifest;
}
if(require.main===module){const o={};const a=process.argv.slice(2);for(let i=0;i<a.length;i+=2){const k=a[i].replace(/^--/,'');if(!['template','output','accounts','names'].includes(k)||!a[i+1])throw Error('Expected --template FILE --output DIR (--accounts EXISTING_CONFIG or --names LIST)');o[k]=a[i+1];}if(!o.template||!o.output)throw Error('--template and --output required');const result=prepare(o);console.log('Prepared '+result.accounts.length+' accounts at '+path.resolve(o.output,'fleet.json')+'; '+result.searchMs+' ms each. Existing teams and builders untouched.');}
module.exports={prepare};
