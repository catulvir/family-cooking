# Milestone 6.1 verification

Verified locally on 2026-11-14.

These checks completed before the user added the [project-wide verification timing rule](../../../AGENTS.md). Going forward, browser smoke checks and extensive frontend suites are reserved for the final milestone step (6.6 here), unless explicitly requested earlier; intermediate steps use targeted frontend tests.

- Backend: `mvn --batch-mode verify` passed **25 tests, zero skipped**, with PostgreSQL 17 through Docker/Testcontainers. This includes recipe ownership and all-route account-status/CSRF checks, ordered content, validation, deterministic pagination, simultaneous child-only updates, rollback after a child persistence failure, a real login/CSRF/create/edit/read/logout flow, and upgrading V4 to V5 while preserving complete existing account and meal rows. Existing journal tests remain green.
- Frontend: **63 tests passed**, including eight new recipe behaviour cases. Lint, formatting, TypeScript/Vite production build, and diff whitespace checks passed. Recipe tests cover create/edit/detail, permission-controlled editing, version submission, draft retention on conflict, duplicate-submit protection, required-field focus, main-view draft preservation, cancellation/discard with fresh detail reload, paging/back, and list/detail retry.
- Browser: the accompanying headless Chrome smoke script passed **15 captures** at 360px, 768px, and 1280px. States: empty library, invalid form, populated form, saved detail, and populated library. Automated checks found no horizontal overflow or visible buttons shorter than 44px; no page script errors occurred. Representative mobile detail, desktop form, and tablet library captures were visually inspected. The final layout keeps the servings summary on one line.
- Browser interactions also exercised a keyboard Enter save, Escape from discard confirmation, focus on the safe choice, draft preservation across main navigation, and a detail reload. API responses in this browser review are synthetic fixtures; PostgreSQL persistence and real session behaviour are tested separately by the backend suite.

The initial six recipe API tests failed with HTTP 404 and the initial six frontend scenarios failed because Recipes navigation was absent before implementation. Additional regressions were added while completing the slice.

The account-status test exposed an existing server gap: an ACTIVE account with `must_change_password=true` could access protected domain endpoints. The shared status filter now rejects these requests, while preserving access to password change, session details, CSRF, and logout.

## Limits and next work

This is the 6.1 smoke review, not the full milestone 6 browser matrix. No actual 200% zoom, screen-reader, other-engine, physical-device, or live browser-to-backend review was performed. Row reordering and detailed row-focus interactions, expanded draft/error/conflict handling, tags, search/filter/sort controls, and recipe/meal links remain in later slices. Recipe version conflicts currently preserve the draft and explain recovery; Cancel/Discard fetches the latest detail before re-editing.

No new dependencies were added. V5 is additive and does not modify existing dish/account rows. No commit, push, or deployment was performed.

## Reproduce the browser smoke review

Start Vite on an available local port, then run `node docs/reviews/milestone-6.1/review.mjs`. Set `REVIEW_URL` when using a port other than 5175. Set `PLAYWRIGHT_MODULE` to an existing Playwright installation when it is not resolvable from the repository. Chrome must be installed.

The script uses a temporary browser context and synthetic account/recipe responses; it does not mutate family data. It prints an external temporary directory containing screenshots and `results.json`. Captures are not committed to the source tree.
