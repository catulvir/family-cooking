# Milestone 6 browser review

Completed 2026-11-15 with Chrome **157.0.8103.51** on Windows. See the [final handoff](../../milestone-6-handoff.md) for results and limitations.

- `review.mjs`: actual packaged app/API/PostgreSQL workflows, three synthetic accounts, real permission/version failures, and 30 captures across 360/768/1280 CSS pixels. Only the explicit 503/retry scenario intercepts an API response.
- `zoom.mjs`: six additional states at **actual 200% Chrome page zoom**, selected through `chrome://settings/appearance` in a temporary isolated profile. It asserts doubled DPR and no horizontal overflow. It does not emulate zoom with CSS or device scaling.
- The initial Windows-native zoom attempt stopped when Computer Use could not verify the browser URL; it produced no passing zoom evidence. The repeatable Chrome settings method completed the check on continuation.

## Run against an isolated local database

These scripts create accounts, tags, recipes and meals. Use a disposable local database, never the family database. Build the frontend before packaging the backend, then run that JAR with a dedicated PostgreSQL database and `PORT=8086`.

Bootstrap the isolated server with email `admin@review.example` and a synthetic temporary password supplied through `BOOTSTRAP_ADMIN_PASSWORD`. The script reads that password from `REVIEW_ADMIN_PASSWORD` (its fixture default is `Review-bootstrap-6!`) and, on first use, changes it to the synthetic `Local-review-password-6!`. On later runs set `REVIEW_ADMIN_PASSWORD` to that changed fixture password. No real credentials belong in these scripts or source control.

From the repository root, with an existing Playwright installation and Chrome:

```powershell
$env:REVIEW_ISOLATED_DATABASE = 'yes'
$env:REVIEW_URL = 'http://localhost:8086'
# Optional: set PLAYWRIGHT_MODULE to an existing installed Playwright module.
node docs/reviews/milestone-6/review.mjs
```

The script prints its temporary artifact directory. Supply its synthetic session file to the zoom companion:

```powershell
$env:REVIEW_STATE = '<printed-artifact-directory>/owner-state.json'
node docs/reviews/milestone-6/zoom.mjs
```

The first fresh-database run includes the empty-library capture. Subsequent runs create uniquely named fixtures and skip that capture when the library is populated. Capture counts therefore depend on the initial database state. Stop the dedicated backend/container after reviewing; the scripts close their own browser sessions.

## Evidence retained locally

The completed run's captures, `results.json`, `zoom-results.json` and synthetic browser session are in `C:/Users/EdgarsPC/AppData/Local/Temp/family-cooking-6.6-nQKpBs`. This is an ephemeral machine-local artifact location, not a repository dependency. The 36 successful captures contain no family data. Earlier failure captures and separate temporary Chrome profiles are also outside the repository.

Selected images inspected include mobile filters/no-match, the 768px meal picker, the 360px 100-row editor, protected meal replacement, the real recipe conflict, and 200% zoom no-match/discard states. Assertions inspect whole-document overflow and action heights; representative image inspection is not a claim that every captured pixel or every assistive technology was reviewed.
