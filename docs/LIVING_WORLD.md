# Ember and Ash — The Living World (Phases 3–4) tracker

Last updated: 2026-11-08. Branch `claude/ember-and-ash-completion` (committed locally, not pushed).

The original ten-chapter campaign is now the opening chapter of a world's history. Phase 4 (sections 11–15) covers class balance, the political simulation, high-level validation, mature content and visual refinement. This document tracks what is implemented, how it was verified, its known limits, and what is next. Earlier systems are covered in [GAME_COMPLETION.md](GAME_COMPLETION.md).

Status key:

- **Done + tested**: automated tests and/or measured bot or browser runs.
- **Done, lightly tested**: works, but coverage is thin.
- **Partial**: works, but is missing something listed.
- **Not done**: not implemented.

## Verification summary

| Check | Result |
| --- | --- |
| `npm test` (isolated temp DB, offline narration) | **113 / 113 pass**: 22 new in Phase 4, covering content preferences, romance and villainy, politics, gear recovery and traits |
| `scripts/ui-playtest.js`: desktop, reduced motion, mobile 390×844 | **50 / 50** checks, including the mature-content settings on both layouts, with no console errors |
| All 12 classes × 2 seeds, full campaign (`playthrough.js`) | **24 / 24 finish**; 1,709–7,449 actions; wizard 1,924–2,861 (was ~11,400) |
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

### Remaining spread

- **Warlocks and druids still take the longest** (4,400–7,400 actions). In matched-level simulations they are in the pack (88–100%), so the gap is mostly how they lose levels in the Crucible.
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

## 14. Mature content, romance and villainy (Phase 4) — **Done + tested**

- **Six independent categories,** each Off, Mild or Mature: violence and gore, horror, profanity, nudity in art, romance and intimacy, and sexual themes.
  - Defaults: violence, horror, profanity and romance are Mild; nudity and sexual themes are Off.
  - The categories live in Settings → MATURE CONTENT on desktop and mobile, and changes apply on the next turn with no restart.
- **Eligibility is enforced on the server:**
  - Nudity, sexual themes (Mild and up) and romance (Mature) need both the player's adult self-declaration and a character aged 18 or over.
  - The declaration is labelled "not verified age assurance". It is a preference, not an age check.
  - A minor character gets romance, sexual themes and nudity forced Off, whatever is sent.
  - Sexual themes never exceed the romance level.
- **Persistence:** preferences are saved with the account (`players.settings`) and on the character. They survive save/load, restart and login on another device, and a new generation in the same world inherits the player's settings, not the world's (API tested).
- **What each renderer can actually do:**
  - **Built-in art:** at most implied nudity (bare shoulders, under a blanket) and an implied intimate scene (a candlelit room, optionally fading out). It never draws explicit content.
  - **Offline narrator:** non-explicit (fade or sensual).
  - **AI narrator:** gets the exact preferences in its prompt. If it refuses, the game says so ("The AI narrator declined to write this scene…") and falls back offline; it does not pretend otherwise. No external image provider is wired in.
- **Outcomes never change:** damage, kills and history are identical at every setting (tested). Only the depiction changes:
  - **wounds:** none, a bandage, or blood;
  - **kill lines** and blood pools;
  - **horror imagery:** eyes in the dark and skulls at Mature;
  - **profanity** in enemy taunts.
- **Romance:**
  - Flirting needs earned rapport and counts once per in-game day.
  - Partners can refuse, and "no" or "stop" always ends a scene.
  - A night together needs rapport 50 (70 for companions). It records a partner and a chronicle entry and is not undoable.
  - Children can never be involved.
- **Villainy** (an adult character with the adult declaration can be a villain):
  - Sexual coercion is possible as a crime, but it is never depicted at any setting: the narrator is told not to, and the scene is a grim overlay with no figure drawn.
  - **Consequences:**
    - the victim never forgives you;
    - witnesses lose loyalty, and companions may leave;
    - corruption +20;
    - a secret that surfaces about 8% per month.
  - **Discovery costs:** faction standing (Compact −20, Wardens −25, the local power −30), local reputation −50, infamy +30, and a chronicle entry.
  - **Infamy changes how the world treats you:** greetings turn hostile, companions refuse to join, and titles like "the Cruel" and "the Reviled" appear. It also feeds the legend's personality ("cruel"), which in turn drives politics.

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

## Known limitations

- **Live AI narration is untested against a real key** (the stored Groq key returns 401). Prompt construction, refusal detection and fallback are tested with a mock. The offline narrator covers every event.
- **AI provider rules apply:** at Mature, the AI narrator may still decline sexual content under its provider's rules. The game reports that and falls back; it cannot make the provider comply.
- **The adult declaration is self-attested,** not verified age assurance, and the game says so in the UI.
- **Class spread remains:** warlock and druid campaigns take 2–3× a rogue's actions (see section 11), and the Crucible is the hardest zone for all classes. Seed variance is large, so 2 seeds per class is a small sample.
- **Politics are yearly and abstract.** Battles the player fights move a war score; there are no sieges of specific towns, and new legends only arise from player characters.
- **High-level validation uses fixtures** for the starting state at levels 150–500 (XP, stats, gear). Everything from there is played through the API, but no bot has actually levelled from 100 to 500.
- **One intermittent test failure** was seen once in a full run under heavy CPU load (24 bots running) and was not reproduced in 7 later runs. It is being watched.
- **Orders** grant a title, a history entry and a hall location, but no further gameplay yet.

## Next implementation tasks

1. **Warlock and druid campaign pacing:** trace their Crucible deaths further. Candidates are the warlock's self-damage (Blood Magic) and the druid's low armour class.
2. **Sieges and town defence:** let the player defend a specific settlement on a war front, with a win or loss deciding whether it changes hands that year.
3. **Optional image-provider interface** (`EMBER_ART_PROVIDER`), as designed in section 15.
4. **A bot that levels from 100 to 200 in real play,** to replace fixtures for the first high-level band.
