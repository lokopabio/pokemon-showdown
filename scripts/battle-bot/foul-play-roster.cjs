'use strict';
// Curated set recombination, offline admission, and persistent live rotation.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {Teams,TeamValidator,Dex}=require('../../dist/sim');
const {validateCustomTeam}=require('./foul-play-team.cjs');
const {rng}=require('./breed.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
const id=team=>crypto.createHash('sha256').update(Teams.pack(team)).digest('hex').slice(0,20);
function legal(team){try{validateCustomTeam(team);return !TeamValidator.get('gen7ou').validateTeam(clone(team));}catch{return false;}}
function roles(team){const dex=Dex.forFormat('gen7ou'),moves=team.flatMap(s=>s.moves.map(m=>dex.moves.get(m).id));return {hazards:moves.some(m=>['stealthrock','spikes','toxicspikes','stickyweb'].includes(m)),removal:moves.some(m=>['defog','rapidspin'].includes(m)),recovery:moves.some(m=>['recover','roost','slackoff','softboiled','wish','shoreup','synthesis','rest'].includes(m)),physical:team.some(s=>s.moves.some(m=>dex.moves.get(m).category==='Physical')),special:team.some(s=>s.moves.some(m=>dex.moves.get(m).category==='Special')),fast:team.some(s=>dex.species.get(s.species).baseStats.spe>=100||dex.items.get(s.item).id==='choicescarf')};}
function candidates(bank,{seed=1,count=4}={}){
  const random=rng(seed),sample=a=>a[Math.floor(random()*a.length)];
  const originals=[],seen=new Set();
  for(const row of bank.teams||[]){const team=row.team||row;if(legal(team)&&!seen.has(id(team))){seen.add(id(team));originals.push({id:id(team),team:clone(team),source:'bank',roles:roles(team)});}}
  if(originals.length<2)throw new Error('Need at least two distinct legal bank teams');
  const sets=[...(bank.sets||[]).map(r=>r.set||r),...originals.flatMap(r=>r.team)];
  const variants=[];
  for(let attempt=0;attempt<count*500&&variants.length<count;attempt++){
    const parent=sample(originals),team=clone(parent.team),slot=Math.floor(random()*6);
    team[slot]=clone(sample(sets));
    if(!legal(team)||seen.has(id(team)))continue;
    const summary=roles(team);
    // Preserve the parent's basic tools; this is a screen, not a strength claim.
    if(Object.keys(summary).some(k=>parent.roles[k]&&!summary[k]))continue;
    seen.add(id(team));variants.push({id:id(team),team,source:'variant',parent:parent.id,roles:summary});
  }
  return {originals,variants};
}
async function buildRoster({bank,python,foul,output,count=4,seed=809,searchMs=10,maxTurns=150},battle=require('./foul-play-smoke.cjs').smoke){
  if(fs.existsSync(output))throw new Error('Use a new output directory');
  if(!Number.isInteger(count)||count<1||count>32)throw new Error('count must be 1–32');
  const data=JSON.parse(fs.readFileSync(bank,'utf8'));
  if(data.schema!==1||data.format!=='gen7ou')throw new Error('Expected schema 1 Gen 7 OU bank');
  const {originals,variants}=candidates(data,{seed,count});
  const records=[...originals],reports=[];
  fs.mkdirSync(output,{recursive:true});
  for(const candidate of variants){
    const report={id:candidate.id,parent:candidate.parent,team:candidate.team,roles:candidate.roles,games:[],errors:[],admitted:false};
    // Same rival teams and battle seeds for each variant; both player slots.
    for(let rival=0;rival<Math.min(2,originals.length);rival++)for(let side=0;side<2;side++){
      try{const result=await battle({python,foul,bank,team1:side?originals[rival].team:candidate.team,team2:side?candidate.team:originals[rival].team,foulSide:side?'p2':'p1',seed:[seed,rival+1,side+1,79],searchMs,maxTurns});report.games.push(result);}
      catch(error){report.errors.push(String(error.message));}
    }
    const wins=report.games.filter(g=>g.winner==='FoulPlay').length;
    report.admitted=!report.errors.length&&report.games.length===4&&!report.games.some(g=>g.capped)&&wins>=2;
    report.wins=wins;
    if(report.admitted)records.push({...candidate,screen:{wins,games:4}});
    reports.push(report);
    fs.writeFileSync(path.join(output,'screening.json'),JSON.stringify({seed,opponent:'Heuristic',limitation:'Four-game compatibility and basic performance screen; not proof of improvement.',reports},null,2)+'\n');
    console.log(`Variant ${reports.length}/${variants.length}: ${wins}/4 wins; ${report.errors.length} errors; ${report.admitted?'admitted':'held back'}`);
  }
  const ordered=[...records.filter(r=>r.source==='variant'),...records.filter(r=>r.source==='bank')];
  const roster={schema:1,format:'gen7ou',records:ordered};
  fs.writeFileSync(path.join(output,'roster.json'),JSON.stringify(roster,null,2)+'\n');
  return {originals:originals.length,generated:variants.length,admitted:records.length-originals.length,roster:path.resolve(output,'roster.json')};
}
class FoulRoster{
  constructor({file,state,owner}){
    this.file=state;this.owner=owner.toLowerCase().replace(/[^a-z0-9]/g,'');
    const roster=JSON.parse(fs.readFileSync(file,'utf8'));
    if(roster.schema!==1||roster.format!=='gen7ou'||!Array.isArray(roster.records)||roster.records.length<2||roster.records.some(r=>!legal(r.team)||r.id!==id(r.team)||(r.source!=='bank'&&!(r.source==='discovery'&&r.screen?.selfPlay&&r.screen.games>=4)&&!(r.source==='variant'&&r.screen?.games>=4&&r.screen.wins>=2))))throw new Error('Invalid or unscreened roster');
    if(new Set(roster.records.map(r=>r.id)).size!==roster.records.length)throw new Error('Duplicate roster teams');
    this.records=roster.records;
    this.state=fs.existsSync(state)?JSON.parse(fs.readFileSync(state,'utf8')):{owner:this.owner,cursor:0,last:null,results:[]};
    if(this.state.owner!==this.owner||!Number.isSafeInteger(this.state.cursor)||this.state.cursor<0||!Array.isArray(this.state.results))throw new Error('Invalid roster state or different account');
  }
  save(){fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.state,null,2)+'\n');fs.renameSync(this.file+'.tmp',this.file);}
  choose(){let selected=this.records[this.state.cursor%this.records.length];if(selected.id===this.state.last)selected=this.records[(this.state.cursor+1)%this.records.length];this.state.cursor=this.records.indexOf(selected)+1;this.state.last=selected.id;this.save();return {id:selected.id,team:clone(selected.team),packed:Teams.pack(selected.team)};}
  record(teamId,outcome,matchKey){if(this.state.results.some(r=>r.matchKey===matchKey))return;this.state.results.push({teamId,outcome,matchKey});this.state.results=this.state.results.slice(-10000);this.save();}
}
if(require.main===module){const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i+=2){const k=args[i].replace(/^--/,'');if(!['bank','python','foul','output','count','seed','searchMs','maxTurns'].includes(k)||args[i+1]===undefined)throw new Error('Unknown option or missing value');options[k]=['count','seed','searchMs','maxTurns'].includes(k)?Number(args[i+1]):args[i+1];}buildRoster(options).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1;});}
module.exports={candidates,roles,legal,id,buildRoster,FoulRoster};
