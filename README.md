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
│  │  └─ regions.js
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
│  └─ state.js
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

## Run Locally

### Requirements

- Node.js 18+ (recommended)

### Install

```bash
npm install
```

### Start

```bash
node server.js
```

Server URL: `http://localhost:3000`

### Quick API Smoke Check (PowerShell)

```powershell
$guest = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/auth/guest" -ContentType "application/json" -Body "{}"
$sessionId = $guest.sessionId
$headers = @{ "x-session-id" = $sessionId }
$payload = @{ input = "1" } | ConvertTo-Json -Compress
$action = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/action" -Headers $headers -ContentType "application/json" -Body $payload

Write-Output ("guest_ok=" + [bool]$sessionId)
Write-Output ("action_success=" + [bool]$action.success)
```

### Quick API Smoke Check (macOS/Linux)

```bash
SESSION_ID=$(curl -s -X POST "http://localhost:3000/api/auth/guest" \
   -H "Content-Type: application/json" \
   -d '{}' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).sessionId||''));")

ACTION_SUCCESS=$(curl -s -X POST "http://localhost:3000/api/action" \
   -H "Content-Type: application/json" \
   -H "x-session-id: $SESSION_ID" \
   -d '{"input":"1"}' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(Boolean(JSON.parse(d).success)));")

echo "guest_ok=$([ -n "$SESSION_ID" ] && echo true || echo false)"
echo "action_success=$ACTION_SUCCESS"
```
