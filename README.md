# Family Cooking Tracker

Private, family-only web application for recording prepared dishes and, in later milestones, reusable recipes, ingredients, reviews, and protected photos.

## Current milestone

Milestone 2 adds private, family-only access on top of the Milestone 1 foundation:

- Administrator bootstrap from deployment configuration
- Administrator-created family accounts with a single-view temporary password
- Forced password change for new accounts before they become active
- HTTP-only, 30-day browser sessions with CSRF protection
- Administrator and member roles, plus pending and disabled account states

There is deliberately no email delivery, invitation token, password-reset, MFA, or direct browser connection to Supabase. Dishes, recipes, reviews, and photos remain future work.

## Architecture

The repository is a modular monolith:

| Path | Responsibility |
| --- | --- |
| `backend/` | Kotlin Spring Boot API, migrations, authorization foundation, and tests |
| `frontend/` | React single-page application and frontend tests |
| `docker-compose.yml` | Local PostgreSQL service |
| `.github/workflows/ci.yml` | Backend and frontend verification |

The backend uses Flyway as the schema authority. Hibernate validates the database schema and does not create or modify it. The account foundation uses UUID identifiers, normalized unique email lookup, `ADMIN`/`MEMBER` roles, and `PENDING`/`ACTIVE`/`DISABLED` statuses. The credential migration only adds `password_hash` and `must_change_password` columns; it does not delete or rewrite existing data.

Future domain modules will keep dishes independent from recipes and reviews. In particular, a dish will have a nullable `recipe_id`; dish ingredients will refer directly to dishes; and optional reviews will have their own authorization-protected endpoints and will not appear in ordinary dish responses.

## Prerequisites

- JDK 21
- Maven is optional when using the included Maven Wrapper.
- Node.js 24 with npm
- Docker Desktop or another Docker-compatible runtime for PostgreSQL and Testcontainers

## Run locally

1. Create the backend and database environment file from the example:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Replace `POSTGRES_PASSWORD` and `DB_PASSWORD` in `.env` with the same local password. To create the initial admin, set `BOOTSTRAP_ADMIN_PASSWORD` to a unique, temporary password. `BOOTSTRAP_ADMIN_EMAIL` defaults to `rozbergs@gmail.com`.

   To override the Vite development API origin, copy `frontend/.env.example` to `frontend/.env.local` and set `VITE_API_BASE_URL` there. The default is `http://localhost:8080`.

3. Start PostgreSQL:

   ```powershell
   docker compose --env-file .env up -d postgres
   ```

4. Start the backend from a second terminal:

   ```powershell
   Get-Content .env | ForEach-Object {
     if ($_ -match '^(?<name>[^#=]+)=(?<value>.*)$') {
       Set-Item -Path "Env:$($matches.name)" -Value $matches.value
     }
   }
   Set-Location backend
   .\mvnw.cmd spring-boot:run
   ```

   The API health endpoint is `http://localhost:8080/api/v1/health`; Actuator health is `http://localhost:8080/actuator/health`.

5. Install and start the frontend from a third terminal:

   ```powershell
   Set-Location frontend
   npm ci
   npm run dev
   ```

   Vite proxies `/api` requests to `http://localhost:8080` by default. Set `VITE_API_BASE_URL` if the API is running elsewhere.

## Tests and builds

Run the backend verification from `backend/`:

```powershell
.\mvnw.cmd verify
```

The PostgreSQL integration test starts a temporary PostgreSQL 17 container through Testcontainers. It is skipped when Docker is unavailable.

Run the frontend checks from `frontend/`:

```powershell
npm ci
npm run lint
npm test -- --run
npm run build
```

## Database migrations

Add PostgreSQL migrations under `backend/src/main/resources/db/migration` using the form `V<number>__description.sql`. Migrations are immutable once shared. Flyway executes them at application startup, and Hibernate validates their result.

## Configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | JDBC PostgreSQL URL; takes precedence over the separate database values |
| `DB_HOST`, `DB_PORT`, `DB_NAME` | PostgreSQL connection parts when `DATABASE_URL` is unset |
| `DB_USERNAME`, `DB_PASSWORD` | PostgreSQL credentials |
| `DB_SSL_MODE` | PostgreSQL SSL mode; use `require` for a hosted provider and `prefer` for the local Docker database |
| `DB_POOL_SIZE` | Maximum backend database connections; keep this small when using a shared managed-database pooler |
| `BOOTSTRAP_ADMIN_EMAIL` | Initial administrator email; defaults to `rozbergs@gmail.com` |
| `BOOTSTRAP_ADMIN_PASSWORD` | One-time initial administrator password; leave blank after the account exists |
| `SESSION_COOKIE_SECURE` | Set to `true` in HTTPS production; use `false` only for local HTTP development |
| `SESSION_COOKIE_SAME_SITE` | `lax` for same-site deployment; set `none` with `SESSION_COOKIE_SECURE=true` for separate frontend and API origins |
| `VITE_API_BASE_URL` | Development API origin used by the Vite proxy; configure it in `frontend/.env.local` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated browser origins allowed to call the API; set this to the deployed frontend URL on Render |

`.env` is ignored by Git. Keep actual passwords and deployment secrets out of the repository.

### Family-account flow

When `BOOTSTRAP_ADMIN_PASSWORD` is set, the application creates the configured bootstrap email as a pending administrator if it does not exist. If the matching legacy account exists but has no password yet, it initializes that account as the pending administrator. An account that already has a password is never changed by bootstrap. The administrator logs in with the bootstrap password and must choose a new password before using the application.

An active administrator can create accounts from the UI. The UI reveals a generated temporary password exactly once; share it directly with the family member. Their account remains pending until they sign in and replace that password. A successful login creates a secure, HTTP-only session cookie lasting 30 days. Sessions are not individually revocable; a disabled account is rejected on its next request.

## Render readiness

The backend supports managed PostgreSQL through `DATABASE_URL` (in JDBC URL form) or the individual `DB_*` variables. It uses forwarded-header support for a reverse proxy and exposes only the unauthenticated health checks. Persisted photos will later use private object storage; the application will not depend on the Render filesystem for uploads.

For a same-origin Render deployment, use this build command from the repository root:

```sh
npm --prefix frontend ci && npm --prefix frontend run build && cd backend && bash ./mvnw --batch-mode package
```

The backend Maven build includes `frontend/dist` in the packaged Spring Boot JAR when that directory exists, so the resulting service serves the React build and API from one origin. Configure Render to start it with `java -jar backend/target/family-cooking-api-0.0.1-SNAPSHOT.jar`, supply a Render PostgreSQL connection as `DATABASE_URL` in JDBC form, and set `PORT` if Render requires it.

For separate Render services, deploy `frontend/` as a Static Site with `npm ci && npm run build` and publish `dist`. Set its build-time `VITE_API_BASE_URL` to the API's public HTTPS URL. Deploy `backend/` as a Docker Web Service with `backend/` as its root directory; its `Dockerfile` builds and starts the API. Set `CORS_ALLOWED_ORIGINS` to the static site's exact HTTPS origin, `SESSION_COOKIE_SAME_SITE=none`, and `SESSION_COOKIE_SECURE=true`. This permits credentialed cross-origin requests; browser privacy settings that block all third-party cookies remain incompatible with a separate-origin cookie session.

### Supabase PostgreSQL (recommended)

Create the Supabase project in **Central EU (Frankfurt)**. Render is IPv4-only, so in Supabase's **Connect** dialog select the **Shared pooler, session mode** connection string rather than the IPv6-only direct connection. Copy its individual host, port, database, and username values into the Render backend's `DB_HOST`, `DB_PORT`, `DB_NAME`, and `DB_USERNAME` variables, respectively; enter the generated database password as `DB_PASSWORD`. Also set `DB_SSL_MODE=require`, `DB_POOL_SIZE=5`, `SESSION_COOKIE_SECURE=true`, `BOOTSTRAP_ADMIN_EMAIL=rozbergs@gmail.com`, and a unique `BOOTSTRAP_ADMIN_PASSWORD`. Do not set `DATABASE_URL` in Render when using these individual values. Flyway will apply the additive credential migration and retain all prior data.

Create the future `dish-photos` bucket as a private Supabase Storage bucket. The backend will use it only after the protected-upload milestone is implemented; it will store object keys and photo metadata in PostgreSQL, not raw image bytes.

## Planned milestones

1. Dish creation and editing, including dishes with no recipe, review, rating, photo, or ingredients.
2. Optional reviews and ratings with member ownership and administrator access.
3. Recipes and independently editable recipe ingredients.
4. Normalized dish ingredients and any/all/exclude ingredient search.
5. Protected photo upload backed by private object storage.
6. Filtering, pagination, and user experience improvements.
7. Production deployment verification, backups, monitoring, and security hardening.
