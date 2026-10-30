# Repository-based Benito updates

Use the codex/benito-development branch for reviewed player changes. Existing experiment modules and local metagame data are not automatically published or promoted. This first update versions the unseen-species support fix and focused regression checks.

After preserving local work and merging the remote development branch, run from roman-training:

    node scripts/battle-bot/sync-benito.cjs

This checks and, if needed, patches only the supported top-50 cutoff in the separate roman-foul-play checkout. It preserves an adjacent before-copy and runs three Node patch checks and four Python tests of the real sampler function bodies. It does not rebuild Rust, rerun the entire importer, overwrite custom engine modifications or restart bots. Already-running Python players need a separate restart to load modified source.

The preparation script also retains the correction on future setup runs. Sampler support is a mechanical coverage fix, not measured strategic improvement. Fixed 100ms remains the reference; the adaptive experiment is not promoted.

Recommended local arrangement: keep a local working branch with your installed code and data checkpoint. Fetch and merge origin/codex/benito-development into that branch, resolving any real conflicts without resets. Do not push that local checkpoint branch wholesale: it may contain private bank data and generated artifacts. Only selected reviewed source belongs on the remote development branch.

The repository update does not contain today's ZIPs, datasets, logs, native states or experimental team exports.
