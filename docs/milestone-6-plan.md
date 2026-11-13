# Milestone 6 — Recipe library and discovery

Status: in progress. Slice 6.1 implemented and verified locally on 2026-11-14; 6.2–6.6 remain. Recipe edit permissions and administrator-managed tags were confirmed during planning. Unimplemented details below remain proposed implementation defaults. [6.1 verification and limitations](reviews/milestone-6.1/README.md).

## Outcome

Active family members can build a shared recipe library, find recipes by name and grouped tags, and record cooking a recipe as a separate meal. Recipes contain reusable ingredients and instructions; meals remain dated journal entries that can exist without a recipe.

Build on the [accepted design](milestone-4-ui-design.md) and [milestone 5 handoff](milestone-5-handoff.md). Keep the existing cream, terracotta, green, rounded-panel interface and **meal** terminology in the UI. Backend meal endpoints retain the existing `dishes` name. Journal remains the initial signed-in view; add Recipes to primary navigation.

## Behaviour and permission contract

### Shared recipes and ownership

- Every active family member can read all recipes and create recipes.
- Only a recipe's creator or an administrator can edit it. The server enforces this policy and returns `canEdit` for UI actions.
- The server assigns creator and timestamps; editing does not transfer ownership. Duplicate recipe names are allowed.
- Signed-out, disabled, pending, and required-password-change accounts cannot use protected recipe or tag operations, consistent with existing access rules. Mutations require CSRF protection.
- Recipes have no private/public setting in this milestone: the library is private to the family and shared within it.
- Recipe deletion, archival, ownership transfer, revision history, and recipe copying are outside this milestone.

### Recipe content

| Field | Proposed contract |
| --- | --- |
| Name | Required, trimmed, 1–200 characters |
| Servings | Optional positive whole number, 1–999; no automatic scaling |
| Ingredients | Required ordered list of 1–100 rows |
| Ingredient name | Required in each row, trimmed, 1–200 characters |
| Quantity | Optional text, up to 50 characters; supports `1/2`, `2–3`, or `to taste` |
| Unit | Optional text, up to 50 characters; no conversion or unit catalogue |
| Instructions | Required ordered list of 1–100 nonblank steps, up to 2,000 characters per step |
| Tags | Optional selection of up to 30 existing tag IDs across the three groups |
| Notes | Optional plain text, up to 5,000 characters |

Trim text at the API boundary, normalize optional blank strings to null, and preserve internal line breaks. Keep editable form values intact until submission. Render content as plain text. Blank ingredient rows or steps must be completed or explicitly removed; do not silently discard user input. Ingredient and instruction order must survive a save and reload.

Recipe ingredients are recipe-owned text rows. They do not establish a normalized ingredient catalogue or create dish ingredient records; ingredient-aware discovery remains milestone 9.

### Tags

- Fixed groups: **Meal type**, **Cuisine**, and **Style**. Multiple tags per group are allowed.
- Administrators create and rename tags through a small Manage tags view reached from Recipes. All active members can list and select tags.
- Tag names are trimmed, 1–50 characters, with consistent whitespace and case-insensitive uniqueness within each group. Use normal names without hashtag punctuation.
- Tag IDs remain stable when renamed; recipe associations survive renaming. A tag's group is immutable in milestone 6.
- No tag deletion, merging, or custom groups in this milestone. Renaming corrects mistakes without breaking saved selections.
- Start with an empty catalogue and a useful empty state. Administrators can add family-specific tags; demo taxonomy is not production data. Untagged recipes remain valid and discoverable.
- Reject unknown tag IDs and handle concurrent duplicate tag creation with a useful validation/conflict response backed by a database uniqueness constraint.

### Discovery

- Perform filtering, sorting, counting, and pagination on the server.
- Name search is a trimmed, case-insensitive literal substring match. Empty search means all names; `%` and `_` are literal characters, not wildcard syntax. Accents are significant; fuzzy search and transliteration are out of scope.
- Combine selected tags with **OR within a group, AND between groups**; name search further narrows results. For example, Dessert or Breakfast, together with Japanese, matches either meal type only when Japanese is also present.
- An unselected group imposes no restriction. Tag choices come from the full catalogue; dynamic facet counts are not required.
- Sort options: **Name A–Z** (default), **Name Z–A**, **Newest added**. Name sorts use a case-insensitive database ordering plus an ID tie-breaker; newest uses creation time descending plus ID. Sorting is deterministic for an unchanged dataset, without claiming locale-specific dictionary ordering or snapshot consistency during concurrent edits.
- Default page size: 20; API supports 1–100. Use a zero-based API page and one-based UI labels. Return total matching recipes and total pages; do not count a recipe twice when it matches multiple selected tags.
- Search uses an explicit Search submission; tag changes and sort selection apply immediately. Search, filter, and sort changes reset to the first page. Removing a chip updates the results; Clear tags preserves the name query; Clear all resets query and tags while retaining sort.
- Preserve query, selected tags, sort, page, and list return focus when opening details, editing, or visiting another main view. After mutations, refresh affected results; if the current page becomes invalid, move to the last valid page. For zero matches, show an empty state without a misleading “Page 1 of 0”.
- Ignore stale responses when requests overlap. Distinguish an empty library, no matches, loading, request failure with retry, and expired session. Do not label old results as matching new criteria after a failed request.

### Recording meals from recipes

- Add an optional recipe selector to meal creation and editing. It searches the paginated recipe API rather than loading the entire library. Users can select, replace, or clear the link subject to existing meal edit permissions.
- **Record cooking this recipe** opens a new meal draft with the recipe selected, its name suggested, and the meal date set to the user's local calendar date. Location and notes begin empty. Nothing is saved until Save meal.
- The meal name remains independently editable. Selecting another recipe only fills a blank name; it never overwrites an entered name, date, location, or notes.
- If a meal form already exists, preserve it. Offer **Continue existing meal** or **Start a new meal**; replacing a changed draft requires the existing Keep editing / Discard changes flow. Do not silently replace either a create or edit draft. Disable replacement while its save is pending.
- A linked meal stores a nullable recipe ID. Its detail offers a link to the current recipe. Recipe edits never rewrite the meal's saved name, date, location, or notes; the recipe link intentionally opens current content, not a historical snapshot.
- Existing meals remain unlinked after migration. Creating a meal without a recipe continues to work. An omitted recipe field on an existing meal update preserves its current link; explicit null clears it. This prevents older clients from accidentally unlinking meals.
- Reject a nonexistent recipe ID without changing the meal. Creating or editing a meal does not modify the recipe or copy recipe ingredients into dish ingredients.
- Returning from a recipe opened through meal detail restores that meal detail. Saving a new meal opens its detail; cancelling an untouched recipe-started meal returns to its source recipe. Preserve the library's discovery state throughout.

### Drafts, feedback, and concurrent editing

- Reuse Formik/Yup, shared submission locking, accessible field errors, and deliberate focus handling. Map nested API errors such as `ingredients[0].name` to the correct row and field.
- Recipe and tag drafts survive switching between Journal, Recipes, and account management within the authenticated session. Hidden panels stay out of keyboard navigation and do not steal focus when requests finish.
- Within Recipes, opening another editor or leaving an editor through Back/Cancel must not discard changed values silently. Preserve the current draft or offer Keep editing / Discard changes before replacing it. Pristine and reverted forms cancel immediately.
- Provide labelled Add, Remove, Move up, and Move down controls for ingredient rows and instruction steps; drag-and-drop is not required. Preserve field values and meaningful focus after moves/removals.
- Failed validation or saves retain all input. Repeated submit while validation or saving is pending sends one mutation. Successful sign out clears drafts; failed sign out preserves them. Draft recovery after reload remains out of scope.
- Add a recipe version token for optimistic concurrency. An update based on an older version returns a conflict without overwriting newer content. Preserve the local draft and explain that the recipe changed; reloading the latest version requires explicit discard of changed local values. No automatic merge or force-overwrite action is required.

## Architecture and API direction

Keep the Kotlin/Spring modular monolith and React frontend. Add a `recipes` backend module and focused recipe library/detail/form/tag components; extend the dashboard for cross-view navigation without a broad rewrite or new routing framework.

Use additive Flyway migrations after V4, allocated in implementation order. Proposed tables: `recipes`, `recipe_ingredients`, `recipe_steps`, `recipe_tags`, and a recipe/tag join table. Store creator, timestamps, and version on recipes; persist ordered child positions with appropriate foreign keys and uniqueness constraints. Add nullable `dishes.recipe_id` and an index. Do not modify shared migrations or backfill invented recipes.

Save each recipe and its ingredients, steps, and tag associations atomically. Any invalid child row, missing tag, permission failure, or version conflict leaves the previous aggregate intact. Include child-only edits in version checking. Design search queries/counts to avoid duplicate results from tag joins; paginate recipe identities/summaries before loading detail collections. Do not return full instructions and ingredients in library responses.

| Endpoint | Planned behaviour |
| --- | --- |
| `GET /api/v1/recipes` | `q`, repeated `tagId`, allowlisted `sort`, `page`, `size`; returns `items`, `page`, `size`, `totalElements`, `totalPages` |
| `GET /api/v1/recipes/{id}` | Full recipe, ordered ingredients/steps, tags, version, ownership metadata, `canEdit` |
| `POST /api/v1/recipes` | Create a complete valid recipe; return 201 and Location |
| `PUT /api/v1/recipes/{id}` | Creator/admin update of complete content with expected version; return updated detail |
| `GET /api/v1/recipe-tags` | Catalogue grouped by Meal type, Cuisine, Style |
| `POST /api/v1/recipe-tags` | Administrator creates a tag |
| `PUT /api/v1/recipe-tags/{id}` | Administrator renames a tag within its existing group |
| Existing dish endpoints | Accept optional recipe linkage and return nullable recipe summary `{ id, name }`; retain other fields and list ordering |

Use existing error-envelope conventions. Plan for 400 validation/malformed requests, 401 unauthenticated, 403 forbidden, 404 missing resource, and 409 recipe-version/tag-name conflicts. Reject invalid pagination, unsupported sorts, malformed IDs, and unknown filter tags instead of silently ignoring them. Bound query length to 200 characters and selected filter IDs to 30. Deduplicate repeated valid filter IDs. A valid out-of-range page returns empty items with accurate totals so the UI can recover.

## Ordered implementation slices

Each behaviour starts with a failing test, followed by minimal implementation and refactoring. Acceptance criteria remain planned work unless a slice's implementation record says otherwise. Per the [project instructions](../AGENTS.md), earlier slices use targeted frontend tests and relevant backend verification; browser smoke checks and extensive frontend suites run in 6.6 unless the user explicitly requests them earlier. Focused lint/type/build checks can still run within a slice.

### 6.1 — Recipe creation, detail, and ownership

Implemented: V5 creates recipes and ordered ingredient/step tables; transactional JDBC persistence supports create/get/update and stable A–Z pagination. Conditional version updates protect the complete aggregate, including child-only changes. Recipes navigation, list/detail, basic Formik editor, optional servings/notes, and basic row addition/removal are available. Creator/admin editing is enforced server-side; pending, disabled, unauthenticated, and required-password-change access is rejected. The latter check also closes an existing gap for active accounts flagged for mandatory password change.

TDD evidence: six initial API tests failed with missing endpoints, and six initial frontend scenarios failed with missing Recipes navigation before implementation. Final verification: 25 backend tests (zero skipped), 63 frontend tests, lint, formatting, and production build passed. Tests include a real login/CSRF flow, V4 upgrade preserving complete account/meal rows, database rollback, and simultaneous child-only edits. Headless Chrome smoke review passed 15 captures at three widths; representative screenshots were visually inspected. [Details and review limits](reviews/milestone-6.1/README.md).

Slice 6.2 still owns row reordering, stronger row-focus behaviour, fuller conflict recovery, and expanded draft/error coverage. Basic cancellation confirmation and main-view draft preservation were included now to keep the initial editor safe to use. Tags, search/filter/sort controls, and meal links are not implemented.

The 6.1 full frontend suite and browser smoke checks above completed before the user established the project-wide verification timing rule. Future slices follow that rule.

Deliver the first complete recipe flow: additive recipe/child tables, create/get/update and basic paginated listing, Recipes navigation, basic content form, and recipe detail. Include the required ingredients and instructions from the outset; 6.2 completes the richer editor interactions.

Acceptance:

- An active member creates a valid recipe and reads it back with ordered content.
- The creator and administrators can edit; another member can read but cannot edit through either the UI or a direct request. Ownership cannot be spoofed or changed by input.
- Authentication/account-status and CSRF rules protect every new endpoint.
- Invalid content rolls back the complete save. A stale version, including concurrent child-only edits, produces a conflict while preserving the newer recipe.
- Migration works against a fresh database and the existing V4 schema without changing accounts or meal data.

### 6.2 — Complete recipe editor and draft behaviour

Add ingredient/step row management, reordering, optional servings/notes, field limits, nested error mapping, draft preservation, conflict recovery, and cancellation behaviour.

Acceptance:

- Add/remove/reorder works with a keyboard and persists order after reload; quantity text such as `1/2` remains intact.
- Errors identify and focus the correct nested field after reordering. Empty required lists produce accessible actionable errors.
- Switching main views preserves all recipe values and order. Back/Cancel, replacement of drafts, successful/failed logout, and pending saves follow the stated contract.
- Failed saves and version conflicts retain the draft. Repeated submissions issue a single request. Reloading newer content cannot silently discard changed values.

### 6.3 — Managed tags and recipe classification

Deliver the tag catalogue, administrator create/rename view, recipe selection controls, and tag display on library rows and details.

Acceptance:

- Members can select existing tags but cannot mutate the catalogue via a forged request.
- Administrators create and rename tags; normalized duplicates are rejected, including concurrent creation.
- Renaming preserves associations and updates displayed labels when affected views refresh. Empty catalogues still allow valid recipe creation.
- Unknown selections fail atomically; repeated selected IDs do not create duplicate associations. Tag-management navigation preserves recipe drafts.

### 6.4 — Search, filters, sorting, and pagination

Complete database-backed name search and grouped-tag filtering, result counts, sort controls, selected chips, pagination, and the responsive filter disclosure.

Acceptance:

- Fixtures prove OR within groups, AND across groups, combined name search, untagged recipes, literal wildcard characters, duplicate names, and no double-counting from tag joins.
- Tied sort values produce stable pages without duplicates on an unchanged dataset. Invalid query parameters fail predictably; empty and out-of-range pages are handled.
- Search/filter/sort changes reset the page; detail/back and main-view navigation retain discovery state. Saved edits refresh membership, ordering, and counts.
- A delayed older request cannot replace newer results. Loading/failure/retry retain controls and criteria without showing misleading results.
- On mobile, Filters exposes its expanded state and selected count; selected chips remain visible. Escape and focus return work if an overlay is used.

### 6.5 — Optional recipe links in the meal journal

Add the nullable dish relationship, recipe picker, recipe-to-meal action, and navigation from linked meal detail. Keep recipe and meal permissions independent.

Acceptance:

- Existing meals and ordinary unlinked create/edit flows continue working with unchanged journal ordering.
- Record cooking suggests the recipe name and local date, creates exactly one separate meal on submission, and leaves the recipe unchanged.
- Existing create/edit meal drafts are preserved until explicitly replaced; failures and cancellation do not lose unrelated recipe or account drafts.
- A meal editor can link any readable recipe even if they cannot edit that recipe. A recipe creator cannot thereby edit someone else's meal.
- Linking/replacing/clearing works; omitted fields preserve existing links. Unknown IDs fail without partial updates.
- Editing a recipe leaves saved meal fields unchanged; linked detail opens the updated recipe and returns to the originating meal correctly.

### 6.6 — Integrated verification and handoff

- Run backend verification (`.\mvnw.cmd verify` in `backend/`) with PostgreSQL/Testcontainers available. Inspect skipped-test counts: skipped database suites do not establish persistence or migration correctness.
- Run frontend tests, lint, formatting, and production build using the existing package scripts. Retain authentication, account, journal, draft, CSRF, focus, retry, and submission regressions.
- Exercise the actual frontend against the backend/database: member creates a recipe, administrator edits/manages tags, another member searches and records a linked meal, and persisted content survives reload. Include a real version conflict and a forbidden edit.
- Review at 360px, 768px, 1280px, and actual 200% browser zoom. Cover empty/populated/no-match/error states, long content, large row lists, mobile filters, pagination, permission-specific actions, conflicts, and recipe/meal draft transitions.
- Complete keyboard flows for row editing/reordering, filtering, paging, tag management, and recording a linked meal. Check visible labels/focus, announced statuses/errors, 44px action targets, readable contrast, and reflow without horizontal page scrolling.
- Record verification evidence and limitations in a milestone 6 handoff. Keep screenshots/raw review artifacts outside the source tree. Update README and milestone status only to reflect verified completion.

## Boundaries and completion definition

Photos, avatars/profiles, favourites, curated Home/collections, normalized dish ingredients, ingredient search, reviews, and ratings retain their later milestones. No public sharing, imports, nutrition calculations, serving scaling, browser-history routing, or reload-persistent drafts are added here. No new search service or UI framework is needed for the planned scope.

Milestone 6 is complete when members can create, find, maintain, and cook from reusable recipes under the confirmed permission policy; administrator-managed tags and all discovery semantics work; old meal data and workflows remain intact; and integrated, migration, responsive, and keyboard checks are recorded with no blocking defects in scope.

Next: **6.2 — Complete recipe editor and draft behaviour**. No commit, push, or deployment was performed for 6.1.
