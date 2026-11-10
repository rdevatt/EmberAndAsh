# Work checkpoint — final completion pass

The completion brief has 15 sections. This file records what is done, what is in progress and what is left, so work can resume without repeating anything. It is updated with every milestone commit.

## Done

| # | Milestone | Commit | Evidence |
| --- | --- | --- | --- |
| 1 | History audit of the database files; purge prepared (not published) | M1/M2 | `docs/SECURITY.md` §1; dry run 15 → 0 database blobs |
| 2 | HTTP, auth and session hardening; authorisation tests; backups | M1/M2 | `tests/security.test.js` (9 tests); browser 58/58 under strict CSP |
| 4 | Permanent canon (two-layer memory): people, reigns, wars, territory, foundations, artifacts, oaths, choices, lineage, marriage | M4 | `tests/canon.test.js` (5): 300 years, contradictions, compaction, worlds, restart. Live multi-generation check is pending in the final live pass |
| 3 | Player agency: four-layer turns, action guard, repetition across replies | M3 | `tests/agency.test.js` (12); live: 7 invented sentences removed in 11 turns, 0 fallbacks |
| 7 | Adventures from world state: 11 kinds (investigation, rescue, trade, exploration, construction, research/artifact, military, negotiation, intrigue, personal, historical mystery); enforced steps (place, words, people, coin, materials, days of work, persuasion rolls with limited tries, fights, choices); deadlines; failures with consequences; world changes in canon | M7 | `tests/adventures.test.js` (6), stable over 5 repeated runs; suite 198/198 |
| 6 | Living world: dynasties (heirs, regencies, disputed claims, elections), population with carrying capacity, prices from ruin/occupation/decrees/disasters, faiths and magic schools, disasters and player-led rebuilding, institutions that grow and outlive founders, legend rivalries and decrees, visible occupation (arrival patrols, levy, resistance work), governing as real law, low-level safety in ancient worlds, `news` command | M6 | `tests/world-life.test.js` (11); suite 192/192; browser 58/58; prompt ≈3.3k chars after 200 years |
| 5 | Companion stories for all 8 (go/act/fight/choice; abilities, gear, factions, settlements, rulers, oaths, deaths, partings; canon); in-character reactions; NPC goals, concerns, views, relations, retirement and successors | M5 | `tests/companion-stories.test.js` (8), `tests/npc-life.test.js` (7); suite 181/181; browser 58/58 |

## Next, in order

8. Profession opportunities; class acquisition audit; bard and druid pacing.
9. Infinite progression validation (1–1,000+), exploits, normal-play scenarios.
10. Mature settings preserved (regression only).
11. Art: recognisability, event accuracy, biomes and weather.
12. UI panels: inventory, crafting, map, quests, skills, professions, companions, politics, chronicle, saves, settings, AI status.
13. Test suites: full campaigns across classes, endings, seeds, alignments and professions; live Groq; failure modes; CI.
14. A human-like acceptance tester.
15. Docs: `GAME_COMPLETION`, `LIVING_WORLD`, `SECURITY`, `FINAL_TEST_REPORT`, `REMAINING_LIMITATIONS`.

## Needs the owner

- Authorise (or decline) publishing the database-history purge (`scripts/security/purge-db-history.sh --push`).
- Authorise any push of this work.
