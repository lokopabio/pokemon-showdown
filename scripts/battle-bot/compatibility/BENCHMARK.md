# Foul Play development benchmark, 2026-10-29

The final corrected run completed all 48 scheduled games: **34 Foul Play wins,
13 learned-policy wins, and one turn-cap tie**. No games crashed. The cap was
150 turns. The win share was 34/48 (70.8%); tie-adjusted score was 34.5/48
(71.9%). This is a development pilot, not a held-out strength claim.

## Protocol

- Opponent: the local `roman-training-001/best.json`, episode 160, schema 1,
  seed 1. Its simulator fingerprint validated. It has not been established to
  be identical to the user's `pc-benchmark-001/best.json`.
- Calculator: disabled for the learned-policy opponent.
- Source: schema-1 Gen 7 OU human metagame bank. Eligible complete teams only,
  Carletto–Lugamon, no Mega Stones, Z-Crystals, or Moody. Shadow Tag allowed.
- Twelve team pairs selected with seed 404. Four games per pair independently
  crossed team ownership and player position. These correlated games are not
  48 independent observations.
- Foul Play: one sampled battle state, 10 ms MCTS budget per decision, one
  thread. MCTS itself is nondeterministic. Same simulator seed within each
  four-game block. No Team Preview; supplied lead order preserved.
- Only player-visible events and the bot's own request enter Foul Play. Its
  hidden-set choices are bank hypotheses, including possible Illusion users.
- Timing: Foul Play made 1,250 decisions, mean 30.3 ms, max 275.4 ms, including
  Python IPC and startup. Learned policy made 1,325 decisions, mean 0.31 ms,
  max 5.38 ms. These timings are machine-specific.

## Fixes uncovered during development

- Preserve battle events received with wait requests.
- Distinguish a copied Trace ability from the original set ability.
- Handle custom Illusion users in own requests and sampled opposing states;
  preserve default-zero stat boosts when reconciling the true own species.
- Track Trick/Switcheroo items as current battle state rather than assuming
  the new item was part of the original set.
- Keep explicit reveals as constraints, while excluding unverified inferred
  speed bounds and missing-activation deductions from hard bank filtering.

Earlier development runs with errors were invalid for score comparisons and
were not merged into the final result. The same development schedule was
used to identify and repair bugs; a fresh evaluation is still required.

## Checkpoint tournament correction

The older roster evaluator swapped player positions and reversed the teams
together. Within each checkpoint matchup, each checkpoint therefore kept the
same team. Team quality could favor earlier checkpoints throughout the
tournament. Those results do not establish training regression.

`roster.cjs` evaluation version 2 uses four games per pair, independently
crossing team ownership and player position. A regression test reads the
saved match logs to verify all four assignments. New runs use `60 * pairs`
battles. Original reports and model files are left unchanged.

## Validation and next step

- Existing bot suite plus assignment test: 25 passed, one optional fork
  calculator test skipped (no calculator engine configured).
- Compatibility/assignment tests: five passed.
- Custom bank/protocol regressions: eight passed.
- Final pilot: all 48 games completed, one capped, zero errors.

Next: repeat against the exact PC checkpoint and its calculator configuration,
then rerun checkpoint rankings with the corrected evaluator. Full ability and
move-effect parity and live WebSocket deployment remain unverified.
