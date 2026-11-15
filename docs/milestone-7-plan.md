# Milestone 7 — Photos and personal profiles

Status: **7.1 and 7.2 implemented locally on 2026-11-15**; 7.3–7.6 remain planned. [7.1 handoff](milestone-7.1-handoff.md), [7.2 handoff and verification](milestone-7.2-handoff.md). No hosted configuration changes or deployment have been made. The [Storage setup runbook](photo-storage-setup.md) is ready for configuration before hosted acceptance.

Build on the [milestone 6 handoff](milestone-6-handoff.md), its [review fixes](milestone-6-review-fixes.md), and the [accepted visual direction](milestone-4-ui-design.md). Journal remains the initial signed-in view. Add Profile to the Account disclosure; retain the existing meal terminology and cream/terracotta/green interface.

## Outcome and scope

Active family members can maintain a display name and avatar, and see private photos on shared meals and recipes. Creators and administrators can manage photos on the meals/recipes they can edit. Existing accounts, recipes, meals, drafts, and recipe links continue to work without images or profile setup.

Proposed first-release limits:

- One optional photo per saved meal, one per saved recipe, and one avatar per account. Add, replace, and remove are supported; galleries and photo ordering are later work.
- Add meal/recipe photos from their saved detail views. Creation first saves the meal or recipe, then offers Add photo. Photo saving is an explicit, separate action from editing text, avoiding ambiguous partial saves.
- Meal photos depict that cooking event. Recipe photos belong to the reusable recipe. Linking or recording a recipe does not copy photos, and meals without photos retain a placeholder rather than silently inheriting a changing recipe image.
- Profile contains an optional display name and avatar. Email remains the login identifier and is read-only here; roles, account status, and password flows remain separate.
- Initial uploads accept JPEG, PNG, and still HEIC/HEIF, at most 5 MiB (5,242,880 bytes) and 24 megapixels. HEIC support was added to 7.2 at the user's request: convert to JPEG on backend submission. Explain the limits before selection. Animated images/HEIF sequences, SVG, video, AVIF, original-file downloads, and a crop editor are outside this milestone.
- Preserve in-memory drafts across view changes. Reload recovery, public profile pages, public sharing, favourites, reviews, and account deletion remain outside scope.

## Permission and privacy contract

| Operation | Allowed actor |
| --- | --- |
| Read meal/recipe photos and displayed member avatars | Active family members |
| Add, replace, or remove a meal/recipe photo | The parent resource's creator or an administrator |
| Change display name or avatar | The signed-in account itself, including administrators editing their own profile |
| Change another member's profile | Not introduced in this milestone |

Enforce permissions on the backend on every request, including image bytes and thumbnails. Reuse account-status and mandatory-password-change restrictions. Require CSRF for every mutation, including multipart uploads and removal. Never trust a submitted owner, object path, bucket, or external image URL. Photo ownership follows the parent resource, not the person who last uploaded its photo.

Store all images in private Supabase Storage buckets. The browser talks only to the application API using its existing cookie session; Supabase Auth is not introduced. The backend holds the privileged Storage credential and applies application authorization before calling Storage. The existing application users are not Supabase Auth users, so policies based on `auth.uid()` do not represent this application's membership. Privileged Storage access bypasses provider RLS; that makes the application's checks essential. [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

Serve image bytes through authenticated application endpoints, with `Cache-Control: private, no-store` and a fixed validated content type. Do not return public or signed Storage URLs to the browser. Signed URLs remain usable by whoever holds them until invalidated or expired; the proxy design makes new image requests subject to current account status. Already downloaded bytes cannot be recalled. [Private asset access](https://supabase.com/docs/guides/storage/serving/downloads).

Use credentialed fetch and short-lived browser blob URLs for image display so the existing separate-origin deployment also works. Revoke blob URLs on replacement/unmount/logout; clear image state when authentication is lost. Bound simultaneous requests and load thumbnails lazily. Failed images show a useful placeholder without preventing access to meal/recipe text.

## Profile behaviour

- Display name: optional, trimmed, 1–80 characters when present; blank clears it. Render as plain text, allow duplicate names, and preserve Unicode names.
- Existing accounts start with no display name or avatar. The current user's account area can fall back to their existing email; shared creator labels use `Family member` instead of introducing email exposure. Avatar fallback uses name initials or a generic person icon.
- Expose the current profile through a self-service API and refresh the signed-in header after successful saves. Shared meal/recipe creator summaries can include current display name and avatar reference, never credentials or additional account details.
- Display name edits use an explicit Save action; avatar upload/removal has its own labelled action and status. A failed avatar change does not undo a saved name or discard a name draft.
- Use version checks for profile edits and conditional photo replacement/removal. Conflicts retain the draft and offer explicit reload/discard, following existing recipe behaviour.
- Do not automatically move focus on opening or returning to Profile, meal detail, or recipe detail. Retain visible keyboard focus and deliberate handling for validation, upload actions, and discard confirmations.

## Image processing and persistence

Validate actual decoded content, byte size, dimensions, and supported format on the server before Storage upload. Inspect dimensions before allocating full decoded images, bound processing concurrency and temporary-file lifetime, and verify limits against the deployed JVM's memory budget. Client checks provide early feedback but are not authoritative.

Apply JPEG EXIF orientation, then re-encode into normalized JPEG derivatives with metadata removed, including GPS. Flatten transparency onto a consistent background. Generate a detail image fitting within 1600 × 1600 and a thumbnail fitting within 320 × 320; avatars use a 256 × 256 centre crop. Do not upscale. Bound output size to the bucket limit. Store derivatives only; do not retain the original upload. Circular presentation belongs in CSS, while full meal/recipe images retain their aspect ratio.

Generate thumbnails in the backend. This avoids a dependency on Supabase's hosted image transformation feature, which is currently offered on Pro plans and above. It does add bounded CPU/memory work to Render, to be measured before release. [Image transformations](https://supabase.com/docs/guides/storage/serving/image-transformations).

Use additive Flyway migrations after V7, allocated in implementation order:

- Nullable display name and a profile version on `app_users`.
- Application-owned photo metadata: generated UUID, parent reference, uploader, generated object keys, dimensions, content type, byte sizes, lifecycle state, and timestamps. Enforce valid parent references and one active image per parent with database constraints.
- Durable upload-operation and cleanup tracking sufficient to recover partial writes and process restarts. Keep image bytes out of PostgreSQL.

Do not alter Supabase's managed `storage` schema with Flyway or direct SQL. Object changes go through the Storage API. [Storage schema guidance](https://supabase.com/docs/guides/storage/schema/design).

PostgreSQL and object storage cannot share one transaction. Plan the lifecycle explicitly:

1. Authorize and validate the request, reserve an operation and unique object keys in PostgreSQL, then upload derivatives without holding a database transaction open over network I/O.
2. In a short transaction, recheck permission and the expected current photo/version, and publish the new metadata/pointer only after all derivatives exist.
3. Keep the old photo available until replacement commits. Failed uploads or stale replacements leave it intact; unreferenced new objects become cleanup work.
4. Removal clears the active reference and queues deletion atomically. The backend immediately denies access to detached image IDs, even if Storage deletion retries later.
5. Retry cleanup through a bounded worker in the existing backend; persist retry state. Reconcile stale pending operations after a grace period, protect in-flight operations, and never delete referenced objects. No separate worker service is required initially.
6. Use a client operation ID for safe retries after a lost response; reusing it with different input is rejected. Concurrent replacements yield one winner and a recoverable conflict, with no leaked active images.

Use a small object-storage interface with a Supabase HTTP adapter and deterministic test doubles. Separate DTOs, repositories, services, controllers, and image-processing code following [project conventions](../AGENTS.md). Configure connect/read timeouts, bounded retries, and sanitized errors; never log credentials or upload bodies.

## Proposed API shape

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/profile` | Current profile with version and avatar metadata |
| `PUT /api/v1/profile` | Update the current account's display name with version checking |
| `PUT /api/v1/profile/avatar` | Validated multipart upload/replacement for the current account |
| `DELETE /api/v1/profile/avatar` | Conditional avatar removal |
| `PUT /api/v1/dishes/{id}/photo` and `/api/v1/recipes/{id}/photo` | Upload/replace a saved parent's photo |
| `DELETE /api/v1/dishes/{id}/photo` and `/api/v1/recipes/{id}/photo` | Conditional photo removal |
| `GET /api/v1/photos/{id}/{variant}` | Authorized bytes for an allowlisted thumbnail/detail variant |
| Existing current-user, meal, and recipe responses | Add nullable photo/profile summaries without changing existing fields or ordering |

Photo mutations carry the expected current photo ID (explicit null for initial upload) and an operation ID; profile text uses its own version. Photo changes must not overwrite text or bypass recipe aggregate version checking. Lists contain metadata/references only and avoid per-row database queries or Storage calls.

Follow existing error envelopes: 400 invalid input, 401 unauthenticated, 403 forbidden, 404 missing/detached image or parent, 409 conflict, 413 oversize, 415 unsupported image, and a retryable 503 for Storage unavailability. Multipart size errors must produce usable API errors rather than HTML responses. For multipart requests send the CSRF header but let the browser set the content-type boundary.

## Ordered implementation slices

Each slice follows failing behaviour test → implementation → refactoring. Run relevant backend and migration verification as changes land, with zero skipped database tests. Use focused frontend tests and lint/type/build checks in earlier slices. Per [AGENTS.md](../AGENTS.md), browser smoke checks and the extensive frontend suite are deferred to **7.6** unless explicitly requested earlier. Record performed and deferred checks separately.

### 7.1 — Display names and Profile

Implemented: V8 adds optional display names and a profile version; self-service GET/PUT, Account → Profile, read-only email, generic avatar placeholder, and immediate header refresh are available. Drafts, save/reload errors, conflicts, discard confirmation, and logout/session boundaries are protected without arrival focus. Backend verification passed **50 tests, zero skipped**; **34 focused frontend tests**, changed-file lint/format checks, and production build passed. Full frontend and browser review remain deferred to 7.6. **No manual Render/Supabase setup change is required for 7.1**; V8 applies through Flyway on deployment. [Detailed handoff](milestone-7.1-handoff.md).

Deliver the additive profile migration, self-service API, Profile entry in Account, name form, and signed-in identity refresh. Include placeholder avatars and a version/conflict contract without exposing unavailable upload actions.

Acceptance: legacy accounts still log in; a member edits only their own name; invalid/blank/Unicode names behave as specified; failed saves and view changes preserve drafts; stale saves do not overwrite changes; password-change and account-status restrictions remain enforced. Fresh-schema and V7-upgrade tests preserve existing accounts, recipes, tags, meals, and links. No automatic navigation focus.

### 7.2 — Private image foundation

Implemented: V9, disabled-by-default Storage configuration, the private Supabase HTTP adapter, bounded JPEG/PNG/HEIC processing and metadata-free JPEG thumbnails, authenticated metadata/byte delivery, all three parents' backend mutations, and durable operation/cleanup recovery. **81 backend tests passed, zero skipped**, including real HTTP multipart limits, actual HEIC decoding, local adapter contract tests, and migration/lifecycle/permission checks. Three Linux codec tests and a packaged Docker JVM-to-decoder smoke check also passed. Frontend controls remain for 7.3–7.5. [7.2 handoff](milestone-7.2-handoff.md), [exact setup steps](photo-storage-setup.md). Live provider acceptance and browser/full frontend checks remain in 7.6.

Deliver Storage configuration/adapter, metadata migrations, bounded image validation/processing, authenticated byte delivery, and durable operation/cleanup support. Add configuration examples and a deployment runbook with no real credentials. Keep feature controls hidden until their complete user flow is available.

Acceptance: verify JPEG/PNG/HEIC decoding, rotated images, metadata removal, limits, corrupt/spoofed inputs, unauthorized bytes, CSRF, Storage timeout/partial failure, safe retries, restart recovery, and cleanup that never removes referenced images. Exercise actual HEIC codec dependencies and Linux limits; bound native processing outside the JVM. Contract tests verify the actual adapter's paths, credential headers, and error handling against a local HTTP stub. Backend tests do not require production credentials.

### 7.3 — Meal photos

Deliver add/preview/upload/replace/remove on saved meal detail, journal thumbnails, fallback states, and credentialed image loading. Keep photo and text saves visibly separate. Selection/preview stays local until Upload; Cancel performs no remote mutation. Accept HEIC/HEIF selection with a filename/format fallback where the browser cannot preview it; the backend converts it on explicit Upload and returns JPEGs.

Acceptance: creator/admin can manage photos; another member can view but cannot mutate through a direct request; failure retains selection and existing photo; concurrent replacement/removal cannot lose a newer image; navigating preserves the pending selection and unrelated drafts. Reload shows persisted images, and an unlinked meal supports the complete flow.

### 7.4 — Recipe photos

Reuse the photo flow for recipe detail and library thumbnails. Preserve filters, pagination, ordered ingredients/instructions, recipe draft conflicts, and meal return navigation.

Acceptance: ownership checks match recipe editing; list/detail images update after replacement; missing images do not break discovery; recording or linking a recipe does not copy its image or change a meal photo. Recipe text and photo mutations cannot silently overwrite one another.

### 7.5 — Avatars and shared identity

Deliver avatar selection/preview/upload/removal in Profile, account-button identity, and creator display names/avatar summaries in meal/recipe views. Use predictable initials/generic fallbacks, image alternative text appropriate to context, and immediate refresh after successful self edits.

Acceptance: another member and an administrator cannot mutate someone else's profile through the self-service endpoints; unauthorized avatar bytes are blocked; failed avatar saves preserve the previous avatar and name draft. Logout/account change clears pending files and blob URLs. Shared identity does not expose another member's email.

### 7.6 — Integrated verification and handoff

- Run full backend verification with PostgreSQL/Testcontainers, frontend tests, lint, formatting, production build, and diff checks; report skipped tests and actual coverage.
- Run the packaged app against isolated PostgreSQL and a dedicated private Storage test location, using synthetic accounts and images. Verify all three image targets, real adapter authentication, add/replace/remove, restart/reload persistence, permission failures, and cleanup recovery. Stub tests alone do not establish hosted Storage compatibility.
- Verify direct unauthenticated Storage access fails, no privileged key enters the frontend bundle/logs, and signed-out/disabled/password-change-required sessions cannot fetch image bytes. Test both existing deployment layouts where available, including credentialed image requests.
- Browser review at 360/768/1280px and actual 200% zoom: keyboard upload/cancel/remove, errors, loading, missing-image fallbacks, long names, drafts, conflicts, and navigation without arrival focus. Use synthetic images rather than family photos in captures.
- Measure bounded image-processing memory, concurrent uploads, thumbnail loading, and representative request latency on the intended service size. Check provider usage before deciding whether a plan upgrade is necessary.
- Record local versus hosted evidence separately. A hosted check remains outstanding until the target environment is configured and exercised; do not call it passed based on local mocks. Deployment itself is a separate action from this planning task.
- Write the final handoff, exact setup steps, remaining limitations, and next milestone 8. Photo storage and metadata must eventually be backed up together; full restore drills remain in operational-readiness milestone 11.

## Render and Supabase setup changes

The repository now supports the Storage configuration below as of 7.2. **Prepare it before hosted photo acceptance**, following the [exact setup and operation runbook](photo-storage-setup.md). Photos remain disabled by default, so the existing application can run without these credentials. Live Render/Supabase dashboards were not inspected or changed during planning or implementation.

| Area | Required change for milestone 7 |
| --- | --- |
| Supabase project/database | Reuse the existing project and JDBC/session-pooler setup. Flyway applies additive application migrations at deployment. |
| Storage buckets | Create or verify private `dish-photos`, `recipe-photos`, and `avatars` buckets. Reuse the previously documented `dish-photos` name if already provisioned. |
| Bucket restrictions | Allow stored `image/jpeg` derivatives only, with a 5 MiB per-object limit. Ensure the project's global limit permits that. Browser inputs can be JPEG/PNG/HEIC because the backend normalizes them before Storage upload. |
| Storage access | Keep anonymous/browser access denied; do not add permissive public or authenticated-user policies. Audit existing bucket policies if reusing a bucket. Backend access uses a server-only secret key. |
| Render backend environment | Add `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `STORAGE_DISH_PHOTOS_BUCKET=dish-photos`, `STORAGE_RECIPE_PHOTOS_BUCKET=recipe-photos`, and `STORAGE_AVATARS_BUCKET=avatars`. |
| Activation | Add `PHOTO_STORAGE_ENABLED` (default false). When enabled, validate required configuration and bucket privacy/restrictions before considering the photo feature ready. When disabled/unavailable, preserve text/profile-name workflows and display useful photo fallbacks. |
| Upload limits | Configure Spring multipart maximum file size to 5 MiB and maximum request size to 6 MiB; validate decoded pixels and output sizes separately. |
| Frontend | No Supabase key or new Supabase frontend environment variable. Keep the existing API origin and cookie/CORS configuration. |
| Render services/disk | Reuse the existing backend. No persistent disk or additional service is needed; temporary processing files are disposable. |
| HEIC runtime | Rebuild/redeploy the updated backend Docker image, which includes the decoder. Plain-JAR deployments need Python 3.12, the pinned photo-codec requirements, and `PHOTO_HEIC_PYTHON`; see the setup runbook. No Supabase change is needed for HEIC. |
| Subscription | No planned mandatory upgrade. Backend thumbnails avoid hosted transformations; check actual storage/egress quotas and Render memory before release. |

Prefer a dedicated current `sb_secret_...` key for the backend. Send this key through the documented `apikey` header, not as though it were a JWT; verify this with the live Storage adapter check in 7.6. Keep it in Render's backend environment and local ignored configuration only, never `VITE_*`, browser responses, Git, or copied logs. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Render environment variables](https://render.com/docs/configure-environment-variables).

The 5 MiB application limit keeps uploads within Supabase's small-file standard-upload recommendation. Bucket and project limits are separate from the backend request limit. Render's default filesystem is ephemeral, so durable images belong in Storage. [Standard uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads), [upload restrictions](https://supabase.com/kb/troubleshooting/upload-file-size-restrictions-Y4wQLT), [Render filesystem behaviour](https://render.com/docs/deploys).

Suggested rollout: implement/test with isolated storage; provision or verify production buckets and the backend secret; deploy the additive migrations and code with photos disabled; validate configuration; enable photos and run an authorized hosted acceptance check. Retain existing database/cookie settings. On a photo-feature rollback, disable photo operations and keep metadata/objects for recovery rather than deleting family data.

## Planning verification

The original planning pass reviewed the roadmap, accepted design, milestone 6 handoff/review fixes, account/security/API code, migration inventory through V7, and committed environment examples. It checked the official Supabase and Render documentation linked above on 2026-11-15, without running application tests or changing hosted services. Subsequent 7.1 and 7.2 implementation and verification are recorded in their handoffs; browser checks, real bucket access, hosted configuration, and deployment remain outstanding.
