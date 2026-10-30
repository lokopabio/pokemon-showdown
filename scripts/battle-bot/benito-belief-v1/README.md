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
