# Milestone 6.4 — Search, filters, sorting, and pagination

Implemented locally on 2026-11-14. Next: **6.5 — Optional recipe links in the meal journal**.

## Delivered behaviour

- `GET /api/v1/recipes` now accepts `q`, repeated `tagId`, `sort`, `page`, and `size`. Defaults remain page 0 and size 20; size supports 1–100. Sort values are `name_asc` (default), `name_desc`, and `newest`.
- Name search trims surrounding whitespace and matches a case-insensitive literal substring. `%`, `_`, backslash, and apostrophes have no special search syntax. Accents remain significant. The normalized query is limited to 200 characters.
- Tag filtering uses OR within each selected group and AND between selected groups, combined with name search. Repeated IDs are deduplicated; at most 30 submitted filter IDs are accepted. Malformed and unknown IDs, invalid pagination, and unsupported sorts return structured 400 errors.
- Filtering, sorting, counts, and pagination run in PostgreSQL. Each group uses an `EXISTS` condition, so multiple matching associations cannot duplicate a recipe or inflate its count. Count and page queries use the same predicate within the existing repeatable-read transaction. Detail collections are not loaded for library results; displayed tags are fetched in one batch for the page.
- Name sorts use `lower(name)` in the chosen direction and ascending ID as the tie-breaker. Newest uses creation time descending, then ascending ID. Out-of-range pages return empty items with accurate totals; the frontend recovers to the last valid page. No new migration or dependency was needed.
- Search requires explicit submission. Typing alone does not change the results; unsubmitted text is kept separate from the applied query. Sort and tag changes apply immediately and reset to page 1, as does submitting search. The UI displays the applied name query separately when present.
- Filters use an inline disclosure at all widths, with expanded state and selected count. Groups use three columns on wider layouts and stack on narrower layouts. Selected removable chips remain outside the collapsed panel. Clear tags retains the name query; Clear all clears the query and tags while retaining sort. At 30 selected tags, unselected options are disabled while selected options remain removable.
- Removing chips moves focus to a surviving chip or the Filters toggle. Clear all focuses search. Escape from filter checkboxes collapses the panel and returns focus to Filters. Pagination focuses the persistent library heading before replacing results. Returning from detail or another main view restores the last focused library recipe when it still exists, with a heading fallback when it no longer matches.
- Query, search draft, selected tags, sort, page, and disclosure state survive detail/edit and main-view navigation. Recipe/tag mutations refresh results; a changed recipe that no longer matches is removed from the result set, and an invalid page is recovered.
- A dedicated `useRecipeDiscovery` hook ties each response to its exact request. New criteria immediately hide older rows/counts/pages. Cancelled requests cannot replace newer results or errors; stale page recovery cannot replace a newer query. Loading, empty library, no matches, failure/retry, and expired session remain distinct. Failed requests retain controls and criteria, and empty results never show “Page 1 of 0”.

## Verification performed

Four new backend discovery tests and the initial nine frontend discovery scenarios failed against the previous implementation, then passed after implementation. A later focused test reproduced loss of the last focused library recipe across main-view navigation before its fix. Additional targeted coverage checks unsubmitted search drafts, the selection limit, and Escape/focus return.

Passed:

- `backend/`: `./mvnw.cmd verify` with JDK 21 and PostgreSQL 17/Testcontainers — **36 tests, zero failures/errors/skipped**. The four discovery cases cover literal/case/accent search, grouped combinations and duplicate IDs, untagged recipes, pagination and tied sorts, accurate totals, summary-only responses, and invalid inputs. Existing recipe/tag permissions, transaction/concurrency tests, and migration/account/meal regressions also passed.
- `frontend/`: `npm test -- --run src/RecipeDiscovery.test.tsx src/Recipes.test.tsx src/RecipeTags.test.tsx` — **48 targeted tests** (12 discovery, 23 recipe, 13 tag interactions). Covers request parameters, page resets, clearing/chips, state and focus preservation, late success/failure responses, current 401/503 errors and retry, mutation refresh/page recovery, selection limits, and empty/no-match states.
- Changed-file Oxlint with warnings denied, Prettier checks, TypeScript/Vite production build, and `git diff --check`.

Frontend interaction tests use synthetic HTTP responses. Per [project instructions](../AGENTS.md), **no browser smoke checks or full frontend suite ran for 6.4**. Responsive layout, real browser keyboard/zoom review, screen-reader behavior, and live frontend-to-backend workflows remain for 6.6. Large-library performance was not benchmarked; ordering is deterministic for an unchanged dataset, without snapshot consistency across separate page requests or locale-specific dictionary-order guarantees.

No commit, push, or deployment was performed.
