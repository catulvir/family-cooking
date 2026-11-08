# Milestone 5.4 — visual and responsive review

Completed 2026-11-08. Chrome 157.0.8103.38 on Windows, against the local Vite application with synthetic API fixtures. No real accounts, passwords, or family records were used or changed.

## Result

All 88 captured states passed the layout, target-size, and contrast checks. Screenshot overviews and representative full-size captures were visually inspected for wrapping, spacing, hierarchy, decoration placement, and focus visibility. No unresolved horizontal scrolling, clipped controls, unreadable content, or keyboard-blocking defects were found in the reviewed cases.

- 360 × 900, 768 × 900, and 1280 × 900 CSS-pixel viewports.
- Actual Chrome **200% page zoom**, selected in Chrome's appearance settings in an isolated test profile. A 1280px outer window produced a 632 × 452 CSS-pixel viewport and device pixel ratio 2. This was not CSS zoom or pinch scaling.
- Every visible button/input/select/textarea measured at least 44px in both dimensions.
- Lowest measured text contrast: **4.53:1**. Lowest measured control-boundary contrast against its surrounding surface: **3.83:1**. Large-text threshold 3:1 and ordinary-text threshold 4.5:1 were checked separately.
- Active Journal hover uses white on deep green (**8.02:1**); the previous generic hover rule applied a pale peach fill while retaining white text.

Raw measurements, focus destinations, browser version, and zero final failures are recorded in [results.json](results.json). [review.mjs](review.mjs) contains the fixtures and repeatable review flow.

## Coverage and screenshots

All 22 states below were captured at each of the four viewport/zoom configurations. Overviews: [360px](360-overview.png), [768px](768-overview.png), [1280px](1280-overview.png), [actual 200% zoom](zoom-200-overview.png). Full-resolution PNGs are in [screenshots](screenshots/), named `<width-or-zoom>-<state>.png`.

| Area | Captured states | Representative evidence |
| --- | --- | --- |
| Access | Login, login keyboard focus, required password change | [Mobile login](screenshots/360-login.png), [password change](screenshots/360-password-change.png), [zoomed login](screenshots/zoom-200-login.png) |
| Journal | Member loading and empty views; administrator populated journal with long meal name | [Desktop journal](screenshots/1280-journal-populated.png), [mobile loading](screenshots/360-journal-loading.png), [mobile empty](screenshots/360-journal-empty-member.png) |
| Meals | Long name/location/notes detail, edit, create, failed save, discard confirmation, keyboard-created meal | [Long mobile detail](screenshots/360-long-meal-detail.png), [edit](screenshots/768-edit-meal.png), [failed save](screenshots/360-failed-save.png), [keyboard save](screenshots/zoom-200-keyboard-saved.png) |
| Accounts | Disclosure, draft, pending creation, temporary password, loading, failed request; long emails | [Tablet draft](screenshots/768-account-draft.png), [pending](screenshots/360-account-pending.png), [temporary password](screenshots/360-temporary-password.png), [failure](screenshots/360-accounts-failure.png) |
| Interaction styling | Selected and inactive Journal hover; primary and secondary hover; focus and disabled states | [Selected hover](screenshots/1280-journal-selected-hover.png), [inactive hover](screenshots/360-journal-inactive-hover.png), [primary hover](screenshots/1280-primary-hover.png), [secondary hover](screenshots/1280-secondary-hover.png), [keyboard focus](screenshots/360-login-focus.png) |

The keyboard-only member sequence uses Tab, Enter, Shift+Tab, and typing to sign in, create and save a meal, open editing, change the name, cancel, discard, and return to the saved journal entry. Focus destinations are asserted in the real browser. Account disclosure checks use Enter/Tab/Escape, including return to Account. Account email and Administrator role are entered with the keyboard. Switching views retains both account and meal drafts. Failed saves retain the draft, and the cancel confirmation's safe choice receives focus.

## Changes and findings

1. Consolidated the two overlapping visual passes into sections for shell, typography, feedback, controls, forms, navigation, and content. Kept the cream/terracotta/green palette and rounded-panel design.
2. Added semantic colors for navigation, selection, hover, secondary controls, disabled controls, and botanical decoration. Fixed selected-navigation hover contrast and strengthened input/button boundaries. Disabled states retain readable text without reducing whole-control opacity.
3. Added an original inline SVG botanical sprig beside the retained Lucide chef motif. It occupies its own header row, stays outside text and controls, and is hidden from assistive technology. No external artwork or additional asset license is required. Existing Lucide icons are also used for Add, Back, Edit, and Save while preserving the text labels.
4. Made account forms stack at tablet width, allowed action rows to wrap, and allowed unbroken names/location/notes/emails/passwords to wrap. Kept the account disclosure within the viewport.
5. Aligned journal/detail/form/account headings, content spacing, fields, and button treatment. Confirmed the 44px control minimum across the matrix.
6. Corrected a review-tool issue: Playwright's full-page screenshot clipping cropped actual browser-zoom captures. The final zoom PNGs use CDP's device-pixel content bounds and show the complete page; layout checks use the real CSS viewport. Earlier cropped captures were replaced.

## Reproduce

Start the frontend on localhost with `npm --prefix frontend run dev -- --host 127.0.0.1 --port 5174 --strictPort`. Run `node docs/reviews/milestone-5.4/review.mjs` from the repository root with Playwright available and Chrome installed. Set `PLAYWRIGHT_MODULE` to an existing Playwright module directory if it is not on the normal module path; set `REVIEW_URL` to override the local URL. The script stores its isolated zoom profile under the ignored `frontend/node_modules/.cache/review-zoom/` directory and closes its browser contexts after review. It regenerates individual screenshots and `results.json`; overview sheets are only visual indexes of those captures.

Frontend verification: **53 tests passed**, lint passed, Prettier check passed, production build passed, and `git diff --check` passed. No backend/schema changes were made.

Scope limits: this is a Chrome layout and keyboard review with mocked HTTP responses, not a live-backend integration test or a screen-reader audit. Other browser engines and physical mobile devices were not reviewed. Final milestone verification is now recorded in the [completed 5.5 handoff](../../milestone-5-handoff.md).
