# Credentials and data handling

## Status (2026-11-07)
- `.env` and `data/emberandash.db*` were previously committed and pushed to
  `origin/main`. They are now untracked (`git rm --cached`); local copies are
  kept and `.gitignore` covers them.
- **Git history still contains the old `.env`.** Treat the Groq key that was in
  it as compromised: revoke it in the Groq console and create a new one. (It
  already returns HTTP 401, but revoke it anyway.)
- History has **not** been rewritten. Purging it (e.g. `git filter-repo
  --path .env --path data --invert-paths`) requires a force-push and is the
  repository owner's decision.
- The committed database may contain player account rows (bcrypt password
  hashes). If real players used that DB, consider forcing password resets.

## Deployment
- Copy `.env.example` to `.env` and set `GROQ_API_KEY`. On Railway set it as a
  service variable instead of a file.
- Without a valid key the game runs fully on offline narration.
- Tests and local play use `EMBER_DB_PATH` pointing at a temp file — never the
  production database.
