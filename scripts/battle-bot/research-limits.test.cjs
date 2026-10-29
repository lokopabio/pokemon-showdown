'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {createLimits}=require('./research-limits.cjs');
const options={output:process.cwd(),hours:1,pauseMs:0,maxMemoryMB:10,maxDiskMB:10,minFreeGB:1};
const deps={rss:()=>1,bytes:()=>1,statfs:()=>({bavail:10,bsize:1024**3})};
test('research guard stops for memory, disk, free-space, time and explicit cancellation',async()=>{for(const [override,message]of [[{rss:()=>11*1024**2},/memory/],[{bytes:()=>11*1024**2},/disk/],[{statfs:()=>({bavail:0,bsize:1})},/reserve/]])await assert.rejects(createLimits(options,{...deps,...override}).checkpoint,message);let clock=0;const time=createLimits(options,{...deps,now:()=>clock});clock=3600000;await assert.rejects(time.checkpoint,/time/);const stopped=createLimits(options,deps);stopped.requestStop();await assert.rejects(stopped.checkpoint,/requested/);await createLimits(options,deps).checkpoint();});
