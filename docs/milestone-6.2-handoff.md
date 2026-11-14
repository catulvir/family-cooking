# Milestone 6.2 — Recipe editor and draft behaviour

Implemented locally on 2026-11-14. Next: **6.3 — Managed tags and recipe classification**.

## Delivered behaviour

- Ingredients and instruction steps have labelled Add, Remove, Move up, and Move down buttons. Stable local row keys preserve field identity; keys are excluded from API payloads and dirty-state comparisons. Reordering retains free-text quantities, including fractions, and persists through the existing save/read API.
- Added and moved rows receive focus on their first field. Removing a row focuses the next surviving row, the previous row when removing the last, or the Add button when the list becomes empty. Row actions announce their result. Both lists can temporarily be empty while editing; saving requires at least one row, with an error associated with the Add control.
- Values, touched state, and server field errors move in the same operation, including sparse error arrays shorter than the content list. The shared form focuses errors once per completed submission; subsequent row moves do not trigger another validation-focus jump. A reset form can focus validation normally on its next submission.
- Validation covers required content, servings from 1 to 999, text limits, and at most 100 rows in each list. Optional blank fields remain optional; ingredient quantities remain text. No rows are silently dropped.
- Conflict responses expose Reload latest recipe. A changed draft requires explicit Discard and reload; Keep editing and Escape preserve it and return focus to the trigger. Reload fetches before replacing the editor, so a network failure retains the entire draft and restores the reload button for retry. Success opens the latest detail; subsequent editing uses the latest version and edit permission.
- Pending saves and reloads lock content and conflicting actions. Duplicate submissions/reloads are guarded. Background results in hidden views do not steal focus. Drafts survive Journal/Recipes/account navigation and failed logout; successful logout clears them. Pristine and fully reverted content cancels without confirmation.

## Verification performed

The initial seven new recipe interaction cases failed against 6.1. A later targeted assertion also caught lost focus after a failed reload before its fix.

All of these checks passed:

- `npm test -- --run src/Recipes.test.tsx src/recipeFormSchema.test.ts src/forms.test.tsx`: **34 targeted tests** (19 recipe interaction cases, 13 schema cases, two shared-form cases).
- Selected existing regressions in `Submission.test.tsx`, `Journal.test.tsx`, and `Accessibility.test.tsx`: **nine passed**, with 36 unrelated cases intentionally excluded by the test-name filter. Covered invalid login, meal field-error focus, hidden meal save results, and duplicate submission/retry across login, password change, account creation, and meals.
- Oxlint and Prettier checks on the changed frontend files, TypeScript/Vite production build, and diff whitespace checks.

The frontend tests use synthetic HTTP responses. There were no backend, database, dependency, or stylesheet changes, so backend verification was not rerun. Existing 6.1 persistence/permission enforcement remains the backend contract.

Per [project instructions](../AGENTS.md), **no browser smoke review or full frontend suite was run for 6.2**. Real-browser keyboard/layout checks, the wider regression suite, and browser-to-backend verification remain in 6.6. Draft persistence across reloads, automatic conflict merging, and force overwrite remain outside scope.

No commit, push, or deployment was performed.

## Review follow-up

Two recipe navigation defects were fixed after 6.2 review. Previous/Next now moves focus to the persistent library heading before clearing the results, retaining keyboard position through loading and avoiding focus changes on delayed completion after navigation. Successful detail fetches, saves, and conflict reloads clear any earlier detail error, so a newly created recipe cannot display an unrelated failed-read message.

The strengthened paging test and four new regression cases failed before the fixes. Targeted verification then passed ten selected recipe tests (13 unrelated cases excluded), changed-file lint/format checks, and the production build. Coverage includes both paging directions, delayed success/failure, navigation during loading, and creating a recipe after a failed detail request. Browser smoke checks and the full frontend suite remain deferred to 6.6.
