const data=require('office-data');const id=x=>String(x||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const getter=map=>({get:x=>map[id(x)]||{id:id(x),name:String(x||''),exists:false,flags:{}}});
const dex={species:getter(data.species),moves:getter(data.moves),abilities:getter(data.abilities),items:getter(data.items),natures:getter(data.natures),getImmunity:(type,s)=>data.effectiveness[s.id][type]!==0,getEffectiveness:(type,s)=>Math.log2(data.effectiveness[s.id][type])};
module.exports={Dex:{...dex,forFormat:()=>dex},id};
