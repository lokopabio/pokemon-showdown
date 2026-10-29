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

For registered accounts, add `"passwordEnv": "UAJ_BOT_PASSWORD"` and set that environment variable before starting. Passwords are never stored in the configuration. The default login endpoint is https://play.pokemonshowdown.com/action.php. Set `loginServer` if your server uses another HTTPS login service. Unregistered names request signed assertions from the login service; registered names require passwordEnv. The live server security settings remain enabled.

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

Training mixes frozen older policies and the heuristic opponent. Training teams rotate periodically from a configurable legal Fakemon pool. Validation teams remain fixed and are never inserted into that pool. A separate validation team pool selects `best.json`; this reused validation score is not an unbiased final test. Evaluation is deterministic, training samples actions, and no parameters change during live human challenges. `latest.json` may perform worse than `best.json`. Saved policy fingerprint checks require matching simulator/data source; rebuild before training and deployment.

Train a new run from the repository root:

```sh
node scripts/battle-bot/train.cjs --episodes 240 --eval-every 40 --eval-pairs 4 --output scripts/battle-bot/results/roman-learning-002
```

Outputs include `initial.json`, `latest.json`, `best.json`, a checkpoint per evaluation in `checkpoints/`, `metrics.csv`, `report.json`, battle logs with seeds/decisions, an exported team, and `bot.json` for one challenge bot. Extend a saved policy using `--resume PATH/latest.json` with a fresh output directory. This warm-starts the policy and reward baseline; it is not an exact continuation of the former opponent archive or RNG stream. Useful options: `--seed`, `--rate`, `--max-turns`, `--server`, and `--name`.

To create a six-bot roster from at least six distinct trained checkpoints:

```sh
node scripts/battle-bot/roster.cjs scripts/battle-bot/results/roman-learning-002 --pairs 8 --output scripts/battle-bot/results/roman-roster-002
```

The roster tests all 15 policy pairs with both team assignments and both player positions (four games per team pair), then assigns names in ascending measured score:

1. Roman-0009
2. Roman-003
3. Roman-016
4. Roman-021
5. Roman-062
6. Roman-162

This is a provisional ranking, not a guarantee of strictly separated skill or head-to-head victories. Mirrored seeded games are correlated; the reported counts should not be interpreted as independent samples for significance testing. More training time does not guarantee better policies. Rerun evaluation on different seeds and more teams before making strong strength claims.

Evaluation version 2 fixes a confound in earlier roster reports: those swapped
player positions but kept each checkpoint's team ownership fixed within a
matchup. Earlier differences may reflect team assignment and cannot establish
training regression. New reports include `evaluationVersion: 2` and run
`60 * pairs` battles, twice the old total.

### Put all six online

Requires Node.js 22 or later and the same built server data. The initial roster is ready to load:

```sh
node scripts/battle-bot/connect.cjs scripts/battle-bot/results/roman-six-roster-001/bots.json
```

The supplied config points to `ws://localhost:8000/showdown/websocket`. Edit `server` for all six entries if needed. Each connects as a separate named user, joins the lobby, and accepts Gen 7 OU challenges. On your client, use `/challenge Roman-016, gen7ou` or open that username and click Challenge. The six bots initially share the same custom-only team so policy comparisons are not confounded by team quality. Generated rosters work the same way with their `bots.json`.

If names are registered, add a different `passwordEnv` to each account and set those environment variables; the client uses the configured HTTPS login service. No credentials are bundled. Do not disable the live server's security settings. Keep the client process running, using your normal process manager if desired. It reconnects after connection loss, but the supplied scripts are not installed as a background service automatically. Start training as a separate process so an in-progress run does not change an active opponent's policy.

Each account writes live protocol logs and decisions to its `logDirectory`, with outcomes in `matches.jsonl`. Live logs contain that bot's own private battle requests; keep them under your control. No chat messages are sent automatically. For multiple accounts with the same base username, Showdown treats punctuation/case as insignificant; the six supplied names have distinct normalized IDs.

Initial evidence: 240 policy-training battles plus 56 validation battles, followed by a 240-battle six-policy round robin. `roman-six-roster-001/ranking.json`, `roman-six-training-001/report.json`, `roman-six-training-001/metrics.csv` and the runs' `battles.jsonl` files provide the saved summaries. These measurements apply to this limited team pool and policy representation. Human strength is unmeasured. Local simulator and WebSocket-fixture tests passed; deployment to the user's live server has not been performed.


## Trainer v2: richer observations and CPU workers

New models use schema 2 and 248 action features. The original schema-1 checkpoints load by appending zero weights for new features, preserving their logits. Saving an upgraded checkpoint writes schema 2; update the challenge client before deploying new models. Fingerprints now normalize path separators and CRLF/LF line endings so new Windows-trained models can load on Linux when simulator/data sources match. Legacy Windows checkpoints can be loaded on the Windows host that created them and resaved with canonical fingerprints.

The policy now tracks revealed opponent moves/items/abilities per visible identity, own held items/abilities from private requests, status, weather, terrain and Trick Room. Features include item/move and ability/type interactions, contact risk, recovery, known immunity clues, and switches against revealed coverage. Unknown enemy attributes remain unknown. These are tactical input features, not exact damage calculations or a complete interpretation of arbitrary custom callbacks. Mega/Ultra variants currently use pre-transformation feature estimates. Identity changes/Illusion, volatile ability changes, item suppression, grounding, exact speed and every battle effect are not comprehensively modeled.

Gen 7 OU is checked to exclude Team Preview. Slot 1 always leads in each supplied team. The decision policy learns actions after entry; it does not choose the lead before battle. Team generation/mutation controls ordering independently. A regression battle verifies that the supplied slot-1 Pokemon actually starts for both players without a preview request.

Defaults: 64 training teams, replacing one quarter every 100 episodes, and a mixture of heuristic, uniform-random, initial-policy and archived-policy opponents. Validation rotates among heuristic, frozen initial and uniform opponents; it remains reused for model selection. New team pools are saved in `team-pools.jsonl` for inspection. Generation uses this fork's validator and the same Carletto-onward custom whitelist.

`--workers 4` runs persistent CPU worker threads. Each synchronous batch uses one frozen learner snapshot, returns policy gradients, and applies their average centrally in episode order. No simultaneous shared-weight writes occur. A fixed seed and worker count are reproducible; changing the worker count changes batch size and training dynamics. Parallelism has startup and communication costs and is not guaranteed faster for short runs. Start with four workers on the desktop, not on the shared VPS.

`--log-every 25` records detailed training logs every 25 episodes; `--log-every 1` records all. Every battle still has summary metadata in `battles.jsonl` and `metrics.csv`. Validation battles keep full logs. Unsampled battles avoid collecting full protocol/choice arrays in memory. Logs contain training teams; keep generated results private.

Example desktop benchmark from the repository root:

```sh
time node scripts/battle-bot/train.cjs --episodes 1000 --eval-every 200 --eval-pairs 24 --workers 4 --team-pool 64 --refresh-every 100 --log-every 25 --seed 29 --output scripts/battle-bot/results/pc-v2-001
```

For a warm start, add `--resume scripts/battle-bot/results/pc-benchmark-001/best.json`. This keeps learned weights but starts a fresh opponent archive and team pool; it does not reproduce continuation of the earlier run. The live VPS bots do not change until you explicitly copy a new checkpoint and restart their client. Compare repeated seeds and a separate test pool before claiming improvement from the larger model.

## Private metagame suggestions and adaptive live teams

`train.cjs` and `breed.cjs` accept `--metagame-bank PATH/metagame-bank.json`. The private bank is a JSON object with `schema: 1`, `format: "gen7ou"`, `sets` entries containing `set`, and optional `teams` entries containing ordered six-member `team` arrays. All suggestions are revalidated; illegal/custom-out-of-scope sets and Z-Crystals fail loading. Team order, EVs, IVs, items and empty item slots are preserved. Cosmetic nicknames/shininess are ignored for set deduplication, not removed from the stored source data.

Complete human teams are sampled as starting candidates alongside generated teams. Suggested individual sets are available alongside synthetic sets, and set mutation can try a suggestion. No usage frequency or win-rate prior is inferred from archive repetition or a human label of "good". The trainer separates the imported full-team list into roughly two-thirds training and one-third validation seeds. Individual sets and near-duplicate cores can still overlap, so validation is not an independent metagame test. Input file changes do not update already running bots.

Live adaptation is opt-in. Prepare a new config next to the existing one:

```sh
node scripts/battle-bot/prepare-live.cjs PATH/bots-active.json PATH/metagame-bank.json PATH/bots-adaptive.json
node scripts/battle-bot/connect.cjs PATH/bots-adaptive.json
```

Preparation creates 12 legal candidates per account, seeded by its original team, complete teams from the bank, and legal mutations. A legacy seed holding a Z-Crystal is replaced with a bank team; original files are left intact. Both commands require the updated source and the private bank locally. Credential environment references are preserved. If output config already exists, choose another name. Do not run two clients using the same bot names at once.

Each account owns a separate persistent pool file, scoped to its model weights and simulator fingerprint. The picker avoids consecutive repeats, favours smoothed observed results with an uncertainty bonus, and explores randomly 20% of the time. Wins, losses and ties from completed live battles update the exact selected team only after a matching format/opponent/player room is identified. Disconnects and room removal do not count as losses. Duplicate result events do not increment statistics twice. Pool writes are atomic. Use one client process per pool file and `maxBattles: 1`; shared-file concurrent writers and overlapping adaptive matches are not supported.

Every five completed games it can replace a tested weaker candidate with a legal mutation of a better-scoring one; retired results remain in a bounded archive. These variants are live experiments, not pre-validated stronger teams. Selection scores are opponent-dependent, and a few human matches do not establish reliable team quality. The selector updates team preferences only; battle decision weights remain frozen. A changed model/account requires a fresh pool state path. New states are opt-in and do not alter the existing fixed-team configuration.

Pool JSON records candidate teams, wins/losses/ties, provenance and archived variants. Match logs include `teamId` so results can be traced to the submitted lineup. Inspect these files locally; generated teams and metagame suggestions are not included in the public source repository.

## Optional custom damage-calculator integration

The bot can call the engine from your `lokopabio/damage-calc` fork directly. It does not control the calculator webpage or send hidden teams to a remote service. Clone that fork in a separate directory and compile a standalone engine using this repository's existing esbuild dependency:

```sh
git clone https://github.com/lokopabio/damage-calc.git ../roman-calculator
node scripts/battle-bot/build-calculator.cjs ../roman-calculator scripts/battle-bot/results/calculator-engine.cjs
```

Enable it during training with `--calculator-engine scripts/battle-bot/results/calculator-engine.cjs`, alongside `--metagame-bank metagame/metagame-bank.json`. The engine checksum is saved in checkpoints; loading a calculator-trained checkpoint requires the same engine build. `roster.cjs` accepts the same two flags. The generated single-bot and roster configs include a `calculator` object with `enginePath` and `bankFile`. Paths must exist on the deployment host; change PC-specific paths when copying to OVH. Existing non-calculator checkpoints continue to work without this option.

The evaluator supplies only each policy's own full team, preserving set details and move order. The live client supplies the submitted team (including an adaptive selection). Opponent sets come from matching the private metagame bank to publicly revealed moves, items and abilities. Unknown opponents' true teams are never read from the simulator. If no bank sets match, a few generic defensive spreads/possible abilities are explicitly labelled assumptions; unknown items then default to no item, which is not exhaustive. At most three evenly sampled matching scenarios are calculated per decision by default. Matching archive sets is a hypothesis filter, not calibrated probability inference or observed-damage EV inference.

Move scoring uses conditional-on-hit damage ranges across these scenarios and a basic accuracy adjustment. Switch features incorporate the largest damage among revealed enemy attacks (or hypothesized attacks when none are revealed). The calculator does not choose strategy on its own, and this is not multi-turn search. The adapter passes source stats/types, items, abilities, boosts, health, status, weather, terrain and basic screens. It does not yet represent every volatile, defensive item trigger, grounding effect, critical-hit probability, Mega decision, ability activation flag or custom callback accurately. In particular, the fork currently hard-codes Final Verdict Judgment as Electric, while the simulator varies it by moveslot. That matchup is marked unsupported and falls back to the original approximate scorer rather than trusting a wrong result.

Full sampled logs include `calculator` scenario explanations; live logs include `botcalc`; per-battle metadata records engine checksums and unavailable-estimate counts. Calculation failures fall back to approximate features and are reported, rather than stopping all play. Calculator calls add CPU cost: benchmark a short run before launching large training jobs or enabling all live accounts.

For the optional fork integration test, set `ROMAN_TEST_CALC_ENGINE` to the built module before running `node --test scripts/battle-bot/test.cjs`. The rest of the test suite does not require a calculator checkout. The custom fork's engine is used as-is and must be independently checked against the battle simulator for mechanics you rely on. Do not assume adding damage calculations improves a trained policy: compare fresh calculator-backed checkpoints with the retained baseline on separate human-team and generated-team evaluations.
