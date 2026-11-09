# Ember and Ash — The Living World (Phases 3–5) tracker

Last updated: 2026-11-08. Branch `claude/ember-and-ash-completion` (committed locally, not pushed).

The original ten-chapter campaign is now the opening chapter of a world's history. Phase 4 (sections 11–15) covers class balance, the political simulation, high-level validation, mature content and visual refinement. Phase 5 (sections 16–23) covers player agency, adult content, crime and justice, slavery (with slave fighters and revolts), 39 professions, the good-and-evil road, and the narrator's long memory with live AI narration. This document tracks what is implemented, how it was verified, its known limits, and what is next. Earlier systems are covered in [GAME_COMPLETION.md](GAME_COMPLETION.md).

Status key:

- **Done + tested**: automated tests and/or measured bot or browser runs.
- **Done, lightly tested**: works, but coverage is thin.
- **Partial**: works, but is missing something listed.
- **Not done**: not implemented.

## Verification summary

| Check | Result |
| --- | --- |
| `npm test` (isolated temp DB, offline narration) | **147 / 147 pass**: 22 added in Phase 4 and 34 in Phase 5. Phase 5 covers player agency, explicit content, crime, slavery, professions, the road, slave fighters and revolts, and narrator memory. The memory tests include a 10,000-turn run |
| `scripts/ui-playtest.js`: desktop, reduced motion, mobile 390×844 | **58 / 58** checks. Phase 5 adds: your exact words narrated back, the Draw / Fight barehanded buttons, undressing drawn, a crime scene with the deeds ledger, and the road meter darkening after a murder. No console errors |
| All 12 classes × 2 seeds, full campaign (`playthrough.js`, final Phase 5 code) | **24 / 24 finish**; 1,445–4,312 actions; wizard 2,099–2,202 (was ~11,400) |
| Live AI narration (Groq, `qwen/qwen3.8-27b`) | 27 live turns across every kind of scene: talk, quoted and described speech, unarmed and armed combat, undressing, explicit consensual intimacy and "stop", work, murder, trial, travel, the slave market, rest. All narrated by the AI, with no leaked notes or engine text, at about 1.3 s per turn. A barkeep the model named Davin came back as Davin 336 turns later |
| Narrator memory, 10,000 turns (mocked AI) | ~5 s in total; memory 94 KB with every store at its cap; prompt 3.2k chars at turn 100 and 4.0k at turn 10,000; a turn-7 promise and a turn-30 murder still recalled at turn 10,000 |
| Professions (`scripts/profession-sweep.js`, 39 trades) | Every trade wins 49.2–56.0% of six-fight chains six levels under the zone (no trade 43.7%). Ordinary trades earn 34–38 copper per region tier per shift; the thief, smuggler and assassin earn more and are caught on 11%, 11% and 2% of shifts |
| High-level fixtures, 12 classes × levels 150/200/300/500 | 92–98% rift wins at matched depth; saves identical after restart in 48 / 48 |
| Politics, 80-year simulations | Wars, alliances, lapses and truces in every decade band; empires capped at 20 regions in 60 / 60 worlds |
| Full campaign regression (`scripts/playthrough.js`) | Completes: The Long Fire, level 96, 0 server errors |
| Postgame hero, ranger, Ascend ending (`--postgame 1500`) | Level 96 → 132 in 1,530 actions; 26 rift depths, 8 sagas, 4 crises won, 2 deaths |
| Postgame hero, fighter, Wardens ending (`--postgame 2500`) | Level 96 → 124 in 2,500 actions; no death spiral after the fix below |
| New generation in the same world (`--generation 800`) | Level 1 → 19 in 851 actions, 6 deaths, 3 sagas; inherited campaign; the legend appears in "legends" and in townsfolk's rumours |
| Wizard, Remnant ending, seed 9 (`--postgame 800 --generation 500`) | Ending reached; hero 96 → 125 in 833 actions (4 deaths, 18 rift depths); newcomer level 19 in 510 actions (3 deaths) |

### Fixes made because of these runs

- **Legends could lose a campaign's worth of progress per death.**
  - *Found:* before the fix, the post-ending hero fell from 103 to level 1.
  - *Now:* from level 100, a death costs a quarter of progress toward the next level and never a whole level.
- **Newcomers' deaths stacked.**
  - *Now:* below level 10, a death costs exactly 1 level.
- **Newcomers had no early story XP.**
  - *Found:* an inherited-world newcomer only reached level 2–6 in about 1,000 actions.
  - *Now:* they get a "First Steps" starter saga (+350 XP, like Chapter 1).
  - *Also:* low-level sagas are gentler, sagas open at level 3, and level-1–4 characters don't meet foes 2 levels above them.
- **Long time skips stamped every event with the final date.** As a side effect, each legend's yearly decision reused the same roll every year.
  - *Found by:* a flaky test.
  - *Now:* the clock steps month by month through any skip.
- **"New Game" discarded the current character.**
  - *Now:* it archives the character first.

## 1. Persistence architecture — **Done + tested**

- **Storage:** new tables `worlds` (calendar, chronicle, legends, realm, crises, relics, orders) and `character_archive`. They live alongside the existing `saves`, `guest_sessions` and `player_sessions` tables.
- **Binding:** each character carries `worldId` and `characterId`. `server/world-store.js` binds the live world to the character as a non-enumerable `state.__world`, so it is never copied into a character save. One world record is shared by every character in it.
- **Migration:** a save from before this phase gets a world built from its own state on first load, including history from a campaign ending it had already reached. Old saves keep everything.
- **Nothing is deleted:** switching character always archives the old one, and any archived character can be resumed.
- **Database guard:** `db/database.js` refuses to open the default (real) database when `NODE_TEST_CONTEXT` is set (any `node --test` run) or `EMBER_REQUIRE_DB_PATH=1`. Every test, bot and simulation in this phase ran against temporary databases. The real `data/emberandash.db` was never opened.

## 2. Infinite leveling — **Done + tested**

`game/character/xp.js` defines the cost to go from level L to L+1:

| Level | Cost of one level | Total XP to reach |
| --- | --- | --- |
| 10 | 100 | 450 |
| 50 | 500 | 12,250 |
| 100 | 1,000 | 49,500 |
| 150 | 7,500 | 209,597 |
| 200 | 50,000 | 1,315,786 |
| 300 | 379,688 | 18.5M |
| 500 | 4.9M | 404M |
| 1,000 | 156M | 26.0B |

- **The three pieces:** 10·L up to level 100 (unchanged, so chapter gates hold); ×25 by level 200; then L⁵/6.4M, computed as an exact closed form.
- **Pacing:** the whole original campaign yields about 44,650 XP. One level at 200 costs more than that (tested), and one level at 500 costs more than a hundred campaigns (tested).
- **No numerical breakage:**
  - The maths is exact BigInt. XP is stored as a Number while it is a safe integer and as a decimal string beyond that, so it survives JSON round trips (tested to level 100,000; computed to 1,000,000).
  - Finding a level from XP is a fast binary search.
  - Invalid values (NaN, negative, garbage text) resolve to level 1, and absurd values are clamped at 10⁴⁰ XP (about level 85 million).
- **No farming:** a monster 10+ levels below you gives ¼ XP, and 25+ below gives none. High-level XP comes from sagas, the rift, crises and story.
- **Gear:** 25 new tiers (Mythic → Worldforged), up to item level 470.
- **Enemy HP:** the depth multiplier is capped at ×2.5, so high-level difficulty comes from affixes, phases and environments rather than giant HP pools.
- **Combat at levels 150, 500 and 1,000** is tested: finite numbers, clean logs, fights lasting multiple rounds.

## 3–4. The world after the ending, and the three paths — **Done + tested**

- **Endings become eras.** The four endings are unchanged, and each now sets an era, a realm and ruler, faction power, and world effects:
  - The Long Fire: hazards ×0.5.
  - The Sunrise Imperium: prices ×1.1, fewer ambushes.
  - The New Sovereign: a dark age; hazards ×1.2.
  - The Ordinary Age: prices ×0.9, spells cost ×1.25 mana.
- **The hero is recorded** as a legend (ruler, patron or mentor). If the hero claimed the realm, the hero is its ruler.
- **The three paths,** offered as text commands and UI buttons:
  1. **Continue:** keep everything (levels, gear, companions, titles, rule).
  2. **New character in this world, N years later:** the years pass for everyone (people age, die and are succeeded; crises come and go). The newcomer starts at level 1 with nothing inherited, and the Sovereign story is history rather than replayed (`campaign.inherited`). They start with a starter saga.
  3. **New world:** a separate, independent world. The old world and its characters are kept and resumable.
- **API routes:** `GET /api/world`, `POST /api/world/continue`, `/api/world/new-character {mode, years}`, `/api/world/resume {characterId}`.

## 5. Time, aging, generations — **Done + tested** (world aging is **Partial**)

- **Calendar:** hours, 360-day years, months, seasons, time of day; starts in 1012 E.R.
  - **Time costs:** an action 1h; travel 2–3 days; exploring 4h; gathering 3h; crafting 2–8h; a long rest runs to the next morning; governing a season; training months or years.
  - **No time passes for** menus, conversations, refreshes or failed requests, and undo rewinds the clock with the action (all tested).
- **Aging:**
  - Stats shift with body age: youth grows; prime is neutral; 36–50 gains WIS and CHA; old age trades STR, DEX and VIT for WIS and INT.
  - Lifespan is 70 + VIT/2, multiplied by species (elf ×3, dwarf ×1.8, halfling ×1.3, orc ×0.9).
  - Players get a warning in the last 5 years. Death of old age turns the character into a legend and offers the new-character paths.
- **Longevity:** six paths with real requirements, all tested:
  - **Elixir of Long Years:** alchemist level 5 plus rare materials.
  - **Emberkeeper's Grace:** the Long Fire ending plus Exalted Warden standing.
  - **Heart of the Ember:** took the Ember in Chapter 8 → immortal.
  - **Rite of the Phylactery:** Morwen's phylactery plus level 150 → undying.
  - **Throne-bound:** the ruler of the Ascend ending.
  - **Shard of Unmaking:** rift depth 50.
  - Immortals stop aging physically while their calendar age keeps counting.
- **World aging:**
  - All 50 named NPCs age, die and are succeeded by named heirs, who take over their role and greetings.
  - Legends who aren't immortal grow old, die, and leave one heirloom relic in their tomb, claimable once per world.
  - Settlements decline from failed crises and are rebuilt over years.
  - **Partial:** political borders are world-wide (one realm), not per region; cities change status but not size; children growing into notable figures happens only through NPC succession.

## 6. Legacy and world memory — **Done + tested**

- **The chronicle** is deduplicated (one-time events can't repeat), capped at 2,000 entries, and readable with `chronicle`. It records endings, boss victories, chapters, choices, sagas, crises, deaths, successions, governance, orders founded, relics claimed, longevity rites, rift milestones and level milestones.
- **Legends can be met at their seat** (`talk to <name>`). Their dialogue comes from their real snapshot: equipment, choices, companions, deeds, personality traits taken from their choices and stats, and their current age. Their relationship to you depends on your standing (liege, tyrant, patron, mentor).
- **Mentors** teach once (+1 to their best stat). Townsfolk rumours cite real chronicle entries, and monuments and tombs appear in the regions tied to each legend.
- **Duplicates are blocked:** relics are claimed once per world, mentor lessons once per newcomer, history keys once each, and nothing is inherited automatically.

## 7. Endless adventure — **Done + tested**

- **The rift:**
  - Depths are unbounded; a depth-N echo is level 92 + 2N.
  - Eight stacking affixes: burning ground, rift-wards, echo hordes, gloom (accuracy), unending fury, mending void, mana drain, and quickened specials. Every 10 depths adds an extra phase.
  - Riftforged gear every 5 depths. Each depth rewards once. Requires level 90.
- **Sagas:**
  - Four-step procedural adventures (travel → investigate → defeat foes → boss), themed by the current era.
  - Newcomers get regional sagas; characters above level 100 get Ascendant threats in the inner ring at their own level.
  - Every step is checked by the engine: you must be in the right region, and only the saga's own foes count.
  - Rewards scale with level, not with the cost of the next level.
- **Crises:** they arise on their own over the months and are scaled to the active character's tier. Ignoring one ruins settlements; ending one records you in history. Both outcomes are tested.

## 8–9. Procedural art and illustrated scenes — **Done + tested**

- **Portraits:**
  - `game/appearance.js` parses the description once (hair colour and style, eyes, skin, build, height, species, beard, scars, freckles, tattoos, eyepatch, crooked nose, missing ear, earrings), fills in the gaps from a seed, and stores the result.
  - `public/game/art.js` draws a layered SVG portrait. It shows equipment (weapon type, armour type, quality trim), age (grey hair from 45, white from 70, lines), boss-fight scars, a ruler's crown, archmage regalia, and an undead or immortal look.
  - Portraits are deterministic and identical after save, restart and load (tested via the API and in the browser).
- **Scenes:**
  - Every response carries a structured scene: biome (23 types mapped to the 38 regions), time of day, season, weather from hazards, era tint, settlement state, the player figure, the enemy (11 body types with per-creature variation and features, bosses larger; see section 15) or an NPC (legends keep their own look), and ordered events.
  - `public/game/scene-view.js` animates those events: lunges, hits and misses, crits, damage numbers, spell projectiles by element, telegraphs, blocks, stuns, deaths, level-ups, travel, rest, crafting and triumphs.
  - **Engine authority:** events come only from the engine result. A miss is drawn as a miss, and a slain enemy is drawn dead and is absent next turn (unit and browser tested).
  - `prefers-reduced-motion` (tested) or the "Still" button shows the final state without animation; "Hide art" turns illustrations off. The scene sits above the story on mobile (tested at 390 px).
- **Not done:** no external image-generation provider is wired in. The game never needs one; an optional provider interface is future work.

## 9b. Dominion and legends who act — **Done + tested**

- **The dominion map:** each region is held by a power (Ember Wardens, Free Compact, Veldrathi Remnant, Ashen Choir, or no one).
  - Each ending redraws the map for the victors.
  - Every year, a power above 70 strength pushes into a weaker neighbour. Regions ruined by ignored crises can fall to the Choir, the Compact or lawlessness.
  - The `map` shows who holds each road, and merchants charge allies of the local power 10% less and its enemies 25% more.
- **Legends act on their own,** about every other year, according to their role and personality:
  - ruling legends annex neighbouring regions in their own name;
  - dutiful legends and patrons ride out to end crises;
  - mentors found schools;
  - others get monuments in their home region.

  Every action goes into the chronicle and their list of achievements, so newcomers hear about it in rumours and in their dialogue.
- **Era effects apply in play** (tested): hazard damage, prices, and the extra mana cost in the Ordinary Age.

## 10. Long-term development — **Done, lightly tested**

- **Titles** come from real state: realm ruler; legend title; Archmage (caster, class level 5, level 120+); Master of Arms; Rift-walker; Champion of the Realm (3+ crises ended); Founder; the Undying.
- **Long-term actions:**
  - `govern for prosperity|order|might`: rulers only; costs a season; shifts faction power, settlements and taxes.
  - `found the <name> order`: level 100+ and 500 gold-equivalent coin; once per character.
  - `train <stat> for N months/years`: ages you; at most +1 to a stat per year of training, 10 in a lifetime; modest XP.
- **Lightly tested:** governing and founding are only tested by hand, not by automated tests.

## 11. Class balance (Phase 4, priority 1) — **Done + tested**

**The complaint:** a wizard campaign took about 11,400 actions and 95 deaths, against about 2,000 for martial classes. The cause was not one number. Simulated fights (`scripts/class-sweep.js`, `scripts/lib/builds.js`) and traced bot campaigns found these:

- **Casters had small or wrong mana pools.** Mana came from INT and WIS only, so charisma casters (sorcerer, warlock, bard) ran dry. *Now:* mana uses the best of INT, WIS and CHA.
- **Element lists were single-element.** All-arcane wizards and all-shadow warlocks hit resistant enemies with no alternative. *Now:* there are sonic, chaos, raw and eldritch spells; Drain Life heals and is eldritch; there is a new Wild Ward; and Sacred Flame and Mockery are stronger.
- **Accuracy and evasion scaled badly with level.** *Now:* dex advantage is normalised by level, spell accuracy uses the casting stat, and a level gap costs +3% damage taken and −1% to hit per level the foe is above you.
- **Hybrids and bruisers had no defence.** The paladin's split stats and the barbarian's raw HP left both fragile. *Now:* the paladin attacks with `max(STR, (STR+WIS)×0.6)` and has a 0.85 damage-taken aura; rage gives +30% damage and ×0.85 damage taken.
- **Echoes of the word "echo" resisted physical damage by 35%**, because the spirit regex matched "echo". *Now:* fixed.
- **Region names were read as creature types:**
  - "**Thorn**wick Brute" counted as a plant (fire-vulnerable, nature-resistant).
  - "Veld**rat**h Marauder" counted as a beast.
  - Every "Ashwood …" human was a treant.

  *Now:* place names are stripped before traits are read, short tokens use word boundaries, and vampires and zombies count as undead (unit tested).
- **Kharzul (chapter 8) was a spike.** At equal level most classes won only 39–65%, against ~95% for the bosses on either side. *Now:* enrage moves from 60% to 40% HP, STR goes from 11 to 10, and the HP multiplier from 3.8 to 3.6. Wins are 87–100% at equal level and 57–100% at four levels under.
- **Death spirals.** A death cost 1–3 levels, stacking for deaths within 50 actions. One bad stretch dropped a bard from level 80 to 69, out of the Crucible's range, for 2,400 extra actions. *Now:* below level 100 a death costs exactly one level and the progress toward the next. It never drops you below the current story chapter's minimum level. Your gear is still left at the death site.
- **Recovering gear downgraded you.** `recover my gear` always re-equipped the old kit and put the gear you were wearing into the backpack. A player who died, bought a better weapon, then went back for their old gear was silently downgraded; one druid fought for 50 levels with tier-6 gear while carrying tier 8. *Now:* the better piece in each slot is worn and the other goes to the backpack, with a message (unit tested).
- **Two bot bugs inflated some runs:**
  - the bot marked armour as bought even when it couldn't afford it;
  - its battle policy never used Drain Life, Hex or Overload.

  Both are fixed in `scripts/playthrough.js`.

### Measured results

**Full campaigns through the real API** (`scripts/playthrough.js`, isolated temp DB, Wardens path, two seeds per class, final code):

| Class | Seed 7: actions / deaths | Seed 11: actions / deaths |
| --- | --- | --- |
| Rogue | 2,052 / 0 | 1,709 / 2 |
| Wizard | 2,861 / 9 | 1,924 / 3 |
| Barbarian | 2,129 / 1 | 2,191 / 6 |
| Fighter | 2,249 / 2 | 2,181 / 1 |
| Paladin | 2,161 / 0 | 2,630 / 2 |
| Ranger | 2,529 / 3 | 2,329 / 1 |
| Monk | 2,478 / 3 | 2,602 / 1 |
| Cleric | 2,931 / 6 | 3,144 / 4 |
| Bard | 3,089 / 7 | 3,111 / 9 |
| Sorcerer | 4,411 / 25 | 2,656 / 14 |
| Druid | 4,400 / 15 | 7,449 / 43 |
| Warlock | 5,585 / 31 | 5,358 / 30 |

- All 24 runs finish the campaign (level 96–97, no server errors).
- **The wizard went from ~9,400–11,400 actions and 67–95 deaths to 1,900–2,900 actions.**
- Before this round's fixes, the cleric on seed 7 took 6,626 actions and the druid on seed 11 took 16,518.

**Matched-level fights** (`class-sweep.js --chain 6`: six fights in a row, resting as the bot does, 60 trials per cell):

| Region (level) | Fighter | Barbarian | Rogue | Ranger | Monk | Paladin | Cleric | Druid | Wizard | Sorcerer | Warlock | Bard | Classless |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Old Veldrath (46) | 93 | 95 | 100 | 97 | 93 | 83 | 93 | 90 | 100 | 88 | 92 | 97 | 22 |
| Crucible Gate (66) | 93 | 98 | 100 | 100 | 90 | 98 | 100 | 95 | 100 | 98 | 100 | 97 | 57 |
| The Crucible (76) | 88 | 93 | 100 | 100 | 80 | 80 | 85 | 83 | 98 | 73 | 88 | 83 | 17 |
| Shattered Throne (96) | 95 | 90 | 100 | 97 | 97 | 98 | 100 | 97 | 100 | 90 | 98 | 90 | 65 |

At equal level, every boss gives 87–100% wins for every class (one fight, three potions). Four levels under, results spread widely: Kharzul is 57–100%, and early Varrick, with a level-4 character against a level-8 boss, is much harder for casters.

**After Phase 5** (weapons drawn by choice, profession edges, gear recovery fixed), the same 24 campaigns took these numbers of actions, all finishing with no server errors:

| Class | Seed 7 | Seed 11 |
| --- | --- | --- |
| Rogue | 1,513 | 1,938 |
| Ranger | 1,970 | 2,015 |
| Barbarian | 2,454 | 1,987 |
| Wizard | 2,476 | 1,991 |
| Paladin | 2,207 | 2,590 |
| Monk | 2,259 | 2,596 |
| Fighter | 2,488 | 2,652 |
| Cleric | 2,378 | 2,540 |
| Warlock | 2,540 | 3,251 |
| Bard | 3,609 | 2,810 |
| Sorcerer | 3,119 | 2,849 |
| Druid | 3,756 | 3,068 |

### Remaining spread

- **Druids, bards and sorcerers take the longest** (up to about 3,750 actions, against 1,500–2,000 for rogues and rangers). The Phase 4 figures were up to 7,400. In matched-level simulations they are in the pack (88–100%).
- **The Crucible is the hardest zone for everyone,** at 73–100% in six-fight chains.
- **Rogues and rangers are the strongest classes;** wizards are no longer the weakest.
- **Seed variance is large:** the same class can differ by 2× between seeds.

## 12. Politics: legends and councils at war and peace (Phase 4, priority 2) — **Done + tested**

`game/politics.js` runs a yearly turn for four powers: the Ember Wardens, the Free Compact, the Veldrathi Remnant and the Ashen Choir.

- **Relations** between each pair are war, truce, peace or alliance. Each change is recorded in the chronicle with its reason and, when a legend drove it, with that legend as the actor.
- **Leaders:**
  - A living legend tied to the faction leads it (or the realm's ruler leads the ending's faction).
  - Otherwise a council leads, with a standing temperament: Wardens dutiful, Compact merciful, Remnant ambitious, Choir ruthless.
  - Personality drives the decisions:
    - ambitious, ruthless or cruel leaders attack weaker neighbours;
    - powers that fear a giant ally against it;
    - merciful or dutiful leaders end wars sooner, unforgiving or cruel ones later.
- **Wars have consequences:**
  - Each year the stronger side, with half its allies' strength and a seeded roll, takes a front region.
  - The region's settlement drops a step (thriving → struggling → ruined), and a named NPC there may die, to be succeeded.
  - Both sides lose power, and front-line shops charge 20% more.
  - Exhaustion or a beaten side ends the war in a truce, and three years of truce become peace.
- **No runaway empires:**
  - Holding more than 15 regions drains power, and distant holdings revolt.
  - No power can conquer past 20 regions.
- **Alliances lapse** when no third power threatens the allies. A ruthless leader may turn on a much weaker ally. *Found in a 60-year run:* before this rule, every pair of powers ended up allied and history stopped.
- **The player:**
  - `politics` shows the state of the world.
  - `enlist with <power>` joins a side, and `renounce allegiance` (or `stay neutral`) leaves it.
  - `fight in the war` starts a front-line battle at the region's own level range, so newcomers are never thrown at legends' armies. Victories move the war score.
  - `negotiate peace between X and Y` needs standing of 40 or more with both sides, or being a ruler.
  - Rulers can `declare war on` / `make peace with` / `ally with`.
  - Staying out is always possible: nothing forces you to choose a side.
- **Low-level safety:** wars change who holds land, prices and NPCs, never enemy levels. The revival settlement in every region always exists.
- **Measured (80-year simulations, `tests/politics.test.js` plus scratch runs):**
  - **Harsh world** (the Choir rules after the Ascend ending): 1–5 wars declared per decade for six decades, fewer once the founding legend has died. The map ends at about 14–15 Compact and 14–15 Choir regions, with 5–10 lawless ones; there were 4–5 named war deaths.
  - **Merciful world** (the Long Fire): 2 wars in 80 years, and 0 war deaths.
  - **Persistence:** relations, allegiance and the map survive a full server restart (API test).

## 13. High-level play (Phase 4, priority 3) — **Done + tested**

`scripts/high-level-playtest.js` builds a fixture character at each level, then plays only through `/api/action`. The fixture sets XP, stats (25 point-buy plus one per level), class level 5, gear of the level's tier, and the finished campaign.

The character dives the rift (with gear recovery after a death, as a player would), plays Ascendant sagas, then saves, restarts the server and reloads.

Results for all 12 classes on the final code (8 rift dives at matched depth and 2 sagas per class and level; each cell covers all 12 classes):

| Level | Gear tier | Echo levels | Rift wins | Rounds per fight | Actions per level (median) | Deaths per run | Save after restart |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 150 | Mythic III | 146–160 | 94 / 96 (98%) | 4.6–17 | 29–180 (51) | 0–9 | identical, 12 / 12 |
| 200 | Ascendant II | 196–208 | 88 / 96 (92%) | 4.5–21 | 130–776 (256) | 0–5 | identical, 12 / 12 |
| 300 | Primordial III | 296–310 | 89 / 96 (93%) | 5.9–27 | 472–2,697 (1,074) | 0–3 | identical, 12 / 12 |
| 500 | Worldforged V | 496–510 | 94 / 96 (98%) | 5.8–27 | 1,364–4,709 (2,502) | 0–1 | identical, 12 / 12 |

- **Mechanics really fire:** across the 48 runs there were about 2,300 telegraphed specials, 1,300 boss phases, 3,800 affix effects and 970 ward absorptions.
- **The weakest results** (6 of 8 wins) were the sorcerer at 150; the paladin, sorcerer and wizard at 200; and the wizard at 300.
- **Reading the pacing:** one level at 150 is an evening (about 50 actions); at 200, a few sessions (about 250); at 300, a campaign's worth (about 1,000); at 500, roughly a campaign per level (about 2,500). Level 500 is a long-term accomplishment without being a grind of identical fights, because the affixes stack with depth.

- **XP for one-time deeds** (sagas, new rift depths, crises) scales by `deedFactor(L) = 1` up to level 200, then `(L/200)^2.2`. Without it, a level at 500 cost about 40,000 actions; levels stay unlimited.
- **Rift echoes** are no longer HP sponges: 80% HP, STR ×0.9, at most five extra phases. The challenge comes from 1 + ⌊depth/15⌋ affixes, telegraphs and wards (weapon crits shatter wards).
- **Save, restart and reload are byte-identical** at every level tested. Numbers stay finite, and XP stays an exact integer string.
- **Levels 1–100 are unchanged:** the same XP curve and chapter gates, and the full campaign regression above.

## 14. Mature content, romance and villainy (Phases 4–5) — **Done + tested**

- **Six independent categories,** each Off, Mild or Mature: violence and gore, horror, profanity, nudity in art, romance and intimacy, and sexual themes.
  - The game is primarily for adults, so **every category defaults to Mature**. Any player can turn any category down in Settings → MATURE CONTENT (desktop and mobile), and the change applies on the next turn.
- **Eligibility is enforced on the server:**
  - Nudity, sexual themes and Mature romance take effect only after the player's adult self-declaration, for a character aged 18 or over.
  - The declaration is labelled "not verified age assurance".
  - A minor character gets romance, sexual themes and nudity forced Off, whatever is sent.
  - Sexual themes never exceed the romance level.
- **Persistence:** preferences are saved with the account and the character. They survive save/load, restart and login on another device, and a new generation inherits the player's settings, not the world's.
- **What is shown, for adults at Mature:**
  - **Art draws it.**
    - Nude adult bodies by gender, whenever the story has a character undressed. "I undress" and "I get dressed" are facts the scene follows. Mild covers chest and hips; Off draws a plain shift.
    - Consensual sex is drawn in the pose the player describes: kiss, embrace, undress, lying together, astride, from behind, oral. Each has a small looping animation, which stops under reduced motion.
    - The intimate scene continues across actions, following the player's words, until either partner says "stop" or the player turns to something else.
  - **Narration tells it.** The offline narrator writes explicit consensual scenes by pose, with the partner's pronouns. The AI narrator is told to write explicit sex between consenting adults fully and frankly, following exactly what the player described.
  - **Violence, horror and profanity** are drawn and told at full strength:
    - wounds and blood;
    - pools of blood under the dead;
    - eyes in the dark and skulls;
    - swearing NPCs.
- **The two lines that do not move:**
  1. Nothing sexual ever involves anyone under 18.
  2. A coerced or forced sexual act is possible and narrated as the crime it is: that it happened, the threat, the victim's fear and the aftermath. It is drawn as threat and aftermath (the victim cowering, or fighting free and fleeing), never with sexual detail or imagery.

  Every other act is narrated; nothing is refused.
- **AI provider rules still apply.** The AI narrator's provider may decline some content. The game reports that ("The AI narrator declined to write this scene…") and its own narrator tells the scene; it never claims the provider complied.
- **Outcomes never depend on settings:** damage, kills and history are identical at every level (tested). Only the depiction changes.
- **Romance:**
  - Flirting needs earned rapport (once per in-game day).
  - Partners can refuse.
  - A night together needs rapport 50 (70 for companions) and records a partner and a chronicle entry.
  - Children are never involved.
- **Coercion is a crime** handled by the crime system (section 18), at heinousness 9:
  - the victim never forgives;
  - witnesses lose loyalty and may leave and talk;
  - the victim may name you;
  - you may face an investigation, a trial and a sentence.

## 15. Visual refinement (Phase 4, priority 4) — **Done + tested**

**Inspected in the real game,** in Chromium at 1400×900 and 390×844, plus rendered galleries of every enemy shape and biome:

- **Heads were cut off on desktop.** The 2:1 picture was sliced to a ~3.7:1 panel. *Now:* wide panels keep the actors' band and extend sideways by mirroring the backdrop and foreground at the edges, which joins seamlessly. Phones keep the plain picture and pay nothing for this.
- **Beards drew as a dark open mouth.** *Now:* beards follow the jaw and leave the mouth clear.
- **The sitting pose had floating legs.** *Now:* the legs are crossed under the body.
- **Axes and maces were drawn as swords** in scenes. *Now:* they have their own shapes.
- **Every enemy of a body type looked identical.** *Now:*
  - **Seeded variation per creature:** size, a touch of tint.
  - **Features from the name:** wings (bat, wyvern, drake, dragon), horns (demon, lord, warlord, archon, fiend), a shield (captain, knight, guard), and larger giants.
  - **New body types:** spider, elemental, and tentacled horror.
  - **Flesh undead** (vampire, ghoul, zombie) are pale humanoids rather than skeletons.
  - **Region names are ignored,** so a "Thornwick Brute" is a man, not a tree.
- **Composition:**
  - ground shadows under every actor;
  - drifting clouds placed by region (each place keeps its own sky);
  - a foreground strip by biome (grass, reeds, cobbles, stones, embers, crystals);
  - a cloak on tier-5+ armour, so gear progression shows in scenes as well as portraits.
- **Cost:** all of it is static SVG shapes with CSS animation. New animations (wing flaps, drift) stop under `prefers-reduced-motion`.
- **Checks:** `scripts/ui-playtest.js` passes 50/50 on desktop, reduced motion and mobile, including the content settings. Portrait identity stays stable across turns, aging, gear changes and death.
- **Optional external provider:** not implemented, and gameplay never depends on one. A design that fits the current code:
  - `EMBER_ART_PROVIDER` names a module that turns the stored appearance, gear and age into an image URL. The server caches the result per (character, appearance hash).
  - The SVG portrait is always rendered first and stays if the provider fails or declines.
  - Content preferences would be passed through, and the provider's own restrictions reported as they are, never claimed.

## 16. Player agency: the player's words and actions are theirs (Phase 5) — **Done + tested**

`game/agency.js` makes the player the only author of what their character says and does.

- **Speech, quoted:** quoted words are the character's only dialogue that turn, verbatim, with nothing before or after them. For `I turn to the bartender asking for a drink "hey barkeep how about an ale"`, the narration's only line for the character is `"hey barkeep how about an ale"`.
- **Speech, described:** speech described without quotes becomes one short line that says exactly that. "…asking for a drink" becomes `"A drink, please."`; "asking the guard about the caravan" becomes `"What can you tell me about the caravan?"`. With no speech described, the character says nothing.
- **The action:** the narration retells the player's action in the second person ("You walk down the street and stop at the bar, asking for a drink.").
- **The AI narrator is held to this twice:**
  - **Prompt:** the system prompt carries these rules with the user's examples.
  - **Filter:** every AI reply is filtered after it is written. Lines the model wrote for the player are found by their attribution ("…" you say / you add, "…"). Invented ones are removed, paraphrases are replaced with the exact quote, and quoted speech the model left out is put back. NPC lines, even ones that mention "you", are untouched. Tested on a mocked reply that invented speech.
- **Weapons and abilities:**
  - A weapon stays sheathed until the player draws or names it ("I draw my sword", "I slash at it", "with my axe"). It stays in hand until sheathed, a long rest or travel.
  - "I fight back" is fists, feet and elbows, in the engine (no weapon damage) and in the narration.
  - Spells and abilities are used only when named.
  - A class never decides the action: a wizard who "fights back" casts nothing and spends no mana (tested).
  - The combat bar offers **Draw <weapon>** and **Fight barehanded** until a weapon is drawn, and the scene shows it sheathed at the hip.

## 17. Undressing, intimacy and poses (Phase 5) — **Done + tested**

See section 14. The art (`public/game/art.js`: `nudeTorso`, `intimateRoom`, the kneel, cower, run, kiss and embrace poses) and the narrators follow the player's words; nothing is drawn or narrated that the player did not describe.

## 18. Crime and justice (Phase 5) — **Done + tested**

`game/crime.js`. Nothing is prohibited: theft, assault, arson, kidnapping, murder and torture are possible against named people, companions, strangers ("a merchant", "the guard") or buildings, in the player's own words.

- **Remembered, always.** Every deed goes into the character's memory (`deeds`), and the narrator is told of the last few.
- **A perfect crime costs nothing.** If no one saw and nothing was left behind, the world never learns of it.
  - Measured: a stealthy night strangling in the wild, with the body hidden, is perfect 91% of the time over 200 trials, and seen 9%.
  - An open stabbing in a city by day is reported 56% of the time and left unsolved 44%.
- **What the world can learn:**
  - **Witnesses:** time of day, a crowd or empty country, stealth words, class and trade, and companions, who always see.
  - **Clues:** a body, blood, the method ("poison", "strangle", "make it look like an accident"), and concealment afterwards ("hide the body", "clean up the blood"). Concealment can itself be seen.
  - **A surviving victim** may name you.
- **The law:**
  - A witnessed crime brings the watch, in a town, or a warrant waiting in the nearest town.
  - Unsolved cases are investigated monthly, by clues and by how far the investigators already suspect you.
  - Others commit crimes too. When you are tried, unsolved cases nearby may be added to your charges, **including ones you did not commit**.
- **Trials:**
  - **Pleas:** innocent, confess, bribe (Warden magistrates often refuse), or flee (become an outlaw).
  - **Evidence is weighed against standing:** local reputation, fame (a finished campaign, level), charisma, faction standing, and known infamy.
  - Measured over 300 trials with equal evidence: a celebrated hero with no known crimes is convicted far less often than a known villain (tested).
- **Sentences grow with heinousness:**
  - a fine;
  - months or years in prison, during which time passes and you age;
  - exile, enforced: you are moved out, and coming back is a new crime;
  - execution, for the worst. The character dies into the chronicle, and you continue as a new character in the same world or a new one.
- **Consequences when a crime is known:**
  - infamy (greetings turn cold, companions refuse to join, "the Cruel" and "the Reviled" titles);
  - faction standing (the Wardens and Compact condemn, the Choir admires cruelty);
  - regional reputation and a chronicle entry.
- **The dead stay dead:** murdered and kidnapped named people are succeeded by heirs, and the story roles they held continue.
- **Art:**
  - the dead, with blood by the violence setting;
  - victims cowering, kneeling or chained;
  - a thief running;
  - arson flames;
  - a trial hall with a magistrate and crowd;
  - prison bars.

  A child victim is never drawn.

## 19. Slavery (Phase 5) — **Done + tested**

`game/slavery.js`.

- **Where it is legal:** where the Remnant or the Choir hold power, and in lawless land (7 of 38 regions at the start; this follows the political map). It is outlawed in Warden and Compact lands.
- **Getting slaves:**
  - "visit the slave market", "buy slave 2";
  - kidnapping (a crime);
  - "slaves" lists them.
- **Work:** porter, labour, household or fighter, each earning or helping in its own way.
- **Treatment:** "feed X well" builds loyalty and health and lowers fear; "beat", "whip" and "torture" do the opposite. "free X" earns Warden and Compact regard. "sell X" works where it is legal.
- **Consequences:**
  - Cruelty is always remembered.
  - Where slavery is legal, cruelty to your own slave is never prosecuted, though people still see it.
  - Mistreated slaves run, and a runaway tells what was done to them, which becomes public.
  - Walking chained slaves into a free town draws the watch.
  - Sexual use of a slave is coercion (a slave cannot consent), handled as such.
- **Art:** chained slaves follow a step behind you, and the market has a block with chained lots.
- **Slaves who fight** (the "fighter" job, with you):
  - They strike your enemies every round, train, and grow loyal when you win together.
  - A slave who hates or fears you may turn on you: at the start of a fight, or when you are badly hurt. They deal a blow, run, and tell what you did to them.
  - Loyal slaves (loyalty 40 or more) never turn.
  - Measured: a hated, cruelly treated fighter turned in about a quarter of fights (tested).
- **Revolt:**
  - **The chance grows with:** more slaves, more cruelty, low loyalty and high fear. Treated well, slaves never revolt (tested).
  - **Slaves kept elsewhere** break out, burn what you had there and scatter.
  - **Slaves with you** rise against you as a real fight that interrupts whatever you were doing. Win, and the survivors are back in chains (some die). Flee or fall, and they are gone.
  - Either way the revolt becomes public, with a chronicle entry and infamy.

## 20. Professions: thirty-nine trades, balanced and varied (Phase 5) — **Done + tested**

There are four new trades (miner, physician, thief, tailor), and 27 more are listed after the table. `game/profession-perks.js` gives every trade three things, scaled by rank (70% at rank 1, 110% at rank 5):

| Trade | Combat edge | Work ("work [for N hours]") | Skill |
| --- | --- | --- | --- |
| Blacksmith | +10% weapon damage, 5% less damage taken | forge commissions | sharpen my blade (+15% next fight) |
| Alchemist | potions +35%, +3% damage | brew for the apothecary | brew (recipes) |
| Scout | +5% hit, +4% dodge (plus fewer ambushes and reagents) | guide travellers | scout ahead |
| Merchant | +6% damage, +30% coin from the fallen | trade (high variance) | bribe it (end a fight with a person) |
| Cook | +4% damage, 2% less damage taken | inn kitchens | cook a meal |
| Hunter | +9% damage, +20% more against beasts | hunt (paid partly in hides) | snares, tracking |
| Scholar | +5% damage, weaknesses +25%, +4% spells | copy texts, tutor | study it (+10% for the fight) |
| Woodsman | +5% health, +8% with axes | fell timber (paid partly in timber) | build a shelter (no ambush at camp) |
| Miner | 3% less damage taken, +2% health | dig ore (paid partly in ore) | prospect |
| Physician | potions +25%, a little health back each round | treat the sick | treat my wounds (40%, every few hours) |
| Thief | +10% crit, +5% damage | work the crowds (×1.6 pay, may be caught) | steal from it (in a fight) |
| Tailor | 4% less damage taken, +3% dodge | take in tailoring | mend my armour (+10% next fight) |

**Measured** (`scripts/profession-sweep.js`: rank 3; fighter, wizard, rogue and cleric; Dustfall, Greymere, the Deep Fens, Old Veldrath and the Crucible; 60 six-fight chains each, fought 6 levels under the zone so that the edge matters):

- With no trade, 43.7% of chains are won.
- With a trade, 49.9% (merchant) to 55.0% (tailor).
- The merchant, scholar and thief sit a little lower because they also have in-fight skills the simulation does not use.

**The wider trades** (`game/constants/data/progression/trades.js`, 27 more). The woodsman was always the lumberjack; carpentry, wheel-making and carving are now separate trades:

| Group | Trades |
| --- | --- |
| Wood | carpenter, wainwright, carver, bowyer |
| Metal | armorer, weaponsmith, jeweler |
| Stone and clay | mason, potter |
| Cloth and hide | leatherworker, weaver |
| Food and land | brewer, baker, butcher, farmer, fisher, herbalist |
| Beasts | tamer (can "calm it" to end a fight with a beast) |
| Service and the road | innkeeper, cartographer, sailor, gambler, courtesan |
| Shadow | bounty hunter (+10% against people), assassin (2.5× pay; contracts can go wrong: a murder charge), smuggler |
| The dead | gravedigger (+20% against the undead) |

- Each has unlock words, five ranks, tasks and its own skill. The skill kinds are: a next-fight buff, healing, gathering, coin, gambling, charting the land, and reading warrants.
- Recipes are opened to the matching trades (the weaponsmith forges swords, the armorer mail, the bowyer bows, the herbalist potions, the baker meals).
- **Measured** with the same sweep across all 39 (60 chains × 20 cells): every trade adds +5.5 to +12.3 points over no trade, the same band as the first twelve.
- Affinity words now match whole words only ("arrow" no longer counts as "row"). Another trade's skill phrase is an ordinary story action for everyone else.

**Income** per 8-hour shift is 34–38 copper per region tier for every ordinary trade. The thief's figure includes being caught (8% per shift before DEX, then a trial). The scholar's separate quest-XP bonus was cut from +25% to +10%.

## 21. The road you walk: good and evil (Phase 5) — **Done + tested**

`game/morality.js` gives every character a road from −100 (Monstrous) to +100 (Saintly). It moves with what the character actually does, **whether or not anyone knows**, because it is about who they are becoming:

- **Crimes** count three points per point of heinousness (a murder is −21, coercion −27).
- **Other deeds:** buying a person −3, freeing one +8, kindness to a slave +1 (once a day), helping people (quests) +1, ending a crisis +5.
- **The story's great choices:** freeing or binding the souls, sparing or executing the Cantor, rekindling or taking the Ember, and so on.

**How it shows:**
- a meter under the portrait (red ← grey → gold) with a label;
- **the portrait**: warm and light on the good road, with a halo when saintly; dark red and black on the evil road, with red eyes from −40, small horns from −40 and great curved horns at −70 and below;
- **scene figures** carry the same horns, red eyes or halo.

**Coercion scenes:** the character's shadow falls over the victim, and nothing more is ever drawn.

## 22. Ages

**Kept, by decision:** nothing sexual ever involves a character under 18, in narration, art, or shadow, whatever the setting. Long-lived races are adults by their age, so a young-looking 300-year-old elf is an adult.

## 23. The narrator's long memory, and live AI narration (Phase 5) — **Done + tested**

**The model.** The game uses Groq with `GROQ_MODEL` (default `qwen/qwen3.8-27b`, thinking hidden), and moves to the next available model if one is retired.
- The key lives only in the git-ignored `.env`.
- Temperature is 0.7.
- If a reply repeats the previous one, the model is asked again; if it repeats again, the game's own narrator tells the scene.

**The memory** (`game/narrative/memory.js`) keeps a bounded, tagged notebook instead of replaying old prompts:
- **People, places, factions and things:** each has a name, aliases, tags and up to 8 facts.
- **Events:** tagged with the people and kinds involved, and weighted.
- **Chapter notes:** written every 25 turns (summarised by the AI when available), then rolled into eras.
- **Recent turns:** a compact log.
- **Open threads,** built live: the story chapter, quests, the saga, lovers, slaves, warrants, a trial in progress, an intimate scene.

**Where the notes come from:**
- **Engine events.**
- **Your quoted words,** filed under whoever they were said to: a named person, or a role like "the barkeep".
- **The narrator's own NOTES lines,** which it is asked to write and which are stripped before you see the text.
- **Names the prose gives people** ("the barkeep, Kael", "a guard named Joss", "Name's Gorm"), with he or she, merged into the role so it is one person.

**Recall** each turn includes everyone you named or who is in the scene, a few weighty background figures and events, and the latest chapters, within a fixed budget. Promises, debts, lovers, victims and secrets resist being forgotten.

**History** is now the last 4 exchanges, compact: your words and the narration, not whole prompts.

**Measured:**
- **10,000 turns:** about 5 s in total. Memory is 94 KB with every store at its cap, and the prompt is 3.2k characters at turn 100 and 4.0k at turn 10,000. A barkeep named at turn 5, his promise at turn 7, your words to him, and a murder at turn 30 are all recalled at turn 10,000 when you bring them up (tested).
- **Live, with the real model:** 27 turns across every kind of scene, all narrated by the AI. Your quoted words were verbatim, described speech became one line, and fists were used when no weapon was drawn. The explicit consensual scene was written and "stop" was respected; murder, a trial, travel and the slave market were narrated. No notes or engine text leaked.
- **Continuity:** a barkeep the model named Davin (knotted forearms, the room he kept) greeted you as Davin 336 turns later.

## Known limitations

- **Invented player actions.** The AI narrator sometimes adds small actions you did not take ("you scan the room"). The prompt forbids it, and the live rate dropped after tightening it, but only speech is enforced by a filter. Actions are not filtered, because telling the narrator's description apart from an invented action is unreliable.
- **Unnamed people.** If the model never names someone, there is nothing to remember except their role. The memory keeps the role ("the barkeep of Thornwick") and what you said to them.
- **AI provider rules** still apply to explicit content. In live tests the current model wrote it; if a provider declines, the game says so and narrates offline.
- **The art is simple vector illustration;** explicit scenes and nudity are drawn as small stylised figures.
- **The adult declaration is self-attested,** not verified age assurance.
- **Remaining class spread:** in the campaign, bards and druids still take up to about twice a rogue's actions (3,200–4,300 against 1,400–1,900).
- **Politics are yearly and abstract,** and **high-level validation uses fixtures.**
- **One intermittent test failure** was seen in full runs under load and not reproduced since.

## Next implementation tasks

1. **A post-check for invented player actions** in AI replies, comparing the "You …" sentences against the stated action, if it can be made reliable.
2. **Sieges and town defence** on war fronts.
3. **Training slaves** into named companions with their own abilities.
4. **An optional image-provider interface** (`EMBER_ART_PROVIDER`).
