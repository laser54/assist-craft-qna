# Workplan

## Status Update (2025-10-28)

- **Backend**: `/api/qa`, `/api/search`, `/api/metrics`, `/api/settings` are live; SQLite persists QA + settings, Pinecone sync runs per mutation (namespace `qa`), embedding service passes explicit `inputType`, and optional rerank integrates Pinecone Rerank API.
- **Frontend**: `/login`, `ProtectedRoute`, `useAuth` fully wired; `Index.tsx` consumes ranked search results and color-codes relevance; `QAManagement` is REST-driven with pagination/import/export; `Settings` loads/saves backend configuration (models shown read-only).
- **Env**: `.env` now controls Pinecone embed + rerank models plus `PINECONE_EMBED_INPUT_TYPE`; portal password still driven by `PORTAL_PASSWORD` and rehashed on boot.
- **Next steps**: finish CSV streaming import endpoint + UI, extend metrics banner (remaining quota/error states), add automated tests before Docker packaging.

## System Architecture
- React application (`frontend`) stays in English, uses `react-query` and fetches everything through REST API; UI copy and docs remain English while allowing Russian user data.
- Node.js/Express server (`backend`) containerized with TypeScript, orchestrates Pinecone for embeddings, vector storage, and reranking, and uses a lightweight SQLite store (file-based, UTF-8 safe) to keep canonical Q&A records and settings.
- Pinecone (free tier) handles both embedding generation (Pinecone Inference), vector DB operations, and reranking via Pinecone Rerank API; single index/namespace `qa`.
- Traefik acts as reverse proxy: routes `qa.example.com` → frontend, `/api` → backend, handles HTTPS termination.
- `.env` files for client and server, secrets (Pinecone, login password, cookie secret) passed via Docker secrets/compose env.

### Data Flows
1. **Authentication**: user submits password (env `PORTAL_PASSWORD`), server verifies and sets httpOnly cookie with JWT session; middleware guards protected routes.
2. **Manual QA add**: frontend POSTs `/api/qa`; server validates, writes record into SQLite (with timestamps), calls Pinecone Inference embedding endpoint (model must support Russian), upserts vector into Pinecone index, returns refreshed stats.
3. **CSV import**: frontend uploads `multipart/form-data` to `/api/qa/import`; server parses CSV with headers `question`,`answer`, streams rows sequentially (chunk size configurable). Each row is embedded through Pinecone Inference before upserting into Pinecone. Sequential processing plus throttling handles Pinecone rate limits—no Redis/queue needed for ~500 pairs.
4. **Search**: frontend GET `/api/search?query=...`; server embeds query via Pinecone Inference, queries Pinecone index, retrieves top-K candidates, then invokes Pinecone Rerank API with the original query and candidate texts to improve ordering before returning ranked list mapped back to SQLite records.
5. **Deletion**: DELETE `/api/qa/:id` removes row from SQLite, then calls `pinecone.delete`; on Pinecone failure respond with error and suggest retry (simple retry logic in code, no job queue).
6. **Stats**: GET `/api/metrics` reads SQLite counts (total QA) and Pinecone `describe_index_stats` (vector count), approximates free-tier remainder if available.

## Backend
- **Stack**: Node 20, Express, TypeScript, `zod` for DTOs, `better-sqlite3`, Pinecone SDK (`@pinecone-database/pinecone`) plus Pinecone Inference client (`@pinecone-database/inference`) for embeddings and reranking, CSV parsing via `fast-csv`.
- **Structure**: `server/src` with `app.ts`, `routes`, `controllers`, `services` (`authService`, `qaService`, `pineconeService`, `embeddingService`, `rerankService`, `metricsService`), `lib/db.ts` (SQLite connection), middleware (`auth`, `errorHandler`), `schemas` for validation.
- **Config** (`server/.env.example`):
  - `PORT=8080`
  - `NODE_ENV=development`
  - `PORTAL_PASSWORD=...`
  - `SESSION_SECRET=...`
  - `PINECONE_API_KEY=...`
  - `PINECONE_INDEX=assist-craft`
  - `PINECONE_HOST=...`
  - `PINECONE_EMBED_MODEL=text-embedding-3-large` (or Pinecone-hosted equivalent supporting Russian)
  - `PINECONE_RERANK_MODEL=cohere-rerank-v3.0` (or other Pinecone-supported reranker with Russian coverage)
  - `CSV_BATCH_SIZE=25`
  - `DEFAULT_LOCALE=ru-RU`
  - `SQLITE_PATH=/data/qa.db`
- **API**:
  - `POST /api/auth/login` → { password } → cookie.
  - `POST /api/auth/logout` → clear cookie.
  - `GET /api/qa` (`page`, `search`, `language=ru` default) → reads from SQLite with limit/offset.
  - `POST /api/qa` → add pair, returns object + `stats`.
  - `PUT /api/qa/:id` → update text, re-embed via Pinecone Inference, upsert vector with same id.
  - `DELETE /api/qa/:id` → delete.
  - `POST /api/qa/import` → CSV upload (sync streaming, returns summary with inserted/failed counts).
  - `GET /api/search` → query results (embed + vector search + rerank).
  - `GET /api/metrics` → { totalQa, pineconeVectors, pineconeLimit? }.
- **Embedding & Rerank Strategy**:
  - `embeddingService` wraps Pinecone Inference, supports fake fallback when API key missing, and respects `PINECONE_EMBED_INPUT_TYPE`.
  - `rerankService` calls Pinecone Rerank API with query and candidate documents; falls back to vector scores when rerank unavailable; search returns results sorted by rerank score.
  - Document embedding dimension requirements and rerank model capabilities under `docs/embeddings.md`.
- **Pinecone**:
  - Ensure index exists on boot (create if missing with dimension matching chosen embed model output).
  - Namespace `qa`, vector IDs mirror SQLite UUIDs.
  - Use `describe_index_stats` for counts; Pinecone free tier ~5M token processing/month (speculative, flag as approximation).
- **Validation & Errors**: `zod` schemas, central error handler, `pino` logs (record Russian sample data safely encoded).

## Frontend
- **Framework**: current Vite + React. Remove local `useVectorSearch` and switch to API-driven hooks with `react-query`.
- **Authentication**: `/login` with English UI copy; after login rely on cookie, guard protected routes by probing `/api/metrics`.
- **Main Page (`Index.tsx`)**:
  - Search form uses `useMutation` hitting `/api/search` (works with Russian queries and benefits from Pinecone reranker ordering).
  - Display top result + list (already reranked).
  - Metrics banner: total QA, Pinecone vectors, remaining limit (`null` → "Unavailable" tooltip).
  - Replace `isReady` with query loading state.
- **Q&A Management (`QAManagement.tsx`)**:
  - Table with pagination via `/api/qa`.
  - Forms for create/update/delete using backend endpoints (each triggers re-embedding through Pinecone).
  - CSV import UI tracks synchronous response summary (success count, failures with row/column info).
  - QA counter from `/api/metrics`.
- **Settings Page (`Settings.tsx`)**:
  - Persist settings server-side (`GET/PUT /api/settings` stored in SQLite).
  - Allow choosing Pinecone embedding/rerank models via dropdown (restricted to available Russian-capable options); warn about dimension mismatch requiring index recreation.
  - Optional locale tag for data, UI stays English.
- **Shared Components**: implement `useAuth`, `useMetrics`, `ProtectedRoute`. Keep UI strings in English; consider `i18next` later if needed.

## DevOps / Infrastructure
- **Docker**:
  - `frontend/Dockerfile`: multi-stage build (`pnpm install`, `pnpm build`, serve via `nginx`/`caddy`).
  - `backend/Dockerfile`: multi-stage TypeScript build, runtime Node 20 Alpine; bundle SQLite binary deps (`apk add sqlite-libs icu-data-full`).
  - `docker-compose.yml` minimal stack:
    ```yaml
    services:
      traefik:
        image: traefik:v3
        command:
          - --providers.docker=true
          - --entrypoints.web.address=:80
          - --entrypoints.websecure.address=:443
          - --certificatesresolvers.le.acme.httpchallenge=true
        ports: ["80:80", "443:443"]
        volumes:
          - /var/run/docker.sock:/var/run/docker.sock
          - traefik-acme:/acme
      frontend:
        build: ./frontend
        labels:
          - traefik.http.routers.front.rule=Host(`qa.example.com`)
      backend:
        build: ./server
        environment:
          - SQLITE_PATH=/data/qa.db
          - PINECONE_EMBED_MODEL=text-embedding-3-large
          - PINECONE_RERANK_MODEL=cohere-rerank-v3.0
        volumes:
          - backend-data:/data
        labels:
          - traefik.http.routers.api.rule=Host(`qa.example.com`) && PathPrefix(`/api`)
          - traefik.http.services.api.loadbalancer.server.port=8080
    volumes:
      traefik-acme:
      backend-data:
    ```
  - Local override without Traefik for dev (bind backend to localhost, mount volume for SQLite file).
- **Config Files**: root `.env` for compose, `frontend/.env` (`VITE_API_BASE=/api`, `VITE_APP_NAME=Assist Craft`), `server/.env` from template.
- **Secrets**: use Docker secrets or external vault in prod; keep `.env` out of VCS.
- **CI/CD**: GitHub Actions running lint/test/build for both apps, build & push Docker images, optional deploy step.

## Testing
- **Unit**: Vitest/Jest for backend services (`embeddingService`, `rerankService`, `qaService`, `metricsService`) with mocked Pinecone clients.
- **Integration**: supertest API suite using temp SQLite files and Pinecone client mocks covering embed + rerank flows.
- **CSV Import**: tests covering streaming parser with mixed valid/invalid Cyrillic rows, verifying Pinecone embed calls per batch.
- **E2E**: Playwright flows for login, manual add, CSV import, search (Russian queries), delete.
- **Smoke**: `docker-compose up`, curl `/api/metrics`, run sample Russian search ensuring reranked output.
- **Observability**: add `/healthz`, structured logs, optional Prometheus exporter if needed later.

## Risks & Open Questions
- Pinecone free tier may not expose precise remaining quota; fallback to static limit env (e.g., `PINECONE_FREE_LIMIT`) minus vector count, flag as approximation (speculative).
- Pinecone Inference limits: embedding + rerank share rate limits; need simple throttling/backoff to avoid HTTP 429 during CSV ingest.
- CSV uploads must enforce size limits (e.g., 2 MB) and handle encoding detection (reject non-UTF8 or convert using `iconv`).
- Password rotation: changing `PORTAL_PASSWORD` should invalidate existing sessions (track `passwordVersion` in SQLite).
- Pinecone-hosted models catalogue may change; need fallback defaults and admin UI to update model IDs without redeploy.
- Traefik + HTTPS needs ACME storage volume and DNS config; document production steps.

## Implementation Phases
1. Environment scaffolding (done): repo restructure (`frontend`, `server`), baseline backend Express app, verified `npm run build`/`npm run dev` + `/healthz` response. Dockerfiles/compose/Traefik wiring pending.
2. Backend MVP (done): auth + session cookie live, CRUD for `qa_pairs` hitting SQLite + Pinecone (namespace `qa`), `/api/search` embeds + reranks, `/api/settings` persists config.
3. Frontend integration (done): app uses REST APIs via `react-query`, login guard works, search page shows ranked results with relevance chips, management/settings pages fully API-driven.
4. CSV import streaming + per-row Pinecone embedding, UI summary (next).
5. Metrics & Pinecone limit visualization (next).
6. Automated tests & CI/CD pipelines (next).
7. Final QA in Docker + Traefik, production deployment checklist (next).
