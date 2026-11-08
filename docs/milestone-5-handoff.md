# Milestone 5 — completed handoff

Completed locally on 2026-11-08. Milestone 5 delivers the redesigned private app shell, access forms, meal journal, and administrator account view. All slices 5.1–5.5 are complete within the agreed scope.

## Delivered behaviour

- Journal remains the initial signed-in destination. Account is a labelled disclosure with administrator-only Family accounts and member Sign out actions; Escape restores focus to Account.
- Meal and account drafts survive view switching. Changed meal forms offer Keep editing or Discard changes; pristine or reverted forms cancel immediately. Failed sign out preserves drafts; successful sign out clears them.
- Login, required password change, account creation, and meal forms use shared Formik/Yup infrastructure with submission locking, accessible validation, first-invalid-field focus, pending states, and retry recovery.
- Meal list/detail/form screens have valid accessible headings and intentional focus destinations. Hidden panels are excluded from keyboard navigation, and background results do not steal focus.
- Loading and successful saves provide status feedback. Session checks distinguish an unauthenticated response from a retryable network/server failure.
- Consolidated cream/terracotta/green styling, semantic state colors, original decorative botanical artwork, labelled Lucide actions, responsive forms, and readable long content follow the accepted design.

## Final verification

Commands were run from `frontend/` after the final test correction:

| Check | Result |
| --- | --- |
| `npm test -- --run` | 53 tests passed in 5 files |
| `npm run lint` | Passed, warnings denied |
| `npm run format:check` | Passed |
| `npm run build` | TypeScript and Vite production build passed |
| `git diff --check` from repository root | Passed |
| Browser evidence integrity | 88 PNG captures present; 22 states in each of 4 configurations; no recorded failures |

The first final test run exposed a timing-sensitive assertion in `Submission.test.tsx`: the server field error could appear before Formik completed submission and the focus effect ran. Login and meal field-validation focus assertions now use `waitFor` to await the same expected control. No expectation was removed, no timeout was increased, and no application behaviour changed. The full suite then passed.

Required regression coverage remains in place:

| Behaviour | Evidence |
| --- | --- |
| Server-controlled edit visibility; forced password-change access restriction | `Journal.test.tsx`, `Accessibility.test.tsx` |
| Session expiry retains unsaved meal; failed sign out preserves drafts | `Journal.test.tsx`, `App.test.tsx` |
| Credentialed meal creation with CSRF header | `Journal.test.tsx` |
| Older edited meals retain journal ordering | `Journal.test.tsx` |
| Failed save/list/account requests permit recovery and retain values | `Journal.test.tsx`, `Submission.test.tsx` |
| Duplicate submission protection across all four forms | `Submission.test.tsx` |
| Draft preservation, discard safety, focus return, background-focus protection | `Journal.test.tsx`, `Accessibility.test.tsx` |
| Real calendar dates and unchanged password characters | `formSchemas.test.ts` |

## Browser review

The [5.4 report](reviews/milestone-5.4/README.md) contains the reproducible fixture-based review script, screenshots, measurements, and findings. It covers Chrome at 360px, 768px, 1280px, and actual 200% browser zoom, including keyboard-only meal creation/edit cancellation and account disclosure navigation.

No unresolved draft-loss, keyboard-blocking, or unreadable-layout defects were found in the reviewed cases. The final 5.5 audit confirmed all capture files exist and the recorded failure list is empty. Application source remains unchanged from the reviewed 5.4 commit `9b0c6e0`; the final build retains the same `index-DVrFe_WW.css` and `index-B2T0Fz2j.js` bundle names. The browser matrix was therefore retained rather than rerun for a test-only correction and documentation changes.

## Boundaries and next work

No backend or migration files changed between the milestone 4 baseline `c42c2fe` and the final application commit, or in this handoff. Backend verification was not rerun for this frontend-only milestone. Server authorization remains authoritative; frontend visibility tests are not a substitute for server authorization tests.

Review coverage is limited to Chrome with synthetic HTTP fixtures. A live-backend end-to-end run, screen-reader audit, other browser engines, and physical mobile devices were not reviewed. Drafts remain session-memory only; browser reload/history persistence is outside this milestone. These limits do not expand the agreed milestone 5 scope.

Next is **milestone 6 — recipe library and discovery**, including an explicit recipe ownership/edit-permission decision before implementation. Photos/profile editing, favourites, ingredients discovery, and reviews remain in their later milestones.

This handoff is local. No commit, push, merge, or deployment was performed as part of 5.5.
