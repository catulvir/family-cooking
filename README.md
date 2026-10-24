# Family Cooking Tracker

Private, family-only web application for recording prepared dishes and, in later milestones, reusable recipes, ingredients, reviews, and protected photos.

## Current milestone

Milestone 1 establishes the application foundation:

- Kotlin and Spring Boot API with Spring Security, JPA, Flyway, PostgreSQL, validation, and Actuator
- React, TypeScript, and Vite frontend with a health-check integration
- PostgreSQL local development through Docker Compose
- A first Flyway migration for the account foundation (`app_users`)
- Backend unit and PostgreSQL integration tests, plus a frontend component test
- GitHub Actions checks for backend and frontend

The application currently has no account-creation, invitation, dish, recipe, review, or photo workflows. Only health endpoints are public; Spring Security requires authentication for future application endpoints.

## Architecture

The repository is a modular monolith:

| Path | Responsibility |
| --- | --- |
| `backend/` | Kotlin Spring Boot API, migrations, authorization foundation, and tests |
| `frontend/` | React single-page application and frontend tests |
| `docker-compose.yml` | Local PostgreSQL service |
| `.github/workflows/ci.yml` | Backend and frontend verification |

The backend uses Flyway as the schema authority. Hibernate validates the database schema and does not create or modify it. The first migration creates only the account foundation: UUID identifiers, normalized unique email lookup, `ADMIN`/`MEMBER` roles, and `PENDING`/`ACTIVE`/`DISABLED` statuses.

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

2. Replace `POSTGRES_PASSWORD` and `DB_PASSWORD` in `.env` with the same local password.

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
| `VITE_API_BASE_URL` | Development API origin used by the Vite proxy; configure it in `frontend/.env.local` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated browser origins allowed to call the API; set this to the deployed frontend URL on Render |

`.env` is ignored by Git. Keep actual passwords and deployment secrets out of the repository.

## Render readiness

The backend supports a Render-managed PostgreSQL instance through `DATABASE_URL` (in JDBC URL form) or the individual `DB_*` variables. It uses forwarded-header support for a reverse proxy and exposes only the unauthenticated health checks. Persisted photos will later use private object storage; the application will not depend on the Render filesystem for uploads.

For a same-origin Render deployment, use this build command from the repository root:

```sh
npm --prefix frontend ci && npm --prefix frontend run build && cd backend && bash ./mvnw --batch-mode package
```

The backend Maven build includes `frontend/dist` in the packaged Spring Boot JAR when that directory exists, so the resulting service serves the React build and API from one origin. Configure Render to start it with `java -jar backend/target/family-cooking-api-0.0.1-SNAPSHOT.jar`, supply a Render PostgreSQL connection as `DATABASE_URL` in JDBC form, and set `PORT` if Render requires it.

For separate Render services, deploy `frontend/` as a Static Site with `npm ci && npm run build` and publish `dist`. Set its build-time `VITE_API_BASE_URL` to the API's public HTTPS URL. Deploy `backend/` as a Docker Web Service with `backend/` as its root directory; its `Dockerfile` builds and starts the API. Wire the managed database's host, port, database, user, and password into `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, and `DB_PASSWORD`; set `CORS_ALLOWED_ORIGINS` to the static site's exact HTTPS origin. A real Render deployment has not been performed.

## Planned milestones

1. Session authentication, administrator invitations, account approval, and role-based authorization.
2. Dish creation and editing, including dishes with no recipe, review, rating, photo, or ingredients.
3. Optional reviews and ratings with member ownership and administrator access.
4. Recipes and independently editable recipe ingredients.
5. Normalized dish ingredients and any/all/exclude ingredient search.
6. Protected photo upload backed by private object storage.
7. Filtering, pagination, and user experience improvements.
8. Production deployment verification, backups, monitoring, and security hardening.
