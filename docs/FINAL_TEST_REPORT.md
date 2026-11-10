# Final test report

Completion pass of 2026-11-08 to 2026-11-09, branch `claude/ember-and-ash-completion` (local commits; nothing pushed).

Every automated run used a temporary database. No run opened the real player database. The Groq key was read from `.env` by the live scripts and never printed. Numbers below are the latest measured results; nothing has been rounded up.

## 1. Automated suite (`npm test`)

**229 tests in 28 files, all passing.** This is up from 147 at the start of the pass.

The suite was run in full after every milestone. It was also run three times in a clean clone with no `.env`, as CI will run it: 229 / 229 on each run, after two flaky tests were found and fixed (section 8).

| Area | Files (tests) | What it proves |
| --- | --- | --- |
| Security | security (9), journal (2) | Headers and CSP; CORS; forged IDs; body limits; passwords and legacy rehash; rate limits; remember-me hashing and migration; logout-all; change-password; save, world and guest isolation; guest-to-account; backups; journal protection and no secrets |
| Player agency | agency (12), narration (4), narration-failures (6) | The action guard removes invented player acts, including in a 60-turn adversarial run. Repetition is caught. Every AI failure mode falls back to the game's narrator: rejected key, rate limit, empty, connection refused, retired model, a call that never answers, refusal, repeat, malformed content |
| Memory and canon | memory (5), canon (5) | 10,000 turns within caps. 300 years of history reach a newcomer. The dead stay dead. The ledger stays bounded. Worlds are separate. Lineage and marriage survive a restart |
| Companions and people | companion-stories (8), npc-life (7) | All eight arcs run end to end with enforced steps, needs, deaths, partings, canon entries, story abilities in combat and in-character reactions. NPC goals, concerns, views and mutual relations; 200 years of retirements and successions; heirs answer to their own names |
| Living world | world-life (11), politics (6), living-world unit and API (18 + 5), world-tour (1) | Dynasties with heirs, regencies, disputes and elections; population within capacity; prices; movements; disasters and rebuilding; institutions; rivalries and decrees; occupation shown on arrival and on the board; governing as law; low-level safety in ancient worlds |
| Adventures | adventures (6) | Eleven kinds built from world state and played to the end; enforced steps; deadlines and failures; world consequences |
| Trades and classes | trades (9), professions (6) | Every class earnable by its own words; 26 paths; commissions, voyages, inns, contracts, masterworks; a peaceful career paid in years, not a shortcut |
| Progression | progression (6) | Levels 1–2,500 exact and playable; XP past 2^53; bounded deaths; huge XP exact through a restart; no buy-sell profit; one-time rewards; played rift XP |
| Content | content unit and API (12 + 7), mature-regression (3), road (5), crime (7) | Six settings server-side; adults only; minors never; consent and "stop"; coercion as a crime; settings untouched by the new systems; violence-off narration without gore |
| Art | art (5) | Weather by land, season and day; banners, disasters, voyages and work; 768 combinations draw clean SVG; every animated class stops under reduced motion and Still |
| Core | game unit (21), systems unit (21), api integration (16), campaign API (6) | Combat, quests, death, chapters and endings, the campaign over the API |

## 2. Browser (`scripts/ui-playtest.js`, Chromium, real server)

**72 / 72 checks, no console errors.** This is up from 58.

The run covers desktop at 1,400×900, mobile at 390×844, and reduced motion. It includes:
- the strict CSP;
- creation, story, combat, the content settings, crime and the road meter, and reload;
- the Journal: all nine pages, arrow keys and Home/End, Escape returning focus, the map's Travel button really travelling, and the "j" key;
- the Still toggle stopping all animation;
- an accessibility audit: every control, field, image and dialog is named;
- on mobile, the Journal fits the screen with 43 px touch targets.

The new art was also checked by eye from rendered screenshots. That check found three problems, all fixed: the sun shone through storms, the player stood inside the ship's hull, and smoke was drawn as grey balls.

## 3. Campaigns (`scripts/playthrough.js`, bot over the real API)

### All 12 classes × 2 seeds × all four endings, each followed by 300 actions of the next generation

**24 / 24 finished. 0 server errors. Every generation played on in the same world.**

| Class | Seed 7 (path) | Seed 11 (path) |
| --- | --- | --- |
| Fighter | 2,524 / 9 deaths (Wardens) | 5,335 / 24 (Remnant) |
| Barbarian | 3,169 / 7 (Ascend) | 2,738 / 9 (Shatter) |
| Rogue | 1,798 / 5 (Wardens) | 2,673 / 12 (Remnant) |
| Ranger | 2,816 / 12 (Ascend) | 2,348 / 5 (Shatter) |
| Monk | 2,559 / 7 (Wardens) | 3,363 / 11 (Remnant) |
| Paladin | 2,753 / 3 (Ascend) | 2,439 / 3 (Shatter) |
| Cleric | 2,681 / 4 (Wardens) | 6,105 / 24 (Remnant) |
| Druid | 8,979 / 44 (Ascend) | 3,015 / 4 (Shatter) |
| Wizard | 2,541 / 3 (Wardens) | 2,419 / 7 (Remnant) |
| Sorcerer | 3,307 / 13 (Ascend) | 3,111 / 9 (Shatter) |
| Warlock | 3,250 / 9 (Wardens) | 7,527 / 44 (Remnant) |
| Bard | 5,405 / 21 (Ascend) | 3,721 / 12 (Shatter) |

The long runs had no companion: the bot only recruited Maren Holt, who refuses anyone the Wardens distrust. After the bot learned to hire sellswords:

| Run | Before | After |
| --- | --- | --- |
| Druid, seed 7, Ascend | 8,626 / 41 deaths | **5,980 / 15** |
| Warlock, seed 11, Remnant | 7,527 / 44 | **4,323 / 21** |
| Cleric, seed 11, Remnant | 6,105 / 24 | **5,779 / 19** |
| Druid, seed 7, Wardens (control) | 2,602 / 1 | 2,602 / 1 (unchanged) |

The remaining gap, about 2× on hostile paths and mostly in chapters 7–8, is listed in `REMAINING_LIMITATIONS.md`.

### Bard and druid pacing (Wardens path, before → after the tuning)

| Class | Seed 7 | Seed 11 |
| --- | --- | --- |
| Bard | 3,609 → **2,610** | 2,810 → **2,641** |
| Druid | 3,756 → **2,602** | 3,068 → **3,111** (deaths 3) |
| Rogue (reference) | 1,445 | 1,877 |

These were re-run after the later milestones with identical results, so the living-world changes caused no regression.

## 4. Progression past level 100

**High-level playtest** (fighter fixtures, played through the API: rift dives and sagas):

| Level | Rift dives won | Deaths | Actions per level | Save and restart |
| --- | --- | --- | --- | --- |
| 150 | 6 / 6 | 0 | 65 | identical |
| 200 | 6 / 6 | 0 | 309 | identical |
| 300 | 6 / 6 | 0 | 987 | identical |
| 500 | 6 / 6 | 0 | 2,803 | identical |
| 1,000 | 6 / 6 | 0 | 11,478 | identical |

All numbers stayed finite.

**Post-game, played normally** (3,000 actions after the ending, no fixtures): fighter 96 → 138, wizard 96 → 142, 0 server errors. The fighter spent its last ~1,700 actions near 136–137, diving deeper than it could hold (see limitations).

## 5. Live AI narration (Groq, `qwen/qwen3.8-27b`)

| Run | Turns | Result |
| --- | --- | --- |
| Agency (M3) | 11 | 7 invented sentences removed; 0 regenerations; 0 fallbacks |
| Two generations, one world (`scripts/live-narration-check.js`) | 12 | 12 AI turns, 0 fallbacks; 3 and 6 invented sentences removed. A man murdered in generation one was never narrated alive 25 years later; the canon and the parent reached the narrator |
| Acceptance, three personas (`scripts/acceptance-tester.js --live`) | 36 | No findings (leaks, broken values, empty replies, errors); slowest turn 3.2 s |

## 6. Human-like acceptance (`scripts/acceptance-tester.js`)

Three personas (soldier, trader, villain) played with natural, misspelt, rambling and hostile input: script tags, SQL fragments, prompt injection, 600-character strings and emoji. They opened the Journal now and then.

**1,800 offline actions over three seeds: no high or medium findings.** The low findings were the same refusal repeated on repeated requests ("The inn here would cost…"), and one repeated offline description of a failed escape.

The first run found two problems, both fixed:
- `stats` returned an empty reply; it now returns a character sheet in words;
- the audit's own leak pattern was too broad.

## 7. Security checks

- **History audit:** 15 database blobs in history, containing 1 account (bcrypt cost 10), 1 save and up to 27 guest IDs. No keys or tokens.
- **Purge:** prepared and dry-run verified (15 → 0 blobs, trees otherwise identical). **Not published** (needs your authorisation).
- **Tracked tree:** no `.env`, no database files, no key patterns (also enforced by the CI workflow).

## 8. Bugs found by testing in this pass (all fixed)

- **A 999-year-old NPC.** Someone killed in a war stayed in the world as a 999-year-old until the next yearly reckoning. The heir now takes over at once. Found by the 200-year NPC test in a clean-clone run.
- **Trade adventures going nowhere.** A trade adventure could target the town the player was standing in. Found by a flaky test.
- **Populations without limit.** Populations grew unbounded, and ruined towns could never recover. Fixed with logistic growth, varied carrying capacity, and returning refugees.
- **Ancient worlds of ruins.** Failed crises left ancient worlds mostly ruined. Damage is now one step at a time, and a strong holder protects its towns.
- **Movements that never faded.** Faiths and schools now rise, age and fade.
- **Honest work as an exploit.** Work XP was far too high (level 10 in 11 shifts). It is now about one fight's worth per shift. Rebuilding and adventure rewards were aligned with sagas.
- **The bard's cooldown.** The bard's main spell had a cooldown that no other caster's has (fights of 6.6 rounds at the Crucible, now 4.3).
- **The druid's defence.** The druid had no defence beyond healing (45% HP left after fights at the Crucible, now 56%).
- **The Still toggle.** It did not stop looping animation, and only applied on the next turn.
- **Accessibility.** Nine unlabelled fields and three unnamed dialogs.
- **The talk hint.** It gave the narrator the original NPC's name when an heir held the role, and heirs could not be talked to by name.
- **"decide N".** It was taken by the main story even when a companion's choice was waiting.
- **Hanging AI calls.** A call that never answered relied entirely on the SDK's timeout. The game now has its own deadline.

## 9. How to reproduce

```
npm test                                             # 229 tests, offline, temporary databases
node scripts/ui-playtest.js                          # needs a running test server and Chromium (see docs)
node scripts/playthrough.js --style druid --seed 7 --path ascend
node scripts/high-level-playtest.js --levels 150,200,300,500,1000
node scripts/acceptance-tester.js --actions 600 --seed 5
node scripts/live-narration-check.js                 # live, reads .env, a few dozen calls
node scripts/acceptance-tester.js --actions 36 --live
```
