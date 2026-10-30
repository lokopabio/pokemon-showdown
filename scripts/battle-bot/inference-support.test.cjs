'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),{BEFORE,AFTER,patchSampler,patchPreparer}=require('./inference-support.cjs');
test('paired cutoff removed without changing surrounding code',()=>{const src='prefix\n'+BEFORE+'\nsuffix',p=patchSampler(src);a.equal(p,'prefix\n'+AFTER+'\nsuffix');a.equal(patchSampler(p),p);});
test('unexpected or duplicate sampler source is rejected',()=>{a.throws(()=>patchSampler('other'));a.throws(()=>patchSampler(BEFORE+'\n'+BEFORE));});
test('future bank preparation persists the exact paired patch idempotently',()=>{const src='  const patches = [\n  ];',p=patchPreparer(src);a.ok(p.includes(JSON.stringify(AFTER)));a.equal(patchPreparer(p),p);});
