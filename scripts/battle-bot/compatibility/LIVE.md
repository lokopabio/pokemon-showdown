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
