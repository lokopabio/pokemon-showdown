# Baseline Foul Play account rollout

This tool copies a working custom-adapted Foul Play connection configuration into separate per-account configs. It never enables experimental battle policies, trains a model, generates teams, registers accounts or changes a service.

Preparation preserves the template's server, authentication endpoint, Python runtime, Foul Play checkout, bank, search budget and diagnostic setting. Existing configs, teams, banks, builder scripts, learned models and experiment results are not overwritten or deleted. New configs use only the existing baseline foulPlay policy. This is the existing custom-compatible baseline, not unmodified upstream Foul Play.

Supply account names locally rather than storing them in repository source:

```
node scripts/battle-bot/prepare-foul-play-fleet.cjs --template PATH_TO_WORKING_CONFIG --output NEW_DIRECTORY --names COMMA_SEPARATED_NAMES
```

Alternatively, --accounts EXISTING_CONFIG accepts a single config or JSON array and preserves each supplied account's existing Gen7 OU team selection. With --names, each account starts with a separate copy of the template's selected team. No team order or sets are regenerated. All teams pass the custom guards and actual Gen7 validator before any output is created. Output directories must be new. Runtime paths are resolved for the preparation host.

Inspect the generated fleet.json and per-account configs before starting. Stop old clients using the same usernames first. This tool does not detect remote clients, migrate runtimes or manage services. Do not stop the battle server or replay service. Account credentials stay local and are not written into the generated configuration.

PowerShell foreground launch:

```
& scripts/battle-bot/start-foul-play-fleet.ps1 -Fleet PATH_TO_GENERATED_FLEET_JSON
```

The launcher prompts privately for each account password. If all accounts share a password, add -SharedPassword for one hidden prompt. Previous environment values are restored on exit. Each Python worker is constructed with fleet password variables removed from its inherited environment. Authentication uses the existing connector and HTTPS login implementation. Missing password variables prevent any connection attempt.

Expect an Online message for every account. Keep the terminal open; Ctrl+C closes the fleet. New account logs go into each generated account directory's logs folder. Existing live logs remain intact. Concurrent battles share machine resources. The copied search budget is not a strength guarantee or end-to-end latency promise.

Rollback: stop the fleet and restart the prior client config/service. No builders, bank teams, models or old configs need restoration because this workflow did not change them.

Validation: node --test scripts/battle-bot/foul-play-fleet.test.cjs covers source preservation, baseline config generation, credential isolation, duplicate rejection, existing-account team preservation and missing-credential preflight. Additional preparation was checked against the real custom Gen7 validator without opening connections. Remote logins require the owner's runtime and credentials. PowerShell execution has not been tested in the Linux development environment.

## Rotate existing bank teams

Stop the fleet, then prepare a separate rotating configuration:

```
node scripts/battle-bot/prepare-foul-play-fleet-rotation.cjs --fleet PATH_TO_CURRENT_FLEET_JSON --output NEW_ROTATING_DIRECTORY
```

This reads the current shared bank, validates original complete teams, removes exact duplicates, and writes a shared bank-only roster plus independent account state files. No new teams are built, mutated or admitted by self-play. Ineligible originals are listed in the new local manifest. Existing fixed-team configs, bank files, builders and histories remain intact. The Foul Play battle policy and search budget are copied unchanged.

Launch the new fleet.json with the existing PowerShell fleet launcher. Selection advances when a challenge is accepted, before the battle starts, so a cancelled challenge can also advance rotation. Each account cycles independently, persists across restarts, and avoids immediate repeats. Different initial offsets spread accounts across the roster, but do not guarantee all accounts always use different teams. The current fixed team initializes the last-team marker so the first selected roster team differs when possible. Rotation results are recorded, but do not train the battle policy or rank team strength.

Stop the fleet before changing banks or rotation data. Restarting with the same rotating manifest continues its state. To return to fixed teams, stop and launch the earlier manifest. The launcher permits only source=bank roster entries; generated/discovery/variant teams are not enabled by this rollout.
