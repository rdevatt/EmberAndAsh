# Security

Last updated 2026-11-09. Branch `claude/ember-and-ash-completion`.

## 1. Secrets and history

### The Groq key
- **The current key** lives only in the git-ignored `.env`. It is never committed, logged or printed; `.env.example` holds a placeholder.
- **The previous key** was committed in `.env` until 2026-11-07. It returned HTTP 401 when it was replaced.
- **The `.env` purge:** on 2026-11-09 `.env` was removed from every commit and the rewritten history was force-pushed, with the owner's authorisation. `main` and `claude/ember-and-ash-completion` are now `7609294`.
- **Verified:** no `gsk_…` key appears in any commit reachable from either branch.

### Database files in history — audited, purge prepared, **not yet published**
The database files that were tracked before `86f43fa` are still in history (15 blobs, reachable from both branches):

| Path | Blobs |
| --- | --- |
| `data/emberandash.db` | 1 |
| `data/emberandash.db-wal` | 6 |
| `data/emberandash.db-shm` | 6 |
| `ember-and-ash/data/emberandash.db-wal` | 1 |
| `ember-and-ash/data/emberandash.db-shm` | 1 |

**Audit.** Each historical database was rebuilt from its WAL in a scratch directory. Only counts were inspected; no values were printed. The real local database was never opened.
- **1 player account:** a username and a bcrypt password hash (cost 10). The email field is empty.
- **1 saved game.**
- **Up to 27 guest session IDs** per snapshot. A session ID works like a password for that guest.
- **0 remember-me tokens, 0 API keys, 0 email addresses.**

**What this means:**
- **The password:** whoever used that account should treat its password as exposed (the hash is crackable offline if the password was weak) and change it anywhere it was reused.
- **The guest sessions:** they are long expired (guest sessions are deleted after 14 days idle), so the session IDs no longer grant access.

**The purge.** `scripts/security/purge-db-history.sh` removes all six paths from every branch and tag:
- it works on a fresh mirror clone, never on the working copy;
- it writes a verified backup bundle first;
- it rewrites the history and verifies that no database blob is reachable afterwards;
- it pushes only when given `--push`.

**Dry run (2026-11-09):** 15 database blobs before and 0 after, no bcrypt hash anywhere, all 62 commits kept, and every code tree byte-identical to the current branches. **Publishing it is a force-push that changes every commit ID and needs the owner's authorisation.** Afterwards every clone must re-clone or `git fetch && git reset --hard origin/<branch>`.

**What a rewrite cannot undo:**
- GitHub may keep old commits reachable by their exact ID for a while; GitHub support can purge cached views.
- Forks and clones made before the rewrite keep the old history.
- Backup bundles keep it too: the ones under the session scratchpad, and the one the purge script writes. Delete them when no longer needed.

### The current tree
- **Tracked files:** no tracked `.env`, database, key or certificate files (checked with `git ls-files`).
- **Secret scan:** `git grep` for Groq, OpenAI and AWS keys and private-key headers finds nothing.
- **Ignored:** `.gitignore` covers `.env`, `.env.*` (except `.env.example`), `/data/`, `*.db`, `*.db-wal` and `*.db-shm`.

## 2. HTTP hardening (`server/security.js`)

| Area | Before | Now |
| --- | --- | --- |
| Cross-origin | `Access-Control-Allow-Origin: *` | Same-origin only; extra front-ends via `ALLOWED_ORIGINS`. Preflights from other origins get 403 |
| Clickjacking | `frame-ancestors *`, `X-Frame-Options` removed | `frame-ancestors 'none'`, `X-Frame-Options: DENY` |
| CSP | none | `default-src 'self'`; scripts only from this site (no inline, no eval); `object-src 'none'`; `base-uri 'none'` |
| Other headers | — | `nosniff`, `Referrer-Policy: no-referrer`, a restrictive `Permissions-Policy`, COOP/CORP same-origin, `Cache-Control: no-store` on the API, HSTS over HTTPS, no `X-Powered-By` |
| HTTPS / proxy | — | `TRUST_PROXY=1` behind Railway or nginx, so HTTPS and client IPs are seen correctly |
| Request size | Express default | 64 KB JSON; malformed or oversized bodies get 400 or 413 with no internals |
| Errors | stack traces possible | a generic message; unknown `/api` routes get a JSON 404 |
| Health check | published player, save, session and history counts | `status` and `uptime` only |

**Rate limits** are in memory and per process; `EMBER_RATE_LIMIT_SCALE` multiplies them:

| Route | Limit |
| --- | --- |
| Login | 20 per 15 min per IP, and 10 per 15 min per account name |
| Registration | 10 per hour per IP |
| Auto-login and guest | 60 per 15 min per IP |
| Password change and sign-out-everywhere | 20 per 15 min per IP |
| Game actions | 240 per minute per session |
| All API | 1,200 per minute per IP |

## 3. Accounts and sessions

- **Passwords (new):**
  - at least 8 characters, at most 200;
  - not the username, not one repeated character, not one of the commonest passwords;
  - bcrypt cost 12.
- **Existing accounts keep working.** Old passwords (6+ characters) still log in, and hashes below cost 12 are rehashed on the next successful login.
- **Login gives no hint whether an account exists:** the same message, and a real bcrypt comparison against a dummy hash for unknown names.
- **Remember-me tokens:**
  - 256 random bits, stored only as a SHA-256 hash, valid for 30 days;
  - up to five devices per account (logging in on one no longer signs out another);
  - tokens issued before hashing are accepted once and upgraded.
- **Sessions:**
  - **IDs:** random UUIDs, validated on every request. Anything else is refused before the database is touched.
  - **Fixation:** login always issues a fresh session ID.
  - **Expiry:** account sessions expire after 30 days idle and guest sessions after 14 days idle. Guests were previously deleted after 24 hours, which lost overnight games.
- **Revocation:**
  - `logout` ends the session in memory and in the database (before, it lingered in memory) and deletes the remember-me token;
  - `POST /api/auth/logout-all` signs out every other device;
  - `POST /api/auth/change-password` needs the current password, then revokes every other session and token.
- **From guest to account:** a finished guest character is carried into a free slot. The guest record is deleted and a new session ID is issued; malformed guest IDs are refused.

## 4. Authorisation (tested with direct requests)

- **Saves** are per account: `/api/saves/*` uses the session's own player ID and slot, and guests get 401.
- **Archived characters and worlds** carry an owner key (`player:<id>` or `guest:<session>`). Resume, list and archive check it, so another player's character ID gives 404, and other players' worlds never appear.
- **Worlds** attach only through server-held state; no route accepts a client-supplied world or state.
- `tests/security.test.js` checks each of these with a second account and a guest. It also covers login fixation, remember-me hashing and migration, revocation, rate limiting, forged IDs and body limits.
- **The journal** (`GET /api/journal/:tab`, added in this pass) is read-only and session-protected:
  - It builds nine pages from the session's own state only.
  - It answers 401 without a session, 409 during character creation, and 404 for anything but the nine page names (including path tricks).
  - Its buttons send ordinary commands through `/api/action`, so the journal can do nothing the game would not allow.
  - The narrator page reports whether a key is configured (yes or no), never the key.
  - `tests/journal.test.js` checks every page for keys, password hashes, tokens and session IDs.

## 5. Rendering

- **Narration, names and quest text** are inserted with HTML escaping.
- **Escaping in attributes:** the attribute escaper now escapes quotes as well (it is used inside `title` and `data-` attributes).
- **SVG art** escapes names in its labels.
- **The strict CSP** is a second line of defence: even an injected `<script>` would not run.
- **The journal client** builds every element with DOM methods (`textContent`), never with HTML strings from the server.
- **Hostile input:** the acceptance tester sends script tags, SQL fragments, prompt-injection text, 600-character strings and emoji through the real API. No errors, leaks or broken output were found in 1,800 offline and 36 live actions.

## 6. Backups (`scripts/db-backup.js`)

- **Backup** uses SQLite's online backup API (consistent while the server runs). It integrity-checks the copy, counts its rows, and keeps the newest 14.
- **Restore** refuses a backup that fails `integrity_check` and keeps a copy of the database it replaces. Stop the server first.
- **Scheduled backups:** set `EMBER_BACKUP_HOURS=24` (never active under tests).
- **Tested** on a temporary database: backup while open, delete everything, restore, a damaged file refused, pruning.

## 7. Development rules

- **Temporary databases only.** All tests, bots and simulations use temporary databases (`tests/helpers.js` sets `EMBER_DB_PATH` to a temp file; `db/database.js` refuses the real path under `node --test` or `EMBER_REQUIRE_DB_PATH=1`). The real `data/emberandash.db` is not opened in development.
- **No secrets in output.** Secrets are never printed, logged or committed. Live AI tests read the key from `.env` without echoing it.
- **AI calls have our own deadline.** A provider call that never answers is abandoned after `EMBER_AI_TIMEOUT_MS` + 2 s, and the turn is told by the game's own narrator. This does not rely on the SDK's timeout (tested).
- **CI** (`.github/workflows/ci.yml`, not yet pushed):
  - It runs the suite offline on Node 20 and 22 with temporary databases and no secrets.
  - It fails if a `.env` or database file is tracked, or if a Groq key pattern appears in tracked code.

## 8. Manual steps for the owner

1. Decide whether to publish the database-history purge (section 1).
2. If the one historical account belonged to a real person, ask them to change that password anywhere it was reused.
3. In production, set `TRUST_PROXY=1` (Railway). Set `ALLOWED_ORIGINS` only if the game is served from a different origin than the API.
4. Set `EMBER_BACKUP_HOURS` on the production service, and copy backups off the machine.
