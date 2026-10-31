'use strict';
const fs=require('node:fs'),path=require('node:path');
const {load}=require('./start-foul-play-fleet.cjs');
function enable({fleet,delayMs=15000,mode='on'}){
 const entries=load(fleet);if(!['on','off'].includes(mode))throw Error('mode must be on or off');
 if(!Number.isInteger(delayMs)||delayMs<5000||delayMs>300000)throw Error('delayMs must be 5000–300000');
 const files=entries.map(e=>{const config={...e.config};if(mode==='on')config.ladder={format:'gen7ou',delayMs};else delete config.ladder;return {file:path.join(e.base,'config.json'),config};});
 // Validate everything first. Backups retain the previous challenge-only settings and rotation paths.
 for(const row of files){const backup=row.file+'.before-ladder';if(!fs.existsSync(backup))fs.copyFileSync(row.file,backup);}
 for(const row of files){const temp=row.file+'.ladder-tmp';fs.writeFileSync(temp,JSON.stringify(row.config,null,2)+'\n');fs.renameSync(temp,row.file);}
 return files.length;
}
if(require.main===module){const options={},args=process.argv.slice(2);for(let i=0;i<args.length;i+=2){const key=args[i].replace(/^--/,'');if(!['fleet','delayMs','mode'].includes(key)||!args[i+1])throw Error('Expected --fleet FILE [--delayMs NUMBER]');options[key]=key==='delayMs'?Number(args[i+1]):args[i+1];}if(!options.fleet)throw Error('--fleet required');console.log((options.mode==='off'?'Disabled':'Enabled')+' Gen7 OU ladder searches for '+enable(options)+' accounts. Restart that fleet to apply.');}
module.exports={enable};
