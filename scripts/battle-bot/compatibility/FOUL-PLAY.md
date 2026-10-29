# Foul Play species integration

This is a reproducible species import, not a complete playable integration.
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

## Remaining work

- Compare modified ability/move behavior with this server, rather than assuming
  identifier presence proves parity. Moody is intentionally unused by bots.
- Feed the custom set bank into opponent inference instead of standard usage.
- Install the patched local Python engine with the Gen 7 build feature; do not
  install the default upstream engine from Foul Play's requirements, which uses
  a different feature configuration and lacks these species.
- Check live protocol behavior, no Team Preview lead order, and matched-team
  evaluation against the preserved policy.

No training checkpoints or live bot configuration are modified by preparation.
