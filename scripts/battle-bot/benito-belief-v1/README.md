# Experimental belief and risk review

Offline only. Does not alter the live connector, separate Foul Play checkout, teams, or native engine. No passwords or network connection are needed.

The candidate adds bounded structural ability/move priors to compatible complete bank sets using generic move flags (pulse, bite, punch) and Technician's base-power condition. These are hand-chosen starting assumptions, not fitted usage probabilities or proof of an ability. Already incompatible bank sets remain excluded; open-set fallback is unchanged. This is incomplete ability coverage. No species pairs are encoded.

The candidate compares per-scenario mean native rollout scores with a 0.25 weighted standard-deviation penalty across sampled sets. This experimental objective is not calibrated win probability, opponent-action inference, a worst-case guarantee, or demonstrated stronger play. Missing/unvisited actions cause explicit rejection if no comparable action remains. Baseline retains pooled visit selection. Both modes capture complete sampled states and native per-action totals/visits. Simulator damage parity checks, damage/speed likelihood updating, learned opponent action probabilities, and full battle strength validation remain to be implemented.

Archived human decisions drive both replay trajectories; proposed choices are only recorded. Each process starts fresh. Only public log events and the bot's own private requests are supplied. Original search samples cannot be recovered. Repetitions and modes use fresh unseeded samples/native timing; they are not matched random trials or a win-rate comparison. The identity log's current appearance move list alone does not establish lost long-term memory.

Run from the repository root in PowerShell:

```powershell
& "$HOME\roman-foul-play\.venv\Scripts\python.exe" -m unittest discover -s scripts/battle-bot/benito-belief-v1 -p 'test_*.py'
$battleLog = Get-ChildItem scripts/battle-bot/results/benito-human-20261030-194540/logs -Filter '*.log' | Select-Object -First 1
& "$HOME\roman-foul-play\.venv\Scripts\python.exe" scripts/battle-bot/benito-belief-v1/review.py --log $battleLog.FullName --output scripts/battle-bot/results/benito-belief-review-001 --repeats 30 --hours 2 --search-ms 100
```

Both repetition count and time cap bound the run. The time cap is checked between complete baseline/candidate pairs; an in-progress pair may overrun it. Each bridge also has a watchdog. Resume with the identical command; completed files are skipped and partial files retried. Input/code hashes reject incompatible resumes. Stop with Ctrl+C. Native library execution requires the installed patched Gen7 Python environment; local unit tests alone do not verify native execution. This experiment does not train or promote a live policy. Inspect .stderr on a bridge failure.

Outputs contain bot-private team details and sampled opponent hypotheses, not opponent hidden truth. Preserve manifest.json and complete JSONL files. Root action values permit diagnosis of flat losing positions versus missing public evidence; actual simulator comparisons are still needed.

## Public evidence audit

`--evidence-audit` checks sampled sets against a conservative subset of observed direct damage and equal-priority move order, using battle-time context and exact own HP. It skips switches, critical hits, multi-hit moves, healing after damage, item/ability changes and other unsupported transitions. Item/transform events invalidate retained records. Speed checks currently require ordinary known abilities, restricted items, no field/weather/status/volatile effects or side conditions; ties remain possible. Native damage mismatches are diagnostic contradictions, not automatic proof that a set is impossible: custom simulator parity must be established first. Checks are logged under each sample's evidenceChecks. They do NOT yet eliminate samples or change live play.

For the bot's final surviving member, this option additionally records native one-turn transition branches for every equipped move pair, allowing priority attacks, setup and slower attacks to be compared without relying on rollout averages. It does not force the opponent to select a particular reply.

Use a new output folder after updates. Start with `--repeats 1 --evidence-audit`; do not run a large batch before native execution and outputs have been inspected. Any proposed evidence-based rejection must later add calibrated mismatch handling, simulator parity and broader event coverage. This update is the verification prerequisite for that filter, not a completed inference policy.

Native calculate_damage returns [normalMaximum, criticalMaximum], not an array of random rolls. The audit now reports a conservative noncritical interval from floor(0.85 * normalMaximum) - 2 through normalMaximum + 2, allowing rounding differences. Critical events remain excluded. This envelope is diagnostic only and cannot establish an exact roll likelihood or simulator parity. KO observations are censored lower bounds. Regression tests cover the observed 249 HP Acrobatics hit and distinguish held-item from itemless damage. Previous audit-002 files can be reinterpreted from their saved two-value native results without another native replay.

## Persistent evidence-weighted bank sampling

In candidate mode, compatible complete bank sets now receive persistent cached assessments from accumulated public evidence BEFORE being sampled for MCTS. Each distinct species/move/type-of-contradiction reduces structural weight by 0.05 (bounded to three distinct contradictions). Repeated hits of the same move do not repeatedly compound the penalty. These numerical penalties are experimental conservative preferences, not calibrated Bayesian likelihoods or hard exclusions. Compatible sets keep positive weight. Every evaluation is logged, including allConflict when every evaluated candidate conflicts. Newly admitted evidence invalidates cache entries by revision; item and identity changes invalidate retained evidence conservatively.

The bank's revealed-move/item/ability legality constraints still run before this ranking. Open generated fallback remains unchanged; it does NOT yet have a persistent distribution or an automatic expansion policy triggered by allConflict. Unseen species are still generated by the existing sampler. Compatible bank-set assessments persist through the battle, but concrete sampled teams are still drawn each decision. This is a first connected bank-hypothesis layer, not a full joint team posterior. It uses only the bot's own requests and public events, never the uploaded opposing team export.

Candidate sampling weights feed the scenarios searched and their action comparison. Native search remains stochastic. Baseline keeps its original sampler. The public tracker and conservative checks cover only documented narrow contexts; skipped checks must not be interpreted as evidence supporting a set. Ordinary native stat/damage calculations are still not fully validated against the custom simulator. No information-gain scouting search, human opponent-action model, or exact EV solver is implemented.

Tests exercise retaining a compatible set, downweighting a conflicting set, avoiding duplicate evidence accumulation, cache revision, all-conflict reporting, changed action comparison, and the actual sampler hook receiving the weights. Native integration still requires the user's patched Python environment. Use one fresh replay pair with --evidence-audit and a new output folder to verify that path. This does not replace the live bridge or promote the candidate automatically.

## Tactical diagnosis: final Ladesaurio position

`tactical.test.cjs` runs actual custom Gen7 Showdown Battle instances with the recorded bot HP (79/351), stats and Coil boosts, against Jolly 252 Attack / 252 Speed itemless Airrivas. All four moves lose immediately to Acrobatics across 16 fixed seeds. Extreme Speed lands damage first but does not prevent the terminal loss. Dragon Rush executes after Roost and deals damage, so it is not dominated against every equipped reply. This does not prove Dragon Rush is optimal; it rules out the inference that dealing chip before a certain loss necessarily demonstrates stronger battle play. No species-specific priority override was added.

Run `node --test scripts/battle-bot/benito-belief-v1/tactical.test.cjs` in a built repository. BENITO_SIM_ROOT optionally points to another built simulator checkout. These are narrow regression fixtures, not full native/simulator parity tests.

`tactical-report.py INPUT_JSONL --output REPORT_JSON` summarizes already saved last-member transition branches, including replies that defeat every equipped move and native root means. It requires no native engine or new replay. Reply likelihoods are deliberately not invented. All three itemless scenarios at turn 33 in both persistent-belief replay modes have Acrobatics as such a defeating reply. The tiny root scores may reflect desperate continuations; treating them as a confident tactical preference is inappropriate.
