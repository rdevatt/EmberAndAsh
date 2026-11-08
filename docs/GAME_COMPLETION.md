# Ember and Ash — Completion Status

Last updated: 2026-11-07. Branch `claude/ember-and-ash-completion`.

Status key:

- **Done + tested**: implemented, with automated tests or measured bot/browser runs.
- **Done, lightly tested**: implemented and exercised, but coverage is thin.
- **Partial**: works, but is missing something listed.
- **Missing**: not implemented.

## How it was verified

| Check | Command | Latest result |
| --- | --- | --- |
| Unit + API tests | `npm test` | **64 / 64 pass** (run repeatedly, stable) |
| Full-game bot over HTTP, no state editing | `node scripts/playthrough.js` | **5 complete runs reached an ending** (table below) |
| Combat balance by tier, build and boss | `node scripts/balance-sim.js` | table below |
| Every region | `node scripts/region-sweep.js` | ability-using fighter wins **86–100 %** in all 38 regions |
| World tour (all 38 regions by road over the API) | `tests/world-tour.api.test.js` | pass |
| Browser, desktop 1400×900 + mobile 390×844 | `node scripts/ui-playtest.js` | **30 / 30** checks, no console errors |

### Full playthroughs (bot, offline narration, temp DB)

| Build | Story path | Ending | Actions | Final level | Deaths | Bounties | Regions visited |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Fighter / alchemist | Wardens | The Long Fire | 2,191 | 95 | 3 | 28 | 21 |
| Ranger / scout | Ascend | The New Sovereign | 2,112 | 96 | 3 | 29 | 21 |
| Wizard / alchemist | Remnant | The Sun Rises | 3,884 | 95 | 15 | 13 | 24 |
| Fighter / alchemist (seed 11) | Shatter | The Ordinary World | 2,715 | 95 | 2 | 8 | 21 |
| Ranger / scout (seed 3) | Wardens | The Long Fire | 2,046 | 96 | 0 | 24 | 21 |

Every run beat all 10 bosses, recruited or kept Maren where the path allows, cleared a postgame rift, and logged zero server errors. The wizard is the hardest build: Chapter 7 (Crucible Gate, full of fire creatures) took it about 1,200 actions. The bot is a competent but simple player: it defends against telegraphed attacks, uses abilities and potions, and avoids elements the enemy resists.

### Combat balance (`balance-sim.js`, 60 fights per cell, seed 1234)

Regular enemies at each tier's mid level, tier-appropriate gear. Win rates:

| Tier | Fighter | Rogue | Ranger | Wizard | Cleric | No class |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 100 | 100 | 98 | 100 | 98 | 100 |
| 5 | 95 | 100 | 100 | 100 | 97 | 82 |
| 8 | 95 | 100 | 100 | 62 (fire region) | 93 | 92 |
| 10 | 97 | 100 | 100 | 100 | 98 | 92 |

- **Bosses** at their chapter's level with 3 potions: Fighter, Rogue, Ranger and Cleric win **80–100 %**. The Wizard wins 50–100 % (weakest against Kharzul, who resists fire).
- **Classless characters** fall to 45–60 % against the late bosses.
- **Under-levelled players can't win:** a player 10 levels below a boss, with gear 2 tiers low, wins **0 %**.
- **Lazy play is risky:** an attack-only fighter wins only 36–80 % of fights in tier 5+ regions. Using its abilities raises that to 86–100 %.

## System status

### 1. World — **Done + tested**
- **Regions:** all 38 now have a settlement (except the Shattered Throne), named NPCs, 1–3 landmarks, resources, and a rare reagent where it fits. Thirty have an environmental hazard. Existing names, descriptions, monster lists and tiers are unchanged.
- **Roads:** two-way, and every region is reachable. The inner ring runs Crucible → Core Wastes → Shattered Throne. The Throne is sealed until Chapter 9 is complete.
- **Landmarks:** one-time rewards (XP, coin, materials, lore). Guarded landmarks spawn a guardian first.
- **Partial:** NPCs have one greeting line each (plus story dialogue), not branching conversations.

### 2. Main story and ending — **Done + tested**
- **Chapters:** 10, one per tier, built from the existing lore (the Ember, the Ashwood corruption, the Veldrath empire, the Pale City, the Crucible, the Shattered Throne).
- **Bosses:** 10, each with telegraphed specials and HP-threshold phases (enrage, summon, ward, heal).
- **Choices:** 9 decisions that change faction standing, flags, items, spells and permanent stats. They close or open later options. Maren Holt's survival depends on Warden standing, or on her being in your party.
- **Endings:** 4, each gated by earlier choices, with an epilogue reflecting your choices. Postgame: an ending-aware NPC greeting, continuing bounties, and an endless rift at the Throne.
- **Rewards and gating:** every reward is engine-granted exactly once. Chapters are level-gated.

### 3. Character creation, classes, progression — **Done + tested** (class abilities); **Partial** (class acquisition)
- **Abilities:** 39 in total. That is a universal Power Attack plus 3–4 per class across 12 classes, unlocked at class levels 1, 3 and 5. Each has a stamina, mana or HP cost and a cooldown, and fails safely when you can't pay.
- **Stat rebalance:** STR now counts toward accuracy, and DEX converts to damage at a discount. Ranged weapons use DEX, finesse weapons use the better of STR and DEX, and a focus boosts spell power.
- **Partial:** classes are still earned by play style (the existing affinity system), not picked at creation. A classless character is viable for regular fights but weak against late bosses.
- **Not re-verified:** each of the 47 backgrounds individually.

### 4. Combat — **Done + tested**
- **Actions:** attack, defend, abilities, spells, potions (these cost your turn), inspect (shows weaknesses), and flee. Fleeing a boss is harder and resets it to full HP.
- **Status effects** on both sides: bleed, poison, burn, stun, weaken, vulnerable, rage, inspire, regen and ward. Bosses resist being stunned again too soon.
- **Damage types and enemy traits:** physical, fire, frost, holy, shadow, arcane, nature, void. Traits are undead, spirit, construct, fiery, frost, void, plant, beast and caster.
- **Enemy behaviours:** telegraphed heavy blows, pack double-hits, ambushes, predator bleeds, tactical weakening, and caster spells that ignore armour. Enemies below level 5 get a "newcomer grace" so the first fights stay fair.
- **No exploits:** equipping mid-fight, resting in combat, and undoing or editing combat rounds are all refused.

### 5. Quests — **Done + tested**
- **Hunts and clears:** count real kills.
- **Retrievals:** need the guardian defeated, then the item carried back and turned in where it was posted. Losing the item resets the quest.
- **Supply contracts** (new; profession work): consume real materials.
- **Scouting:** must be reported in the region where it was posted.
- **Escorts:** complete only on arrival, and fail if you die.
- **Advance quests:** go exactly one tier up.
- **Partial:** escort-on-death is the only failure condition. There are no timed quests.

### 6. Equipment, crafting, economy — **Done + tested** (crafting, economy); **Missing** (durability)
- **Crafting:** 20 recipes. Gear quality is capped by your level, your profession level and your best ore. Reagents add enchantments.
- **Free crafting removed:** describing crafting no longer creates items, and narrated profession XP is rate-limited.
- **Economy:** resale is always below the purchase price (tested for every shop item). Scene pickups are worthless junk. Loot is typed and tiered. Gear stat mods disappear on unequip (tested).
- **Missing:** item durability and repair.
- **Partial:** professions have a few unlockable benefits beyond quality and yield (scout hazard and flee bonuses, scholar landmark XP, a bonus potion yield at level 3+, stronger enchantments at level 4+). There is no reforging of existing gear.

### 7. Companions and relationships — **Done + tested** (rules); **Done, lightly tested** (play)
- **Roster:** 8 named companions with personalities and roles (striker, guardian, healer, caster), plus hired sellswords on a contract.
- **Recruitment:** requires meeting them, earning rapport (first meeting, then bounties completed in their home region), faction standing, and story progress. Invented names and "set companion" are refused.
- **Loyalty:** rises with shared victories and shifts with faction-moving choices. A companion pushed far enough leaves.
- **Persistence:** companions survive save, restart and load (tested).
- **Only Maren has been played end to end** (in every bot run). The other seven are covered by unit tests only.

### 8. AI narration and offline play — **Done + tested** (fallbacks, sanitising); **Not verified live**
- **Authority:** the engine decides every outcome. AI text is stripped of invented rewards, and narrative item and companion detection stays disabled.
- **Failure handling:** a 15-second timeout with one retry. A rejected key pauses AI calls for 10 minutes. 429 responses honour `Retry-After`. Repeated failures pause AI calls for 60 seconds. Malformed or empty responses fall back to offline prose. All of this is tested with a fake client.
- **Offline narrator:** reflects hits, crits, defending, abilities, telegraphs, potions, travel, landmarks, story beats and hazards, and varies its lines. The UI shows whether narration is AI or offline.
- **Not verified:** real Groq output. The `.env` key returns HTTP 401; a valid key is a deployment dependency.

### 9. Accounts, saves, security — **Done + tested**
- **Persistence:** campaign, factions, companions, landmarks, location and travel survive a save, a server restart and a load (API test). Multiple slots and characters per account remain covered by the earlier tests.
- **Secrets:** `.env` and `data/*.db` are untracked. See [SECURITY.md](SECURITY.md): the old key is still in git history and must be rotated. History has not been rewritten.

### 10. User interface — **Done + tested**
- **Panels:** a main-story panel with confirm-before-choose buttons, a combat action bar (shown on mobile too), faction standings, party, and a narration indicator.
- **Smaller fixes:** the combat log font was reduced, combat and story entries hide undo/edit, and there's no horizontal scroll at phone width.
- **Partial:** no dedicated inventory, crafting or map screens. These remain text commands with panel summaries.

## Known gaps and risks
- **Live AI narration is untested** (no valid key).
- **Durability and repair** are not implemented.
- **Pacing:** the bots finish in about 2,000–3,900 actions. A human typing full sentences will take far longer. That pacing has not been tested with real players.
- **Bot coverage:** bots use 3 builds (fighter, ranger, wizard). Rogue, cleric and the other classes are covered by simulation only.
- **NPC dialogue is shallow** (one line per NPC, outside the story).

## Next implementation task
**Gear durability and blacksmith reforging.** Weapons and armour lose durability in combat. A merchant or blacksmith repairs them for coin and materials. A blacksmith of profession level 3+ can `reforge <item>` to raise an owned item one quality tier (capped by player level and ore). Start in `game/economy/core.js` (gear objects) and `game/crafting-recipes.js`, add a `durability` field with a migration in `game/state.js` `validateState`, and cover it in `tests/systems.unit.test.js`.
