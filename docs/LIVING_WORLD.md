# Ember and Ash — The Living World (Phase 3) tracker

Last updated: 2026-11-08. Branch `claude/ember-and-ash-completion` (committed locally, not pushed).

The original ten-chapter campaign is now the opening chapter of a world's history. This document tracks what is implemented, how it was verified, its known limits, and what is next. Earlier systems are covered in [GAME_COMPLETION.md](GAME_COMPLETION.md).

Status key:

- **Done + tested**: automated tests and/or measured bot or browser runs.
- **Done, lightly tested**: works, but coverage is thin.
- **Partial**: works, but is missing something listed.
- **Not done**: not implemented.

## Verification summary

| Check | Result |
| --- | --- |
| `npm test` (isolated temp DB, offline narration) | **89 / 89 pass** (68 earlier + 21 new) |
| `scripts/ui-playtest.js`: desktop, reduced motion, mobile 390×844 | **44 / 44** checks, no console errors |
| Full campaign regression (`scripts/playthrough.js`) | Completes: The Long Fire, level 96, 0 server errors |
| Postgame hero, ranger, Ascend ending (`--postgame 1500`) | Level 96 → 132 in 1,530 actions; 26 rift depths, 8 sagas, 4 crises won, 2 deaths |
| Postgame hero, fighter, Wardens ending (`--postgame 2500`) | Level 96 → 124 in 2,500 actions; no death spiral after the fix below |
| New generation in the same world (`--generation 800`) | Level 1 → 19 in 851 actions, 6 deaths, 3 sagas; inherited campaign; the legend appears in "legends" and in townsfolk's rumours |

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
  - Every response carries a structured scene: biome (23 types mapped to the 38 regions), time of day, season, weather from hazards, era tint, settlement state, the player figure, the enemy (8 body types and tints, bosses larger) or an NPC (legends keep their own look), and ordered events.
  - `public/game/scene-view.js` animates those events: lunges, hits and misses, crits, damage numbers, spell projectiles by element, telegraphs, blocks, stuns, deaths, level-ups, travel, rest, crafting and triumphs.
  - **Engine authority:** events come only from the engine result. A miss is drawn as a miss, and a slain enemy is drawn dead and is absent next turn (unit and browser tested).
  - `prefers-reduced-motion` (tested) or the "Still" button shows the final state without animation; "Hide art" turns illustrations off. The scene sits above the story on mobile (tested at 390 px).
- **Not done:** no external image-generation provider is wired in. The game never needs one; an optional provider interface is future work.

## 10. Long-term development — **Done, lightly tested**

- **Titles** come from real state: realm ruler; legend title; Archmage (caster, class level 5, level 120+); Master of Arms; Rift-walker; Champion of the Realm (3+ crises ended); Founder; the Undying.
- **Long-term actions:**
  - `govern for prosperity|order|might`: rulers only; costs a season; shifts faction power, settlements and taxes.
  - `found the <name> order`: level 100+ and 500 gold-equivalent coin; once per character.
  - `train <stat> for N months/years`: ages you; at most +1 to a stat per year of training, 10 in a lifetime; modest XP.
- **Lightly tested:** governing and founding are only tested by hand, not by automated tests.

## Known limitations

- **Live AI narration** is still untested: the stored Groq key returns 401. The offline narrator covers every new event.
- **Legends don't act on their own** between your sessions. They age, die, rule and are succeeded, but they don't wage wars or make new choices autonomously.
- **Bot pacing data stops at level 132.** Levels 150+ were checked only through the formula and simulated fights.
- **Orders** grant a title, a history entry and a hall location, but no further gameplay yet.

## Next implementation tasks

1. **Autonomous legend agency.** Once a year in `chronicle.evolve`, each living legend takes an action that follows from their personality and role:
   - a ruthless ruler annexes a region (faction power and settlement status change);
   - a patron raises a monument;
   - a mentor founds a school.

   Each action should be recorded in history and reflected in dialogue.
2. **Per-region dominion map.** Track which faction or realm controls each region (`world.dominion[region]`), shown on the map, changed by crises, governing and legend actions. It should affect prices and patrol encounters per region.
3. **Optional image-provider interface** (`EMBER_ART_PROVIDER`) for portraits, with the SVG renderer as the guaranteed fallback.
