'use strict';
// User-authored hypotheses and restrictions. These guide search, not battle legality.
const {Dex}=require('../../dist/sim');const dex=Dex.forFormat('gen7ou');
const allowed={carlis:['rattled','gooey'],tiopep:['toxicboost'],dijeypepe:['reckless','competitive'],mijue:['bigpecks'],fonsomate:['imposter'],angelote:['oblivious','simple'],oruguille:['intimidate','sapsipper'],momontanho:['serenegrace','megalauncher','dazzling'],pabio:['furcoat','comatose'],papalvo:['synchronize','steelworker'],habiemigo:['trace'],balongus:['defiant','beastboost'],albeerto:['stickyhold','thickfat','pressure'],vtroll:['teravolt','prankster'],ponshead:['unaware','oblivious'],xristian:['flashfire'],rafalu:['frisk','grasspelt'],pedrerol:['quickfeet'],chemous:['dryskin','powerofalchemy'],chemfalse:['illusion','triage'],supersteban:['noguard'],rickymartin:['protean'],alepato:['rockhead','skilllink','tanglinghair'],waynero:['flashfire','vitalspirit'],pajillero:['grassysurge'],titogallar:['primordialsea','swiftswim'],fidalsana:['guts','berserk','bulletproof'],ladesaurio:['adaptability'],luppitto:['chlorophyll','poisonheal'],oscobain:['intimidate','soundproof','filter'],svax:['harvest','liquidvoice'],matebelo:['gluttony','stickyhold'],moreirao:['intimidate','stakeout'],qileschin:['prankster'],arturacer:['hugepower'],tholmas:['snowwarning'],gemelotro:['psychicsurge'],jamadelpa:['sheerforce','magnetpull'],migslender:['shadowtag'],ferninfarto:['aftermath','technician','cursedbody'],germeneko:['suctioncups','poisontouch','stench'],mermela:['intimidate','lightningrod'],miguapaa:['trace'],morich:['snowcloak'],pikayala:['magicbounce'],teketeki:['sandrush','download','levitate'],tallarin:['speedboost'],pavoaero:['stamina'],hitmondad:['unburden'],ludevtention:['contrary'],pabrown:['ironfist'],marcobarco:['waterabsorb'],herindro:['sapsipper'],botondsk:['refrigerate'],marianoids:['ironbarbs','justified'],khangrena:['waterbubble'],airrivas:['airlock']};
const excluded=new Set(['virodcan','gemeluno','calvivas']);
const setup=new Set(['swordsdance','nastyplot','calmmind','quiverdance','geomancy','shellsmash','bulkup','curse','coil','dragondance','agility','rockpolish','autotomize','shiftgear','growth','workup','honeclaws','irondefense','amnesia','cosmicpower','tailglow','bellydrum','minimize','doubleteam','defensecurl','charge','acupressure','sharpen','meditate','howl','stockpile']);
const view=s=>({n:dex.species.get(s.species).id,a:dex.abilities.get(s.ability).id,i:dex.items.get(s.item).id,m:s.moves.map(m=>dex.moves.get(m).id)});
const minSpeed=s=>(s.ivs?.spe??31)===0&&(s.evs?.spe||0)===0&&dex.natures.get(s.nature).minus==='spe';
function assess(set,team){const {n,a,i,m}=view(set),has=x=>m.includes(x),boost=m.some(x=>setup.has(x)),errors=[],notes=[];let weight=1;
 const need=(condition,reason)=>{if(!condition)errors.push(reason);};const prefer=(condition,reason)=>{if(!condition){weight*=0.5;notes.push(reason);}};
 if(excluded.has(n))errors.push('Species excluded from initial search by user');
 if(allowed[n])need(allowed[n].includes(a),'Ability outside user candidate policy');
 if(n==='carlis'&&a==='rattled'){need((set.evs?.atk||0)+(set.evs?.spa||0)>=128,'Rattled Carlis reserved for offensively invested bait sets');weight*=0.2;notes.push('Rare offensive speed-bait experiment; Gooey preferred for both roles');}
 if(n==='tiopep')need(a==='toxicboost'&&i==='toxicorb'&&has('stealthrock')&&(set.evs?.spe||0)>0,'Tiopep requires Toxic Boost, Toxic Orb, rocks and Speed investment');
 if(n==='fonsomate')need(a==='imposter'&&i==='choicescarf'&&set.evs?.hp===252,'Fonsomate requires Imposter, Scarf and maximum HP investment');
 if(n==='dijeypepe')need(a===(has('flareblitz')||has('volttackle')?'reckless':'competitive'),'Dijeypepe ability follows recoil attacks');
 if(n==='angelote')need(a===(boost?'simple':'oblivious'),'Angelote: Simple for stat setup, otherwise Oblivious');
 if(n==='oruguille')prefer(a==='intimidate','Intimidate generally preferred; Sap Sipper remains an experiment');
 if(n==='momontanho'){if(i==='choicescarf'&&has('airslash'))prefer(a==='serenegrace','Scarf Air Slash prefers Serene Grace');if(a==='megalauncher')need(m.some(x=>dex.moves.get(x).flags.pulse),'Mega Launcher requires a boosted pulse move');if(a==='dazzling')notes.push('Ladesaurio insurance hypothesis; requires matchup validation, not a certified full counter');}
 if(n==='pabio'&&a==='comatose')need(boost,'Comatose Pabio reserved for setup sets');
 if(n==='papalvo')need(a===(m.some(x=>{const move=dex.moves.get(x);return move.type==='Steel'&&move.category!=='Status';})?'steelworker':'synchronize'),'Papalvo ability follows Steel attacks');
 if(n==='balongus'&&a==='defiant')prefer(i==='choicescarf','Defiant Scarf anti-Defog preference');
 if(n==='albeerto'){need(i==='eviolite','Albeerto requires Eviolite');prefer(a==='stickyhold','Sticky Hold preferred to retain Eviolite');}
 if(n==='vtroll')prefer(a===(m.filter(x=>dex.moves.get(x).category==='Status').length>=2?'prankster':'teravolt'),'Support-heavy Vtroll prefers Prankster; offensive prefers Teravolt');
 if(n==='ponshead')prefer(a===(has('stealthrock')?'oblivious':'unaware'),'Rocks prefers Oblivious; walling prefers Unaware');
 if(n==='pedrerol')need(a==='quickfeet'&&i==='toxicorb','Pedrerol initial candidate requires Quick Feet + Toxic Orb');
 if(n==='chemous'&&a==='powerofalchemy')notes.push('Requires explicit ability-donor plan');
 if(n==='chemfalse'&&a==='triage')need(m.some(x=>dex.moves.get(x).flags.heal),'Triage requires a healing move');
 if(n==='alepato'){if(has('headsmash'))need(a==='rockhead','Head Smash Alepato requires Rock Head');else if(m.some(x=>Array.isArray(dex.moves.get(x).multihit)))need(a==='skilllink','Variable multihit Alepato requires Skill Link');}
 if(n==='waynero')need(a===(has('steameruption')?'vitalspirit':'flashfire'),'Waynero ability follows Steam Eruption');
 if(n==='fidalsana'){if(i==='flameorb')need(a==='guts','Flame Orb Fidalsana requires Guts');if(a==='guts')need(i==='flameorb','Guts Fidalsana requires Flame Orb in initial pool');if(a==='berserk')notes.push('Server Berserk raises Attack; do not use standard special-attack assumption');}
 if(n==='luppitto'&&a==='poisonheal')need(i==='toxicorb','Poison Heal Luppitto requires Toxic Orb');
 if(n==='oscobain')prefer(a==='intimidate','Intimidate generally preferred');
 if(n==='svax'){if(a==='harvest')need(!!dex.items.get(i).isBerry,'Harvest requires a Berry');if(a==='liquidvoice')need(m.some(x=>dex.moves.get(x).flags.sound&&dex.moves.get(x).category!=='Status'),'Liquid Voice requires a damaging sound move');}
 if(n==='matebelo')need(a==='gluttony'?!!dex.items.get(i).isBerry:a==='stickyhold'&&i==='blacksludge','Matebelo requires Gluttony/Berry or Sticky Hold/Black Sludge');
 if(n==='tholmas'){prefer((set.evs?.hp||0)>0&&(set.evs?.spe||0)>0,'Fast HP-invested Tholmas preference');prefer(['auroraveil','blizzard','curse'].every(has),'Tholmas suggested Veil/Blizzard/Curse core');}
 if(n==='jamadelpa'&&a==='sheerforce')need(i==='lifeorb'&&minSpeed(set),'Sheer Force Jamadelpa requires Life Orb and minimum Speed');
 if(n==='migslender')prefer(i==='choicescarf','Scarf generally preferred');
 if(n==='germeneko')prefer(a==='suctioncups','Suction Cups generally preferred');
 if(n==='mermela')prefer(a==='intimidate','Lightning Rod remains an Electric-matchup experiment');
 if(n==='teketeki'&&a!=='sandrush'){const offensive=(set.evs?.atk||0)+(set.evs?.spa||0)>=128;prefer(a===(offensive?'download':'levitate'),'Offensive Teketeki prefers Download; defensive prefers Levitate');}
 if(n==='tallarin')need(has('batonpass'),'Tallarin initial candidates require Baton Pass');
 if(n==='hitmondad'){const consumed=!!dex.items.get(i).isBerry||(i==='whiteherb'&&(has('curse')||has('closecombat')));need(consumed,'Unburden requires a supported consumable; White Herb pairs with Curse/Close Combat');}
 if(n==='ludevtention')prefer(has('closecombat'),'Contrary Close Combat preference');
 if(team){const peers=team.filter(s=>s!==set).map(view),all=team.map(view);const provided=(move,abilities)=>all.some(s=>s.m.includes(move)||abilities.includes(s.a));
  if(n==='rafalu')need(a===(peers.some(s=>s.a==='grassysurge')?'grasspelt':'frisk'),'Rafalu ability follows teammate Grassy Surge support');
  if(n==='titogallar'&&a==='swiftswim')need(provided('raindance',['drizzle','primordialsea']),'Swift Swim requires actual rain support');
  if(n==='luppitto'&&a==='chlorophyll')need(provided('sunnyday',['drought','desolateland']),'Chlorophyll requires actual sun support');
  if(n==='teketeki'&&a==='sandrush')need(provided('sandstorm',['sandstream']),'Sand Rush requires actual sand support');
  if(n==='jamadelpa'&&a==='sheerforce')need(provided('trickroom',[]),'Sheer Force Jamadelpa requires Trick Room support');
  if(n==='abicort'){need(peers.some(s=>s.m.includes('trickroom')),'Abicort requires a teammate with Trick Room');need(minSpeed(set),'Trick Room Abicort requires minimum Speed');}
  if(n==='chemous'&&a==='powerofalchemy')need(peers.some(s=>['hugepower','purepower','adaptability','waterbubble','furcoat','magicguard','parentalbond','speedboost','refrigerate','protean','contrary'].includes(s.a)),'Power of Alchemy requires an identified useful donor ability; acquisition sequence still unverified');
 }
 return {errors,notes,weight};
}
function teamErrors(team){return team.flatMap(s=>assess(s,team).errors.map(reason=>({species:s.species,reason})));}
module.exports={assess,teamErrors,allowed,minSpeed};
