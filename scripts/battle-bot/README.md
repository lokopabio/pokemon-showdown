# Custom server battle bot: first playable version

Requires Node.js 22 or later. Run from the pokemon-showdown repository root.

## Start

1. Install dependencies with `npm ci` and build with `node build`.
2. Copy `scripts/battle-bot/config.example.json` to `scripts/battle-bot/config.json`.
3. Export a legal team from your teambuilder as text and save it as `scripts/battle-bot/team.txt`.
4. Set `server` to your server's WebSocket endpoint (usually `ws://HOST:PORT/showdown/websocket`, or `wss://HOST/showdown/websocket` behind HTTPS).
5. Set `username` to a dedicated bot account name.
6. Run `node scripts/battle-bot/connect.cjs` and challenge that account in Gen 7 OU.

Team paths are relative to the configuration file. The bot validates teams before connecting. Use actual format IDs as keys in `teams`. This fork's Gen 7 OU ID is `gen7ou`. Only singles are supported. An empty `allowedUsers` list allows challenges from anyone; supply usernames to restrict opponents.

For registered accounts, add `"passwordEnv": "UAJ_BOT_PASSWORD"` and set that environment variable before starting. Passwords are never stored in the configuration. The default login endpoint is https://play.pokemonshowdown.com/action.php. Set `loginServer` if your server uses another HTTPS login service. Guest login works only where the server permits it.

For multiple bots, use a JSON array of configurations with distinct usernames. One process opens a separate connection for each account. Keep `maxBattles` at 1 for initial use. The limit counts observed battle rooms, so simultaneous incoming challenges can briefly exceed it.

## Local evaluation

`node scripts/battle-bot/evaluate.cjs gen7customgame team1.txt team2.txt 20`

Runs the heuristic policy against a simple attack baseline in the actual simulator. Each side receives its own private requests and public battle events, without reading the opponent's hidden team. Seeds vary per battle. Battles are capped at 300 turns. This is a functional evaluation harness, not a strength benchmark or training system.

`node --test scripts/battle-bot/test.cjs`

## Current decisions and limits

Reads the selected format's Dex directly, including custom species and move powers. Scores attacks using approximate damage, typing, accuracy, priority and recoil. Considers recovery, status, early hazards, switching, Mega Evolution, Ultra Burst and Z-Moves. Reconnects after connection loss, and falls back to the server's default choice after a rejected decision.

This is a heuristic first version, not a learned agent. It does not yet simulate candidate turns, model every custom ability, infer hidden sets, track hazards and boosts comprehensively, or evaluate weather and items accurately. Loading custom data does not mean understanding arbitrary ability callbacks. Automatic Mega Evolution and simple setup scoring can be strategically poor. Dynamax and Terastallization decisions are not implemented. Training and stronger search are subsequent work.

Tests cover legal choice handling, opponent tracking, immunities, custom species loading, Mega/Z choice generation, six complete simulated battles (including Carletto), and login/challenge/choice messages against a local WebSocket fixture. Registered-account login and deployment to your live server require separate verification.

## Battle-tested Fakemon team builder

Run from the repository root:

```
node scripts/battle-bot/breed.cjs --population 8 --generations 3 --opponents 3 --seed 1
```

The builder uses **Gen 7 OU**. Its species whitelist starts at Carletto in this fork's Pokédex source order, includes only negative-numbered custom species, and excludes direct entry with battle-only or Mega forms. All six-member teams and generated sets must pass the actual Gen 7 OU validator. Mega stones and Z-Crystals are considered, but banned forms/items are rejected by validation. Lower evolutionary stages remain eligible. The initial population favors higher base-stat totals; mutation explores the entire eligible pool.

It generates sets with varied moves, abilities, items, offensive EV spreads and natures. It plays each candidate against a fixed generated opponent pool with the same heuristic policy on both sides. Every matchup runs twice with reversed sides and a shared battle seed. Wins score 1, ties score 0.5, losses score 0. Better teams survive, and children replace a member, regenerate a set, or change the lead. Elite teams are retained unchanged. Repeated seed values reproduce candidate generation and battle randomness. This is evolutionary team search, **not training the battle policy**.

Defaults run 144 selection battles plus 6 held-out battles. `--population`, `--generations` and `--opponents` increase the search. `--max-turns 200` controls the cap, which counts as a tie. Final evaluation uses separate generated teams and different battle seeds; these held-out results do not affect selection. There is no guarantee of improvement against humans or unseen strategies, and the fixed opponent pool can be overfit. Generated sets use a limited family of EV spreads, not unrestricted optimization.

Results are written after each generation to `scripts/battle-bot/results/`:

- `best.txt`: winning team in teambuilder import format, ready for manual inspection or bot use.
- `checkpoint.json`: last completed generation, ranked teams, options and progress history. This is an inspection checkpoint; automatic resume is not implemented.
- `opponents.json`: training and held-out teams for inspection.
- `report.json`: final selection history and separate held-out score.

Use `--output PATH` for a separate run directory. Each run requires a new or empty output directory to preserve previous logs. To play the exported team, set the connection config's team path to `"gen7ou": "results/best.txt"` (relative to the config in this directory). Multiple accounts can use outputs from different seeds.


## Running Roman-016 on your server and inspecting results

Training runs are ordinary Node.js processes using this fork's in-process battle simulator. They do not need a browser, GPU, online battle rooms, or a running Showdown WebSocket server. Run them alongside Showdown using the same checkout and built data, with Node.js 22 or later. They consume CPU, so start small on a shared server. No training job has been deployed automatically.

From the repository root, after fetching this branch, installing dependencies and building:

```sh
node scripts/battle-bot/breed.cjs --name Roman-016 --population 8 --generations 3 --opponents 3 --output scripts/battle-bot/results/roman-run-001
```

On a Linux host, to keep a run alive after disconnecting and capture progress:

```sh
mkdir -p scripts/battle-bot/results/console
nohup node scripts/battle-bot/breed.cjs --name Roman-016 --output scripts/battle-bot/results/roman-run-002 > scripts/battle-bot/results/console/roman-run-002.log 2>&1 &
```

Access these files through your server's terminal, SFTP or file manager:

| File | Contents |
| --- | --- |
| `run.json` | Bot name, settings, Node version and start timestamp |
| `battles.csv` | Spreadsheet-friendly per-battle outcome, side, generation, candidate, opponent, turn count, turn-cap flag and duration |
| `battles.jsonl` | Same battle index with simulator seeds and player names |
| `battles/*.log` | Turn-by-turn simulator battle protocol |
| `battles/*.log.json` | Both complete teams, seed, result and submitted decisions for reproducing a matchup |
| `checkpoint.json` | Generation rankings, full teams and selection scores |
| `report.json` | Final selection history and separate held-out wins/losses/ties |
| `best.txt` | Importable champion team |

The detailed logs intentionally include both training teams and omniscient simulator events, and are written only by the evaluator. Playing policies still receive their own player streams. These are local protocol logs, not uploaded Showdown replay URLs, and there is no browser dashboard yet. The last completed generation remains available if a run stops early; individual completed battles are indexed immediately. A final report appears only on successful completion.

To put the exported champion online, copy the example connection config, keep `username` as `Roman-016`, and set its `gen7ou` team path to `results/roman-run-001/best.txt`. Then run `node scripts/battle-bot/connect.cjs`. Training logs describe local evaluation battles; the connection client does not yet persist live match logs.
