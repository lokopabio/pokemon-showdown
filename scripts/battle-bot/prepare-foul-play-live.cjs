'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {Teams,TeamValidator}=require('../../dist/sim');
const {validateCustomTeam}=require('./foul-play-team.cjs');
function prepareLive({server,username,python,foul,bank,output,searchMs=100,roster}) {
  const url=new URL(server);if(!['ws:','wss:'].includes(url.protocol))throw new Error('Expected WebSocket server URL');
  if(!username||!Number.isInteger(searchMs)||searchMs<1||searchMs>10000)throw new Error('Invalid username or search budget');
  for(const file of [python,foul,bank])if(!fs.existsSync(file))throw new Error('Missing path: '+file);
  if(fs.existsSync(output))throw new Error('Use a new output directory');
  const data=JSON.parse(fs.readFileSync(bank,'utf8'));if(data.schema!==1||data.format!=='gen7ou')throw new Error('Invalid bank');
  const team=(data.teams||[]).map(r=>r.team||r).find(t=>{try{validateCustomTeam(t);return !TeamValidator.get('gen7ou').validateTeam(JSON.parse(JSON.stringify(t)));}catch{return false;}});
  if(!team)throw new Error('No legal non-Mega, non-Moody Fakemon team in bank');
  const config={server:url.href,username,passwordEnv:'BENITO_PASSWORD',maxBattles:1,allowedUsers:[],logDirectory:'logs',teams:{gen7ou:'team.txt'},
    foulPlay:{python:path.resolve(python),foul:path.resolve(foul),bank:path.resolve(bank),searchMs}};
  if(roster){const rosterFile=path.resolve(roster);new (require('./foul-play-roster.cjs').FoulRoster)({file:rosterFile,state:path.join(path.resolve(output),'roster-state.json'),owner:username});config.foulRoster={file:rosterFile,state:'roster-state.json'};}
  fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,'team.txt'),Teams.export(team));
  fs.writeFileSync(path.join(output,'config.json'),JSON.stringify(config,null,2)+'\n');
  return config;
}
if(require.main===module){const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i+=2){const key=args[i].replace(/^--/,'');if(!['server','username','python','foul','bank','output','searchMs','roster'].includes(key)||args[i+1]===undefined)throw new Error('Unknown option or missing value');options[key]=key==='searchMs'?Number(args[i+1]):args[i+1];}prepareLive(options);console.log('Prepared '+path.resolve(options.output,'config.json')+'; no password saved.');}
module.exports={prepareLive};
