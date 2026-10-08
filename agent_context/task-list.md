# Implementation Plan & Task List (Architecture V2)

This task list integrates both the business requirements (`MVP.md`) and the technical architecture (`IMPLEMENTATION_AND_ARCHITECTURE_PLAN.md`) for building a secure, large-file upload platform using Node 22, Fastify, TypeScript, PostgreSQL, and Cloudflare R2.

## Milestone 1: Scaffold, Database, and R2 Basics
- [ ] Initialize Node 22 project with Fastify and TypeScript in `server/`.
- [ ] Install dependencies (`fastify`, `@aws-sdk/client-s3`, `pg`, `zod`, `jose`, `argon2`, etc.).
- [ ] Implement database schema via migrations (tables: `users`, `files`, `upload_sessions`, `share_links`, `idempotency_keys`, `jobs`).
- [ ] Create `db/pool.ts` for PostgreSQL connections.
- [ ] Implement `POST /auth/login` for owner login (rate-limited, returns JWT via `jose`).
- [ ] Configure Cloudflare R2 client (`lib/r2.ts`) and create presign helpers.
- [ ] Configure R2 bucket CORS allowing `PUT`, `GET`, `HEAD` and exposing `ETag`.
- [ ] **Acceptance:** A 100 MB test upload works from `curl` using presigned URLs.

## Milestone 2: Browser Uploader & Resume Logic
- [ ] Scaffold `web/` directory with `index.html`, `js/api.js`, `js/uploader.js`, `js/upload.worker.js`.
- [ ] Implement `POST /uploads/init` API to handle quota check (max 9GB active) and return upload ID/parts.
- [ ] Build Web Worker (`upload.worker.js`) for slicing files (16 MB up to 2 GB, 64 MB above).
- [ ] Implement parallel part uploads (3-4 concurrently) with exponential backoff retries.
- [ ] Implement `GET /uploads/:id/parts` API and client logic to resume uploads matching `name+size+lastModified` fingerprint.
- [ ] **Acceptance:** A 2 GB file uploads; killing the tab mid-way and reopening resumes without re-sending finished parts.

## Milestone 3: Upload Completion, Validation, & Idempotency
- [ ] Implement `POST /uploads/:id/sign` API to lazily generate presigned URLs in batches.
- [ ] Implement `Idempotency-Key` tracking in `idempotency.ts` and API wrapper.
- [ ] Implement `POST /uploads/:id/complete` API to:
  - Run `ListParts` to validate count and sizes.
  - Update file status to `uploaded` atomically.
  - Enqueue a scan job in the `jobs` table (Postgres).
- [ ] Implement `DELETE /uploads/:id` to abort multipart uploads.
- [ ] **Acceptance:** Double-clicking "Complete" 5 times produces one state change and one scan job.

## Milestone 4: Scan Worker & ClamAV Pipeline
- [ ] Set up ClamAV daemon (`clamd`).
- [ ] Implement `jobs/queue.ts` using Postgres `FOR UPDATE SKIP LOCKED`.
- [ ] Build `jobs/scanWorker.ts` pipeline:
  - Stream R2 object to `/tmp/scan/<id>`, computing SHA-256 simultaneously.
  - Run `clamdscan` if size <= 4 GB (otherwise flag 'partial').
  - Delete R2 object if infected.
  - Mark `ready`, save SHA-256 and `scan_result`.
- [ ] **Acceptance:** The EICAR test file ends as `infected` and is deleted; a clean file ends as `ready`.

## Milestone 5: Secure Sharing & Downloads
- [ ] Implement `GET /files` to list owner files, and `DELETE /files/:id`.
- [ ] Implement `POST /files/:id/share` to create unique links (slug `nanoid(16)`).
- [ ] Build public download page (`d.html`) showing metadata via `GET /s/:slug` (hides actual URL).
- [ ] Implement `POST /s/:slug/unlock` to check `argon2id` passwords and issue 5-minute unlock tokens.
- [ ] Implement `POST /s/:slug/download` to increment download count atomically and return short-lived R2 presigned GET URLs.
- [ ] **Acceptance:** A wrong password fails/locks out; the right one gives a working, resumable download.

## Milestone 6: Reliability & Background Cleanup
- [ ] Implement deduplication in the Scan Worker (match SHA-256, set `dedup_of`, delete new R2 copy).
- [ ] Build `jobs/cleanup.ts` (cron running every 15 minutes) to:
  - Expire old files (set status `expired`, delete R2 object).
  - Abort orphaned sessions (>24 hours).
  - Clean old `idempotency_keys` and completed jobs.
- [ ] Apply matching R2 lifecycle rules as a fallback.
- [ ] **Acceptance:** A second 10 GB upload is rejected (quota guard); the same file re-uploaded is stored once.

## Milestone 7: Infrastructure & Deployment
- [ ] Set up `docker-compose.yml` defining: `caddy`, `api`, `worker`, `postgres`, `clamav`.
- [ ] Configure Caddyfile with DuckDNS subdomain for auto-TLS.
- [ ] Provision Oracle Always Free VM (Ampere ARM Ubuntu) or Render fallback.
- [ ] Host the `web/` static files on GitHub Pages (CORS restricted to `API_BASE`).
- [ ] Configure automated DB backups (`pg_dump` to R2 prefix).
- [ ] **Acceptance:** End-to-end 8-10 GB upload and download from a secondary device on mobile data.
