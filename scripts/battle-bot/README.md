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
