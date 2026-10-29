'use strict';
// Stages 1–2 only: local mechanics scenarios, then a conservative baseline rebuild. No discovery tournament or login.
const fs=require('node:fs');const path=require('node:path');
async function prepareResearch({output='scripts/battle-bot/results/research-prep-001',bank='metagame/metagame-bank.json',calculatorEngine='scripts/battle-bot/results/calculator-engine.cjs',baselineFile='scripts/battle-bot/results/calc-baseline-001/baseline.json',python='../roman-foul-play/.venv/Scripts/python.exe',results='scripts/battle-bot/results/benito-discovery-002',hours=8}={},dependencies={}){
 for(const file of [bank,calculatorEngine,baselineFile,python])if(!fs.existsSync(file))throw Error('Missing path: '+file);
 if(fs.existsSync(output))throw Error('Use a new preparation output directory');fs.mkdirSync(output,{recursive:true});
 const started=Date.now();let summary={schema:1,stage:'mechanics',startedAt:new Date().toISOString(),liveChanges:false};const save=()=>fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');save();
 try{console.log('Stage 1/2: scenario testing in the local Showdown simulator and native engine.');const audit=await (dependencies.audit||require('./mechanics-audit.cjs').auditMechanics)({baselineFile,python,output:path.join(output,'mechanics'),scope:'all',hours});summary.audit=audit;save();if(!audit.complete){summary.stage='audit time limit';save();return summary;}
  console.log('Stage 2/2: rebuild calculator baseline with scenario-dependent and unverified damage separated.');summary.stage='baseline';save();const baseline=await (dependencies.baseline||require('./calc-baseline.cjs').baseline)({bank,calculatorEngine,results,output:path.join(output,'baseline'),targetCount:24,seed:2201,mechanicsReport:audit.report});summary={...summary,stage:'complete',baseline,elapsedMinutes:(Date.now()-started)/60000};save();return summary;
 }catch(error){summary={...summary,stage:'failed',error:error.message};save();throw error;}
}
if(require.main===module){const a=process.argv.slice(2),o={};for(let i=0;i<a.length;i+=2){const k=a[i].replace(/^--/,'');if(!['output','bank','calculatorEngine','baselineFile','python','results','hours'].includes(k)||a[i+1]===undefined)throw Error('Invalid option');o[k]=k==='hours'?Number(a[i+1]):a[i+1];}prepareResearch(o).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1;});}
module.exports={prepareResearch};
