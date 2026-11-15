# Milestone 7.2 — Private image foundation

Implemented locally on 2026-11-15. Next: **7.3 — Meal photos**. No hosted configuration, commit, push, or deployment was performed as part of this slice.

## Delivered

The backend now supports private photo storage for saved meals, saved recipes, and the signed-in account's avatar. The complete upload controls and image presentation remain in 7.3–7.5; the frontend is unchanged.

- V9 adds application-owned parent slots, upload/remove operations, photo metadata, and durable cleanup tracking. Foreign keys and a one-parent check prevent invalid attachments; a partial unique index permits one active photo per parent. Existing application rows are unchanged. Supabase's managed `storage` schema is not modified.
- Disabled-by-default configuration reads the Supabase project origin, server secret, and three bucket names. Enabled requests verify private bucket metadata, exact size restrictions, and MIME allowlists. `GET /api/v1/photos/status` reports enabled/readiness to active members. Missing or invalid Storage configuration does not prevent existing text/profile-name workflows.
- A server-only HTTP adapter uses the current secret-key `apikey` header. It has bounded response bodies/concurrency/timeouts, no redirects, sanitized failures, immutable generated object keys, and bounded retries for reads/deletes. No secrets or Storage URLs enter photo responses.
- Image processing checks actual format against declared JPEG/PNG MIME, the 5 MiB/24 MP limits, corruption, and PNG animation. It applies all eight JPEG EXIF orientations, strips metadata through re-encoding, flattens alpha onto white, and produces bounded JPEG detail/thumbnail derivatives without upscaling. Avatar variants use a centred square crop. One decoder runs at a time, with source subsampling and no durable original-file storage.
- Protected multipart PUT and JSON DELETE endpoints exist for each parent; metadata GETs and authenticated JPEG byte GETs support the later UI slices. Parent creator/admin editing, avatar self-editing, active-account restrictions, and mutation CSRF checks are enforced. Byte responses have `private, no-store` and `nosniff`; detached images are inaccessible before remote cleanup finishes.
- Short database transactions reserve operations and publish only after uploads complete, rechecking permissions and the expected current photo. A partial upload keeps the old image. Identical completed operation replays return the original result; conflicting input or pending/failed operations return 409 without repeating writes.
- The existing backend worker recovers expired five-minute operations and deletes retired objects in bounded batches. Failed deletions retain retry state. Durable tombstones are rechecked daily to clean late provider writes after crash recovery; active images and fresh in-flight work are excluded. Removal remains possible during a provider outage while the feature is enabled.

Implementation is split into configuration, adapter, processing, authorization, repository, transactional lifecycle, orchestration, cleanup, DTO, controller, and exception-handler files. Added `com.drewnoakes:metadata-extractor:2.19.0` for JPEG EXIF reading; no frontend dependency was added.

## Verification performed

Initial missing-feature tests failed for the absent storage-status endpoint and V9 migration. Focused processor, adapter, migration, and lifecycle checks then passed. Real HTTP multipart testing exposed Tomcat closing an oversized upload before sending its JSON error; setting a bounded 8 MiB drain limit fixed that while retaining the 5 MiB file/6 MiB request acceptance limits.

Final `./mvnw.cmd --batch-mode verify` passed **74 tests, zero failures/errors/skipped**, using JDK 21 and PostgreSQL 17/Testcontainers. This includes 24 new photo tests:

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

7.3 can use the metadata/upload/remove endpoints documented in the runbook, add in-memory selection/preview, refresh parent metadata after an uncertain request, and fetch authenticated thumbnail/detail blobs. Keep photo actions separate from meal text saves. Continue to preserve drafts and avoid arrival focus. Final hosted checks and deployment-resource measurements belong in 7.6; backup/restore drills remain in milestone 11.
