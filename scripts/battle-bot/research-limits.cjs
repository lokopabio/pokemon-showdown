'use strict';
const fs=require('node:fs');const path=require('node:path');
function bytesIn(directory){if(!fs.existsSync(directory))return 0;return fs.readdirSync(directory,{withFileTypes:true}).reduce((n,e)=>n+(e.isDirectory()?bytesIn(path.join(directory,e.name)):fs.statSync(path.join(directory,e.name)).size),0);}
function createLimits({output,hours=8,pauseMs=100,maxMemoryMB=2048,maxDiskMB=1024,minFreeGB=10},deps={}){
 for(const [k,v]of Object.entries({hours,pauseMs,maxMemoryMB,maxDiskMB,minFreeGB}))if(!Number.isFinite(v)||v<0||(k==='hours'&&v===0))throw Error('Invalid resource limit: '+k);
 const now=deps.now||Date.now,start=now();let lastDisk=-Infinity,stop=false;const requestStop=()=>{stop=true;};
 const fail=message=>{const error=Error(message);error.code='RESEARCH_LIMIT';throw error;};
 const checkpoint=async()=>{if(stop)fail('Stop requested');if(now()-start>=hours*3600000)fail('Whole-run time limit reached');const rss=(deps.rss||(()=>process.memoryUsage().rss))();process.send?.({type:'research-resource',rss});if(rss>maxMemoryMB*1024*1024)fail('Node memory budget reached');
  if(now()-lastDisk>=1000){lastDisk=now();if((deps.bytes||bytesIn)(output)>maxDiskMB*1024*1024)fail('Output disk budget reached');let existing=path.resolve(output);while(!fs.existsSync(existing))existing=path.dirname(existing);const stat=(deps.statfs||fs.statfsSync)(existing);if(Number(stat.bavail)*Number(stat.bsize)<minFreeGB*1024**3)fail('Minimum free disk reserve reached');}
  if(pauseMs)await new Promise(resolve=>setTimeout(resolve,pauseMs));};
 return {checkpoint,requestStop};
}
module.exports={createLimits,bytesIn};
