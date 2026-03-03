'use strict';

// =============================================================
// EMBER AND ASH — SERVER
// Express API. Handles sessions, auth, and the game loop.
// One route does one thing. No game logic lives here.
// =============================================================

require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const { v4: uuidv4 } = require('uuid');
const bcrypt   = require('bcryptjs');

// Game modules
const { createFreshState, validateState, isInCreation, isReady, isDead } = require('./game/state');
const { processCreationInput, buildCharacterPanelData, getPlayerLevel, spendFreePoint, recalculateResources } = require('./game/character');
const { detectCombatIntent, detectFleeIntent, isPassiveAction, applyCombatRound, applyFleeAttempt, checkAmbientEncounter, spawnEnemy, buildEnemyInspectData, updateActionProgress, buildEnemyPanelData } = require('./game/combat');
const { resolveProfessionTask, processPendingProgressEvents, processClassOfferResponse, processProfessionOfferResponse, buildProgressionPanelData } = require('./game/professions');
const { 
  detectCoinIntent, processPendingCoinEvents, tryOpenShop, tryCloseShop, checkShopCustomerEvent, 
  recoverGear, saveGearAtDeath, buildEconomyPanelData, checkIntimacyAvailable, changeReputation, 
  formatCoin, equipCraftedItem, sellCraftedItem,
  // NEW: Equipment and companion functions
  detectEquipIntent, processEquipCommand, 
  addCompanion, removeCompanion, detectCompanionIntent, getCompanionsDisplay
} = require('./game/economy');
const { processNarrative, buildRightPanelData, buildEventAnnouncements } = require('./game/narrative');
const { detectBoardIntent, detectQuestAccept, refreshBoard, getBoardQuests, acceptQuestByIndex, acceptQuest, buildBoardDisplayData, buildBoardInspectHint, checkQuestProgress, processQuestCompletions, buildActiveQuestContext } = require('./game/quests');
const { calculateEnemyXP } = require('./game/combat');

// Database
const db = require('./db/database');


// =============================================
// APP SETUP
// =============================================
const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: '*'
}));
app.use((req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', "frame-ancestors *");
  next();
});
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


// =============================================
// IN-MEMORY SESSION STORE
// Keeps active game states in memory for speed.
// Persisted to DB on every action and on shutdown.
// sessionId -> { state, playerId, saveSlot, saveId, lastActive }
// =============================================
const sessions = new Map();

function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

function setSession(sessionId, data) {
  data.lastActive = Date.now();
  sessions.set(sessionId, data);
}

// Persist session to DB
async function persistSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  if (session.playerId && session.saveSlot) {
    db.saveGame(session.playerId, session.saveSlot, session.state);
  } else {
    db.saveGuestSession(sessionId, session.state);
  }
}

// Clean idle sessions from memory every 30 minutes
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, session] of sessions.entries()) {
    if (session.lastActive < cutoff) {
      persistSession(id);
      sessions.delete(id);
    }
  }
}, 30 * 60 * 1000);


// =============================================
// AUTH HELPERS
// Simple bcrypt password hashing.
// No JWT — session ID in header is sufficient for now.
// =============================================
async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function requireSession(req, res, next) {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId) return res.status(401).json({ error: 'No session ID provided.' });

  const session = getSession(sessionId);
  if (!session) return res.status(401).json({ error: 'Session not found or expired.' });

  req.sessionId = sessionId;
  req.session   = session;
  next();
}


// =============================================
// INSTALL BCRYPTJS
// better-sqlite3 is already installed.
// We need bcryptjs for password hashing.
// =============================================


// =============================================
// ROUTES — AUTH
// =============================================

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  const { username, password, email } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' });
  }
  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: 'Username must be 3-20 characters.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const hash   = await hashPassword(password);
  const result = db.createPlayer(username, hash, email || null);

  if (!result.success) {
    return res.status(409).json({ error: result.error });
  }

  res.json({ success: true, playerId: result.playerId });
});


// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { username, password, sessionId, rememberMe } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' });
  }

  const player = db.getPlayerByUsername(username);
  if (!player) return res.status(401).json({ error: 'Invalid credentials.' });

  const valid = await verifyPassword(password, player.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });

  db.recordLogin(player.id);

  // If they had a guest session, migrate it
  let state = null;
  if (sessionId) {
    const guest = db.loadGuestSession(sessionId);
    if (guest && isReady(guest.state)) {
      state = guest.state;
      db.deleteGuestSession(sessionId);
    }
  }

  // Create new session
  const newSessionId = uuidv4();
  setSession(newSessionId, {
    state:     state || createFreshState(),
    playerId:  player.id,
    saveSlot:  1,
    saveId:    null
  });

  // Generate a persistent remember-me token if requested
  let rememberToken = null;
  if (rememberMe) {
    rememberToken = uuidv4();
    db.storeRememberToken(player.id, rememberToken);
  }

  res.json({
    success:      true,
    sessionId:    newSessionId,
    username:     player.username,
    rememberToken,
    nsfwEnabled:  !!player.nsfw_enabled
  });
});


// POST /api/auth/auto-login
// Silently log back in using a stored remember-me token
app.post('/api/auth/auto-login', async (req, res) => {
  const { rememberToken } = req.body;
  if (!rememberToken) return res.status(400).json({ error: 'No token.' });

  const player = db.getPlayerByRememberToken(rememberToken);
  if (!player) return res.status(401).json({ error: 'Token expired or invalid.' });

  // Load their most recent save automatically
  const saves = db.getSaves(player.id);
  let state   = null;
  if (saves && saves.length > 0) {
    const latest = saves.sort((a, b) => b.updated_at - a.updated_at)[0];
    const loaded = db.loadSave(latest.id);
    if (loaded) state = loaded.state;
  }

  const newSessionId = uuidv4();
  setSession(newSessionId, {
    state:    state || createFreshState(),
    playerId: player.id,
    saveSlot: 1,
    saveId:   null
  });

  // Refresh the remember token (rolling expiry)
  const newToken = uuidv4();
  db.storeRememberToken(player.id, newToken);

  res.json({
    success:      true,
    sessionId:    newSessionId,
    username:     player.username,
    rememberToken: newToken,
    autoLoggedIn: true,
    hasCharacter: state && isReady(state),
    storySummary: state ? (state.storySummary || '') : '',
    nsfwEnabled:  !!player.nsfw_enabled
  });
});


// POST /api/auth/guest
// Start a guest session — no account needed
app.post('/api/auth/guest', (req, res) => {
  const sessionId = uuidv4();
  const state     = createFreshState();

  // Check if resuming a guest session
  const existingId = req.body.sessionId;
  if (existingId) {
    const existing = db.loadGuestSession(existingId);
    if (existing) {
      setSession(existingId, { state: existing.state, playerId: null, saveSlot: null, saveId: null });
      return res.json({
        success:      true,
        sessionId:    existingId,
        resumed:      true,
        inCreation:   isInCreation(existing.state),
        isReady:      isReady(existing.state),
        storySummary: existing.state.storySummary || ''
      });
    }
  }

  state.creation.phase = 1;
  state.creationPrompt = buildOpeningPrompt();
  setSession(sessionId, { state, playerId: null, saveSlot: null, saveId: null });

  res.json({ success: true, sessionId, resumed: false, output: buildOpeningPrompt() });
});


// =============================================
// ROUTES — SAVES
// =============================================

// GET /api/saves
app.get('/api/saves', requireSession, (req, res) => {
  if (!req.session.playerId) {
    return res.status(401).json({ error: 'Must be logged in to view saves.' });
  }
  const slots = db.getSaveSlots(req.session.playerId);
  res.json({ success: true, slots });
});


// POST /api/saves/load
app.post('/api/saves/load', requireSession, (req, res) => {
  const { slot } = req.body;
  if (!req.session.playerId) return res.status(401).json({ error: 'Must be logged in.' });

  const save = db.loadGame(req.session.playerId, slot || 1);
  if (!save) return res.status(404).json({ error: 'No save found in that slot.' });

  req.session.state    = save.state;
  req.session.saveSlot = slot || 1;
  req.session.saveId   = save.saveId;
  setSession(req.sessionId, req.session);

  res.json({
    success:      true,
    character:    buildCharacterPanelData(save.state),
    rightPanel:   buildRightPanelData(save.state),
    storySummary: save.state.storySummary || ''
  });
});


// POST /api/saves/save
app.post('/api/saves/save', requireSession, async (req, res) => {
  if (!req.session.playerId) return res.status(401).json({ error: 'Must be logged in.' });

  await persistSession(req.sessionId);
  res.json({ success: true });
});


// POST /api/saves/save-to-slot
// Save current game to a specific slot (1-3)
app.post('/api/saves/save-to-slot', requireSession, async (req, res) => {
  if (!req.session.playerId) return res.status(401).json({ error: 'Must be logged in.' });

  const { slot } = req.body;
  const slotNum  = parseInt(slot);
  if (!slotNum || slotNum < 1 || slotNum > 3) {
    return res.status(400).json({ error: 'Slot must be 1, 2, or 3.' });
  }

  db.saveGame(req.session.playerId, slotNum, req.session.state);
  req.session.saveSlot = slotNum;
  setSession(req.sessionId, req.session);

  res.json({ success: true, slot: slotNum });
});


// GET /api/saves/all
// Returns all 3 save slots with character preview data
app.get('/api/saves/all', requireSession, (req, res) => {
  if (!req.session.playerId) {
    return res.json({ success: true, slots: [], isGuest: true });
  }

  const slots = [];
  for (let i = 1; i <= 3; i++) {
    const save = db.loadGame(req.session.playerId, i);
    if (save && save.state) {
      const s   = save.state;
      const c   = s.character || {};
      const lvl = s.totalXP ? Math.floor(Math.sqrt(s.totalXP / 10)) + 1 : 1;
      slots.push({
        slot:       i,
        empty:      false,
        name:       c.name || 'Unnamed',
        background: c.background || '—',
        level:      Math.min(lvl, 100),
        region:     c.region || '—',
        saveId:     save.saveId,
        updatedAt:  save.updatedAt || null
      });
    } else {
      slots.push({ slot: i, empty: true });
    }
  }

  res.json({ success: true, slots, currentSlot: req.session.saveSlot || 1 });
});


// POST /api/game/reset
// Wipes the current session and starts a fresh character
app.post('/api/game/reset', requireSession, async (req, res) => {
  const freshState      = createFreshState();
  freshState.creation.phase = 1;
  freshState.creationPrompt = buildOpeningPrompt();

  req.session.state    = freshState;
  req.session.saveSlot = req.session.saveSlot || 1;
  req.session.saveId   = null;
  setSession(req.sessionId, req.session);

  // Persist the wipe
  if (req.session.playerId && req.session.saveSlot) {
    db.saveGame(req.session.playerId, req.session.saveSlot, freshState);
  } else {
    db.saveGuestSession(req.sessionId, freshState);
  }

  res.json({ success: true, output: buildOpeningPrompt() });
});


// POST /api/game/equip-crafted
// Equip a crafted item from the crafted gear inventory
app.post('/api/game/equip-crafted', requireSession, (req, res) => {
  const { itemName } = req.body;
  if (!itemName) return res.status(400).json({ error: 'itemName required.' });

  const state  = req.session.state;
  const result = equipCraftedItem(state, itemName);
  setSession(req.sessionId, req.session);

  res.json({
    success:  result.success,
    message:  result.message,
    economy:  buildEconomyPanelData(state),
    character: buildCharacterPanelData(state)
  });
});


// POST /api/game/sell-crafted
// Sell a crafted item for coins
app.post('/api/game/sell-crafted', requireSession, (req, res) => {
  const { itemName } = req.body;
  if (!itemName) return res.status(400).json({ error: 'itemName required.' });

  const state  = req.session.state;
  const result = sellCraftedItem(state, itemName);
  setSession(req.sessionId, req.session);

  res.json({
    success:  result.success,
    message:  result.message,
    amount:   result.amount,
    display:  result.display,
    economy:  buildEconomyPanelData(state),
    character: buildCharacterPanelData(state)
  });
});


// =============================================
// ROUTES — QUESTS
// =============================================

app.get('/api/quests/board', requireSession, (req, res) => {
  res.json({ success: true, board: buildBoardDisplayData(req.session.state) });
});

app.post('/api/quests/refresh', requireSession, (req, res) => {
  refreshBoard(req.session.state);
  setSession(req.sessionId, req.session);
  res.json({ success: true, board: buildBoardDisplayData(req.session.state) });
});

app.post('/api/quests/accept', requireSession, (req, res) => {
  const state = req.session.state;
  const { questIndex, questId } = req.body;
  const result = questId ? acceptQuest(state, questId) : acceptQuestByIndex(state, parseInt(questIndex));
  setSession(req.sessionId, req.session);
  res.json({ success: result.success, message: result.message, quest: result.quest, board: buildBoardDisplayData(state) });
});

app.post('/api/quests/abandon', requireSession, (req, res) => {
  const state = req.session.state;
  const { questId } = req.body;
  if (!questId || !state.activeQuests) return res.json({ success: false });
  const idx = state.activeQuests.findIndex(q => q.id === questId);
  if (idx !== -1) state.activeQuests.splice(idx, 1);
  setSession(req.sessionId, req.session);
  res.json({ success: true, board: buildBoardDisplayData(state) });
});


// =============================================
// ROUTES — SETTINGS
// =============================================

// POST /api/settings/nsfw
app.post('/api/settings/nsfw', requireSession, (req, res) => {
  const { enabled } = req.body;
  req.session.state.nsfwEnabled = !!enabled;
  setSession(req.sessionId, req.session);

  if (req.session.playerId) {
    db.setNSFWSetting(req.session.playerId, !!enabled);
  }

  res.json({ success: true, nsfwEnabled: !!enabled });
});


// =============================================
// ROUTES — GAME STATE
// Returns current panel data without taking an action
// =============================================

// GET /api/state
app.get('/api/state', requireSession, (req, res) => {
  const state = req.session.state;
  res.json({
    success:     true,
    character:   buildCharacterPanelData(state),
    progression: buildProgressionPanelData(state),
    economy:     buildEconomyPanelData(state),
    rightPanel:  buildRightPanelData(state),
    inCreation:  isInCreation(state),
    isReady:     isReady(state)
  });
});


// GET /api/history
app.get('/api/history', requireSession, (req, res) => {
  const saveId = req.session.saveId;
  if (!saveId) return res.json({ success: true, history: [] });

  const history = db.getRecentHistory(saveId, 30);
  res.json({ success: true, history });
});


// =============================================
// MAIN GAME LOOP — POST /api/action
// This is the heart of the server.
// Receives player input, runs all game logic,
// calls AI, returns narrative + panel updates.
// =============================================
app.post('/api/action', requireSession, async (req, res) => {
  const { input } = req.body;
  if (!input || typeof input !== 'string' || input.trim().length === 0) {
    return res.status(400).json({ error: 'Input required.' });
  }

  const state      = req.session.state;
  const cleanInput = input.trim();
  const events     = [];   // Collects all game events this turn

  // --------------------------------------------------------
  // STATE SNAPSHOT — save state BEFORE processing for undo/retry
  // --------------------------------------------------------
  const { createStateSnapshot } = require('./game/state');
  req.session.stateSnapshot = createStateSnapshot(state);
  req.session.lastInput = cleanInput;

  try {

    // --------------------------------------------------------
    // CREATION PHASE
    // --------------------------------------------------------
    if (isInCreation(state)) {
      const result = processCreationInput(state, cleanInput);

      // Guard: processCreationInput should never return undefined, but be safe
      if (!result) {
        console.error('[Creation] processCreationInput returned null for phase', state.creation.phase, 'input:', JSON.stringify(cleanInput));
        return res.status(500).json({
          error: `Creation phase ${state.creation.phase} returned no result. Check console.`
        });
      }

      if (result.done) {
        // Character fully built — inject a rich opening scene hint so the AI
        // knows this is the very first moment of the story, not a response to "3"
        const c        = state.character || {};
        const envKey   = c.startingEnvironment || '';
        const bgKey    = c.background           || '';
        const charName = c.name                 || null;
        const region   = c.region               || '';

        // Map env/region keys to human-readable labels without requiring constants
        const envLabels = {
          deep_forest:   'Deep Forest — dense woodland, sparse population, beast-heavy',
          open_plains:   'Open Plains — vast grasslands, visible horizon, traveler roads',
          small_village: 'Small Village — a settlement of a few hundred people, community life',
          bustling_city: 'Bustling City — a metropolis of millions, wealth and rot in equal measure'
        };
        const regionFlavors = {
          thornwick: 'rolling farmland, muddy roads, and treelines that feel closer every year',
          ironport:  'salt-stained cobblestones, crowded markets, and shadows that watch you back',
          ashwood:   'silver bark trees, eerie silence, and light that bends at wrong angles',
          dustfall:  'amber grass, open sky, and the wind carrying the smell of something dead'
        };
        const beastOpenings = {
          thornwick: 'A road wolf the size of a pony crashes into the mud at your feet — brought down by someone else\'s arrow before it could reach you',
          ironport:  'A bloated harbour beast — part eel, part nightmare — stops thrashing as the man beside you wrenches his blade free from its skull',
          ashwood:   'A corrupted stag — its antlers fused into bone blades, its eyes black and burning — drops mid-charge at the hand of a stranger who doesn\'t stay to explain',
          dustfall:  'An orc raider twice your size crumples face-first into the dust — the crossbow bolt through its eye placed by a hooded figure already disappearing into the grass'
        };

        const openingHint = [
          '[OPENING SCENE — character creation just completed. Write the very first moment of this character\'s story in vivid prose.]',
          charName ? `[Character name: ${charName}]` : '[Character has no name — do not give them one]',
          bgKey    ? `[Background: ${bgKey}]` : '',
          envKey   ? `[Starting environment: ${envLabels[envKey] || envKey}]` : '',
          region   ? `[Region feel: ${regionFlavors[region] || region}]` : '',
          beastOpenings[region] ? `[Opening beat: ${beastOpenings[region]}]` : '',
          '[Write ONLY prose. No stats, no mechanics, no system text. Establish the world as dangerous, real, and indifferent.]',
          '[End on an open beat — something just changed, now what?]'
        ].filter(Boolean).join('\n');

        state.pendingContextHint = openingHint;
        state.creationPrompt     = null;
      } else {
        state.creationPrompt = result.prompt;
      }

      const narrative = await processNarrative(state, cleanInput, events);
      await persistSession(req.sessionId);

      return res.json({
        success:    true,
        output:     narrative.fullOutput,
        character:  buildCharacterPanelData(state),
        rightPanel: narrative.rightPanel,
        inCreation: isInCreation(state)
      });
    }

    // --------------------------------------------------------
    // PENDING CLASS OFFER
    // --------------------------------------------------------
    if (state.pendingClassOffer) {
      const result = processClassOfferResponse(state, cleanInput);
      if (result.handled) {
        if (result.accepted === true)  events.push({ type: 'classAccepted',  message: result.message, key: result.key });
        if (result.accepted === false) events.push({ type: 'classDeclined',  message: result.message });
        if (result.pending)            events.push({ type: 'statScreen',     content: result.message });

        const narrative = await processNarrative(state, cleanInput, events);
        await persistSession(req.sessionId);
        return res.json({
          success:     true,
          output:      narrative.fullOutput,
          character:   buildCharacterPanelData(state),
          progression: buildProgressionPanelData(state),
          rightPanel:  narrative.rightPanel
        });
      }
    }

    // --------------------------------------------------------
    // PENDING PROFESSION OFFER
    // --------------------------------------------------------
    if (state.pendingProfOffer) {
      const result = processProfessionOfferResponse(state, cleanInput);
      if (result.handled) {
        if (result.accepted === true)  events.push({ type: 'professionAccepted', message: result.message, key: result.key });
        if (result.accepted === false) events.push({ type: 'professionDeclined', message: result.message });
        if (result.pending)            events.push({ type: 'statScreen',         content: result.message });

        const narrative = await processNarrative(state, cleanInput, events);
        await persistSession(req.sessionId);
        return res.json({
          success:     true,
          output:      narrative.fullOutput,
          character:   buildCharacterPanelData(state),
          progression: buildProgressionPanelData(state),
          rightPanel:  narrative.rightPanel
        });
      }
    }

    // --------------------------------------------------------
    // SYSTEM COMMANDS
    // Commands that show UI panels without advancing the story
    // --------------------------------------------------------
    const t = cleanInput.toLowerCase().trim();

    // Check stats
    if (['check stats', 'status', 'character sheet', 'view stats', 'my stats'].includes(t)) {
      const panel = buildCharacterPanelData(state);
      return res.json({
        success:    true,
        output:     null,
        character:  panel,
        isCommand:  true,
        commandType:'stats'
      });
    }

    // Check gear / inventory
    if (['check gear', 'gear', 'inventory', 'check inventory', 'my inventory', 'equipment', 'my gear'].includes(t)) {
      const panel = buildEconomyPanelData(state);
      return res.json({
        success:    true,
        output:     null,
        economy:    panel,
        isCommand:  true,
        commandType:'gear'
      });
    }
// Explicit set/add companion command (bypasses rapport requirement for testing/GM use)
    if (t.startsWith('set companion ') || t.startsWith('add companion ')) {
      const name = cleanInput.replace(/^(set|add) companion\s+/i, '').trim();
      if (!name) {
        return res.json({
          success: true,
          output: 'Specify a companion name. Example: set companion Elara',
          isCommand: true
        });
      }
      
      const result = addCompanion(state, {
        name: name.charAt(0).toUpperCase() + name.slice(1).toLowerCase(),
        description: 'A companion who joined your journey.',
        role: 'ally'
      });

      await persistSession(req.sessionId);
      return res.json({
        success: true,
        output: result.success
          ? `${result.companion.name} has joined your party.`
          : result.message,
        isCommand: true,
        commandType: 'companion'
      });
    }
    // Check companions
    if (['companions', 'check companions', 'my companions', 'party', 'my party'].includes(t)) {
      const companionData = getCompanionsDisplay(state);
      return res.json({
        success:     true,
        output:      companionData.hasCompanions 
          ? `Your companions: ${companionData.display}`
          : 'You are traveling alone.',
        economy:     buildEconomyPanelData(state),
        isCommand:   true,
        commandType: 'companions'
      });
    }

    // Spend free point
    if (/\b(spend|allocate|put|add)\b/.test(t) && /\b(str|strength|dex|dexterity|vit|vitality|int|intelligence|wis|wisdom|cha|charisma)\b/.test(t)) {
      const result = spendFreePoint(state, cleanInput);
      events.push({ type: 'freePointSpent', ...result });
      return res.json({
        success:   true,
        output:    result.message,
        character: buildCharacterPanelData(state),
        isCommand: true,
        commandType: 'freePoint'
      });
    }

    // Toggle NSFW
    if (t === 'nsfw on' || t === 'nsfw off' || t === 'enable nsfw' || t === 'disable nsfw') {
      const enabled = t.includes('on') || t.includes('enable');
      state.nsfwEnabled = enabled;
      if (req.session.playerId) db.setNSFWSetting(req.session.playerId, enabled);
      return res.json({
        success:    true,
        output:     enabled
          ? '[Adult content enabled. Intimate scenes will play out fully when earned.]'
          : '[Adult content disabled. Intimate scenes will fade to black.]',
        isCommand:  true,
        commandType:'nsfw'
      });
    }

    // Inspect enemy
    if (['inspect', 'size up', 'assess', 'read the enemy', 'study enemy'].some(w => t.includes(w))) {
      const inspectData = buildEnemyInspectData(state);
      events.push({ type: 'inspect', content: formatInspectResult(inspectData) });
      const narrative = await processNarrative(state, cleanInput, events);
      return res.json({
        success:    true,
        output:     narrative.fullOutput,
        rightPanel: narrative.rightPanel
      });
    }

    // Recover gear
    if ((t.includes('recover') || t.includes('retrieve')) && (t.includes('gear') || t.includes('equipment') || t.includes('belongings'))) {
      const result = recoverGear(state);
      if (result.success) {
        events.push({ type: 'gearRecovered', ...result });
      }
      const narrative = await processNarrative(state, cleanInput, events);
      await persistSession(req.sessionId);
      return res.json({
        success:    true,
        output:     narrative.fullOutput,
        economy:    buildEconomyPanelData(state),
        rightPanel: narrative.rightPanel
      });
    }

    // Open / close shop
    if (t.includes('open shop') || t.includes('set up shop') || t.includes('open stall')) {
      const result = tryOpenShop(state);
      if (!result.success) {
        return res.json({ success: true, output: result.message, isCommand: true });
      }
    }

    if (t.includes('close shop') || t.includes('pack up shop')) {
      const result = tryCloseShop(state);
      return res.json({ success: true, output: result.message, isCommand: true });
    }

    // --------------------------------------------------------
    // EQUIPMENT COMMANDS
    // Detect equip/unequip intent and process mechanically
    // --------------------------------------------------------
    const equipIntent = detectEquipIntent(cleanInput);
    if (equipIntent) {
      const equipResult = processEquipCommand(state, equipIntent);
      if (equipResult) {
        if (equipResult.success) {
          events.push({ 
            type: equipIntent.intent === 'equip' ? 'itemEquipped' : 'itemUnequipped', 
            item: equipResult.item,
            slot: equipResult.slot,
            message: equipResult.message 
          });
          state.pendingContextHint = `[GEAR UPDATED — ${equipResult.message}. Narrate this naturally.]`;
        } else if (equipResult.notFound) {
          // Item not in inventory — let AI know so it can handle gracefully
          state.pendingContextHint = equipResult.hint;
          events.push({ type: 'equipFailed', message: equipResult.message });
        }
      }
    }

    // --------------------------------------------------------
    // COMPANION COMMANDS
    // Detect companion join/leave intent
    // --------------------------------------------------------
    const companionIntent = detectCompanionIntent(cleanInput, state);
    if (companionIntent && companionIntent.npcName) {
      if (companionIntent.intent === 'join') {
        // Check if NPC has enough rapport to join
        const npcKey = companionIntent.npcName.toLowerCase();
        const rapport = state.npcRelationships && state.npcRelationships[npcKey]
          ? state.npcRelationships[npcKey].rapport || 0
          : 0;
        
        if (rapport >= 30) {
          const result = addCompanion(state, {
            name: companionIntent.npcName.charAt(0).toUpperCase() + companionIntent.npcName.slice(1),
            description: `A companion met in your travels.`,
            role: 'ally'
          });
          
          if (result.success) {
            events.push({ type: 'companionJoined', companion: result.companion });
            state.pendingContextHint = `[COMPANION JOINED — ${result.companion.name} has agreed to travel with the player. Narrate this naturally as a meaningful moment.]`;
          } else {
            state.pendingContextHint = `[COMPANION LIMIT — ${result.message}]`;
          }
        } else {
          state.pendingContextHint = `[COMPANION DECLINED — Not enough rapport (${rapport}/30) with ${companionIntent.npcName}. They are not ready to commit to traveling together. Narrate a polite decline.]`;
        }
      } else if (companionIntent.intent === 'leave') {
        const result = removeCompanion(state, companionIntent.npcName);
        if (result.success) {
          events.push({ type: 'companionLeft', companion: result.companion });
          state.pendingContextHint = `[COMPANION LEFT — ${result.companion.name} has parted ways with the player. Narrate this farewell naturally.]`;
        }
      }
    }

    // --------------------------------------------------------
    // DEATH CHECK
    // Process before any new actions
    // --------------------------------------------------------
    if (isDead(state)) {
      const playerLevel  = getPlayerLevel(state.totalXP || 0);
      const levelsLost   = state.deathCount + 1;
      state.deathCount   = (state.deathCount || 0) + 1;
      const newLevel     = Math.max(1, playerLevel - levelsLost);
      const { getXPForLevel } = require('./game/character');
      state.totalXP      = getXPForLevel(newLevel);
      state.hp           = state.maxHp;
      state.stamina      = state.maxStamina;
      state.mana         = state.maxMana;
      state.inCombat     = false;
      state.currentEnemy = null;

      const hadGear = saveGearAtDeath(state);
      changeReputation(state, state.character.region, -5);

      const regionLabel = buildCharacterPanelData(state).region || 'the region';

      events.push({
        type:        'death',
        deathCount:  state.deathCount,
        levelsLost,
        newLevel,
        hadGear,
        regionLabel
      });
    }

    // --------------------------------------------------------
    // COMBAT FLEE
    // --------------------------------------------------------
    if (state.inCombat && state.currentEnemy && detectFleeIntent(cleanInput)) {
      const fleeResult = applyFleeAttempt(state);
      state.pendingContextHint = fleeResult.hint;

      const narrative = await processNarrative(state, cleanInput, events);
      await persistSession(req.sessionId);
      return res.json({
        success:    true,
        output:     narrative.fullOutput,
        character:  buildCharacterPanelData(state),
        rightPanel: narrative.rightPanel
      });
    }

    // --------------------------------------------------------
    // ACTIVE COMBAT ROUND
    // --------------------------------------------------------
    if (state.inCombat && state.currentEnemy) {
      const combatResult = applyCombatRound(state, cleanInput);
      state.pendingContextHint = combatResult.hint;

      // Update affinity progress from combat actions
      updateActionProgress(state, cleanInput);

      if (combatResult.enemyKilled) {
        events.push({
          type:  'enemyKill',
          label: state.pendingEnemyKill ? state.pendingEnemyKill.label : 'Enemy',
          xp:    state.pendingEnemyKill ? state.pendingEnemyKill.xp    : 0
        });

        // Apply kill XP
        if (state.pendingEnemyKill) {
          const { getPlayerLevel: gpl, getXPForLevel: gxfl } = require('./game/character');
          const prevLevel  = gpl(state.totalXP || 0);
          state.totalXP    = (state.totalXP || 0) + state.pendingEnemyKill.xp;
          state.classXP    = (state.classXP  || 0) + state.pendingEnemyKill.xp;
          const newLevel   = gpl(state.totalXP);
          state.pendingEnemyKill = null;

          if (newLevel > prevLevel) {
            const pts        = newLevel - prevLevel;
            state.freePoints = (state.freePoints || 0) + pts;
            recalculateResources(state);
            events.push({ type: 'levelUp', prevLevel, newLevel, freePointsAwarded: pts });
          }
        }
      }

      // Check progression events
      const progressEvents = processPendingProgressEvents(state);
      events.push(...progressEvents);

      const narrative = await processNarrative(state, cleanInput, events);
      await persistSession(req.sessionId);

      // Append the mechanical combat log below the narrative prose
      const fullOutput = combatResult.combatLog
        ? (narrative.fullOutput || '') + combatResult.combatLog
        : narrative.fullOutput;

      // Store for retry-narrative functionality
      req.session.lastOutput = fullOutput;
      req.session.lastCombatLog = combatResult.combatLog || null;
      req.session.lastCombatResult = state.pendingCombatResult;
      req.session.lastEvents = events;
      setSession(req.sessionId, req.session);

      return res.json({
        success:     true,
        output:      fullOutput,
        character:   buildCharacterPanelData(state),
        progression: buildProgressionPanelData(state),
        economy:     buildEconomyPanelData(state),
        rightPanel:  narrative.rightPanel
      });
    }

    // --------------------------------------------------------
    // BOUNTY BOARD CHECK
    // --------------------------------------------------------
    if (!state.inCombat && detectBoardIntent(cleanInput)) {
      state.pendingContextHint = buildBoardInspectHint(state);
    }

    // --------------------------------------------------------
    // QUEST ACCEPT via natural language
    // --------------------------------------------------------
    if (!state.inCombat && detectQuestAccept(cleanInput) && state.boardQuests && state.boardQuests.length > 0) {
      const numMatch = cleanInput.match(/\b([1-9])\b/);
      if (numMatch) {
        const result = acceptQuestByIndex(state, parseInt(numMatch[1]));
        if (result.success) {
          events.push({ type: 'questAccepted', quest: result.quest });
          state.pendingContextHint = result.hint || `[QUEST ACCEPTED: "${result.quest.label}" — narrate naturally.]`;
        }
      } else {
        const t2 = cleanInput.toLowerCase();
        const quests = getBoardQuests(state);
        for (let i = 0; i < quests.length; i++) {
          const q = quests[i];
          if (
            (t2.includes('hunt') && q.type === 'hunt') ||
            (t2.includes('escort') && q.type === 'escort') ||
            (t2.includes('patrol') && q.type === 'patrol') ||
            (t2.includes('retrieve') && q.type === 'retrieve') ||
            (t2.includes('scout') && q.type === 'scout') ||
            (t2.includes('advance') && q.type === 'advance') ||
            (t2.includes('move on') && q.type === 'advance')
          ) {
            const result = acceptQuest(state, q.id);
            if (result.success) {
              events.push({ type: 'questAccepted', quest: result.quest });
              state.pendingContextHint = result.hint;
              break;
            }
          }
        }
      }
    }

    // --------------------------------------------------------
    // QUEST PROGRESS
    // --------------------------------------------------------
    if (state.activeQuests && state.activeQuests.length > 0) {
      const killEvents = events.filter(e => e.type === 'enemyKill').map(e => ({ type:'enemyDefeated', enemyLabel: e.label || '' }));
      const questUpdates = checkQuestProgress(state, cleanInput, killEvents);
      if (questUpdates.length > 0) events.push(...questUpdates.map(u => ({ type:'questProgress', ...u })));

      const completions = processQuestCompletions(state);
      for (const c of completions) {
        events.push({ type:'questComplete', quest:c.quest, reward:c.reward, hint:c.hint });
        state.pendingContextHint = (state.pendingContextHint ? state.pendingContextHint + '\n\n' : '') + c.hint;
      }
    }

    // --------------------------------------------------------
    // SPAWN ENEMY ON COMBAT INTENT
    // --------------------------------------------------------
    if (detectCombatIntent(cleanInput) && state.character && !state.inCombat) {
      const playerLevel = getPlayerLevel(state.totalXP || 0);
      const enemy       = spawnEnemy(state.character.region, playerLevel);

      if (enemy) {
        state.inCombat     = true;
        state.currentEnemy = enemy;
        const unbeatable   = (enemy.level - playerLevel) >= 20;
        state.pendingContextHint = unbeatable
          ? `[ENEMY SPAWNED: ${enemy.label} — far beyond the player. Cannot be defeated. Narrate absolute dominance.]`
          : `[ENEMY SPAWNED: ${enemy.label} Lv${enemy.level}. ${enemy.desc} Behavior: ${enemy.behavior}. Player attacked first. Begin the combat scene.]`;
      }
    }

    // --------------------------------------------------------
    // AMBIENT ENCOUNTER CHECK
    // --------------------------------------------------------
    if (!state.inCombat && !isPassiveAction(cleanInput)) {
      const ambientEnemy = checkAmbientEncounter(state);
      if (ambientEnemy) {
        state.inCombat     = true;
        state.currentEnemy = ambientEnemy;
        state.pendingContextHint = `[AMBIENT ENCOUNTER — a ${ambientEnemy.label} appears unexpectedly. ${ambientEnemy.desc} Behavior: ${ambientEnemy.behavior}. Player did not seek this fight — introduce naturally. They can fight, flee, or attempt to avoid it.]`;
      }
    }

    // --------------------------------------------------------
    // SHOP CUSTOMER EVENT
    // --------------------------------------------------------
    if (state.shopOpen && !state.inCombat) {
      const shopEvent = checkShopCustomerEvent(state);
      if (shopEvent) {
        state.pendingContextHint = shopEvent.hint;
      }
    }

    // --------------------------------------------------------
    // PROFESSION TASK
    // --------------------------------------------------------
    if (state.profession && !state.inCombat) {
      const taskResult = resolveProfessionTask(state, cleanInput);
      if (taskResult) {
        state.pendingContextHint = taskResult.hint;

        // Apply pending prof XP and check for level up
        if (state.pendingProfXP && state.pendingProfXP > 0) {
          state.profXP         = (state.profXP || 0) + state.pendingProfXP;
          state.pendingProfXP  = 0;
        }
      }
    }

    // --------------------------------------------------------
    // AFFINITY TRACKING (non-combat)
    // --------------------------------------------------------
    if (!state.inCombat) {
      updateActionProgress(state, cleanInput);
    }

    // --------------------------------------------------------
    // COIN DETECTION
    // --------------------------------------------------------
    const coinIntent = detectCoinIntent(cleanInput);
    if (coinIntent && coinIntent.intent === 'earn') {
      state.pendingCoinGain  = (state.pendingCoinGain  || 0) + coinIntent.amount;
    }
    if (coinIntent && coinIntent.intent === 'spend') {
      state.pendingCoinSpend = (state.pendingCoinSpend || 0) + coinIntent.amount;
    }

    // --------------------------------------------------------
    // PROCESS COIN EVENTS
    // --------------------------------------------------------
    const coinEvents = processPendingCoinEvents(state);
    for (const ce of coinEvents) {
      if (ce.type === 'coinSpend' && !ce.success) {
        events.push({ type: 'coinSpendFailed', hint: ce.hint });
        state.pendingContextHint = ce.hint;
      }
    }

    // --------------------------------------------------------
    // STAMINA RECOVERY (out of combat)
    // --------------------------------------------------------
    if (!state.inCombat) {
      const recovery = Math.floor((state.maxStamina || 10) * 0.15);
      state.stamina  = Math.min(state.maxStamina, (state.stamina || state.maxStamina) + recovery);
    }

    // --------------------------------------------------------
    // PROGRESSION EVENTS
    // --------------------------------------------------------
    const progressEvents = processPendingProgressEvents(state);
    events.push(...progressEvents);

    // --------------------------------------------------------
    // NARRATIVE
    // --------------------------------------------------------
    // Inject active quest context
    const activeQuestCtx = buildActiveQuestContext(state);
    if (activeQuestCtx) {
      state.pendingContextHint = state.pendingContextHint
        ? state.pendingContextHint + '\n\n' + activeQuestCtx
        : activeQuestCtx;
    }

    const narrative = await processNarrative(state, cleanInput, events);

    // --------------------------------------------------------
    // PERSIST & SAVE HISTORY
    // --------------------------------------------------------
    await persistSession(req.sessionId);

    // Store last output info for retry-narrative functionality
    req.session.lastOutput = narrative.fullOutput;
    req.session.lastCombatLog = null; // Non-combat actions
    req.session.lastEvents = events;
    setSession(req.sessionId, req.session);

    if (req.session.saveId) {
      db.appendStoryHistory(
        req.session.saveId,
        state.actionCount || 0,
        cleanInput,
        narrative.narrative || '',
        state.sceneContext || 'neutral'
      );
    }

    // --------------------------------------------------------
    // RESPONSE
    // --------------------------------------------------------
    return res.json({
      success:     true,
      output:      narrative.fullOutput,
      character:   buildCharacterPanelData(state),
      progression: buildProgressionPanelData(state),
      economy:     buildEconomyPanelData(state),
      rightPanel:  narrative.rightPanel,
      board:       buildBoardDisplayData(state),
      inCreation:  isInCreation(state)
    });

  } catch (err) {
    console.error('[Action] Unhandled error:', err);
    return res.status(500).json({
      error:  'Something went wrong. Your progress has been saved.',
      detail: err.message   // always expose — helps debug without crashing client
    });
  }
});


// =============================================
// RETRY NARRATIVE ONLY
// Re-generates just the AI prose using the same mechanical outcome.
// Does NOT re-roll combat dice or change game state.
// =============================================
app.post('/api/retry-narrative', requireSession, async (req, res) => {
  const state = req.session.state;
  const lastInput = req.session.lastInput;
  
  if (!lastInput) {
    return res.status(400).json({ error: 'No previous action to retry.' });
  }

  try {
    // Re-use the existing pendingContextHint or rebuild it from stored combat result
    // The state already has the combat outcome applied — we just regenerate prose
    const events = req.session.lastEvents || [];
    
    const narrative = await processNarrative(state, lastInput, events);
    
    // Re-append combat log if there was one
    const fullOutput = req.session.lastCombatLog
      ? (narrative.fullOutput || '') + req.session.lastCombatLog
      : narrative.fullOutput;

    // Update the stored last output
    req.session.lastOutput = fullOutput;
    setSession(req.sessionId, req.session);

    return res.json({
      success:     true,
      output:      fullOutput,
      character:   buildCharacterPanelData(state),
      progression: buildProgressionPanelData(state),
      economy:     buildEconomyPanelData(state),
      rightPanel:  narrative.rightPanel,
      board:       buildBoardDisplayData(state)
    });

  } catch (err) {
    console.error('[RetryNarrative] Error:', err);
    return res.status(500).json({ error: 'Failed to regenerate narrative.' });
  }
});


// =============================================
// UNDO LAST ACTION
// Restores game state to before the last action was processed.
// Allows the player to try a completely different action.
// =============================================
app.post('/api/undo', requireSession, async (req, res) => {
  const { restoreStateSnapshot } = require('./game/state');
  
  if (!req.session.stateSnapshot) {
    return res.status(400).json({ error: 'Nothing to undo.' });
  }

  try {
    // Restore state from snapshot
    restoreStateSnapshot(req.session.state, req.session.stateSnapshot);
    
    // Clear the snapshot (can only undo once per action)
    const undoneInput = req.session.lastInput;
    req.session.stateSnapshot = null;
    req.session.lastInput = null;
    req.session.lastOutput = null;
    req.session.lastCombatLog = null;
    req.session.lastCombatResult = null;
    req.session.lastEvents = null;
    
    setSession(req.sessionId, req.session);
    await persistSession(req.sessionId);

    return res.json({
      success:     true,
      message:     'Action undone. You can try something different.',
      undoneInput: undoneInput,
      character:   buildCharacterPanelData(req.session.state),
      progression: buildProgressionPanelData(req.session.state),
      economy:     buildEconomyPanelData(req.session.state),
      rightPanel:  {
        inCombat:    req.session.state.inCombat || false,
        enemy:       req.session.state.currentEnemy ? buildEnemyPanelData(req.session.state) : null,
        sceneContext:req.session.state.sceneContext || 'neutral'
      },
      board:       buildBoardDisplayData(req.session.state)
    });

  } catch (err) {
    console.error('[Undo] Error:', err);
    return res.status(500).json({ error: 'Failed to undo action.' });
  }
});


// =============================================
// EDIT AND RESUBMIT
// Restores state to before last action, then processes new input.
// Combines undo + new action in one call.
// =============================================
app.post('/api/edit-action', requireSession, async (req, res) => {
  const { input } = req.body;
  const { restoreStateSnapshot, createStateSnapshot } = require('./game/state');
  
  if (!input || typeof input !== 'string' || input.trim().length === 0) {
    return res.status(400).json({ error: 'New input required.' });
  }
  
  if (!req.session.stateSnapshot) {
    return res.status(400).json({ error: 'No previous action to edit.' });
  }

  try {
    // Restore state from snapshot
    restoreStateSnapshot(req.session.state, req.session.stateSnapshot);
    
    // Now process the new input as a fresh action
    // Create a new snapshot for this action
    req.session.stateSnapshot = createStateSnapshot(req.session.state);
    req.session.lastInput = input.trim();
    
    setSession(req.sessionId, req.session);

    // Forward to the main action handler by making an internal call
    // We'll simulate the action processing here instead
    const state = req.session.state;
    const cleanInput = input.trim();
    const events = [];

    // Skip creation phase handling for edit (shouldn't happen in combat)
    if (isInCreation(state)) {
      return res.status(400).json({ error: 'Cannot edit during character creation.' });
    }

    // Process combat if in combat
    if (state.inCombat && state.currentEnemy && !detectFleeIntent(cleanInput)) {
      const combatResult = applyCombatRound(state, cleanInput);
      state.pendingContextHint = combatResult.hint;
      updateActionProgress(state, cleanInput);

      if (combatResult.enemyKilled && state.pendingEnemyKill) {
        events.push({
          type:  'enemyKill',
          label: state.pendingEnemyKill.label,
          xp:    state.pendingEnemyKill.xp
        });

        // Apply kill XP
        const { getPlayerLevel: gpl } = require('./game/character');
        const prevLevel = gpl(state.totalXP || 0);
        state.totalXP = (state.totalXP || 0) + state.pendingEnemyKill.xp;
        state.classXP = (state.classXP || 0) + state.pendingEnemyKill.xp;
        const newLevel = gpl(state.totalXP);
        state.pendingEnemyKill = null;

        if (newLevel > prevLevel) {
          const pts = newLevel - prevLevel;
          state.freePoints = (state.freePoints || 0) + pts;
          recalculateResources(state);
          events.push({ type: 'levelUp', prevLevel, newLevel, freePointsAwarded: pts });
        }
      }

      const narrative = await processNarrative(state, cleanInput, events);
      await persistSession(req.sessionId);

      const fullOutput = combatResult.combatLog
        ? (narrative.fullOutput || '') + combatResult.combatLog
        : narrative.fullOutput;

      req.session.lastOutput = fullOutput;
      req.session.lastCombatLog = combatResult.combatLog || null;
      req.session.lastCombatResult = state.pendingCombatResult;
      req.session.lastEvents = events;
      setSession(req.sessionId, req.session);

      return res.json({
        success:     true,
        output:      fullOutput,
        character:   buildCharacterPanelData(state),
        progression: buildProgressionPanelData(state),
        economy:     buildEconomyPanelData(state),
        rightPanel:  narrative.rightPanel
      });
    }

    // Non-combat action processing
    const narrative = await processNarrative(state, cleanInput, events);
    await persistSession(req.sessionId);

    req.session.lastOutput = narrative.fullOutput;
    req.session.lastCombatLog = null;
    req.session.lastEvents = events;
    setSession(req.sessionId, req.session);

    return res.json({
      success:     true,
      output:      narrative.fullOutput,
      character:   buildCharacterPanelData(state),
      progression: buildProgressionPanelData(state),
      economy:     buildEconomyPanelData(state),
      rightPanel:  narrative.rightPanel,
      board:       buildBoardDisplayData(state)
    });

  } catch (err) {
    console.error('[EditAction] Error:', err);
    return res.status(500).json({ error: 'Failed to process edited action.' });
  }
});


// =============================================
// OPENING PROMPT BUILDER
// =============================================
function buildOpeningPrompt() {
  return (
    'The world did not send for you.\n\n' +
    'No prophecy. No destiny. No ancient blood stirring in your veins at midnight. ' +
    'You are alive because you kept breathing when it was hard, and that is the whole of your story so far.\n\n' +
    'Something changed today. You watched something die — something that should have killed you first — ' +
    'and felt a warmth move through your chest like a coal catching air. Small. Unfamiliar. Real.\n\n' +
    'You don\'t know what it means yet.\n\n' +
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
    'Before this story goes further — who are you?\n\n' +
    'How old are you, and what is your gender?\n' +
    'Answer naturally:\n' +
    '  "I am 25 years old and male"\n' +
    '  "19, female"\n' +
    '  "32 and other"'
  );
}


// =============================================
// INSPECT FORMATTER
// =============================================
function formatInspectResult(inspectData) {
  if (!inspectData.available) {
    return `[${inspectData.reason || 'Cannot inspect.'}]`;
  }
  if (inspectData.scoutLevel === 0) {
    return `[${inspectData.flavor}]`;
  }

  const d     = inspectData.data;
  const lines = [
    '',
    '========================================',
    '        E N E M Y   R E A D',
    '========================================',
    `  ${d.label}`,
    `  ${d.desc}`,
    '----------------------------------------'
  ];

  if (d.condition)  lines.push(`  Condition  : ${d.condition}`);
  if (d.behavior)   lines.push(`  Behavior   : ${d.behavior.charAt(0).toUpperCase() + d.behavior.slice(1)}`);
  if (d.threat)     lines.push(`  Threat     : ${d.threat}`);
  if (d.read)       lines.push(`  Read       : ${d.read}`);
  if (d.fullStats) {
    lines.push(`  Power      : Level ${d.fullStats.level}`);
    lines.push(`  Strength   : ${d.fullStats.strength}`);
    lines.push(`  Agility    : ${d.fullStats.agility}`);
    lines.push(`  Endurance  : ${d.fullStats.endurance}`);
    lines.push(`  HP         : ${d.fullStats.hp}/${d.fullStats.maxHP}`);
  }

  lines.push('========================================', '');
  return lines.join('\n');
}


// =============================================
// HEALTH CHECK
// =============================================
app.get('/api/health', (req, res) => {
  const stats = db.getStats();
  res.json({
    status:  'ok',
    uptime:  process.uptime(),
    db:      stats,
    sessions:sessions.size
  });
});


// =============================================
// CATCH-ALL — serve frontend
// =============================================
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// =============================================
// START SERVER
// =============================================
const server = app.listen(PORT, () => {
  console.log(`[Server] Ember and Ash running on http://localhost:${PORT}`);
});


// =============================================
// GRACEFUL SHUTDOWN
// Persist all active sessions before closing.
// =============================================
async function shutdown() {
  console.log('[Server] Shutting down — persisting sessions...');
  const persistPromises = [];
  for (const sessionId of sessions.keys()) {
    persistPromises.push(persistSession(sessionId));
  }
  await Promise.all(persistPromises);
  db.closeDatabase();
  server.close(() => {
    console.log('[Server] Closed cleanly.');
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);