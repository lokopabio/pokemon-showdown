# Foul Play species integration

This is a reproducible development integration with an offline battle adapter.
It is not a production deployment or a verified strength improvement.
The server itself is not changed. Own teams must contain six species from
Carletto through Lugamon, inclusive. Mega Evolutions, Mega Stones, Z-Crystals,
and Moody are excluded. Shadow Tag is allowed. Opponent data is not restricted
by the own-team guard.

The importer reads the built server's Gen 7 Dex. It found 115 selectable
non-Mega entries in the source used for initial validation. The current
source, rather than an assumed fixed species count, determines the import.
Types, stats, weights, and abilities come directly from that Dex. Rust species
identifiers and base-stat mappings are generated; Foul Play gets its expected
Pokedex schema. Unrecognized upstream revisions are rejected.

## Prepare pinned checkouts

Run from the Showdown repository after `node build`. Use separate development
checkouts: preparation edits their source files. Re-running it is supported.

```bash
git clone https://github.com/pmariglia/poke-engine.git ../roman-poke-engine
git -C ../roman-poke-engine checkout f7b147f13637ceecc1b0d1e9172ec232af4d45d0
git clone https://github.com/pmariglia/foul-play.git ../roman-foul-play
git -C ../roman-foul-play checkout 8f541f80f91f960603673796559f796b10ccf0fb
node scripts/battle-bot/prepare-foul-play.cjs ../roman-poke-engine ../roman-foul-play
```

## Verify

Requires Rust for native engine tests and Python for the Foul Play data checks.

```bash
cargo test --manifest-path ../roman-poke-engine/Cargo.toml --no-default-features --features gen7
cd ../roman-foul-play
python ../pokemon-showdown/scripts/battle-bot/verify-foul-play.py
```

The Python script path should point to your actual Showdown checkout (for
example `../roman-training/scripts/battle-bot/verify-foul-play.py` on your PC).
Tests validate every imported species and the own-team guards. Native tests
also verify Shadow Tag trapping, opposing Shadow Tag immunity, Ghost immunity,
and Shed Shell. The importer fixes upstream's opposing Shadow Tag immunity.

## Custom inference and local test battle

After preparing both checkouts, install the patched Gen 7 Python engine:

```bash
python -m pip install ./../roman-poke-engine/poke-engine-py --config-settings="build-args=--features poke-engine/gen7 --no-default-features"
python -m pip install requests python-dateutil websockets==14.1
node scripts/battle-bot/prepare-foul-play-bank.cjs ../roman-foul-play
```

This patches only the separate Foul Play checkout. Standard battle mode then
uses the local bank exclusively; set `ROMAN_METAGAME_BANK` to the absolute bank
path. Guesses must match revealed information; a missing compatible hypothesis
raises an explicit error rather than quietly contradicting observations.
Unrevealed species use uniform positive priors over species represented in the
bank, not claimed empirical usage or access to the opponent's hidden team.
Gen 7 preview and Mega inference are disabled in this development checkout.

Run from the Showdown repository using two exported teams:

```bash
node scripts/battle-bot/foul-play-smoke.cjs python ../roman-foul-play metagame/metagame-bank.json team1.txt team2.txt
node scripts/battle-bot/check-foul-play-moves.cjs ../roman-poke-engine metagame/metagame-bank.json
cargo test --manifest-path ../roman-poke-engine/Cargo.toml --no-default-features --features gen7 --test roman_move_parity
```

The smoke adapter runs an actual Showdown BattleStream and gives Foul Play only
its player stream and own request. It searches one sampled state for 10 ms per
decision by default (`ROMAN_SEARCH_MS` can change this). Its opponent is the
existing fixed heuristic, not the episode-160 learned checkpoint. Own teams
pass both the custom restrictions and the server's Gen 7 OU validator.
The function API supports either player position; the CLI uses player 1.
Battles stop at 150 turns and capped results are explicitly marked.

Run the bank tests from the prepared Foul Play checkout, with the environment
variable above set:

```bash
python ../pokemon-showdown/scripts/battle-bot/verify-foul-play-bank.py
```

Use the actual Showdown directory name in that path.

## Remaining work

- Compare modified ability/move behavior with this server, rather than assuming
  identifier presence proves parity. Moody is intentionally unused by bots.
- Expand hypotheses when reveals invalidate every bank candidate; currently
  this stops with a diagnostic. No relaxed, contradictory fallback is used.
- Check full WebSocket connection behavior and matched-team evaluation against
  the preserved learned policy. Offline BattleStream tests already complete.

Initial checks: five uncapped local battles completed, including player slot 2;
all were wins against the heuristic. This tiny smoke sample is not a strength
estimate. Bank tests cover zero usage-network calls and preservation of revealed
move PP, ability and item. Fixed-power assertions do not verify full mechanics.
The available initial server source reports Twin Beam 40 and Mega Punch 80;
earlier requested buffs to 60/100 are not present in that source. The audit reads
the built server and will expose future differences rather than silently
overriding either engine.

No training checkpoints or live bot configuration are modified by preparation.
