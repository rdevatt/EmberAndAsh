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

Type what your character does. Type `help` in-game for the full command list. The basics:

- **Creation:** age/gender/name → appearance → background → starting environment.
- **Combat:** `attack …` starts a fight. Detailed, tactical actions ("I feint left and slash at its knee") hit more often than "attack". Magical backgrounds can `cast` their bolt (costs mana). `flee` to escape.
- **After a fight:** `loot the body`. The loot message points out gear upgrades; looted weapons and armor scale to your level when you `equip` them.
- **Quests:** `check board`, `accept quest N` (or click Accept), `quests` for the journal, `abandon quest N`. The board refreshes over time. Once you out-level a region, an advance quest points to the next tier.
- **Travel:** `map`, `travel to <region>`. Roads to higher tiers open near their level range, or once an advance quest reveals the way.
- **Rest:** `rest` (short, once between actions), `make camp` (full heal, with a chance of ambush), `rent a room at the inn` (safe; costs coin, only in settlements).
- **Trade:** `shop`, `buy <sword|armor|healing potion>`, `drink potion`, `sell <item>`.
- **Growth:** level-ups give free points (`spend point on str`). Class and profession offers appear from how you play; answer `yes` or `no`, and anything else keeps playing.
- **Companions:** talking with an NPC builds rapport. At 30+, `ask <name> to join me`. `dismiss <name>` to part ways.
- **Death:** you lose 1 level (up to 3 for repeated deaths in a short span), wake at the last settlement you visited, and leave your gear where you fell (`recover gear` there).

## Changes in this pass

See the git diff for details. Highlights:

- **Progression unblocked:** every region now spawns enemies; there is real travel between regions; advance quests lead one tier up and complete on arrival; the bounty board refreshes; quest XP triggers level-ups; quest kill progress is tracked from combat; retrieve, scout and escort quests need real progress instead of a keyword.
- **Combat:** rebalanced (about 5 rounds per even fight; careful play is rewarded). Enemies near your level. Spells work. Gear stat mods apply without permanently changing base stats. Death no longer spirals.
- **Sessions/saves:** sessions survive server restarts and idle eviction, for logged-in players too. Login loads your latest save (or moves a finished guest character into a free slot) instead of a stuck, empty state that overwrote slot 1. Auto-login picks the right save and keeps the remember-me token stable. Story history is recorded.
- **UI:** panels update after every command. The creation wizard can't fall out of step with the server (errors stay on the step; Back rewinds the server). Retry/edit/undo apply only to the latest action. Network errors never freeze the UI. Quests have Accept/Abandon buttons. Loading a slot refreshes everything. Added logout.
- **Safety:** adult content can never be enabled for characters under 18.
- **Exploits closed:** "take 1000 gold" (loose coin is capped), "I receive 50 gold" (no longer pays out), phantom crafting from sentences like "I make my way…", and "go north" no longer declines a class offer.
