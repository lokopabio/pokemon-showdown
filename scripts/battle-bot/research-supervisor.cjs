'use strict';
const fs=require('node:fs');const path=require('node:path');const {spawn,execFile}=require('node:child_process');const os=require('node:os');
function supervise(options){const hours=options.hours??8;if(!Number.isFinite(hours)||hours<=0||hours>12)throw Error('hours must be >0 and <=12');const args=Object.entries(options).flatMap(([k,v])=>['--'+k,String(v)]);
 const child=spawn(process.execPath,['--max-old-space-size=1024',path.join(__dirname,'prepare-research.cjs'),...args],{env:{...process.env,RESEARCH_SUPERVISED:'1'},stdio:['inherit','inherit','inherit','ipc'],detached:process.platform!=='win32'});
 let forced=false,reason,grace;const nativePids=new Set();const output=options.output||'scripts/battle-bot/results/research-prep-001';
 const writeStop=()=>{const file=path.join(output,'summary.json');if(fs.existsSync(file)){try{const data=JSON.parse(fs.readFileSync(file,'utf8'));fs.writeFileSync(file,JSON.stringify({...data,stage:'stopped',reason:reason||'Worker exited unexpectedly; inspect saved output.'},null,2)+'\n');}catch{}}};
 const killNative=()=>{for(const pid of nativePids)if(process.platform==='win32')execFile('taskkill',['/PID',String(pid),'/T','/F'],()=>{});else{try{process.kill(pid,'SIGKILL');}catch{}}};
 const kill=()=>{forced=true;killNative();if(process.platform==='win32')execFile('taskkill',['/PID',String(child.pid),'/T','/F'],()=>{});else{try{process.kill(-child.pid,'SIGKILL');}catch{}}};
 const stop=why=>{if(reason)return;reason=why;child.send?.({type:'research-stop'},()=>{});grace=setTimeout(kill,10000);};
 const timer=setTimeout(()=>stop('Whole-run time limit reached'),hours*3600000);const interrupt=()=>stop('Interrupted');process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
 child.on('spawn',()=>{try{os.setPriority(child.pid,os.constants.priority.PRIORITY_BELOW_NORMAL);}catch{console.log('Priority adjustment unavailable; throttling remains enabled.');}});
 child.on('message',message=>{if(message?.type==='research-native-start')nativePids.add(message.pid);if(message?.type==='research-native-exit')nativePids.delete(message.pid);if(message?.type==='research-resource'&&message.rss>(options.maxMemoryMB??2048)*1024*1024)stop('Node memory budget reached');});
 child.on('error',error=>{clearTimeout(timer);clearTimeout(grace);console.error(error.message);process.exitCode=1;});
 child.on('exit',(code,signal)=>{clearTimeout(timer);clearTimeout(grace);process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);if(forced||signal||code){killNative();writeStop();process.exitCode=1;}else process.exitCode=0;});
 return child;
}
module.exports={supervise};
