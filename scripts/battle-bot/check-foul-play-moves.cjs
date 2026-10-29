'use strict';
// Generates native parity assertions for fixed-power moves in the supplied bank.
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {Dex}=require('../../dist/sim');
const {ENGINE}=require('./prepare-foul-play.cjs');
const catalog=require('./compatibility/poke-engine.json');
function generate(engine,bankFile) {
  if(execFileSync('git',['rev-parse','HEAD'],{cwd:engine,encoding:'utf8'}).trim()!==ENGINE)throw new Error('Unsupported engine revision');
  const bank=JSON.parse(fs.readFileSync(bankFile,'utf8'));
  if(bank.schema!==1||bank.format!=='gen7ou')throw new Error('Unsupported bank');
  const dex=Dex.forFormat('gen7ou');
  const records=[...bank.sets.map(r=>r.set||r),...(bank.teams||[]).flatMap(r=>r.team||r)];
  const moves=[...new Set(records.flatMap(s=>s.moves).map(m=>dex.moves.get(m).id))].sort();
  const lines=['use poke_engine::choices::{Choices,MOVES};','use std::str::FromStr;','#[test] fn custom_bank_fixed_power_matches_server() {'];
  const checked=[],skipped=[];
  for(const id of moves) {
    const m=dex.moves.get(id);
    if(!catalog.moves.includes(id)||!m.basePower||m.basePowerCallback){skipped.push(id);continue;}
    checked.push(id);
    lines.push(`assert_eq!(MOVES.get(&Choices::from_str("${id}").unwrap()).unwrap().base_power, ${m.basePower}.0, "${id}");`);
  }
  lines.push('}');
  fs.writeFileSync(path.join(engine,'tests/roman_move_parity.rs'),lines.join('\n')+'\n');
  return {checked:checked.length,skipped,limitation:'Fixed base power only. Dynamic power, move effects, ability effects, accuracy, and damage rounding are not verified by this test.'};
}
if(require.main===module){if(!process.argv[3])throw new Error('Usage: node scripts/battle-bot/check-foul-play-moves.cjs ENGINE_DIR BANK');console.log(JSON.stringify(generate(process.argv[2],process.argv[3]),null,2));}
module.exports={generate};
