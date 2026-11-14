# Milestone 6.3 — Managed tags and recipe classification

Implemented locally on 2026-11-14. Next: **6.4 — Search, filters, sorting, and pagination**.

## Delivered behaviour

- V6 adds `recipe_tags` and `recipe_tag_assignments` without changing existing accounts, meals, recipes, ingredients, or steps. The catalogue starts empty. The three groups are `MEAL_TYPE`, `CUISINE`, and `STYLE`, displayed as Meal type, Cuisine, and Style.
- Active members can read `GET /api/v1/recipe-tags`, which returns all three groups, including empty groups. Administrators can create with `POST /api/v1/recipe-tags` (`name`, `group`) and rename with `PUT /api/v1/recipe-tags/{id}` (`name`). Creation returns 201 and Location. Existing authentication, account-status, and CSRF protection apply; role authorization is enforced on the controller and service mutations.
- Names are trimmed, whitespace is collapsed, and normalized names must be 1–50 characters without `#`. A PostgreSQL unique index enforces case-insensitive uniqueness within each group, including concurrent requests. Duplicate names return a structured 409 with a name-field error. Rename keeps the ID and associations; sending a non-null group on rename is rejected. No deletion, merging, or custom groups were added.
- Recipe create/update accepts optional `tagIds`, defaulting to an empty list. It permits at most 30 submitted IDs and stores distinct selections. Missing IDs return an actionable field error without changing the aggregate. Tag changes participate in optimistic version checking and transactional rollback. Library summaries and recipe details return `tags` with ID, name, and group; list tags are loaded in one batch for the page.
- Members select tags through grouped, labelled checkboxes. Empty catalogues allow untagged recipes. Catalogue failures expose retry while retaining content and selected IDs. Selection-limit errors are announced and focused. Restoring the original selection does not create a false dirty state.
- Administrators reach Manage tags from the library, detail, or recipe editor. Tag and recipe drafts survive Journal, Recipes, and account navigation within the session. Returning to the recipe preserves its editor and focuses the Manage tags trigger. Switching tag editors or cancelling changed tag content requires Keep editing / Discard changes; Escape returns focus to the trigger. Back to recipe preserves the tag draft.
- Failed mutations preserve input. Repeated submissions share the existing submission lock; editor replacement and return navigation are disabled while saving. Hidden completions do not move focus. Failed logout retains drafts; successful logout clears them.
- Successful tag changes refresh the catalogue/library and update any cached detail labels without changing recipe versions. Fresh recipe responses use their own current tag labels, so an older cached catalogue cannot mask another administrator's rename.

## Verification performed

The initial five tag UI scenarios failed against the previous implementation. Later tests reproduced discard-prompt focus return, repeated Recipes navigation focusing a hidden heading, and cached labels hiding a fresh server rename before fixes. The initial backend test attempt could not use the Maven cache within the sandbox, and the first elevated attempt failed because Docker was not running; these infrastructure errors are not behavioral TDD evidence. Docker was then started and real database verification completed.

Passed:

- `backend/`: `./mvnw.cmd verify` with JDK 21 and Docker/Testcontainers PostgreSQL 17 — **32 tests, zero failures/errors/skipped**. Includes six tag API cases, existing recipe/account/meal regressions, simultaneous normalized tag creation, tag-only recipe conflicts, rollback of associations after child persistence failure, fresh migrations, V4 upgrade preserving account/meal rows, and V5 upgrade preserving recipes and ordered content.
- `frontend/`: `npm test -- --run src/RecipeTags.test.tsx src/Recipes.test.tsx src/recipeFormSchema.test.ts src/forms.test.tsx` — **50 tests** (11 tag interactions, 23 recipe interactions, 14 recipe schema cases, two shared-form cases).
- Oxlint with warnings denied and Prettier on changed frontend files; TypeScript/Vite production build; `git diff --check`.

Frontend interaction tests use synthetic HTTP responses. Per [project instructions](../AGENTS.md), **no browser smoke review or full frontend suite ran for 6.3**. Real browser layout, responsive/zoom and keyboard review, and live frontend-to-backend workflows remain in 6.6. Search/filter controls remain in 6.4; recipe/meal links remain in 6.5. Draft recovery across page reloads and concurrent tag-rename conflict detection are outside this slice's contract.

No commit, push, or deployment was performed.
