'use strict';
// Offline frozen-team validation supervisor. No account or roster writes.
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const {spawn,execFile}=require('node:child_process');
function limits(o){const hours=Number(o.hours??1);if(!Number.isFinite(hours)||hours<=0||hours>8)throw Error('hours must be >0 and <=8');if(!o.run||!o.output)throw Error('--run and --output required');if(fs.existsSync(o.output))throw Error('Use a new output directory');return hours;}
function supervise(o){const hours=limits(o);const options={bank:'metagame/metagame-bank.json',python:'../roman-foul-play/.venv/Scripts/python.exe',foul:'../roman-foul-play',opponents:24,repeats:4,seed:4301,searchMs:30,maxTurns:150,pauseMs:250,minFreeGB:10,...o,hours};
 const args=Object.entries(options).flatMap(([k,v])=>['--'+k,String(v)]);
 const child=spawn(process.execPath,['--max-old-space-size=768',path.join(__dirname,'validate-discovery.cjs'),...args],{env:{...process.env,PYTHONUTF8:'1'},stdio:['inherit','inherit','inherit','ipc'],detached:process.platform!=='win32'});
 let stopping=false,reason='running',grace,lastProgress=Date.now(),lastCount=-1,finished=false;
 const write=()=>{if(fs.existsSync(o.output))fs.writeFileSync(path.join(o.output,'supervisor.json'),JSON.stringify({reason,hours,liveChanges:false,limits:{nodeHeapMB:768,nodeRSSMB:2048,outputMB:1024,minFreeGB:10,stallSeconds:180,errorStop:3,graceSeconds:15},note:'Memory checks cover Node, not total Python RSS. Output and memory checks happen between games. Hard deadline and stall watchdog kill the worker process tree.'},null,2));};
 const killTree=()=>{if(finished)return;if(process.platform==='win32')execFile('taskkill',['/PID',String(child.pid),'/T','/F'],()=>{});else{try{process.kill(-child.pid,'SIGKILL');}catch{}}};
 const stop=why=>{if(stopping)return;stopping=true;reason=why;write();if(child.connected)child.send({type:'research-stop'},()=>{});grace=setTimeout(killTree,15000);console.log(`Stopping: ${why}. Saving the current battle where possible.`);};
 const interrupt=()=>stop('User interrupted');process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
 const deadline=setTimeout(()=>stop('One-run time budget reached'),hours*3600000);
 const poll=setInterval(()=>{try{const file=path.join(o.output,'summary.json');if(fs.existsSync(file)){const s=JSON.parse(fs.readFileSync(file,'utf8'));if(s.attempted!==lastCount){lastCount=s.attempted;lastProgress=Date.now();}if((s.standings||[]).reduce((n,r)=>n+r.errors,0)>=3)stop('Three battle errors; inspect saved games before continuing');}if(Date.now()-lastProgress>180000)stop('No completed battle for 180 seconds');}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))stop(error.message);}},2000);
 child.on('spawn',()=>{try{os.setPriority(child.pid,os.constants.priority.PRIORITY_BELOW_NORMAL);}catch{}console.log(`Offline validation started; time budget ${hours} hour(s). Keep this terminal open.`);});
 const clean=()=>{finished=true;clearInterval(poll);clearTimeout(deadline);clearTimeout(grace);process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);};
 child.on('error',e=>{reason=e.message;clean();write();console.error(e.message);process.exitCode=1;});
 child.on('exit',(code,signal)=>{if(reason==='running')reason=code===0?'Scheduled evaluation finished':`Worker exited ${code??signal}`;clean();write();console.log(`Saved output: ${o.output}. ${reason}.`);if(code||signal)process.exitCode=1;});
 return child;
}
if(require.main===module){const a=process.argv.slice(2),o={};for(let i=0;i<a.length;i+=2){const k=a[i].replace(/^--/,'');if(!['run','output','bank','python','foul','hours','opponents','repeats','seed','searchMs','maxTurns','pauseMs','minFreeGB'].includes(k)||!a[i+1])throw Error('Invalid option');o[k]=a[i+1];}supervise(o);}
module.exports={supervise,limits};
