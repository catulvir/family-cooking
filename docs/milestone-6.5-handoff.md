# Milestone 6.5 — Optional recipe links in the meal journal

Implemented on 2026-11-14; verification continued into 6.6 on 2026-11-15.

## Delivered behaviour

- V7 adds nullable `dishes.recipe_id`, its foreign key and index. Existing meals remain unlinked and retain their original fields. Dish responses include a nullable `{ id, name }` recipe summary; list responses resolve names in a batch.
- Create/update accepts `recipeId`. Omission on update preserves the existing link; explicit null clears it. Invalid references fail before any meal fields change. Meal and recipe ownership rules remain independent, and no recipe ingredients are copied into meals.
- The optional meal picker searches the paginated recipe API. Selecting or replacing a recipe fills only a blank meal name. Date, location, notes and an entered name remain intact. Clearing the selection does not clear meal content.
- Record cooking this recipe starts an unsaved meal with the recipe selected, its suggested name, local calendar date, and empty location/notes. Save creates the meal; untouched cancellation returns to the source recipe.
- Existing create/edit drafts offer Continue existing meal or Start a new meal. Changed replacements require Keep editing / Discard changes, and replacement is disabled during a pending save. Failed saves retain input and selection.
- Linked recipe previews fetch current content on every opening and return to the originating meal. A separate read view preserves the library's discovery state and unrelated recipe editor. Recipe changes never rewrite saved meal fields.
- `MealForm`, `RecipePicker` and `LinkedRecipe` have focused component boundaries. The backend reference service separates lookup/validation from dish mutations.

## Verification

- Four new backend API cases and one V6-to-V7 migration case failed before implementation, then passed. Backend `verify` passed **41 tests, zero skipped** before the 6.6 additions.
- Nine meal-link interaction cases cover save/retry, untouched cancel, existing create/edit drafts, pending saves, select/replace/clear, current content, repeated opening, pagination and failure recovery. Initial scenarios and later focus/refresh regressions failed before their fixes. Ten selected accessibility/submission regressions also passed.
- Final confirmation of these cases, the complete frontend suite, lint, format, build and browser integration belongs to the [milestone 6 handoff](milestone-6-handoff.md). Earlier 6.5 checks used mocked HTTP responses; browser work was deferred until the user requested 6.6.
