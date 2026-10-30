# Separate Foul Play challenge bot

The connector supports an optional `foulPlay` policy using the same Python
decision bridge as the offline benchmarks. Existing heuristic/learned configs
continue using their original policies. No deployment or process-manager
changes are performed by the preparation script.

Requires the already prepared Foul Play checkout, its installed patched Gen 7
engine, Python dependencies, the metagame bank and Node.js 22 or later.

From the Showdown checkout in Windows PowerShell:

```powershell
node scripts/battle-bot/prepare-foul-play-live.cjs --server wss://suajserver.xyz/showdown/websocket --username BenitoMafious --python ../roman-foul-play/.venv/Scripts/python.exe --foul ../roman-foul-play --bank metagame/metagame-bank.json --output scripts/battle-bot/results/benito-live-001
```

This chooses the first eligible complete bank team and validates it with the
server's Gen 7 OU team validator and the custom restrictions. It writes a
configuration and an exported team. No password is accepted or saved.

The pilot accepts Gen 7 OU challenges, one battle at a time, without Megas,
Z-Moves or Moody on its own team. Shadow Tag is allowed. Search time defaults
to 100 ms per request, rather than the offline smoke benchmark's 10 ms.
Optional `allowedUsers` in the generated config can restrict challengers.

Start with an environment-variable password, supplied through a hidden prompt:

```powershell
$secret = Read-Host "Password for BenitoMafious" -AsSecureString
$env:BENITO_PASSWORD = [System.Net.NetworkCredential]::new("", $secret).Password
$env:PYTHONUTF8 = "1"
try {
    node scripts/battle-bot/connect.cjs scripts/battle-bot/results/benito-live-001/config.json
} finally {
    Remove-Item Env:BENITO_PASSWORD -ErrorAction SilentlyContinue
}
```

Wait for `Online as BenitoMafious with Foul Play search`, then challenge the
account through your normal client, or use `/challenge BenitoMafious, gen7ou`.
Keep the terminal open; Ctrl+C stops this bot. It reconnects after transport
disconnects. Login rejection stops reconnection to avoid repeated login attempts.

Credentials go only to the configured HTTPS login service using the existing
authentication implementation. The default is the standard Showdown login
service. No assertions or passwords are logged or passed to the Python bridge;
the configured password variable is removed from that child's environment.
Battle logs contain the bot's player-visible events and its own requests/team,
so treat them as private team information when sharing.

This is a live pilot. Opponent inference is based on the custom bank, with
explicit errors for unsupported contradictory sets. On bridge failure the
connector reports the reason and forfeits that battle. It does not silently
switch to the heuristic. Invalid server choices retain the connector's existing
single default-choice recovery. Full arbitrary-human-team coverage and every
custom mechanic have not been established by the benchmark.

Validation: the real Python bridge completed local WebSocket login/challenge/
choice/logging fixture battles in both player positions. The existing bot
suite also passed (one optional calculator-engine test skipped). The actual
remote account login and human challenge are the next user-side checks.

## Building and rotating teams

`foul-play-roster.cjs` recombines one member of a curated team with another curated set (including same-species set changes). It uses only Carletto–Lugamon, excludes Moody/Megas/Z-Moves, checks Gen 7 legality and preserves any parent hazard, removal, recovery, physical/special offense and fast-member flags. These coarse flags are not a full defensive synergy analysis. It does not yet invent movesets or learn team changes autonomously during live matches.

Each proposed variant plays four offline games against two bank teams, crossing player positions, with Foul Play controlling the variant and the heuristic controlling the opposition. Admission requires at least two wins, no errors and no turn caps. This is a small compatibility/performance screen, not evidence the variant improves on its parent. Original eligible bank teams remain available. Detailed outcomes, rejected candidates and errors are in `screening.json`. Accepted variants are placed first in the roster, followed by bank teams. Selection cycles through all records, persists across restarts, and avoids immediate repeats. Match results are recorded without claiming a learned strength ranking.

From PowerShell in `roman-training` (stop the live bot first):

```powershell
node scripts/battle-bot/foul-play-roster.cjs --bank metagame/metagame-bank.json --python ../roman-foul-play/.venv/Scripts/python.exe --foul ../roman-foul-play --output scripts/battle-bot/results/benito-roster-001 --count 4 --seed 809
node scripts/battle-bot/prepare-foul-play-live.cjs --server wss://suajserver.xyz/showdown/websocket --username BenitoMafious --python ../roman-foul-play/.venv/Scripts/python.exe --foul ../roman-foul-play --bank metagame/metagame-bank.json --roster scripts/battle-bot/results/benito-roster-001/roster.json --output scripts/battle-bot/results/benito-live-002
node scripts/battle-bot/connect.cjs scripts/battle-bot/results/benito-live-002/config.json
```

The last command requires `BENITO_PASSWORD` set as described above. New build runs require a new output directory; change the seed to explore other variants. Stop/restart using the new config after building a new roster. Fixed-team configs continue to work. Search/prediction weaknesses such as overpredicting switches are separate from this team-builder change.

## Open legal-set discovery (preferred)

`discover-metagame.cjs` now uses the server Dex and TeamValidator to export `legal-space.json`: full inherited legal move pools, abilities, items and natures. A set's absence from the human bank is not evidence of illegality. Bank teams supply comparison opponents and bank sets remain optional inference proposals, not hard limits.

Initial candidates are assembled independently using newly generated sets. Later generations explore species, individual moves, abilities, items, natures, legal EV allocations, IVs and lead order. Every candidate passes the custom-only/no-Mega/no-Z/no-Moody guard and whole-team Gen 7 validator. Shadow Tag remains legal. The legality catalog stays complete; default proposals now apply the version 3 coherence rules below. Native identifier support is separately recorded; unsupported identifiers remain visible in the catalog but are not generated for native search. Identifier coverage is not proof of mechanical parity.

Both players use Foul Play. Generations share opponents and seeds for comparisons; archived leaders are re-evaluated and retained for final independent testing instead of disappearing at a generation boundary. Failed matchups are retried once, with both attempt errors preserved. Persistent failures remain incomplete rather than counting as losses or wins. Four-game screens are provisional compatibility checks, not proof of improvement. Larger populations, multiple battle policies and broader evaluations are needed for metagame conclusions.

Opponent inference now draws new legal sets as well as bank proposals. Revealed moves, items and abilities are retained; current PP is preserved. An appearance tracker keeps public move histories separate across switches. It retains a structural Illusion prior (initially 0.1, not an empirically calibrated usage probability), rules out identities using legal learnsets, and resolves public ability/damage/replacement evidence. Called moves do not imply learnset illegality. Unresolved appearance histories are not merged into confirmed species sets. Three sampled hypotheses share each decision's search budget. Live logs include `botsearch` entries with action weights and current identity evidence. This remains an approximation, not an exact joint belief over every hidden team.

### Calculator guidance

`--calculatorEngine PATH` enables neutral-field damage/survival/speed matchup profiles. Without an explicit target file, it profiles sets from two training comparison teams, without using held-out team sets. These are baseline probes, not usage-derived “common attack” frequencies. `calculations.json` records exact target sets, assumptions, ranges, objective outcomes and calculator hash. Unsupported calculations are explicitly unavailable, not silently successful.

`--matchupTargets PATH` optionally reads a JSON array. Each entry has a complete legal `set` for the opponent, optional `forSpecies` limiting the member assigned that job, and a `role`: `check`, `breaker`, `revenge`, or `profile`. Optional fields are `move` (incoming attack to check), `surviveHits` (default 1), `damagePercent` (minimum outgoing damage percentage, default 100 for breaker/revenge), and `outspeed`. A check objective requires survival; revenge requires neutral speed superiority and outgoing damage; breaker requires outgoing damage. For example, target entry structure is `{ "set": { ...complete opponent set... }, "forSpecies": "Pabio", "role": "check", "move": "Focus Blast", "surviveHits": 1 }`.

Specific objectives take priority over the broader profile, which only breaks ties. Calculator-guided mutations compete with ordinary mutations and independent exploration. The guide currently ranks sampled mutations; it is not an exhaustive EV-threshold solver. Profiles assume full HP, no hazards/status/boosts/weather and do not prove a multi-turn counter relationship. Speed includes Scarf/Iron Ball/Macho Brace, not ability/weather activation. Battle results alone rank teams; calculator scores are proposal guidance.

### Windows update and first run

Stop the bot, pull the branch, and reinstall the Python data/adapter patches. No Rust rebuild is needed for this update:

```powershell
git pull --ff-only
node scripts/battle-bot/prepare-foul-play-bank.cjs ../roman-foul-play
node scripts/battle-bot/discover-metagame.cjs --bank metagame/metagame-bank.json --python ../roman-foul-play/.venv/Scripts/python.exe --foul ../roman-foul-play --output scripts/battle-bot/results/benito-discovery-002 --population 4 --generations 2 --seed 1910 --searchMs 30 --calculatorEngine scripts/battle-bot/results/calculator-engine.cjs
```

Archive re-evaluations and retries make battle counts variable. Keep previous run folders intact. To use a new roster, pass its `roster.json` via `--roster` to `prepare-foul-play-live.cjs` with a new output directory, then start that new config as above. Live results are recorded by team; they do not automatically retrain the offline search.

Artifacts include exact teams, every battle/attempt error, generation standings, archived IDs, held-out results, species exposure counts (not causal strength or human usage), the legality catalog and calculator profiles. Existing set banks no longer bound discovery or opponent hypotheses. The current generator and structural priors are starting distributions; the small runs do not establish a settled metagame.


### Generator version 3: basic set coherence

Generation and every mutation now apply the same IV policy: all IVs 31 by default, Attack 0 only when no move is Physical, and Speed 0 only for a deliberately constructed slow Trick Room plan with a setter, 0 Speed EVs and a Speed-lowering nature. Ordinary mutation never randomly lowers IVs. Trick Room plans are a rare initial proposal (5%); removing the setter restores normal Speed IVs/natures. The legality catalog remains complete; generation priors avoid species-locked items on unrelated species, Eviolite on fully evolved species, unsupported terrain seeds, Assault Vest with status moves, and Choice items with incompatible setup/support moves. Abilities with no singles benefit and negative abilities are avoided when the species has useful alternatives. Moves, EVs and natures are checked together; ordinary sets get usable direct attacks and STAB where available, rather than unsupported dependencies and doubles-only moves. These are basic proposal heuristics, not an exhaustive team-synergy engine.

Each generation now faces the same human control panel and battle seeds. Offspring no longer replace those controls. Earlier leaders remain archived. A discovered team needs at least 50% held-out score with no errors/caps to enter the live roster; a 0–4 team cannot enter merely because it ran without crashing. Four games remain too few to claim strength.

Testing also caught a catalog error: a move can be legal through an alternate ability even if illegal with ability slot 0. The catalog now exports the union and per-ability move legality, and inference completes sets from the chosen ability’s move pool. Reinstall these Python/data patches after pulling; no Rust rebuild is required. Use a new output directory:

```powershell
node scripts/battle-bot/prepare-foul-play-bank.cjs ../roman-foul-play
node scripts/battle-bot/discover-metagame.cjs --bank metagame/metagame-bank.json --python ../roman-foul-play/.venv/Scripts/python.exe --foul ../roman-foul-play --output scripts/battle-bot/results/benito-discovery-003 --population 4 --generations 2 --seed 1910 --searchMs 30 --calculatorEngine scripts/battle-bot/results/calculator-engine.cjs
```

## Calculator baseline before team discovery

Run calculator reconnaissance separately, before self-play. Refresh it when the server's legality, calculator engine or target evidence changes. `calc-baseline.cjs` profiles every selectable custom species across native-supported abilities, physical/special/mixed attack plans, physical/special bulk plans, and applicable Life Orb/Choice/Leftovers/Eviolite item variants. It greedily selects complementary coverage moves against exact target sets, weighting accuracy and excluding sacrificial moves from reusable coverage scoring. It then searches 4-EV increments for individual offensive/defensive/speed benchmarks and reallocates remaining investment. These are best-tested proposals under the specified assumptions, not globally optimal sets or proofs of team strength.

`--results` points to a completed discovery folder (`teams.json` and `games.jsonl`). Teams with at least four completed games supply observed success evidence for half the target panel. This does not attribute their success to individual members. The rest of the panel samples fully evolved species across strong-stat/diverse profiles, using bank examples or independently generated legal sets. Candidate eligibility still includes every selectable species, including unevolved species. Baseline targets have equal weight; they are not asserted usage rates or a settled list of threats.

Outputs: `manifest.json` identifies exact targets, assumptions and data/engine hashes. `species.jsonl` contains role/set probes, damage profiles, failed probes and investment searches. `baseline.json` contains the concise role evidence and proposed sets. Defensive evidence uses survival of two strongest incoming hits at full HP in a neutral field; it does not model switching hazards, recovery, setup or context-dependent abilities. Offensive evidence and EV benchmarks are conditional on hits. Support moves and relevant abilities are separately recorded with an unmeasured status, and support exploration proposals are retained rather than scored as ineffective because they deal little direct damage. A missing role probe is `null`, distinct from a measured score of zero.

Use two separate PowerShell commands, running the second only after the first finishes:

```powershell
node scripts/battle-bot/calc-baseline.cjs --bank metagame/metagame-bank.json --calculatorEngine scripts/battle-bot/results/calculator-engine.cjs --results scripts/battle-bot/results/benito-discovery-002 --output scripts/battle-bot/results/calc-baseline-001 --targetCount 24 --seed 2201
```

```powershell
node scripts/battle-bot/discover-metagame.cjs --bank metagame/metagame-bank.json --python ../roman-foul-play/.venv/Scripts/python.exe --foul ../roman-foul-play --calculatorEngine scripts/battle-bot/results/calculator-engine.cjs --baselineFile scripts/battle-bot/results/calc-baseline-001/baseline.json --output scripts/battle-bot/results/benito-discovery-004 --population 4 --generations 2 --seed 2202 --searchMs 30
```

For a smaller calculator diagnostic, `--species rickymartin,pabio,himnassio` restricts only that baseline pass. It does not restrict discovery's species pool. A calculator pass prints progress per species and may take several minutes. It does not run battles or log in to any account.

With `--baselineFile`, each new set attempts a calculator-derived proposal 75% of the time and uses the independent generator otherwise. Role-score floors and an explicit unmeasured support prior retain exploration. Poor defensive evidence reduces proposal priority without banning the species/role. Exact benchmarked spreads survive unrelated mutations; changing the set invalidates their signature and restores coherence repair. `proposal-sources.json` records proposal counts, including rejected proposals, not battle usage. This is not yet a learned posterior or an exhaustive combinatorial search over six-member team synergy.

Holdout opponents must not contain exact target sets from the loaded baseline. The loader checks legality data and the optional active calculator hash. Updating either requires rebuilding the baseline. Battle results still select teams and apply admission checks; calculator scores cannot automatically promote a team into live play.

Potential future bot usernames noted: `BalongaAlso` and `MonsieurBonVoyage`. Neither is configured or launched by this change. Credentials must be supplied outside the repository.

## Preparing the mechanics and baseline stages together

`prepare-research.cjs` performs the two preparation stages sequentially. It does **not** run a discovery tournament, log into an account or change a live roster. Start it from `roman-training` after pulling:

```powershell
node scripts/battle-bot/prepare-research.cjs --hours 8
```

Defaults read `calc-baseline-001/baseline.json`, the existing calculator engine, the Windows Python environment, the metagame bank, and prior `benito-discovery-002` results. Output is `results/research-prep-001`:

1. `mechanics/scenarios.jsonl`: three-turn local Showdown reference scenarios, native search-engine predictions, public events and categorical differences. The suite covers baseline combinations plus representatives of native-supported legal moves and abilities. Opponents take passive, physical and special actions. A synthetic durable fixture prevents target KOs from prematurely ending most cost tests.
2. `mechanics/mechanics.json`: comparison summary, coverage and unresolved cases. Observed failures, lost actions, self stat changes, conditional activation and native errors are distinguished. Tests re-anchor the native engine to each actual reference state. Exact damage rolls/rounding, all field states, volatile timing and full team interactions are not certified. A zero-disagreement result means only no disagreement observed in these scenarios.
3. `baseline/baseline.json`: rebuilt role/move/EV proposals. Direct-damage rankings use moves with no disagreement or dependency observed in the tested nonnegative-ability contexts. Other moves are explicitly deferred. Negative-rated cost-sensitive abilities are deferred from cheap static ranking pending longer evaluation. This is conservative uncertainty handling, not proof those strategies are bad. Support remains unmeasured and preserved for exploration.
4. `summary.json`: current stage and final output paths or error.

The audit has an eight-hour limit by default and stops between scenarios. If it does not complete, the baseline rebuild is withheld. The supervised CLI now applies a shared whole-run deadline to both stages, as described below. Completion may take minutes or longer depending on the machine. Keep the PC awake and terminal open; no power settings are changed. A new run needs a fresh output folder. Intermediate audit detail is saved as it runs, but this preparation command does not promise exact resume after interruption.

This prepares a mechanic-aware **bounded** baseline; it does not complete a universal mechanics evaluator or establish native parity for every possible battle. Inspect disagreements and deferred coverage before authorizing a large self-play experiment. Native-engine fixes require separate reviewed changes and rebuilding the native wheel when necessary.


### Low-load supervised preparation

The preparation CLI now starts a supervised Node worker with a 1 GB V8 heap cap and attempts below-normal process priority. Default work-unit pauses are 100 ms. It still runs one native probe process at a time. These reduce load but are not an exact CPU-percentage cap.

Both stages share a whole-run eight-hour deadline. Checkpoints also enforce a 2 GB Node RSS budget, an approximate 1 GB output budget and a 10 GB remaining-disk reserve. Disk/RSS checks occur between work units, so brief overshoots are possible. The Node RSS budget does not include the native Python process. The supervisor tracks that helper for cleanup if the Node worker fails and force-stops its process tree after a 10-second grace period. Windows uses the built-in taskkill command; no power settings or live-bot processes are changed.

On a controlled limit stop, partial reports remain and `summary.json` explains the reason. An incomplete audit cannot trigger the baseline rebuild. The baseline remains marked incomplete if interrupted. This limits resource use and contains failures; it cannot guarantee a failure-free run or exact resume.

Use a fresh output folder:

```powershell
node scripts/battle-bot/prepare-research.cjs --hours 8 --output scripts/battle-bot/results/research-prep-safe-001
```

Optional CLI limits: `--pauseMs`, `--maxMemoryMB` (Node RSS), `--maxDiskMB`, `--minFreeGB`. The supervisor's 1 GB heap cap is fixed. Keep Windows awake and the terminal open; the monitor can turn off.

### Constrained candidate search

`discover-metagame.cjs` now defaults to `--builder bank`. It preserves complete supplied sets from individual bank entries and training teams, retaining provenance in `candidate-bank.json`. NFEs are initially excluded except Albeerto, Fonsomate and Tiopep; Tiopep is restricted to supplied Toxic Orb + Stealth Rock sets; Fonsomate has an explicit experimental Imposter/Scarf/252 HP candidate. No random move, item, ability or EV changes occur. Mutation replaces one or two complete teammates. `--builder open` retains the old experimental full-learnset mode; `--baselineFile` is only accepted in that mode.

Each generation tests fixed human controls and a balanced generated-team round robin, using both player positions. Selection weights control score and peer score equally; failed/capped matches disqualify leaders. Admission still requires the separate held-out control screen. Holdout excludes exact team combinations, not individual sets; it is not unseen-set validation. The playing policy does not learn. Peer evaluation grows quadratically, so begin with population 4, generations 2. This command does not inherit `prepare-research.cjs` resource supervision.

### User building policy

`building-policy.cjs` records the user's ability/role restrictions. Bank mode rejects incompatible complete sets (reported with reasons), requires actual weather/terrain/Trick Room providers for dependent candidates, and applies soft sampling preferences without altering a supplied set. Virodcan, Gemeluno and Calvivas are excluded. Rattled Carlis is a rare offensively invested experiment; Gooey works for both roles. Minimum Speed is required for the initial Trick Room Abicort and Sheer Force/Life Orb Jamadelpa candidates.

Role inference from move/EV patterns and the preference weights are provisional engineering choices, not battle-derived strength. Dazzling Momontanho's Ladesaurio matchup, Lightning Rod Mermela's team fit, Power of Alchemy's donor acquisition sequence and weather-setting opportunities still need battle verification. Having a provider is necessary but does not establish that setup succeeds. Intact sets that cannot meet these constraints are rejected rather than silently rewritten. Policy reports describe the generation pool, not standard-game legality; original comparison teams remain unchanged.

### Frozen finalist validation

`validate-discovery.cjs --run RESULTS_DIR --bank BANK --python PYTHON --foul FOUL_DIR --output NEW_DIR` freezes every finalist listed in the run's `holdout.json`. Defaults: 12 previously unused human-bank opponent teams, two repeats, both positions, seed 3301, search 30 ms. Six finalists means 288 games. It does not evolve, modify IVs, admit teams, or change the live roster. Team combinations are fresh, not necessarily individual sets. All finalists use the same opponent panel and simulator seeds. Foul Play search itself is stochastic.

The manifest saves frozen teams, panel, settings and bank hash. Per-game JSONL records errors and results without scoring failures as losses. `summary.json` updates after each game; `validForScore` requires completion without errors or turn caps. Bounded per-game traces include simulator events and each side's request, chosen action and Foul Play search output. These are offline diagnostics, not inputs exposing hidden information to agents.

The runner pauses 100 ms between games and checks Node RSS (2 GiB), output size (1 GiB), free space (10 GiB) and elapsed time (8 hours) between games. These are soft checkpoints, not a supervised whole-process resource cap; Python memory is not included. Ctrl+C requests a stop after the current battle. Partial results remain; exact resume is not implemented.

### Inference and search diagnostics

`diagnose-validation.cjs --run VALIDATION_DIR --bank BANK --python PYTHON --foul FOUL_DIR --output NEW_DIR` reruns validation games 37,38,57,101,205,217 with diagnostics explicitly enabled. These are stochastic reruns, not reconstructions of historical positions. Each decision includes the tracked own/observed opponent state, sampled inferred teams and exact serialized native states. Agents still receive only private own-team requests and player-visible events. Diagnostic output is disabled for ordinary/live play, including when an inherited diagnostic environment variable is set.

After each game, `replay-native-search.py` compares budgets 30/100/300 ms, three repetitions each, on up to 12 captured positions (prioritizing low-HP passers and boosted Ladesaurio). Every search starts from a fresh instance of the same serialized state; opponents are not resampled during the comparison. Outputs contain visit allocations and mean internal search scores, not calibrated win probabilities or proof of an optimal move. This isolates budget effects conditional on a fixed inference; it does not certify mechanics or inference accuracy. Trace size is bounded at 32 MiB/game; budget comparison is withheld if truncated. No automatic strategy overrides, training or live changes occur.

### Evidence-driven opponent priors

Opponent inference now draws only from compatible supplied bank sets while any remain. These are uncalibrated priors, not assertions that all opponents use bank sets. Revealed moves, item and ability information take precedence; an out-of-bank observation opens completion from a nearby ability-compatible template or a structured full-learnset fallback. Fallbacks use offensive-stat-aligned spreads, ranked STAB/coverage/support moves and purposeful generic items rather than uniform random moves/items/EVs. This is a conservative heuristic, not a learned set-quality model. Novel unobserved sets are not explored while an exact compatible bank prior remains.

Synthetic seeds for species missing supplied sets are marked as generated; they are not reported as human-bank evidence. Diagnostic snapshots include `roman_hypothesis_source` and `roman_compatible_bank_count`. Transformed public states continue bypassing original-species resampling. Apply Python changes with `prepare-foul-play-bank.cjs`; no Rust rebuild is needed. Full integration tests: run `verify-foul-play-bank.py` from the prepared Foul Play directory with `ROMAN_METAGAME_BANK` set. No user building restrictions are imposed on observed opponent legality.

### Sequence checks and shared weaknesses

Before another broad validation, run the offline sequence comparison:

```powershell
node scripts/battle-bot/mechanics-sequences.cjs --python ../roman-foul-play/.venv/Scripts/python.exe --output scripts/battle-bot/results/mechanics-sequences-001
```

This writes `sequences.json`: consecutive Endure, Baton Pass with Attack/Speed boosts and Substitute, and a lethal Stealth Rock switch followed by replacement and an attack. Each step converts the current Showdown fixture into native state, enumerates native branches, and compares joint categorical outcomes, including boosts, Substitute and forced switches. Inspect errors and disagreements before treating anything as engine parity. The pass fixture uses a harmless opposing move; arbitrary interrupted damaging replies are not covered. The hazard fixture checks continuation mechanics, not the strategic value of sacrificing. No Rust source changes or Rust rebuild are required. The native comparison must be run with the installed custom engine; simulator-only tests do not certify native agreement.

Bank construction and mutation now choose the lowest shared attack-type exposure among eight legal complete-set proposals, retaining 20% unfiltered exploration. Threats are the eligible supplied sets, weighted equally by set, not measured usage. Multiple weaknesses with zero resistant answers are penalized more heavily than dependence on one resistant answer; a second answer reduces that penalty. Coverage moves and the implemented immunity abilities matter. This is a conservative type/ability heuristic, not a damage calculation or a guarantee that a teammate survives, outspeeds or counters the threat. It preserves set fields and existing legality/building policy. Selection details are recorded in `candidate-bank.json`. Existing results are unchanged; new discovery runs use the new selection. Live rosters are unchanged.
