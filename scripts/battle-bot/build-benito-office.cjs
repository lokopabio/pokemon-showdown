'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
async function build({bank=path.resolve(__dirname,'../../../metagame-bank/metagame-bank.json'),output=path.resolve(__dirname,'../../web/benito')}={},onData){
 const {Dex}=require('../../dist/sim'),dex=Dex.forFormat('gen7ou');const {catalog}=require('./legal-space.cjs');const {CandidateBank}=require('./candidate-bank.cjs');
 const raw=JSON.parse(fs.readFileSync(bank,'utf8'));const pool=new CandidateBank(raw,raw.teams.map(r=>r.team||r),()=>0.5),cat=catalog();
 const species={};for(const [id,s]of Object.entries(cat.species))species[id]={...s,id,baseStats:s.stats,types:s.types.map(t=>t[0].toUpperCase()+t.slice(1)),nfe:dex.species.get(id).nfe};
 const moves=Object.fromEntries(Object.keys(cat.moves).map(id=>{const m=dex.moves.get(id);return [id,{id,name:m.name,type:m.type,category:m.category,basePower:m.basePower,flags:m.flags,multihit:m.multihit,accuracy:m.accuracy}];}));
 const simple=rows=>Object.fromEntries(rows.map(r=>[r.id,{id:r.id,name:r.name,isBerry:r.isBerry,megaStone:r.megaStone,zMove:r.zMove,zMoveType:r.zMoveType,plus:r.plus,minus:r.minus}]));
 const types=dex.types.all().map(t=>t.name);const effectiveness=Object.fromEntries(Object.keys(species).map(id=>[id,Object.fromEntries(types.map(t=>[t,dex.getImmunity(t,dex.species.get(id))?2**dex.getEffectiveness(t,dex.species.get(id)):0]))]));
 const data={schema:1,format:'Custom Gen 7 singles',builtAt:new Date().toISOString(),bankHash:crypto.createHash('sha256').update(fs.readFileSync(bank)).digest('hex'),species,moves,abilities:simple(dex.abilities.all()),items:simple(dex.items.all()),natures:simple(dex.natures.all()),types,effectiveness,sets:[...pool.records.values()].map(r=>({id:r.id,set:r.set,sources:r.sources}))};
 if(onData)onData(data);
 fs.mkdirSync(output,{recursive:true});const source=path.join(__dirname,'office');for(const file of ['index.html','style.css'])fs.copyFileSync(path.join(source,file),path.join(output,file));
 await require('esbuild').build({entryPoints:[path.join(source,'app.cjs')],bundle:true,platform:'browser',format:'iife',minify:true,outfile:path.join(output,'app.js'),plugins:[{name:'office-data',setup(b){b.onResolve({filter:/^office-data$/},()=>({path:'data',namespace:'office'}));b.onLoad({filter:/.*/,namespace:'office'},()=>({contents:'module.exports='+JSON.stringify(data),loader:'js'}));b.onResolve({filter:/^\.\.\/\.\.\/dist\/sim$/},()=>({path:path.join(source,'dex.cjs')}));}}]});
 fs.writeFileSync(path.join(output,'data-info.json'),JSON.stringify({builtAt:data.builtAt,bankHash:data.bankHash,species:Object.values(species).filter(s=>s.selectable).length,sets:data.sets.length},null,2));return {output,species:Object.keys(species).length,sets:data.sets.length};
}
if(require.main===module){const a=process.argv.slice(2),o={};for(let i=0;i<a.length;i+=2){const k=a[i].replace(/^--/,'');if(!['bank','output'].includes(k)||!a[i+1])throw Error('Invalid option');o[k]=path.resolve(a[i+1]);}build(o).then(console.log).catch(e=>{console.error(e);process.exitCode=1;});}module.exports={build};
