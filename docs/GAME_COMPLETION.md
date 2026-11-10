# Ember and Ash — Completion Status

Last updated: 2026-11-09. Branch `claude/ember-and-ash-completion` (committed locally; **not pushed**).

This is the status against the fifteen sections of the final completion brief. Evidence is in [FINAL_TEST_REPORT.md](FINAL_TEST_REPORT.md), and what is not done is in [REMAINING_LIMITATIONS.md](REMAINING_LIMITATIONS.md). The systems built before this pass are described in [LIVING_WORLD.md](LIVING_WORLD.md) and [SECURITY.md](SECURITY.md).

Status key:

- **Done**: implemented and verified by automated tests and/or measured runs.
- **Done, with limits**: implemented and verified, with a known weakness listed in the limitations.
- **Waiting on you**: prepared, but needs your authorisation.

## Overall

| | |
| --- | --- |
| Automated tests | **229 / 229** (28 files), stable in three clean-clone runs |
| Browser checks | **72 / 72** (desktop, mobile, reduced motion, journal, accessibility) |
| Campaigns | **24 / 24** finish (12 classes × 2 seeds × all four endings, plus a next generation each); 0 server errors |
| Progression | Levels 1–2,500 exact; rift play at 150–1,000 won 6 / 6 at each level |
| Live AI | 59 live turns across three runs; 0 fallbacks; invented actions removed; no contradictions of the canon |
| Acceptance tester | 1,800 offline and 36 live human-like actions; no high or medium findings |

**Is the standard achieved?** Mostly, but not entirely.
- Every section of the brief has working, tested code.
- Two actions need you: publishing the history purge, and pushing.
- The clearest remaining weakness is campaign length on the Ascend and Remnant paths, about twice the Wardens path even with companions.
- Some depth is computed rather than simulated: NPC goals, one story arc per companion, and adventure templates filled from world state.

## By section

| # | Section | Status | Where |
| --- | --- | --- | --- |
| 1 | Historical security cleanup | **Waiting on you** | History audited without exposing contents: 15 database blobs, 1 account hash, 1 save, no keys. Verified backup bundle. Purge script dry-run verified (15 → 0). The destructive push is not run. No tracked secrets, also enforced in CI. `SECURITY.md` §1 |
| 2 | Auth, authorisation, persistence | **Done** | Rate limits; bcrypt 12 with legacy rehash; hashed remember tokens; revocation; CSP and clickjacking; CORS; proxy; body limits; fixation; ownership; guest transition; backups. `tests/security.test.js`, `tests/journal.test.js` |
| 3 | Player agency | **Done, with limits** | Separate layers for the submitted action, the engine outcome and the narration. An 11-kind action guard; repetition across replies; regeneration once, then the game's own narrator. Live: invented sentences removed with no fallbacks. A filter, not understanding |
| 4 | Two-layer memory | **Done** | A permanent canon (people, reigns, wars, treaties, territory, foundations, artifacts, oaths, choices, lineage, marriage) plus compact narrator memory. Tested at 10,000 turns and 300 years. Live two-generation check passed |
| 5 | Companion stories and NPC depth | **Done, with limits** | All eight companions have multi-stage stories with real, distinct consequences (abilities, gear, factions, settlements, a ruler, oaths, deaths, partings) and in-character reactions. NPCs have goals, concerns, views, relations, retirement and heirs. One arc each; NPC goals are computed |
| 6 | Living world | **Done, with limits** | Dynasties (heirs, regencies, disputes, elections), population, prices, movements, disasters and rebuilding, institutions, rivalries, decrees, visible occupation, governing as law, low-level safety. Yearly cadence; a price index, not a market |
| 7 | Varied adventures | **Done, with limits** | Eleven kinds built from world state, with enforced steps, deadlines, failures and consequences. One step shape per kind |
| 8 | Professions and classes | **Done, with limits** | Commissions for every trade; sailor voyages; inn ownership; assassin contracts with legal risk; smith masterworks and ranks. Class audit; 26 paths; bard and druid tuned. Hostile-path campaigns are slower (see the overall verdict above) |
| 9 | Infinite progression | **Done** | 1–2,500 exact; XP past 2^53; deaths bounded; saves exact; exploits closed; post-game played normally from 96 to 138 and 142 |
| 10 | Mature settings | **Done** | Six settings, server-side, untouched by the new systems. Adults only, never minors; coercion only as a crime. `tests/mature-regression.test.js` plus the existing content suites |
| 11 | Art | **Done, with limits** | Weather; banners and occupation; disasters; voyages; work scenes; contract killings drawn as crimes; reduced motion and Still fully static. No external provider (optional; not added) |
| 12 | UI panels | **Done** | A Journal with nine pages, real controls, keyboard and mobile support; plus the existing panels (inventory, gear, saves, settings, story, board) |
| 13 | Comprehensive tests | **Done** | Suite, browser, campaign matrix, generations, restarts, live runs within budget, failure modes, accessibility, a CI workflow (not yet run on GitHub) |
| 14 | Human-like acceptance tester | **Done** | `scripts/acceptance-tester.js`, offline and live |
| 15 | Documentation | **Done** | This file, `LIVING_WORLD.md`, `SECURITY.md`, `FINAL_TEST_REPORT.md`, `REMAINING_LIMITATIONS.md`, `CHECKPOINT.md` |

## Commits in this pass

`d7a685b` security · `4041c5d` agency · `da5f707` canon · `03d6af4` companions and NPCs · `ee57a16` living world · `c8d9764` adventures · `a139ba0` trades and classes · `0651d8a` progression · `59a3c07` mature regression · `4a7dee0` art · `cfe70d7` journal · `31d05db` failure modes, accessibility, CI · `cf5f8bc` and `6f8f85f` fixes and the acceptance tester · `3123990` docs and bot · plus this documentation commit.
