# Implementation and Architecture Plan: Large-File Share Portal

## 1. Architecture

```
                         GitHub Pages (static HTML/JS)
                                     │  HTTPS + CORS
                                     ▼
 ┌────────────────────────── Oracle Always Free VM (Docker) ─────────────────────────┐
 │  Caddy (TLS, DuckDNS domain) ──► API (Node 22 + TS + Fastify)                     │
 │                                      │                                            │
 │                                      ▼                                            │
 │                             Postgres (files, sessions, links, jobs, idempotency)  │
 │                                      ▲                                            │
 │              Scan Worker (Node) ─────┘── polls jobs table (SKIP LOCKED)           │
 │                   │  └──► ClamAV daemon (clamd)                                   │
 └───────────────────┼───────────────────────────────────────────────────────────────┘
                     │ GET object → temp disk → scan + SHA-256 → delete temp
                     ▼
          Cloudflare R2 (private bucket)  ◄── browser uploads parts directly (presigned PUT)
                     │
                     └──► browser downloads directly (presigned GET, range supported)
```

**Key decisions**

- **Bytes never touch the API.** Browser ↔ R2 directly, in both directions.
- **No Redis.** The job queue uses Postgres (`FOR UPDATE SKIP LOCKED`), and rate limiting is in-memory (single instance). This saves RAM and a service.
- **Fastify + TypeScript** for the API. NestJS works too if you prefer your usual structure, but it's heavier for this size.
- **Fallback if Oracle signup or capacity fails:** API on Render free + free hosted Postgres, with the scan worker disabled and files labelled "not scanned". The code stays the same, with `SCAN_ENABLED=false`.

## 2. Repo layout

```
file-share/
├─ docker-compose.yml
├─ Caddyfile
├─ .env.example
├─ server/
│  ├─ src/
│  │  ├─ app.ts                 # fastify bootstrap, cors, rate-limit, error handler
│  │  ├─ config.ts              # zod-validated env
│  │  ├─ auth/                  # login, jwt (jose), guard
│  │  ├─ uploads/               # init, parts, complete, abort, resume
│  │  ├─ files/                 # list, delete, metadata
│  │  ├─ share/                 # create link, public meta, unlock, download
│  │  ├─ lib/
│  │  │  ├─ r2.ts               # S3Client + presign helpers
│  │  │  ├─ idempotency.ts      # request dedupe
│  │  │  ├─ quota.ts            # 9 GB guard
│  │  │  └─ errors.ts
│  │  ├─ db/
│  │  │  ├─ pool.ts
│  │  │  └─ migrations/*.sql
│  │  └─ jobs/
│  │     ├─ queue.ts            # enqueue/claim/finish
│  │     ├─ scanWorker.ts       # scan pipeline
│  │     └─ cleanup.ts          # expiry + stale sessions
│  └─ package.json
└─ web/                          # deployed to GitHub Pages
   ├─ index.html (upload)  files.html  d.html (public download page)
   ├─ js/ api.js  uploader.js  upload.worker.js  state.js
   └─ css/style.css
```

Dependencies: `fastify`, `@fastify/cors`, `@fastify/rate-limit`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `pg`, `zod`, `argon2`, `jose`, `nanoid`, `pino`, `file-type`.

## 3. Database schema (Postgres)

```sql
CREATE TYPE file_status AS ENUM
  ('uploading','uploaded','scanning','ready','infected','scan_failed','expired','deleted');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL, password_hash text NOT NULL
);

CREATE TABLE files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  original_name text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  mime text,
  storage_key text UNIQUE NOT NULL,          -- random uuid, never the user's name
  status file_status NOT NULL DEFAULT 'uploading',
  sha256 text,
  scan_result text,                           -- clean | infected:<sig> | partial | skipped
  dedup_of uuid REFERENCES files(id),
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX ON files (sha256) WHERE sha256 IS NOT NULL;

CREATE TABLE upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid UNIQUE NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  r2_upload_id text NOT NULL,
  part_size int NOT NULL, total_parts int NOT NULL,
  fingerprint text NOT NULL,                  -- name+size+lastModified, for resume match
  expires_at timestamptz NOT NULL
);

CREATE TABLE share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  slug text UNIQUE NOT NULL,                  -- nanoid(16)
  password_hash text,                         -- argon2id, nullable
  expires_at timestamptz, max_downloads int,
  download_count int NOT NULL DEFAULT 0
);

CREATE TABLE idempotency_keys (
  user_id uuid, key text, route text, request_hash text,
  response jsonb, status_code int, created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, key, route)
);

CREATE TABLE jobs (
  id bigserial PRIMARY KEY, type text NOT NULL, file_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued',      -- queued|running|done|failed
  attempts int NOT NULL DEFAULT 0, run_at timestamptz DEFAULT now(), locked_at timestamptz
);
```

## 4. API contract

All owner routes need `Authorization: Bearer <jwt>`. All mutating routes accept `Idempotency-Key`.

| Route                        | Purpose                                                                                               | Notes                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `POST /auth/login`           | Owner login                                                                                           | Rate-limited; returns a short-lived JWT                                                |
| `POST /uploads/init`         | `{name,size,mime,fingerprint,ttlHours}` → `{fileId, uploadId, partSize, totalParts, parts:[{n,url}]}` | Checks quota; if an open session with the same fingerprint exists, returns it (resume) |
| `POST /uploads/:id/sign`     | `{parts:[n...]}` → fresh presigned URLs                                                               | Called in batches of ~20 so URLs don't expire mid-upload                               |
| `GET /uploads/:id/parts`     | → uploaded parts (`ListParts`)                                                                        | Drives resume                                                                          |
| `POST /uploads/:id/complete` | `{parts:[{n,etag}]}`                                                                                  | Validates against `ListParts`, then compare-and-set; enqueues a scan job               |
| `DELETE /uploads/:id`        | Abort                                                                                                 | Calls `AbortMultipartUpload`                                                           |
| `GET /files`                 | List owner's files + status                                                                           |                                                                                        |
| `DELETE /files/:id`          | Delete object and row                                                                                 |                                                                                        |
| `POST /files/:id/share`      | `{password?,expiresAt?,maxDownloads?}` → `{slug,url}`                                                 | Only if `status='ready'`; idempotent                                                   |
| `GET /s/:slug`               | Public metadata: name, size, sha256, scanResult, `passwordRequired`                                   | Never returns a file URL                                                               |
| `POST /s/:slug/unlock`       | `{password}` → 5-minute token                                                                         | argon2 verify; lockout after N failures                                                |
| `POST /s/:slug/download`     | `{token?}` → presigned GET URL (60-120 s)                                                             | Checks status, expiry, and limit; increments count atomically                          |

**Download counting, atomically:**

```sql
UPDATE share_links SET download_count = download_count + 1
WHERE slug = $1 AND (max_downloads IS NULL OR download_count < max_downloads)
  AND (expires_at IS NULL OR expires_at > now())
RETURNING file_id;
```

## 5. Upload flow, step by step

1. **Browser** picks a file and computes the fingerprint. It checks `localStorage` for a saved `fileId` and, if there is one, calls `GET /uploads/:id/parts`.
2. **`init`**: the server runs the quota check (`sum(size) of active files + in-progress ≤ 9 GB`), inserts `files` + `upload_sessions`, and calls `CreateMultipartUpload`. Part size is 16 MB up to 2 GB and 64 MB above that.
3. **Parallel upload (3-4 at once)**: the worker reads `file.slice()`, `PUT`s each part to its presigned URL, reads the `ETag` from the response, and saves `{n, etag}` to `localStorage`. Failed parts retry with exponential backoff (up to 5 times, with jitter).
4. **`complete`**: the server runs `ListParts` and rejects the call if the count or sizes differ, then runs `HeadObject` after completion to verify the total size.
   ```sql
   UPDATE files SET status='uploaded' WHERE id=$1 AND status='uploading' RETURNING id;
   ```
   If no row comes back, this was a duplicate request, and the stored response is returned instead.
5. **Enqueue scan job** in the same transaction.

**Pitfalls to check early:**

- Newer AWS SDK v3 versions add default checksums that may not play well with R2. Set `requestChecksumCalculation: 'WHEN_REQUIRED'` on the client.
- The R2 bucket CORS must allow `PUT`/`GET`/`HEAD` from your Pages origin and **expose the `ETag` header**, or the browser can't read it.
- Spike per-part SHA-256 via the `x-amz-checksum-sha256` header and confirm R2 accepts it. If it doesn't, fall back to `ListParts` size verification.

## 6. Scan worker

```
loop:
  job = claim ( SELECT ... FROM jobs WHERE status='queued' AND run_at<=now()
                ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1 )
  mark file 'scanning'
  stream R2 object → /tmp/scan/<id>   (computing SHA-256 while writing)
  if size <= 4 GB: clamdscan → clean | infected
  else: scan_result = 'partial'  (hash-only checks)
  if sha256 already exists on another 'ready' file: set dedup_of, delete new R2 object
  if infected: delete R2 object, status='infected'
  else: status='ready', save sha256, scan_result
  rm temp file
  on error: attempts++, run_at = now()+backoff; after 3 failures → 'scan_failed'
```

- Reclaim stuck jobs where `locked_at < now() - 2h`.
- Check free disk before starting, and process one file at a time.
- Optional: look up the SHA-256 against VirusTotal's free API (check its current limits).

## 7. Cleanup job (every 15 minutes)

- Expire files past `expires_at`: delete the R2 object, set `status='expired'`.
- Abort sessions older than 24 hours that never completed.
- Delete old `idempotency_keys` (older than 48 hours) and finished jobs.
- Back this up with R2 lifecycle rules (expiry and abort-incomplete) in case the VM is down.

## 8. Frontend plan (plain HTML/JS)

- **`index.html`**: drag-and-drop, TTL selector, optional password, progress bar, speed/ETA, pause/resume, "copy link" once the status is `ready`. It shows "scanning…" while the status polls every 5 seconds.
- **`upload.worker.js`**: slicing, part queue, retries, ETag collection.
- **`api.js`**: fetch wrapper that attaches the token and a generated `Idempotency-Key` per user action. A single in-flight promise per action prevents double-click duplicates.
- **`d.html`**: reads the slug, shows file info and scan badge ("clean" / "not fully scanned"), prompts for a password if required, then calls `download` and starts it with `location.href = url`.

## 9. Deployment

**Oracle VM**

1. Create an Ampere ARM instance (Ubuntu). Open ports 80 and 443 in the security list and the OS firewall.
2. Install Docker and Compose. Point a DuckDNS subdomain at the VM's IP.
3. `docker-compose.yml` services: `caddy`, `api`, `worker`, `postgres` (volume), and `clamav` (`clamav/clamav` image with a volume for signature updates).
4. Caddy auto-issues the TLS certificate and reverse-proxies to `api:3000`.
5. Run migrations on API start. Deploy by `git pull && docker compose up -d --build`.
6. Keep the instance from being reclaimed as idle by running the real workload (ClamAV updates, the cleanup job).
7. Run a nightly `pg_dump` to a small R2 prefix or your own machine.

**Cloudflare:** create a private bucket and an API token scoped to that bucket, then set the CORS and lifecycle rules.

**GitHub Pages:** publish `/web`, and set `API_BASE` in `api.js`.

**Environment variables:** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET`, `R2_BUCKET`, `DATABASE_URL`, `JWT_SECRET`, `ALLOWED_ORIGIN`, `QUOTA_BYTES`, `SCAN_ENABLED`.

## 10. Milestones and acceptance tests

| #   | Milestone                                               | Done when                                                                                            |
| --- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | Scaffold, migrations, login, R2 client, CORS verified   | A 100 MB test upload works from `curl` using presigned URLs                                          |
| 2   | Browser uploader with parallel parts, retry, and resume | A 2 GB file uploads; killing the tab mid-way and reopening resumes without re-sending finished parts |
| 3   | Complete + validation + idempotency                     | Double-clicking Complete 5 times produces one state change and one scan job                          |
| 4   | Scan worker + ClamAV                                    | The EICAR test file ends as `infected` and is deleted; a clean file ends as `ready`                  |
| 5   | Share links, password, signed download                  | A wrong password fails and gets locked out; the right one gives a working, resumable download        |
| 6   | Quota, expiry, dedupe, cleanup                          | A second 10 GB upload is rejected; the same file re-uploaded is stored once                          |
| 7   | Deploy, TLS, backups, monitoring                        | An end-to-end 8-10 GB upload and download from a second device on mobile data                        |

## 11. Risks to watch

- **Storage budget:** one 10 GB file fills the free tier, so a short TTL and the quota guard are essential.
- **Upload time:** a 10 GB file on a typical Indian upload link can take a very long time, so resume is a must-have, not a nice-to-have.
- **Scan coverage:** files over 4 GB get hash checks only and are shown as "not fully scanned".
- **Oracle availability:** if ARM capacity isn't available, use the Render fallback and add the scanner later.
