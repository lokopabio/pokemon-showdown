'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {FOUL} = require('./prepare-foul-play.cjs');
function prepareBank(directory) {
  directory = path.resolve(directory);
  if (execFileSync('git', ['rev-parse', 'HEAD'], {cwd: directory, encoding:'utf8'}).trim() !== FOUL) throw new Error('Unsupported Foul Play revision');
  const patches = [
    ["fp/search/standard_battles.py","        keys = list(sample_weights.keys())[:50]\n        values = list(sample_weights.values())[:50]","        # BENITO FULL HYPOTHESIS SUPPORT: no insertion-order top-50 cutoff\n        keys = list(sample_weights.keys())\n        values = list(sample_weights.values())"],
    ['fp/battle/protocol.py', '        function_to_call = battle_modifiers_lookup.get(action)',
      '        from fp.data.sets.roman_open import AppearanceTracker\n        if not hasattr(battle, "roman_tracker"):\n            battle.roman_tracker = AppearanceTracker()\n        battle.roman_tracker.before(battle, line)\n        function_to_call = battle_modifiers_lookup.get(action)'],
    ['fp/battle/protocol.py', '            function_to_call(battle, split_msg)',
      '            function_to_call(battle, split_msg)\n            battle.roman_tracker.apply(battle)'],
    ['fp/battle/protocol.py', '    side.active.ability = ability\n\n\ndef illusion_end',
      '    side.active.ability = ability\n    if is_opponent(battle, split_msg):\n        from fp.data.sets.roman_bank import reconcile_prior_illusion_history\n        reconcile_prior_illusion_history(side.active)\n\n\ndef illusion_end'],
    ['fp/search/standard_battles.py', '    revealed_set = set(revealed_pokemon)',
      '    from fp.data.sets.roman_bank import bank_species_name\n    revealed_set = {bank_species_name(name) for name in revealed_pokemon}'],
    ['fp/search/standard_battles.py', '    existing_pokemon_names = {pkmn.name for pkmn in existing_pokemon}',
      '    from fp.data.sets.roman_bank import bank_species_name\n    existing_pokemon_names = {bank_species_name(pkmn.name) for pkmn in existing_pokemon}'],
    ['fp/search/standard_battles.py', '        for revealed in revealed_set:\n            try:',
      '        for revealed in revealed_set:\n            if revealed not in all_pkmn_counts or all_pkmn_counts[revealed].get(RAW_COUNT, 0) <= 0:\n                continue\n            try:'],
    ['fp/search/standard_battles.py', '        likelihoods[pkmn] = sum(joint_probs) / len(joint_probs)',
      '        likelihoods[pkmn] = sum(joint_probs) / len(joint_probs) if joint_probs else 1.0'],
    ['fp/battle/state.py', '        pokedex_name = normalize_name(pokedex[self.active.name][constants.NAME])',
      '        pokedex_name = normalize_name(pokedex[self.active.name][constants.NAME])\n        # Own active slot is authoritative across custom battle-only form changes.\n        active_rows = [p for p in request_json["side"]["pokemon"] if p.get("active")]\n        if len(active_rows) == 1:\n            active_name = normalize_name(active_rows[0][constants.DETAILS].split(",")[0])\n            if active_name == self.active.name or normalize_name(pokedex.get(active_name, {}).get("baseSpecies", "")) == self.active.base_name:\n                pokedex_name = active_name'],
    ['fp/battle/protocol.py', '    item = normalize_name(split_msg[3].strip())\n\n    if (',
      '    item = normalize_name(split_msg[3].strip())\n    if any("[from] move: " + move in extra for move in ("Trick", "Switcheroo") for extra in split_msg[4:]):\n        side.active.roman_item_changed = True\n\n    if ('],
    ['fp/modes/standard_battle.py', '        self.team_datasets = TeamDatasets()\n        self.smogon_sets = SmogonSets()',
      '        from fp.data.sets.roman_bank import BankTeams, BankPriors\n        self.team_datasets = BankTeams()\n        self.smogon_sets = BankPriors()'],
    ['fp/search/standard_battles.py', 'def sample_pokemon(pkmn: Pokemon, mode):\n',
      'def sample_pokemon(pkmn: Pokemon, mode):\n    from fp.data.sets.roman_bank import sample_bank_pokemon\n    sample_bank_pokemon(pkmn)\n    return\n'],
    ['fp/generations.py', '    return GENERATIONS[generation]',
      '    if generation == "gen7":\n        return replace(GENERATIONS[generation], has_team_preview=False, megas_exist=False)\n    return GENERATIONS[generation]'],
  ];
  const writes = new Map();
  for (const [file, before, after] of patches) {
    const target = path.join(directory,file); let source = writes.get(target) ?? fs.readFileSync(target,'utf8').replace(/\r\n/g,'\n');
    if (!source.includes(after)) {
      if (!source.includes(before)) throw new Error('Patch target changed: ' + file);
      source = source.replace(before,after);
    }
    writes.set(target,source);
  }
  writes.set(path.join(directory,'fp/data/roman-legal.json'),JSON.stringify(require('./legal-space.cjs').catalog(),null,2)+'\n');
  writes.set(path.join(directory,'fp/data/sets/roman_open.py'),fs.readFileSync(path.join(__dirname,'foul-play-open.py'),'utf8'));
  writes.set(path.join(directory,'fp/data/sets/roman_bank.py'), fs.readFileSync(path.join(__dirname,'foul-play-bank.py'),'utf8'));
  for (const [file,source] of writes) fs.writeFileSync(file,source);
}
if(require.main===module) {
  if(!process.argv[2]) throw new Error('Usage: node scripts/battle-bot/prepare-foul-play-bank.cjs FOUL_PLAY_DIR');
  prepareBank(process.argv[2]);console.log('Custom bank inference installed. Set ROMAN_METAGAME_BANK to an absolute bank path.');
}
module.exports = {prepareBank};

