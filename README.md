# Ember and Ash

## Project Structure

```text
.
├─ server.js
├─ server/
│  ├─ app.js
│  └─ routes/
│     ├─ auth/
│     │  ├─ index.js
│     │  └─ register.js
│     ├─ saves/
│     │  ├─ index.js
│     │  └─ register.js
│     ├─ quests/
│     │  ├─ index.js
│     │  └─ register.js
│     ├─ settings/
│     │  ├─ index.js
│     │  └─ register.js
│     ├─ state/
│     │  ├─ index.js
│     │  └─ register.js
│     └─ gameplay/
│        ├─ index.js
│        ├─ register.js
│        └─ utils/
│           ├─ index.js
│           └─ openingHint.js
├─ game/
│  ├─ constants.js
│  ├─ constants/
│  │  ├─ data.js
│  │  ├─ regions.js
│  │  └─ data/
│  │     ├─ character/
│  │     │  └─ index.js
│  │     ├─ world/
│  │     │  ├─ enemies.js
│  │     │  ├─ quests.js
│  │     │  └─ region-monsters.js   # enemies generated from each region's monster lists
│  │     └─ progression/
│  │        └─ index.js
│  ├─ character.js
│  ├─ character/
│  │  ├─ core.js
│  │  ├─ panel-and-points.js
│  │  ├─ crafting.js
│  │  └─ custom-gear.js
│  ├─ economy.js
│  ├─ economy/
│  │  ├─ core.js
│  │  ├─ companions.js
│  │  └─ crafted-gear.js
│  ├─ narrative.js
│  ├─ narrative/
│  │  ├─ core.js
│  │  └─ detections.js
│  ├─ combat.js
│  ├─ professions.js
│  ├─ quests.js
│  ├─ shop.js          # merchants, potions
│  ├─ travel.js        # region travel, map, revival point
│  └─ state.js
├─ tests/              # node:test unit + API integration tests
└─ public/
   ├─ index.html
   ├─ style.css
   ├─ game.js
   ├─ game/
   │  ├─ core.js
   │  ├─ creation.js
   │  └─ ui.js
   └─ styles/
      ├─ base.css
      ├─ layout.css
      ├─ modals-and-wizard.css
      └─ utilities.css
```

### Game systems added in the completion pass

| File | Responsibility |
| --- | --- |
| `game/campaign.js` + `game/constants/data/world/campaign.js` | Main story: 10 chapters, story NPCs, bosses, choices, endings, postgame rift |
| `game/constants/data/world/region-details.js` | Settlements, NPCs, landmarks, hazards, resources per region; two-way road graph |
| `game/world.js` | Explore, landmarks, gathering, hazards, talking to NPCs |
| `game/combat-tactics.js` | Abilities, defend, status effects, resistances, enemy behaviour, boss phases |
| `game/crafting-recipes.js` | Material-consuming recipes, profession quality caps, enchanting reagents |
| `game/factions.js` | Ember Wardens, Free Compact, Veldrathi Remnant, Ashen Choir standing |
| `game/companions.js` | Recruitable roster, combat roles, loyalty, hired sellswords |
| `game/narrative/offline.js` | Offline narrator built from engine results |
| `server/routes/gameplay/world-commands.js` | Story/world/crafting/companion commands for `/api/action` |

## Conventions

- Route domains use `index.js` as the barrel and `register.js` as the implementation.
- Gameplay helper modules live under `server/routes/gameplay/utils/`, imported via its barrel.
- Game domain root files (for example, `game/character.js`) are wrappers around split internal modules.
- Frontend scripts and styles are split by concern under `public/game/` and `public/styles/`.

## Constants Layout

- Keep `game/constants/data.js` as the public aggregation surface and stable export API.
- Add character/build/spell/background constants in `game/constants/data/character/index.js`.
- Add enemy/world-tier/body-part constants in `game/constants/data/world/enemies.js`.
- Add quest templates and quest scaling constants in `game/constants/data/world/quests.js`.
- Add classes/professions/progression/scene constants in `game/constants/data/progression/index.js`.
- If adding a new constants category, prefer a new focused module and wire it through `game/constants/data.js`.
- The flat files `data/character.js`, `data/enemies.js`, `data/quests.js`, `data/progression.js` are now one-line re-exports of the nested modules above (they used to be full copies that silently shadowed edits to the nested files).
- Every region gets spawnable enemies generated from its `monsters` / `rareMonsters` lists (`data/world/region-monsters.js`). Rare monsters only spawn when a Clear quest names them.

## Run Locally

### Requirements

- Node.js 18.17+ (tested on 22.11; the `uuid` dependency was removed so older Node works too)
- npm. **Note:** npm 10.9.0 can hang forever during `npm install` while resolving this project's dependency tree; npm 11 installs it in seconds (`npx npm@11 install`).

### Install / Start

```bash
npm install
npm start            # http://localhost:3000
```

### Environment (`.env`)

| Variable | Purpose |
| --- | --- |
| `GROQ_API_KEY` | Enables AI narration (Groq, `llama-3.3-70b-versatile`). |
| `PORT` | HTTP port (default 3000). |
| `NARRATIVE_OFFLINE=1` | Skip the AI entirely; the game uses short engine-written prose. Also used automatically when no key is set **or when a Groq call fails** (e.g. an invalid key), so the game is always playable. |
| `EMBER_AI_TIMEOUT_MS` | Groq request timeout (default 15000). A rejected key pauses AI calls for 10 minutes; rate limits honour `Retry-After`. |
| `EMBER_DB_PATH` | Path to the SQLite file (default `./data/emberandash.db`, or `/data/...` on Railway). Tests point this at a temp file. |

### Tests

```bash
npm test             # node --test: unit tests + HTTP integration tests
```

The tests start the real server in-process on a random port with a temporary database and offline narration — they never touch `data/` or call the AI. Integration tests play the actual loop: creation → board → quest → combat → loot → rest → travel → death → accounts/save slots → simulated server restart.

### Quick API smoke check (macOS/Linux)

```bash
SESSION_ID=$(curl -s -X POST localhost:3000/api/auth/guest -H 'Content-Type: application/json' -d '{}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).sessionId))")
curl -s -X POST localhost:3000/api/action -H 'Content-Type: application/json' \
  -H "x-session-id: $SESSION_ID" -d '{"input":"My name is Dara, I am 26 years old and female"}'
```

## How to Play

Type what your character does. Type `help` in-game for the full command list. The right panel tracks the **main story**; the buttons above the input box handle combat.

- **Creation:** age/gender/name → appearance → background → starting environment. A wounded Ember Warden, Maren Holt, is waiting when you arrive — `talk to Maren` starts the story.
- **Main story:** `story` shows your chapter and objective. Ten chapters, one per tier, each ending in a boss (`confront <name>`) and a decision (`choose N`). Chapters unlock as you reach their level. Choices change faction standing, companions, later options, and which of four endings you can reach. After the ending the game continues: bounties everywhere and `enter the rift` at the Shattered Throne.
- **World:** `explore` lists the settlement, hazard, resources, landmarks and people of a region; `explore <place>` (guarded places have a guardian), `talk to <name>`, `gather` for crafting materials. Hazards (cold, heat, blight, void…) hurt until you carry the matching ward (merchants sell them; anyone can craft them).
- **Combat:** `attack …` starts a fight. Tactical actions hit more often than "attack". `defend` blunts the heavy attacks enemies telegraph with ⚠. Name a class ability ("I use Shield Bash" — `abilities` lists yours), `cast <spell>`, `drink potion` (costs your turn), `inspect` (shows weaknesses), `flee`. Undead fear holy, constructs shrug off blades, fire beasts laugh at fire.
- **After a fight:** `loot the body`. Loot is a notch below shop quality unless you're lucky; the loot message points out upgrades.
- **Quests:** `check board`, `accept quest N`, `quests`, `abandon quest N`. Hunts count real kills; retrievals need the guardian beaten and the item turned in where it was posted; supply contracts consume real materials (`deliver`); escorts end at the destination (and fail if you die).
- **Travel:** `map`, `travel to <region>`. Higher tiers open near their level range, through advance quests, or when the story sends you there.
- **Crafting & professions:** `recipes`, `materials`, then `forge a sword`, `brew 2 healing potions`, `make a fur-lined cloak`… Crafting consumes materials; your profession decides what you can make and how good it is; the best ore you carry sets the metal; a rare reagent enchants the result.
- **Trade:** `shop`, `buy <item>`, `sell <item>`, `drink mana potion`. Free Compact standing changes prices.
- **Companions:** `companions` shows who could join and what they need. Recruit with `recruit <name>` once you've met them and earned it (bounties in their home region, faction standing, story progress). `hire a sellsword` at an inn for a fixed term. Companions fight (striker / guardian / healer / caster), gain loyalty from shared victories, and react to your choices.
- **Rest:** `rest` (short), `make camp` (full heal, ambush risk), `rent a room at the inn` (safe, costs coin).
- **Death:** you lose 1 level (up to 3 for repeated deaths), wake at the last settlement, and leave your gear where you fell (`recover gear` there).
- **No rerolls:** combat rounds and story decisions can't be undone or edited.
- **After the ending:** `continue`, `new character in this world, 40 years later`, or `new world` (or use the buttons). Nothing is deleted — set-aside characters can be resumed from Saves → Worlds & Characters.
- **The living world:** `date`, `chronicle`, `legends`, `crises` / `answer the call`, `sagas`, `titles`, `longevity` / `pursue <path>`, `train strength for a year`, `govern for prosperity` (rulers), `found the <name> order`, `talk to <legend>`, `learn from <legend>`. Time passes with real actions; characters age; there is no level cap, but levels beyond 100 get dramatically harder.
- **Art:** your portrait is drawn from your description and changes with gear, age, scars and rank; each turn is illustrated. "Still" stops animation; "Hide art" hides it; reduced-motion settings are respected.

## Development tools

```bash
npm test                                   # 89 unit + API tests (temp DB, offline narration)
node scripts/balance-sim.js --fights 200   # win%/rounds/HP per tier & build, and every boss
node scripts/region-sweep.js               # fighter vs every one of the 38 regions
node scripts/playthrough.js --style fighter|wizard|ranger --path wardens|remnant|ascend|shatter
                                           # bot plays the whole game over HTTP to an ending
                                           # add --postgame N (play the hero on) and --generation N (a successor)
node scripts/ui-playtest.js                # desktop + mobile browser checks (needs playwright-core + Chromium; see file header)
```

Status of every system, what is verified and what remains: [`docs/GAME_COMPLETION.md`](docs/GAME_COMPLETION.md) (campaign era) and [`docs/LIVING_WORLD.md`](docs/LIVING_WORLD.md) (persistent worlds, generations, endless play, art). Credentials: [`docs/SECURITY.md`](docs/SECURITY.md).

## Changes in this pass

See the git diff for details. Highlights:

- **Progression unblocked:** every region now spawns enemies; there is real travel between regions; advance quests lead one tier up and complete on arrival; the bounty board refreshes; quest XP triggers level-ups; quest kill progress is tracked from combat; retrieve, scout and escort quests need real progress instead of a keyword.
- **Combat:** rebalanced (about 5 rounds per even fight; careful play is rewarded). Enemies near your level. Spells work. Gear stat mods apply without permanently changing base stats. Death no longer spirals.
- **Sessions/saves:** sessions survive server restarts and idle eviction, for logged-in players too. Login loads your latest save (or moves a finished guest character into a free slot) instead of a stuck, empty state that overwrote slot 1. Auto-login picks the right save and keeps the remember-me token stable. Story history is recorded.
- **UI:** panels update after every command. The creation wizard can't fall out of step with the server (errors stay on the step; Back rewinds the server). Retry/edit/undo apply only to the latest action. Network errors never freeze the UI. Quests have Accept/Abandon buttons. Loading a slot refreshes everything. Added logout.
- **Safety:** adult content can never be enabled for characters under 18.
- **Exploits closed:** "take 1000 gold" (loose coin is capped), "I receive 50 gold" (no longer pays out), phantom crafting from sentences like "I make my way…", and "go north" no longer declines a class offer.
