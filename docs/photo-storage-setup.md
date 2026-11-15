# Private photo storage — setup and operation

Milestone 7.2 provides the backend foundation. Upload controls arrive in 7.3–7.5. **The existing app can be deployed with photos disabled and no Storage credentials.** V9 runs automatically through the existing Flyway deployment flow; do not run separate application-table SQL in Supabase.

This checklist is ready to use when configuring Storage, before hosted photo acceptance. No live Render or Supabase configuration has been changed or inspected as part of 7.2.

## 1. Prepare Supabase Storage

Reuse the existing Supabase project. Create or inspect these three buckets:

| Bucket | Visibility | Stored content | File-size limit |
| --- | --- | --- | --- |
| `dish-photos` | Private | `image/jpeg` only | 5,242,880 bytes (5 MiB) |
| `recipe-photos` | Private | `image/jpeg` only | 5,242,880 bytes (5 MiB) |
| `avatars` | Private | `image/jpeg` only | 5,242,880 bytes (5 MiB) |

The backend verifies the exact stored byte limit, private flag, and MIME allowlist. If the dashboard uses a size unit, verify that its stored value is **5,242,880**, rather than assuming a label of “5 MB” means the same thing. The project's global upload limit must allow at least this much. Inputs can be JPEG, PNG, or still HEIC/HEIF; only normalized JPEG derivatives reach Storage. **Do not add HEIC to the bucket MIME allowlist.** [Supabase bucket restrictions](https://supabase.com/docs/guides/storage/buckets/fundamentals), [upload limits](https://supabase.com/kb/troubleshooting/upload-file-size-restrictions-Y4wQLT).

Keep browser/anonymous access denied. A new private bucket needs no permissive client policies for this backend-only integration. Audit existing policies if reusing a bucket: neither `anon` nor browser Supabase Auth users should have grants exposing these objects. Existing application accounts use Spring sessions, not Supabase Auth. The privileged server credential bypasses Storage RLS, so application permission checks remain mandatory. [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

Create a dedicated server secret key in Supabase's API Keys settings. This implementation accepts the current `sb_secret_...` format and sends it in the `apikey` header. It does not use a publishable key, database password, personal access token, or legacy JWT `service_role` key. [API keys](https://supabase.com/docs/guides/getting-started/api-keys).

Bucket setup belongs in the dashboard or Storage API, not direct writes to Supabase's managed `storage` tables. Do not make a bucket public to fix an access failure. [Storage schema guidance](https://supabase.com/docs/guides/storage/schema/design).

## 2. Configure the Render backend

Set these on the backend Web Service, or the single same-origin service if it serves both the JAR and frontend:

| Variable | Value |
| --- | --- |
| `PHOTO_STORAGE_ENABLED` | `false` while preparing configuration; `true` when ready to enable the photo API |
| `SUPABASE_URL` | The HTTPS project origin, e.g. `https://YOUR_PROJECT_REF.supabase.co`; no `/storage/v1` suffix |
| `SUPABASE_SECRET_KEY` | The dedicated server-only `sb_secret_...` value |
| `STORAGE_DISH_PHOTOS_BUCKET` | `dish-photos` (also the default) |
| `STORAGE_RECIPE_PHOTOS_BUCKET` | `recipe-photos` (also the default) |
| `STORAGE_AVATARS_BUCKET` | `avatars` (also the default) |

Use distinct bucket names. Do not put the key in frontend settings, any `VITE_*` variable, source control, screenshots, request payloads, or logs. Update local ignored `.env` only when intentionally using a dedicated development project. Tests use isolated PostgreSQL and local storage doubles/stubs, so they need no Supabase credentials.

Keep the existing JDBC/session-pooler, cookie, and CORS settings. There is no new Render service, persistent disk, or cron job: the existing backend processes images and runs cleanup. Supabase-hosted image transformations are not used. The servlet may spool an incoming request to temporary disk and removes it at request completion; durable originals are not retained. [Render environment settings](https://render.com/docs/configure-environment-variables), [Render ephemeral filesystem](https://render.com/docs/deploys).

**HEIC runtime setup:** the updated `backend/Dockerfile` includes Python 3.12, Pillow, pillow-heif, and its bundled libheif/HEVC decoder. A Render Docker deployment only needs a rebuild/redeploy of this version; `PHOTO_HEIC_PYTHON=/opt/photo-codecs/bin/python` is set by the image. No manual package installation or new Render environment variable is needed for that path.

For a plain-JAR deployment or local development, install Python 3.12 and create a virtual environment before running the API/tests. From `backend/` on Linux:

```sh
python3.12 -m venv .photo-codecs
.photo-codecs/bin/pip install --only-binary=:all: -r photo-codecs-requirements.txt
export PHOTO_HEIC_PYTHON="$PWD/.photo-codecs/bin/python"
```

On Windows with Python 3.12 installed:

```powershell
py -3.12 -m venv .photo-codecs
.\.photo-codecs\Scripts\python.exe -m pip install --only-binary=:all: -r photo-codecs-requirements.txt
$env:PHOTO_HEIC_PYTHON = (Resolve-Path .photo-codecs/Scripts/python.exe).Path
```

Keep that environment variable in the API/test process. An IDE needs the same absolute interpreter path in its run configuration. Missing codecs cause HEIC requests to return sanitized 503 errors; JPEG/PNG and text workflows remain available. The storage-status endpoint checks Supabase configuration, not the local HEIC runtime. Verify a real HEIC upload before enabling hosted photo acceptance.

The requirements pin Pillow 13.0.0 and pillow-heif 1.8.1; the tested wheels bundle libheif 1.23.6/libde265 1.1.3. Keep these native decoder dependencies updated together. The helper runs outside the JVM with no application credentials in its environment, a 15-second wall deadline, one decoder at a time, and Linux limits of 512 MiB address space and 10 CPU seconds. It exchanges bounded pixel data through pipes and saves no source file. The Windows development path has the deadline/byte/pixel/concurrency bounds but no Linux resource limits. These are process limits, not a complete OS security sandbox or a guarantee that JVM plus codec fits a particular Render memory tier. Measure combined memory before release. [pillow-heif API](https://pillow-heif.readthedocs.io/en/stable/reference/API.html), [decoder options](https://pillow-heif.readthedocs.io/en/stable/options.html).

Redeploy to apply environment changes. Configuration errors disable photo readiness without breaking text/profile-name workflows. The global application health check deliberately remains independent of Storage; monitor the protected photo status separately when enabling this feature.

## 3. Verify readiness and access

With an active application session, open **`/api/v1/photos/status` on the API origin**:

- Disabled: `{"enabled":false,"ready":false}`. No provider calls are made.
- Correctly configured and reachable: `{"enabled":true,"ready":true}`.
- Enabled but misconfigured/unreachable: `{"enabled":true,"ready":false}`. Check the project origin, server key, exact bucket names, private flags, byte limits, MIME restrictions, and provider availability. No secret/provider error body is returned.

Readiness checks bucket metadata over the real adapter, but does not establish that upload/download/delete all work. Final hosted acceptance in 7.6 must use synthetic files and accounts to exercise those operations and verify that direct unauthenticated Storage access fails. Do not call that check passed based on local tests or the readiness response alone. Keep production photos disabled until the intended hosted rollout is ready; backend API checks can be performed in a dedicated test environment during development.

## Backend API contract for later UI slices

| Parent | Current metadata | Upload/replace | Remove |
| --- | --- | --- | --- |
| Saved meal | `GET /api/v1/dishes/{id}/photo` | `PUT /api/v1/dishes/{id}/photo` | `DELETE /api/v1/dishes/{id}/photo` |
| Saved recipe | `GET /api/v1/recipes/{id}/photo` | `PUT /api/v1/recipes/{id}/photo` | `DELETE /api/v1/recipes/{id}/photo` |
| Signed-in account | `GET /api/v1/profile/avatar` | `PUT /api/v1/profile/avatar` | `DELETE /api/v1/profile/avatar` |

Uploads use multipart parts `file` (JPEG/PNG/HEIC bytes with matching content type: `image/jpeg`, `image/png`, `image/heic`, or `image/heif`) and `request` (`application/json`). HEIF support is for HEVC still images; sequences, AVIF, and other HEIF codecs are not accepted:

```json
{"operationId":"CLIENT_GENERATED_UUID","expectedPhotoId":null}
```

`expectedPhotoId` is required: use explicit null for an empty slot or the currently displayed photo UUID for replacement/removal. DELETE uses the same JSON as its request body. Send the existing `X-CSRF-TOKEN` header and session cookie. Let the browser set the multipart boundary. Requests cannot specify a bucket, storage key, uploader, or another avatar owner.

Responses are `{"photo":null}` or `{"photo":{"id":"...","width":1600,"height":900,"thumbnailWidth":320,"thumbnailHeight":180}}`. Fetch bytes with the session cookie from `GET /api/v1/photos/{id}/detail` or `/thumbnail`; responses are JPEG with `Cache-Control: private, no-store` and `nosniff`. There is no original-file or public/signed-URL endpoint. For separate frontend/API origins, use credentialed fetch and managed blob URLs when implementing the UI.

Replay the same operation ID and identical upload after a lost response. A completed operation returns its original result without uploading again; it never reattaches an old image if a later change has replaced it. Refresh current metadata after such a replay. Reusing the ID with another actor, parent, action, expected photo, or file is rejected. A pending operation returns 409; refresh before retrying. A recorded failed operation returns 409 with an instruction to start a new operation ID. Never silently resolve a current-photo conflict by replacing the latest ID and resubmitting the old selection.

Limits: 5 MiB/file, 6 MiB/multipart request, 24 megapixels before decoding. JPEG EXIF orientations 1–8 are applied. HEIC uses the primary still image, applies container rotation/mirroring through libheif, and does not apply informational EXIF orientation a second time. Depth maps and auxiliary images are not stored; HDR inputs are converted to 8-bit output. PNG animation, HEIF sequences, unsupported formats, corrupt input, and declared-type mismatches are rejected. JPEG output has metadata removed, transparent pixels flattened onto white, and dimensions bounded without upscaling. Meals/recipes get detail up to 1600 × 1600 plus thumbnail up to 320 × 320; avatars get a centred square up to 256 × 256 for both variants. [HEIF orientation semantics](https://pillow-heif.readthedocs.io/en/stable/workaround-orientation.html).

For 7.3–7.5, allow `.heic`/`.heif` selection without assuming the browser can decode it for a local preview. Show a filename/format fallback and retain the file until explicit Upload; display the returned JPEG after submission. Do not send a selected image to the backend merely to render a preview.

Expected errors: 400 malformed/invalid content, 401 unauthenticated, 403 forbidden/inactive access, 404 absent or detached image/unknown variant, 409 operation/current-photo conflict, 413 excessive size, 415 unsupported or mismatched format, 503 disabled/unready/busy/provider failure. Signed-out, disabled, pending, and mandatory-password-change accounts cannot use protected image operations.

## Recovery and operational limits

- Uploads reserve generated immutable object keys and metadata in PostgreSQL before contacting Storage. The old active photo remains until all derivatives have uploaded and a short transaction rechecks account permission and the expected current photo.
- Photo operations have a five-minute lease. A crash leaves recoverable pending state; stale pending work becomes retired cleanup work. Database transactions are not held during provider HTTP calls.
- Replacement/removal immediately detaches the old image in PostgreSQL. Its byte endpoint denies access while physical deletion is pending. Removal can succeed during a Storage outage, provided the feature remains enabled and PostgreSQL is available.
- The existing backend checks cleanup once per minute, in batches of at most ten. Failures use persisted exponential retry delays from one minute up to one hour. Active images and unexpired operations are excluded.
- Retired rows/operation IDs remain as durable tombstones. Successful deletions are checked again daily to remove a late provider write that completed after lease recovery. These rows cannot be reactivated. There is no automatic tombstone pruning in 7.2.
- Provider requests have a ten-second complete-response deadline, a three-second connection timeout, bounded bodies, no redirects, and at most two attempts for reads/deletes. Uploads are not automatically replayed. At most eight provider calls, two upload workflows, and one image decoder run concurrently per JVM; excess work returns a retryable 503.
- Multipart data is spooled at a zero-byte threshold, while decoding uses bounded in-memory input and source subsampling. Tomcat drains at most 8 MiB of rejected request data so ordinary over-limit uploads can receive JSON 413 responses. Very large requests beyond that bound, or earlier proxy limits, can terminate at the transport layer. The real HTTP tests cover both configured multipart limits. [Tomcat request draining](https://tomcat.apache.org/tomcat-10.1-doc/config/http.html).
- Backend-generated thumbnails avoid hosted transformation requirements, but storage/egress quotas and deployment memory/latency must still be measured in 7.6. Full backup/restore drills remain in milestone 11; image objects and application metadata must be backed up together.

For rollback, set `PHOTO_STORAGE_ENABLED=false` and redeploy. This stops photo access and cleanup while leaving existing application data and stored objects intact. Keep the additive V9 tables; do not delete objects as part of an application rollback.
