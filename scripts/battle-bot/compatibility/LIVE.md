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

## Empirical metagame discovery (preferred)

Use `discover-metagame.cjs` when the goal is to discover teams independently of human compositions. Initial candidates assemble six legal members from the bank's set inventory. Subsequent generations allocate half the population to independent exploration and half to recombinations of measured leaders. Human teams are comparison opponents, not assumed champions. No hand-written team-role preservation rules are imposed in this mode.

Both sides use Foul Play. Each candidate faces the same two opponents and battle seeds within its generation, in both player positions. Later generations face a discovered leader as one opponent. Final leaders face two disjoint human-bank holdout teams. Results are provisional and depend on this search policy's weaknesses; the held-out human opponents alone do not establish metagame dominance. The current implementation explores team composition and existing set choices, not new movesets. Exhaustive species/move coverage and large independent evaluations remain future work.

Artifacts: `manifest.json` identifies the bank and schedule parameters; `teams.json` stores exact teams; `games.jsonl` stores every matchup, seed, result and error; `search.json` stores generation standings; `holdout.json` stores independent results; `metagame.json` stores species exposure and associated team points. `roster.json` contains compatible tested discoveries plus two human-bank controls for live rotation. Capped held-out runs and errors prevent admission. Rankings use measured team results, never training age. Live results are stored per selected team, but do not automatically retrain this offline search.

First discovery run, from PowerShell:

```powershell
node scripts/battle-bot/discover-metagame.cjs --bank metagame/metagame-bank.json --python ../roman-foul-play/.venv/Scripts/python.exe --foul ../roman-foul-play --output scripts/battle-bot/results/benito-discovery-001 --population 8 --generations 2 --seed 1909 --searchMs 10
```

This schedules 64 search battles and up to 16 held-out battles. Use its `roster.json` with the live preparer's `--roster` option instead of the variant-builder roster. Large runs should follow validation of search behavior and custom mechanic parity; more battles cannot correct a consistently faulty policy.
