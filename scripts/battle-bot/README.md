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

## Learned decisions and six challengeable Roman bots

The initial six policies are in the private training-log archive. Extract it into `scripts/battle-bot/results/`; it contains `roman-six-roster-001/` and `roman-six-training-001/`. Generated models, teams and logs are not published with the source code. They use a small linear softmax policy trained with REINFORCE, not Metamon pretrained weights. A policy receives only its private request and public battle events. It scores legal attacks, Mega/Ultra/Z variants, and switches using bounded tactical features and hashed action identities. Terminal wins/losses produce actual parameter updates. Candidate features include approximate damage, health, boosts, recovery, hazards, status and switch matchup. Custom callbacks are executed by the real simulator during training, but the model has no explicit understanding of every ability. This is a first trainable model, not an expert agent.

Training mixes frozen older policies and the heuristic opponent. Teams are held fixed during a run to separate policy learning from team evolution. A separate validation team pool selects `best.json`; this reused validation score is not an unbiased final test. Evaluation is deterministic, training samples actions, and no parameters change during live human challenges. `latest.json` may perform worse than `best.json`. Saved policy fingerprint checks require matching simulator/data source; rebuild before training and deployment.

Train a new run from the repository root:

```sh
node scripts/battle-bot/train.cjs --episodes 240 --eval-every 40 --eval-pairs 4 --output scripts/battle-bot/results/roman-learning-002
```

Outputs include `initial.json`, `latest.json`, `best.json`, a checkpoint per evaluation in `checkpoints/`, `metrics.csv`, `report.json`, battle logs with seeds/decisions, an exported team, and `bot.json` for one challenge bot. Extend a saved policy using `--resume PATH/latest.json` with a fresh output directory. This warm-starts the policy and reward baseline; it is not an exact continuation of the former opponent archive or RNG stream. Useful options: `--seed`, `--rate`, `--max-turns`, `--server`, and `--name`.

To create a six-bot roster from at least six distinct trained checkpoints:

```sh
node scripts/battle-bot/roster.cjs scripts/battle-bot/results/roman-learning-002 --pairs 8 --output scripts/battle-bot/results/roman-roster-002
```

The roster tests all 15 policy pairs with swapped sides and common team matchups, then assigns names in ascending measured score:

1. Roman-0009
2. Roman-003
3. Roman-016
4. Roman-021
5. Roman-062
6. Roman-162

This is a provisional ranking, not a guarantee of strictly separated skill or head-to-head victories. Mirrored seeded games are correlated; the reported counts should not be interpreted as independent samples for significance testing. More training time does not guarantee better policies. Rerun evaluation on different seeds and more teams before making strong strength claims.

### Put all six online

Requires Node.js 22 or later and the same built server data. The initial roster is ready to load:

```sh
node scripts/battle-bot/connect.cjs scripts/battle-bot/results/roman-six-roster-001/bots.json
```

The supplied config points to `ws://localhost:8000/showdown/websocket`. Edit `server` for all six entries if needed. Each connects as a separate named user, joins the lobby, and accepts Gen 7 OU challenges. On your client, use `/challenge Roman-016, gen7ou` or open that username and click Challenge. The six bots initially share the same custom-only team so policy comparisons are not confounded by team quality. Generated rosters work the same way with their `bots.json`.

If names are registered, add a different `passwordEnv` to each account and set those environment variables; the client uses the configured HTTPS login service. No credentials are bundled. Do not disable the live server's security settings. Keep the client process running, using your normal process manager if desired. It reconnects after connection loss, but the supplied scripts are not installed as a background service automatically. Start training as a separate process so an in-progress run does not change an active opponent's policy.

Each account writes live protocol logs and decisions to its `logDirectory`, with outcomes in `matches.jsonl`. Live logs contain that bot's own private battle requests; keep them under your control. No chat messages are sent automatically. For multiple accounts with the same base username, Showdown treats punctuation/case as insignificant; the six supplied names have distinct normalized IDs.

Initial evidence: 240 policy-training battles plus 56 validation battles, followed by a 240-battle six-policy round robin. `roman-six-roster-001/ranking.json`, `roman-six-training-001/report.json`, `roman-six-training-001/metrics.csv` and the runs' `battles.jsonl` files provide the saved summaries. These measurements apply to this limited team pool and policy representation. Human strength is unmeasured. Local simulator and WebSocket-fixture tests passed; deployment to the user's live server has not been performed.
