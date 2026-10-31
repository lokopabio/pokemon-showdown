'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function configure({names,config='config/config.js',patchServer:applyPatch=false}){
 const file=path.resolve(config),marker='// Managed registered bot-pair ladder allowlist';
 const ids=[...new Set(String(names||'').split(',').map(n=>n.toLowerCase().replace(/[^a-z0-9]/g,'')))].filter(Boolean);
 if(ids.length<2)throw Error('Supply at least two registered bot account names');
 const original=fs.readFileSync(file,'utf8');
 const expression=/\n\/\/ Managed registered bot-pair ladder allowlist\nexports\.sameipbotladderusers = [^\n]*;\n?/g;
 if((original.match(expression)||[]).length>1)throw Error('Duplicate managed block; refusing changes');
 const output=original.replace(expression,'\n').trimEnd()+'\n\n'+marker+'\nexports.sameipbotladderusers = '+JSON.stringify(ids)+';\n';
 if(applyPatch){if(require(file).noipchecks)throw Error('IP checks are already globally disabled; inspect matchmaking logs instead of applying this exception');patchServer(process.cwd());}
 fs.copyFileSync(file,file+'.before-bot-ladder-'+Date.now()+'-'+crypto.randomBytes(3).toString('hex'),fs.constants.COPYFILE_EXCL);
 const temp=file+'.bot-ladder-tmp';fs.writeFileSync(temp,output);fs.renameSync(temp,file);
 return ids.length;
}
function patchServer(root){
 const file=path.join(root,'server/ladders.ts'),helperFile=path.join(root,'server/bot-ladder-policy.ts');
 const helper="/** Explicit registered bot-pair exception to the Gen7 OU same-IP match check. */\nexport function allowSameIPBotMatch(\n format: string, users: readonly { id: string; registered: boolean }[], configured: unknown\n): boolean {\n if (format !== 'gen7ou' || users.length !== 2 || !Array.isArray(configured)) return false;\n const ids = new Set(configured.filter((name): name is string => typeof name === 'string')\n  .map(name => name.toLowerCase().replace(/[^a-z0-9]/g, '')));\n return users[0].id !== users[1].id && users.every(user => user.registered && ids.has(user.id));\n}\n";
 const source=fs.readFileSync(file,'utf8');
 const old='if (new Set(users.map(user => user.latestIp)).size !== users.length) return false;';
 const replacement='if (new Set(users.map(user => user.latestIp)).size !== users.length &&\n\t\t\t!allowSameIPBotMatch(formatid, users, Config.sameipbotladderusers)) return false;';
 const anchor="import type { ChallengeType } from './room-battle';";
 const addition="import { allowSameIPBotMatch } from './bot-ladder-policy';";
 if(fs.existsSync(helperFile)&&fs.readFileSync(helperFile,'utf8')!==helper)throw Error('Existing bot policy helper differs; refusing overwrite');
 if(source.includes(replacement)&&source.includes(addition)&&fs.existsSync(helperFile))return;
 if(source.split(old).length!==2||source.split(anchor).length!==2||source.includes(addition))throw Error('Unexpected ladder source; refusing automatic patch');
 const result=source.replace(old,replacement).replace(anchor,anchor+'\n'+addition);
 fs.copyFileSync(file,file+'.before-bot-ladder-'+Date.now()+'-'+crypto.randomBytes(3).toString('hex'),fs.constants.COPYFILE_EXCL);
 if(!fs.existsSync(helperFile))fs.writeFileSync(helperFile,helper,{flag:'wx'});
 const temp=file+'.bot-ladder-tmp';fs.writeFileSync(temp,result);fs.renameSync(temp,file);
}
if(require.main===module){const a=process.argv.slice(2),o={};for(let i=0;i<a.length;i+=2){const k=a[i].replace(/^--/,'');if(!['names','config','patch-server'].includes(k)||!a[i+1])throw Error('Expected --names LIST [--config FILE]');if(k==='patch-server'){if(!['true','false'].includes(a[i+1]))throw Error('patch-server must be true or false');o.patchServer=a[i+1]==='true';}else o[k]=a[i+1];}console.log('Configured '+configure(o)+' account IDs; server rebuild/restart required.');}
module.exports={configure,patchServer};
