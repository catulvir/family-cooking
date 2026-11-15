# Milestone 6 review follow-up — meal return and navigation focus

Implemented on 2026-11-15 after the original 6.6 handoff.

## Originating meal

Opening a recipe through a meal now stores that meal with the recipe visit, independently of the journal's active cooking draft or newly saved meal. Back to meal restores the recorded destination, using the journal's current copy when available.

Regression tests cover the complete linked meal → View recipe → Record cooking → Cancel → Back to meal sequence, and saving the new meal → Recipes → Back to meal. Both return to the original meal and its fields. Saving retains both meal entries; cancelling makes no write. The test fixture now assigns distinct identifiers to created meals so it cannot conceal accidental replacement.

If Back to meal is requested while a cooking draft is still open, that draft remains intact with a message to save or cancel before returning. Changed cancellation still requires explicit discard. A further test covers this protection and the eventual return.

## Navigation focus preference

The user's updated preference supersedes the earlier milestone contract for automatic heading and return-control focus. Journal, recipe library/detail/editor, linked recipe, tag management and account views no longer move focus on arrival or return. Paging also avoids heading autofocus. Open pickers and discard prompts do not refocus themselves when revisiting a view.

Validation-error focus, explicit picker opening, row operations, filter/disclosure Escape behavior, and in-place discard confirmations retain their existing keyboard behavior. Focus indicators remain visible for keyboard interaction; this change removes navigation-triggered focus rather than hiding focus styling.

## Verification

- Three initial regression cases failed before the implementation: the cancel path, save path and navigation autofocus check.
- **27 targeted tests passed** in `MealRecipeLinks.test.tsx` and `Accessibility.test.tsx`.
- **20 selected recipe, tag and discovery tests passed**, covering navigation/focus, paging, pending reload, duplicate failure/retry, tag editor replacement, row moves and conflict recovery.
- Frontend lint, changed-file formatting, TypeScript/Vite production build and `git diff --check` passed.
- No backend or schema changes. No browser review or full frontend suite was rerun for this focused follow-up. The original 6.6 browser captures describe the earlier focus behavior; the browser script's return/paging assertions were updated but not rerun. Broad browser/full-suite checks remain for the next milestone's final verification step unless requested earlier.
