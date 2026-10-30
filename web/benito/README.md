# Benito’s Office

Static, browser-local teambuilding for the custom Gen 7 singles project. This directory is ready for a static web server. It has not been deployed to the live Showdown server.

## Preview on your Windows PC

From roman-training:

```powershell
node scripts/battle-bot/serve-benito-office.cjs
```

Open http://127.0.0.1:8877/ in your browser. Keep the terminal open. Ctrl+C stops the preview. It binds only to your PC; this is not the later friends-accessible deployment.

## Deploy later

Upload `index.html`, `style.css`, `app.js` and `data-info.json` to the web server’s static `/benito/` directory. Preserve relative paths, serve JavaScript with its correct content type and use HTTPS. Do not upload research results, Python environments, account configs or credentials. No Node/Python/Rust service is needed on the public server. The application works beneath a subdirectory and contains no external asset dependencies or network API calls. Browser policy blocks outgoing connections from the app.

Test the new path before adding a link from Showdown. Different origins have separate local storage: export backups before switching between localhost, preview and the public origin. Different paths on the same origin share storage. The key is `benito-office-v1`. Normal server access logs can record page and asset requests; teams are not sent to a server endpoint. Other scripts installed on the same origin can access origin-local storage, so use a dedicated origin if stronger separation is needed. Changes to hosted JavaScript can change future behavior; the current build has no analytics or uploads.

## Features and limits

Six editable slots; complete supplied-set selection; suggestions that preserve your current core; Showdown import/export; persistent draft and up to 100 saved teams; JSON backup and additive restore. No account, login, synchronization, natural-language chat service or shared team database.

Reviews distinguish basic data checks, project building preferences, supplied-attack type exposure, Speed and missing battle evidence. They do not certify full Showdown legality, exact damage, reliable counters or overall strength. No live battle execution or learned policy is bundled. The proposal generator samples complete sets, applies the project’s hard building rules and selects lower shared weakness exposure among a small batch. It does not optimize individual moves/EVs or guarantee a strong team. All proposals are labeled untested.

Data: compiled from the simulator checkout and supplied bank, with build date and bank hash in `data-info.json`. Update the public build after relevant server changes. No user-specific battle files are bundled. This first version uses typography and species initials instead of external sprite URLs.

## Refresh the snapshot

Build the simulator first if its data changed, then:

```powershell
node scripts/battle-bot/build-benito-office.cjs --bank metagame/metagame-bank.json
```

The build uses the repository’s existing esbuild dependency. Deploy the refreshed static files together. Refreshes do not deliberately erase local teams. Backups remain recommended. To run source/data tests, set `ROMAN_TEST_BANK` to your bank path, then run `node --test scripts/battle-bot/office.test.cjs`.

## Verification

Source tests cover 709 supplied-set import/export round trips, EV/IV parsing, nickname/gender preservation, actual Alepato Speed, building preferences, additive restore, restore validation/capacity and the offline bundle. Browser QA covered generation, core-preserving completion, editing, ability/item review, saved-team persistence and backup download. The automated browser file-chooser restore check stalled; restore data logic passes, but the full file-picker flow needs a manual check before public release. Desktop appearance was visually inspected; narrow-screen CSS is included but has not been checked on a physical phone.
