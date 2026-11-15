# Milestone 7.1 — Display names and Profile

Implemented locally on 2026-11-15. Next: **7.2 — Private image foundation**. No deployment or hosted configuration change was performed.

## Delivered

Active members can open Profile from the Account disclosure, save or clear an optional display name, and see their saved name immediately in the signed-in header. Email remains read-only and remains the login identifier. Profiles without a name retain the existing email fallback in the account area and show a generic avatar placeholder. No upload controls are exposed yet.

The name is trimmed, limited to 80 characters, and supports Unicode and duplicate names. Blank input clears it. Self-service `GET` and `PUT /api/v1/profile` derive the account from the authenticated principal. Submitted IDs, roles, email addresses, or statuses cannot change the target or account privileges. The existing authentication, account-status, required-password-change, and CSRF protections apply.

V8 adds nullable `app_users.display_name` and `profile_version`, defaulting to zero. Profile updates use an atomic conditional version update and return 409 on a conflict. JDBC owns profile writes; the JPA account mapping reads the name without writing it, so stale account/password/status saves cannot overwrite a newer name. Existing credential, account, recipe, tag, meal, and link data is retained.

Profile drafts survive navigation and failed saves/logout. Save and reload operations prevent duplicate/overlapping requests. Conflict reload and resetting changed input require explicit discard; failed reloads retain the draft. Logout clears the mounted draft, and late completions cannot change a later session's identity. Navigation does not focus headings or fields on arrival. Validation and discard actions handle focus within the current view, including Escape and focus restoration after controls become enabled again.

## Verification performed

- Initial backend behaviour run: **5 expected failures out of 6 tests**, covering missing endpoints and V8; existing session/CSRF denial already passed. Initial frontend run: **7 expected failures** for the missing Profile entry.
- Backend `./mvnw.cmd --batch-mode verify`: **50 tests passed, zero failures/errors/skipped**, with JDK 21 and PostgreSQL 17/Testcontainers. Includes real login/CSRF/current-user refresh, simultaneous saves, ownership, validation, access restrictions, and protection against stale JPA writes.
- Fresh database startup applies V8 and passes Hibernate schema validation. The explicit V7-to-V8 migration test compares complete existing rows across accounts, recipes, ingredients, steps, tags, tag assignments, and linked meals. Earlier migration tests now explicitly target V7, retaining their original migration boundary; the new test covers V8 preservation.
- Focused frontend command: `npm test -- --run src/Profile.test.tsx src/Accessibility.test.tsx src/App.test.tsx src/Submission.test.tsx`: **34 tests passed**. Nine Profile tests cover API payload/CSRF/credentials, name clearing, failed saves, navigation drafts, conflicts, failed reloads, retries, validation focus, duplicate submission, hidden completion, logout/session boundaries, and discard/reset.
- Changed-file Oxlint and Prettier checks, TypeScript/production build, and `git diff --check`: passed.

The full frontend suite, browser smoke checks, responsive/zoom review, and real hosted workflows are deferred to **7.6**, per AGENTS.md. No browser or production behaviour is claimed from these component/API tests. No dependencies were added.

## Setup timing

**No manual Render or Supabase setup changes are needed for 7.1.** Deploy through the existing workflow when ready; Flyway applies V8 at backend startup. Keep the existing database, cookie, and CORS environment values. No new environment variable is required for display names.

Storage provisioning and backend secret configuration belong to **7.2**, after the Storage adapter and configuration contract are implemented and before hosted photo acceptance. At that point, provide the exact bucket restrictions and environment checklist from the [milestone plan](milestone-7-plan.md). The planned Storage variables are not supported by 7.1. Photos, avatar upload, and shared creator summaries remain for later slices.
