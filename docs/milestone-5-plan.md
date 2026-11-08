# Milestone 5 — App shell and journal redesign

Status: partly implemented; remaining work planned. Updated 2026-11-08.

## Outcome

Family members can sign in, record and edit meals, and move around the journal comfortably on desktop and mobile. Administrators can manage accounts without losing drafts. The interface follows the accepted cream, terracotta, green, rounded-panel design.

This plan completes the work already started after the milestone 4 design agreement. It does not restart the redesign. Preserve the current **meal** terminology and optional **location** field, which supersede the earlier wireframe's dish labels. Backend dish terminology and API contracts remain unchanged.

## Baseline already implemented

- Shared visual styling, Lucide icons, responsive layout rules, and visible focus outlines.
- Central colour schema in `frontend/src/colors.css`, consumed by `App.css`.
- Journal and administrator account views, with selected navigation indicated.
- Meal drafts and account email/role drafts survive switching views through mounted, hidden panels.
- Journal creation, editing, ordering, optional location/notes, permission-based edit visibility, and retry/error handling.
- Private login, required password change, and existing account-creation flow.
- Last verified frontend baseline: 14 tests, lint, formatting, and build passed. This is not evidence of completed browser visual or accessibility review.

## Ordered implementation slices

Each behaviour change starts with a failing test, followed by the smallest implementation and refactoring. Pure visual changes use browser inspection rather than tests that assert CSS declarations.

### 5.1 — Draft and navigation contract

Implemented: inline Keep editing / Discard changes confirmation for changed meal forms, immediate cancellation for pristine or reverted forms, safe-choice focus and Escape return. Regression coverage verifies create/edit cancellation, all four meal fields, preservation across navigation and failed logout, and clearing both drafts after successful logout/login. Frontend verification: 23 tests, lint, formatting, and build passed. Browser visual review remains in 5.4.

Keep view switching non-destructive. Preserve drafts in memory within the authenticated session; reload persistence is out of scope. Sign out clears drafts by unmounting the authenticated interface. Explicit cancellation discards a meal draft; a changed form should offer Keep editing / Discard changes before doing so. A pristine form cancels immediately. Account drafts continue to clear their email after successful creation as today.

Acceptance/tests:

- Retain both existing draft-preservation regressions, including the selected Administrator role.
- Switching away hides controls from keyboard and assistive-technology navigation.
- Cancelling unchanged forms returns to the correct list/detail without sending a mutation.
- Cancelling changed forms preserves values when Keep editing is chosen; Discard returns without saving.
- Successful sign out clears the session's drafts; failed sign out preserves them.

### 5.2 — Reliable form submission and validation

Implemented: synchronous submission guards for login, password change, account creation, and meal saves; pending buttons and retry recovery; client meal-name/date validation; accessible server/client field errors and first-invalid-field focus. Regression tests cover deferred repeated submissions, account draft retention and successful temporary-password display, and all four meal field error associations. Verification: 33 frontend tests, lint, formatting, and production build passed.

Apply consistent pending and error behaviour to login, required password change, meal saves, and account creation. Meal saves already disable actions; account creation and password change still need pending-state protection. Errors must preserve entered values. Associate every field-level error with its input using stable IDs and `aria-describedby`, mark invalid inputs, and focus the first invalid field after validation.

Acceptance/tests:

- A deferred request plus repeated submit produces only one mutation for each affected form.
- Pending labels communicate progress, and controls return to usable state after failure.
- Blank meal names and missing/invalid dates are handled before saving; server validation remains authoritative.
- Name, date, location, and notes errors are associated with the correct controls.
- Failed account creation retains email and selected role; successful creation displays the returned temporary password without another creation request.

### 5.2b — Standardise forms with Formik and Yup

Implemented: login, password change, account creation, and meal editing now use Formik for values, errors, dirty state, and pending state. Shared `AppForm` and `FormField` components provide submission locking, first-error focus, stable accessible field IDs, and consistent input/select/textarea feedback. Validation schemas are centralized in `frontend/src/formSchemas.ts`.

Validation runs on submission; raw editable values stay in Formik. Meal API mapping explicitly trims text and converts optional blanks to null. Dates remain calendar strings, and passwords are never trimmed. Mounted panels preserve drafts; Formik reinitialization is not enabled. The shared lock covers validation and the request, including immediate repeated submissions.

TDD: the new accessible login-validation test failed before migration. Existing submission tests now provide valid credentials; focus tests await asynchronous validation. All previous behaviour assertions remain. Added calendar-date and password schema checks. Verification: 42 tests, lint, formatting, and production build passed. Browser visual review remains in 5.4.

### 5.3 — Accessible navigation and feedback

Finish the agreed account menu: Journal stays in primary navigation; an Account button opens Family accounts for administrators and Sign out for all active members. Profile is omitted until milestone 7. Use a labelled disclosure with normal buttons, rather than an ARIA menu unless full menu keyboard behaviour is implemented. Preserve the mounted draft panels when changing entry points.

Fix the journal region's accessible heading reference: currently `journal-title` only exists in list view. Ensure list, detail, and form each have a valid accessible heading. Move focus intentionally after changing screens, opening details, saving, and returning, without stealing focus on background loads.

Acceptance/tests:

- Account disclosure reports expanded state; Escape closes it and restores focus to Account.
- Members cannot see account-management actions; forced-password-change users cannot access protected navigation.
- Journal/detail/form regions have valid accessible names.
- Keyboard focus lands on the new view's heading or appropriate control and returns meaningfully after Back/Cancel.
- Loading and successful saves have appropriate status feedback; failures remain announced alerts.
- A network failure while checking the session offers retry rather than silently looking like a signed-out session. An actual unauthenticated response shows login.

### 5.4 — Visual consolidation and responsive review

Consolidate duplicated selectors and superseded rules in `App.css` while preserving appearance. Continue sourcing all theme colours from `colors.css`; add semantic tokens for navigation/selected states where they currently borrow text or field tokens. Check active navigation hover contrast as well as ordinary button states.

Complete the welcome treatment with restrained botanical decoration using original or appropriately licensed assets; retain the chef motif and family attribution. Keep illustration away from text and controls. Align journal/detail/forms and account management spacing, heading hierarchy, and button treatment. Use Lucide consistently for suitable actions without replacing useful text labels.

Browser review matrix:

| Dimension | Cases |
| --- | --- |
| Width | 360px, 768px, 1280px; 200% zoom |
| Access | Login, required password change, active member, administrator |
| Journal | Loading, empty, populated, long meal names, long notes/location, detail, create, edit, failed save |
| Accounts | Draft, loading, request failure, pending creation, temporary password, long emails |
| Interaction | Keyboard-only navigation, visible focus, disabled/hover/selected states, Escape and focus return |

Pass criteria: no horizontal page scrolling or clipped controls, readable wrapping, 44px action targets, visible labels, and adequate contrast (4.5:1 normal text; 3:1 large text and meaningful UI boundaries). Record actual screenshots and findings; do not infer visual quality from a successful build.

### 5.5 — Verification and handoff

- Run frontend tests, lint, formatting, and production build after the final implementation changes.
- Retain existing ownership, session-expiry, CSRF-request, meal ordering, and retry regressions. Server authorization remains the authority; hiding controls is not authorization.
- No backend/schema changes are expected. If scope requires them, add appropriate API tests and backend verification.
- Complete the browser matrix and record remaining issues, with no unresolved draft-loss, keyboard-blocking, or unreadable-layout defects.
- Update README and milestone status to reflect the final implemented scope.
- Keep work local; no push unless explicitly requested.

## Scope boundaries

Recipes, tags/search, pagination, photos, avatars/profile editing, favourites, seasonal collections, and reviews remain in later milestones. No public signup, new authentication architecture, or database migration is planned. Browser-history routing and persistence of drafts across reloads are separate future decisions.

## Completion definition

Milestone 5 is complete when existing access/journal/account workflows use the agreed design, the remaining behaviour scenarios pass, and desktop/mobile/keyboard review is recorded. The first styling pass and green unit tests alone do not close this milestone.

Recommended next implementation slice: **5.3**, accessible account navigation and feedback.
