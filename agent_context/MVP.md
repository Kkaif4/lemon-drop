# Plan v2: Big Files, Security, and Free Deployment

## 1. R2 free tier vs. 5-10 GB files

R2's free tier gives you 10 GB of storage, 1 million Class A operations, and 10 million Class B operations per month, with free egress. Even a single 10 GB file uses up the whole free storage. To stay at zero cost:

- **Auto-expire files** (e.g. 24-72 hours or 7 days) with an R2 lifecycle rule, plus a cleanup job in Node.
- **Add a quota guard.** `uploads/init` refuses new uploads if (active files + in-progress uploads) would pass about 9 GB. In-progress multipart parts count as stored data too.
- **Add an "abort incomplete multipart uploads" lifecycle rule** so abandoned uploads don't hold storage.
- **Deduplicate by content hash** (section 6), so the same file is never stored twice.
- The operation counts are not a concern. A 10 GB upload in 64 MB parts is only about 160 write operations.

## 2. Handling 5-10 GB uploads

- **Part size:** 64 MB for files over 2 GB, 16 MB for smaller ones. R2 needs equal-sized parts (except the last), at least 5 MiB each, and at most 10,000 parts.
- **Parallelism:** 3-4 parts at once. Keep it modest on mobile networks.
- **Resumable:** Store the upload ID and completed parts on the server (Postgres) and in `localStorage`. On reload, the browser asks `GET /uploads/:id/parts`, then uploads only the missing parts. Match a resumed file by name + size + lastModified.
- **Browser memory:** Always use `file.slice()` and never read the whole file. Use a Web Worker for the work.
- **Presigned URLs:** Sign them lazily in batches, so a long upload doesn't hit URL expiry.

## 3. Any file type, safely

- Don't block types, but never trust them. Store under a random UUID key, and keep the original name only in the DB.
- On download, always send `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`. This stops an uploaded `.html` or `.svg` from running in a browser.
- On complete, call `HeadObject` and check the real size matches the declared size. Sniff magic bytes with a ranged read of the first few KB.
- Uploads are **owner-only** (login required). Public upload would make you an abuse target.

## 4. Malware scanning pipeline

Status flow: `uploading → uploaded → scanning → ready` (or `infected` / `scan_failed`). **No download link works until the status is `ready`.**

1. A scan worker downloads the object from R2 to temp disk. R2 egress is free.
2. It runs **ClamAV** (`clamdscan`) and computes the **SHA-256** at the same time.
3. It optionally checks the hash against the free VirusTotal API. Hash lookup works for any file size, but check their current rate limits.
4. It deletes the temp file. If the file is infected, it deletes the R2 object and marks the DB row.

Be honest about the limits:

- To my knowledge, ClamAV can't scan single files above roughly 4 GB. For 4-10 GB files, mark them **"not fully scanned"**, rely on the hash reputation check, and show that label on the download page.
- Password-protected archives can't be scanned either. Flag them the same way.
- Antivirus is never 100%, so show scan status to downloaders.
- ClamAV needs about 1-2 GB RAM, which affects hosting (section 8).

## 5. Missing or corrupt data

I read "package missing" as missing or corrupt chunks. Protection at every step:

- **Per part:** the browser computes a SHA-256 or MD5 of each part and sends it as a checksum header. R2 rejects the part on mismatch, and the browser retries.
- **Before completing:** the server calls `ListParts` and checks that the count, sizes, and ETags match what the client claims. Missing parts are re-uploaded.
- **After completing:** the scan worker's SHA-256 is saved and shown on the download page, so downloaders can verify their copy.
- **Downloads:** presigned URLs support range requests, so browsers and download managers resume broken downloads.

## 6. Duplicate requests

- **Idempotency keys.** The frontend sends an `Idempotency-Key` header on init, complete, and share. A unique DB constraint `(user_id, key)` stores the first response, and repeats just return it.
- **Safe state changes.** Use `UPDATE ... WHERE status='uploading'` so only one request can complete an upload. A second click gets the same result, not a second action.
- **Frontend guard.** Disable the button while a request is in flight and reuse the same promise.
- **Duplicate files.** After scanning, if the SHA-256 already exists, point the new record at the existing object and delete the new copy.

## 7. Password-protected downloads

1. `GET /f/:slug` returns metadata only (name, size, expiry, `passwordRequired`). No file URL is included.
2. If a password is set, `POST /f/:slug/unlock` checks it against an **argon2id** hash and returns a 5-minute signed token tied to that link.
3. `POST /f/:slug/download` takes the token and returns a short-lived **R2 presigned GET URL**. A download that has already started continues even after the URL expires.
4. Add rate limiting and lockout on unlock attempts (per IP and per link), plus expiry and a max-download count.
5. Slugs are random with at least 16 characters.

## 8. Free deployment

Because file bytes go straight to R2, your backend stays light. The one exception is the scanner.

Render's free instance has 512 MB RAM and 0.1 CPU, and it spins down after 15 minutes without traffic. Oracle's Always Free tier is the only option that gives a real always-on machine with no expiry. Fly.io has no free tier for new accounts, and Koyeb no longer offers free compute. Cloudflare Workers is not Node, so native dependencies won't work there.

|           | Option A: Oracle Always Free VM (recommended)                                                                       | Option B: Render free + Neon/Supabase        |
| --------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| API       | Docker on the VM                                                                                                    | Render web service                           |
| Scanner   | ClamAV worker on the same VM                                                                                        | Not possible in 512 MB                       |
| DB        | Postgres in Docker (or SQLite)                                                                                      | Free hosted Postgres (verify current limits) |
| Always on | Yes                                                                                                                 | Sleeps after 15 min, so cold starts          |
| HTTPS     | Caddy + free DuckDNS subdomain                                                                                      | Included                                     |
| Catch     | Signup needs a card for verification. ARM capacity can be scarce in India regions. Idle instances can be reclaimed. | No real malware scanning                     |

- **Option A** lets you run everything with `docker-compose`: API, Postgres, Redis, ClamAV, scan worker, and Caddy. It also fits 10 GB temp scans on its disk.
- **Option B** works as a fallback. Use only hash-reputation checks and "not scanned" labels. Add a "waking server" message on the frontend and a free uptime pinger. Render grants 750 free instance hours per month, which is enough for one always-awake service.
- **Hybrid:** run the API on Render and only the scanner on Oracle.

**Frontend:** GitHub Pages. Set CORS on the API to that origin only. Since the API is on another domain, use a bearer token instead of cookies.

**R2:** a private bucket with CORS allowing your Pages origin for `PUT`, `GET`, and `HEAD`, exposing the `ETag` header. Add lifecycle rules for expiry and aborting incomplete uploads.

**Secrets:** keep R2 keys, JWT secret, and DB URL in environment variables only. Never put them in the repo or the frontend.

## 9. Updated phases

| Phase | Deliverable                                                                       |
| ----- | --------------------------------------------------------------------------------- |
| 1     | R2 bucket, Oracle VM (or Render), Postgres, login, GitHub Pages skeleton          |
| 2     | Multipart upload: init, sign, parts, complete, with resume and per-part checksums |
| 3     | Scan worker (ClamAV + SHA-256) and status gating                                  |
| 4     | Share links, password unlock, signed downloads, rate limits                       |
| 5     | Idempotency, dedupe, quota guard, expiry cleanup                                  |
| 6     | Hardening, monitoring, backups, deploy scripts                                    |
