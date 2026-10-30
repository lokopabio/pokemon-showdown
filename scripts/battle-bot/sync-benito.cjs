'use strict';
// Apply only the supported external inference fix and run focused checks.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {patchSampler}=require('./inference-support.cjs');
function sync({root=path.resolve(__dirname,'../..'),foul=path.resolve(root,'../roman-foul-play'),python}={}){
 const source=path.join(foul,'fp/search/standard_battles.py'),before=fs.readFileSync(source,'utf8'),after=patchSampler(before);
 python=python||path.join(foul,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
 if(!fs.existsSync(python))throw Error('Python environment missing: '+python+'; pass --python PATH');
 if(before!==after){const backup=source+'.benito-before-'+new Date().toISOString().replace(/[^0-9]/g,'');fs.copyFileSync(source,backup,fs.constants.COPYFILE_EXCL);fs.writeFileSync(source,after);console.log('Updated external sampler; backup: '+backup);}else console.log('External sampler already current.');
 for(const [cmd,args]of [[process.execPath,['--test',path.join(__dirname,'inference-support.test.cjs')]],[python,[path.join(__dirname,'verify-inference-support.py'),'--foul',foul]]]){const result=spawnSync(cmd,args,{cwd:root,stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)throw Error('Verification failed; no server restart or native rebuild performed.');}
 console.log('Benito inference support verified. No live configuration changed.');
}
if(require.main===module){const o={},args=process.argv.slice(2);for(let i=0;i<args.length;i+=2){const k=args[i].replace(/^--/,'');if(!['root','foul','python'].includes(k)||!args[i+1])throw Error('Options: --root --foul --python');o[k]=path.resolve(args[i+1]);}sync(o);}
module.exports={sync};
