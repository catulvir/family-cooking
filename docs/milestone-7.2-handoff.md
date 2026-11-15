# Milestone 7.2 — Private image foundation

Implemented locally on 2026-11-15. Next: **7.3 — Meal photos**. No hosted configuration, commit, push, or deployment was performed as part of this slice.

## Delivered

The backend now supports private photo storage for saved meals, saved recipes, and the signed-in account's avatar. The complete upload controls and image presentation remain in 7.3–7.5; the frontend is unchanged.

- V9 adds application-owned parent slots, upload/remove operations, photo metadata, and durable cleanup tracking. Foreign keys and a one-parent check prevent invalid attachments; a partial unique index permits one active photo per parent. Existing application rows are unchanged. Supabase's managed `storage` schema is not modified.
- Disabled-by-default configuration reads the Supabase project origin, server secret, and three bucket names. Enabled requests verify private bucket metadata, exact size restrictions, and MIME allowlists. `GET /api/v1/photos/status` reports enabled/readiness to active members. Missing or invalid Storage configuration does not prevent existing text/profile-name workflows.
- A server-only HTTP adapter uses the current secret-key `apikey` header. It has bounded response bodies/concurrency/timeouts, no redirects, sanitized failures, immutable generated object keys, and bounded retries for reads/deletes. No secrets or Storage URLs enter photo responses.
- Image processing checks actual format against declared JPEG/PNG/HEIC MIME, the 5 MiB/24 MP limits, corruption, and animation/sequence restrictions. It applies all eight JPEG EXIF orientations and HEIC container transforms, strips metadata through re-encoding, flattens alpha onto white, and produces bounded JPEG detail/thumbnail derivatives without upscaling. Avatar variants use a centred square crop. One decoder runs at a time, with JPEG source subsampling, a bounded native HEIC subprocess, and no durable original-file storage.
- Protected multipart PUT and JSON DELETE endpoints exist for each parent; metadata GETs and authenticated JPEG byte GETs support the later UI slices. Parent creator/admin editing, avatar self-editing, active-account restrictions, and mutation CSRF checks are enforced. Byte responses have `private, no-store` and `nosniff`; detached images are inaccessible before remote cleanup finishes.
- Short database transactions reserve operations and publish only after uploads complete, rechecking permissions and the expected current photo. A partial upload keeps the old image. Identical completed operation replays return the original result; conflicting input or pending/failed operations return 409 without repeating writes.
- The existing backend worker recovers expired five-minute operations and deletes retired objects in bounded batches. Failed deletions retain retry state. Durable tombstones are rechecked daily to clean late provider writes after crash recovery; active images and fresh in-flight work are excluded. Removal remains possible during a provider outage while the feature is enabled.

Implementation is split into configuration, adapter, processing, authorization, repository, transactional lifecycle, orchestration, cleanup, DTO, controller, and exception-handler files. Added `com.drewnoakes:metadata-extractor:2.19.0` for JPEG EXIF reading; no frontend dependency was added.

## Verification performed

Initial missing-feature tests failed for the absent storage-status endpoint and V9 migration. Focused processor, adapter, migration, and lifecycle checks then passed. Real HTTP multipart testing exposed Tomcat closing an oversized upload before sending its JSON error; setting a bounded 8 MiB drain limit fixed that while retaining the 5 MiB file/6 MiB request acceptance limits.

Initial foundation verification passed **74 tests**. After the HEIC addition below, final `./mvnw.cmd --batch-mode verify` passed **81 tests, zero failures/errors/skipped**, using JDK 21 and PostgreSQL 17/Testcontainers. The original 24 photo tests cover:

| Coverage | Evidence |
| --- | --- |
| Configuration | Disabled/no credentials, invalid origins/keys/buckets, provider unavailability, private bucket restrictions |
| Processing | JPEG/PNG, transparency, dimensions, no upscaling, avatar crop, eight orientations, metadata stripping, corrupted/spoofed/animated input, byte/pixel limits, bounded decoder concurrency |
| Real HTTP adapter against a local server | Bucket/upload/download/delete paths, secret header, immutable upload, response bounds, deadlines, missing objects, redirects, sanitized failures, retry limits |
| Persistence and permissions | Three parent types, idempotent operations, collisions, parent ownership, administrator access, self-avatar routing, CSRF, inactive accounts, protected bytes, private cache headers |
| Failure and concurrency | Partial upload preserves old photo; one concurrent publish wins; permission/detach rechecked after network calls; no network I/O inside database transactions |
| Recovery | Deferred deletion, persisted failure attempts, fresh-operation protection, expired-operation recovery, daily tombstone re-deletion of late writes, active-byte preservation |
| Migration | Fresh database startup; V8-to-V9 upgrade preserves complete account/profile/recipe/ingredient/step/tag/link/meal rows; invalid parent references and duplicate active photos rejected |
| Embedded HTTP server | Real login/session/CSRF; actual per-file and whole-request multipart limits return JSON 413; the session remains usable afterward |

`git diff --check` passed. The earlier V8 migration test now explicitly targets V8; its original scope is preserved and the new migration test verifies V9.

No frontend source changed, so no frontend suite/build or browser review was run for this backend slice. Per AGENTS.md, browser smoke checks and extensive frontend verification remain deferred to **7.6**. Hosted Supabase credentials/operations, direct anonymous bucket denial, production TLS/CORS, deployed JVM memory/latency, storage quotas, and physical-device behaviour remain unverified. Local stub/fake tests do not establish live provider compatibility. Test “restart recovery” simulates durable pending state and lease expiry; it is not a real process-kill test.

## Setup timing and handoff

**Storage setup can now be prepared**, and is needed before hosted photo acceptance. Follow the [exact Render/Supabase setup runbook](photo-storage-setup.md). Create/verify private `dish-photos`, `recipe-photos`, and `avatars`, each restricted to JPEG with a 5,242,880-byte limit. Configure the project HTTPS origin and a dedicated `sb_secret_...` on the Render backend only. Keep `PHOTO_STORAGE_ENABLED=false` until the intended rollout/test environment is ready. No additional Render service, disk, Supabase Auth migration, or hosted image-transformation feature is required.

For ordinary deployment with photos disabled, no new credential is needed; Flyway applies V9 automatically. Existing database, cookie, and CORS settings remain. This implementation has not changed either hosted service.

HEIC conversion adds a runtime dependency: **rebuild/redeploy the updated backend Docker image**, which installs/configures the codec automatically. Plain-JAR deployments and local backend tests need Python 3.12, `photo-codecs-requirements.txt`, and `PHOTO_HEIC_PYTHON` as documented in the runbook. Supabase still accepts JPEG derivatives only; no bucket or schema changes are needed for HEIC.

7.3 can use the metadata/upload/remove endpoints documented in the runbook, add in-memory selection/preview, refresh parent metadata after an uncertain request, and fetch authenticated thumbnail/detail blobs. Keep photo actions separate from meal text saves. Continue to preserve drafts and avoid arrival focus. Final hosted checks and deployment-resource measurements belong in 7.6; backup/restore drills remain in milestone 11.

## HEIC addition within 7.2

At the user's request, submission now accepts `image/heic` and `image/heif` for HEVC still images. The backend decodes the primary image and uses the shared JPEG derivative pipeline for meals, recipes, and avatars. HEIF sequences and non-HEVC formats remain unsupported. Container rotation/crop/mirroring is applied by libheif; informational EXIF orientation is not applied again. No HEIC original, depth image, auxiliary image, or metadata reaches Storage. The source hash remains based on the original uploaded bytes, preserving the existing replay contract.

The decoder uses Pillow 13.0.0/pillow-heif 1.8.1 in a separate process with a restricted environment, bounded input/output, a deadline, and Linux CPU/address-space limits. Native packages are pinned in `backend/photo-codecs-requirements.txt`; Docker installs them and CI installs/verifies the same versions. These limits do not establish deployed Render memory headroom. The storage readiness endpoint remains a provider check; missing codecs yield 503 only for HEIC requests and do not break JPEG/PNG/text workflows.

Verification performed for this addition:

- The initial HEIC processor test failed against the previous implementation's 415 rejection. After implementation and fixture corrections, **21 focused tests passed**; the final full backend verification passed **81 tests, zero skipped**.
- Seven added JVM tests cover real HEIC/HEIF decoding, real container rotation without double rotation, metadata stripping, alpha, tiled images, avatar cropping, malformed/oversized/sequenced/spoofed input, missing/hung/broken decoder handling, bounded output, restricted child environment, and authenticated upload/replay/JPEG delivery for all three parent types.
- The production Docker image built successfully. **Three Linux runtime tests passed** in that image, including conversion of a generated 12 MP tiled photo under the helper's 512 MiB address-space limit. A separate packaged-JAR smoke check passed through the actual JVM → bundled Python/libheif → rotated JPEG path, running as the image's non-root user with no network and a read-only filesystem.
- Synthetic fixtures and their generator are committed as test resources. No personal photos or external service credentials were used. `git diff --check` passed.

No frontend source changed. Browser/device HEIC selection and preview fallback, real iPhone/HDR compatibility, live Storage acceptance, and deployed combined JVM/codec memory checks remain in 7.6. Future upload UI must allow HEIC selection even if local preview is unavailable and convert only on explicit Upload.
