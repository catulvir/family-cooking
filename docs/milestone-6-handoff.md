# Milestone 6 — Recipe library and discovery

Completed locally on 2026-11-15. Next: **milestone 7 — Photos and personal profiles**. No commit, push, or deployment was performed during 6.6.

Post-handoff review: [originating-meal return fix and updated navigation focus preference](milestone-6-review-fixes.md). That follow-up used targeted verification; the full-suite/browser results below remain the original 6.6 evidence.

## Delivered

Active members can create shared recipes with ordered ingredients/instructions, servings, notes and grouped tags. Creators and administrators can edit; version checking prevents concurrent edits from silently overwriting content. Recipe and account drafts survive main-view navigation, and changed drafts require explicit discard.

Administrators create and rename tags within Meal type, Cuisine and Style. Discovery combines literal name search, OR within each tag group, AND across groups, sorting, accurate counts and pagination. Search controls, selected filters, page and return focus survive navigation.

Meals can remain unlinked or select a recipe through paginated search. Record cooking this recipe starts an unsaved meal with a suggested name and local date. Existing meal drafts are protected. Recipe links open current content while saved meal fields remain independent. V7 preserves legacy meals with null links; omitted update fields retain existing links and explicit null clears them.

Detailed implementation records: [6.1](reviews/milestone-6.1/README.md), [6.2](milestone-6.2-handoff.md), [6.3](milestone-6.3-handoff.md), [6.4](milestone-6.4-handoff.md), [6.5](milestone-6.5-handoff.md). The [plan](milestone-6-plan.md) retains the acceptance contract.

## Defects fixed during final verification

- The packaged app initially returned 404 for its home page: Maven copied frontend output to the classpath root. It now packages that output under `static/`.
- Security also blocked the public app shell for signed-out, pending and disabled sessions. A shared request matcher now permits only GET/HEAD of `/`, `/index.html` and `/assets/**` through the frontend-access checks. Private API authentication, account-status checks and mutation CSRF protection remain in place. Three regression tests failed before this fix, then passed.
- Continue existing meal is disabled while discard confirmation is open, preventing contradictory draft actions. Retrying a linked recipe keeps focus on its persistent heading as the retry button disappears.

## Verification performed

| Check | Result |
| --- | --- |
| Backend `./mvnw.cmd verify`, JDK 21, PostgreSQL 17/Testcontainers | **44 tests passed, zero failures/errors/skipped** |
| Frontend `npm test -- --run` | **128 tests passed in 11 files** |
| Frontend `npm run lint`, `npm run format:check`, `npm run build` | Passed |
| `git diff --check` | Passed |
| Packaged app with isolated PostgreSQL and three authenticated roles | Live workflows passed |
| Chrome 157, widths 360/768/1280 | **30 captures**, no horizontal overflow; checked action/checkbox-label targets at least 44 CSS px high |
| Actual Chrome page zoom at 200% | **6 captures**, DPR 1 → 2 and CSS viewport 1264 → 632; no horizontal overflow |

Backend coverage includes ownership, account status, CSRF/login, invalid input, atomic rollback, concurrent recipe edits, tag uniqueness, discovery semantics and recipe/meal link independence. Migration tests cover fresh databases and upgrades from existing schema versions, including preservation of account, recipe and meal data.

The browser review used the production frontend served from the built JAR and a separate local PostgreSQL container. Synthetic accounts were created and authenticated through the real API. A member created and reordered recipe content, an administrator created/renamed a tag and edited that recipe, and another member searched, filtered and saved a linked meal. Reload preserved stored content. A real stale-version save retained the draft and required explicit discard to reload; another member's direct edit returned 403. The review also exercised meal draft replacement, cancellation, current recipe content and return navigation, pagination, unbroken long text, 100 ingredient/100 instruction rows, and retry after a controlled 503 response. All other workflow requests were live.

Keyboard activation and focus checks covered add/move/remove rows, Enter search, Space tag selection, Escape/filter focus return, pagination, tag management, linked meal creation and discard confirmation. At 200% zoom, row movement and Escape/cancel focus restoration also passed. Representative captures were visually inspected. Eight text-colour token pairs measured 4.53:1–12.09:1 contrast; labels, errors and primary actions were included.

## Reproduction and limits

See the [browser review instructions](reviews/milestone-6/README.md). Captures, metrics, temporary Chrome profiles and synthetic session state remain outside the source tree. The isolated review backend and database were stopped after review; existing development services and family data were not modified.

This establishes local behavior, not production deployment readiness. Review used Chrome on Windows, synthetic data and local HTTP. No physical-device, other-browser-engine, screen-reader, hosted TLS/cookie-policy or load/performance review was performed. Automated keyboard checks exercised focused controls; they were not a full manual screen-reader or exhaustive Tab-order audit. The controlled service failure is a frontend retry check, not a database outage test. Account setup used API calls rather than the browser's password-change form; backend regression tests cover public shell access during password change.

No blocking defects remain in the reviewed milestone scope. Photos/profiles, favourites, ingredient-aware discovery and reviews retain their later milestones. Draft recovery across reload, recipe deletion/history, serving scaling and public sharing remain outside this milestone.
