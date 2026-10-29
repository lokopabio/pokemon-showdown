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
