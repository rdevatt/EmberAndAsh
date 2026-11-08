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
const { randomUUID: uuidv4 } = require('crypto');
const bcrypt   = require('bcryptjs');
const { REGIONS } = require('../game/constants');
// Game modules
const { createFreshState, validateState, isInCreation, isReady, isDead } = require('../game/state');
const { processCreationInput, buildCharacterPanelData, getPlayerLevel, spendFreePoint, recalculateResources } = require('../game/character');
const { detectCombatIntent, detectFleeIntent, isPassiveAction, applyCombatRound, applyFleeAttempt, checkAmbientEncounter, spawnEnemy, buildEnemyInspectData, updateActionProgress, buildEnemyPanelData } = require('../game/combat');
const { resolveProfessionTask, processPendingProgressEvents, processClassOfferResponse, processProfessionOfferResponse, buildProgressionPanelData } = require('../game/professions');
const { 
  addCoin, detectCoinIntent, processPendingCoinEvents, tryOpenShop, tryCloseShop, checkShopCustomerEvent, 
  recoverGear, saveGearAtDeath, buildEconomyPanelData, checkIntimacyAvailable, changeReputation, 
  formatCoin, equipCraftedItem, sellCraftedItem,
  // NEW: Equipment and companion functions
  detectEquipIntent, processEquipCommand, 
  addCompanion, removeCompanion, detectCompanionIntent, getCompanionsDisplay,
  buildBackpackSummary,
  addItem,
  removeItem,
  findInventoryItem,
  hasItem
} = require('../game/economy');
const { processNarrative, buildRightPanelData, buildEventAnnouncements } = require('../game/narrative');
const { detectBoardIntent, detectQuestAccept, refreshBoard, getBoardQuests, acceptQuestByIndex, acceptQuest, buildBoardDisplayData, buildBoardInspectHint, checkQuestProgress, processQuestCompletions, buildActiveQuestContext } = require('../game/quests');
const { calculateEnemyXP } = require('../game/combat');
const registerAuthRoutes = require('./routes/auth');
const registerSaveRoutes = require('./routes/saves');
const registerQuestRoutes = require('./routes/quests');
const registerSettingsRoutes = require('./routes/settings');
const registerStateRoutes = require('./routes/state');
const registerGameplayRoutes = require('./routes/gameplay');

// Database
const db = require('../db/database');


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
app.use(express.static(path.join(__dirname, '..', 'public')));


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
const worldStore = require('./world-store')(db);

async function persistSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;
  try { worldStore.persist(session.state, session, sessionId); } catch (e) { console.error('[World] persist failed:', e.message); }

  if (session.playerId && session.saveSlot) {
    const result = db.saveGame(session.playerId, session.saveSlot, session.state);
    if (result && result.success && result.saveId) session.saveId = result.saveId;
    db.storePlayerSession(sessionId, session.playerId, session.saveSlot);
  } else {
    db.saveGuestSession(sessionId, session.state);
  }
}

// Rebuild an in-memory session from the database after a restart or
// idle eviction. Logged-in sessions map to their account + slot; guests
// map to their guest_sessions row.
function restoreSession(sessionId) {
  const playerSession = db.getPlayerSession(sessionId);
  if (playerSession) {
    const save  = db.loadGame(playerSession.player_id, playerSession.slot);
    const state = save ? save.state : newCreationState();
    const data  = { state, playerId: playerSession.player_id, saveSlot: playerSession.slot, saveId: save ? save.saveId : null };
    setSession(sessionId, data);
    return data;
  }
  const guest = db.loadGuestSession(sessionId);
  if (guest) {
    const data = { state: guest.state, playerId: null, saveSlot: null, saveId: null };
    setSession(sessionId, data);
    return data;
  }
  return null;
}

// A fresh state positioned at the first creation question.
function newCreationState() {
  const state = createFreshState();
  state.creation.phase = 1;
  state.creationPrompt = buildOpeningPrompt();
  return state;
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
}, 30 * 60 * 1000).unref();


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

  const session = getSession(sessionId) || restoreSession(sessionId);
  if (!session) return res.status(401).json({ error: 'Session not found or expired.', code: 'SESSION_EXPIRED' });

  req.sessionId = sessionId;
  req.session   = session;
  try { worldStore.bind(session.state, session, sessionId); } catch (e) { console.error('[World] bind failed:', e.message); }
  next();
}


// =============================================
// INSTALL BCRYPTJS
// better-sqlite3 is already installed.
// We need bcryptjs for password hashing.
// =============================================


registerAuthRoutes(app, {
  db,
  worldStore,
  uuidv4,
  hashPassword,
  verifyPassword,
  setSession,
  getSession,
  persistSession,
  newCreationState,
  isReady,
  isInCreation,
  buildOpeningPrompt,
  buildCharacterPanelData,
  buildProgressionPanelData,
  buildEconomyPanelData,
  buildRightPanelData,
  buildBoardDisplayData
});

registerSaveRoutes(app, {
  db,
  worldStore,
  requireSession,
  setSession,
  persistSession,
  newCreationState,
  isInCreation,
  buildProgressionPanelData,
  buildBoardDisplayData,
  getPlayerLevel,
  createFreshState,
  buildOpeningPrompt,
  buildCharacterPanelData,
  buildRightPanelData,
  buildEconomyPanelData,
  equipCraftedItem,
  sellCraftedItem
});

registerQuestRoutes(app, {
  requireSession,
  setSession,
  persistSession,
  refreshBoard,
  acceptQuest,
  acceptQuestByIndex,
  buildBoardDisplayData
});

registerSettingsRoutes(app, {
  db,
  worldStore,
  requireSession,
  setSession,
  persistSession
});

registerStateRoutes(app, {
  db,
  worldStore,
  requireSession,
  buildCharacterPanelData,
  buildProgressionPanelData,
  buildEconomyPanelData,
  buildRightPanelData,
  buildBoardDisplayData,
  isInCreation,
  isReady
});

const worldRoutes = require('./routes/world/register')(app, {
  db, worldStore, requireSession, setSession, persistSession, newCreationState,
  buildCharacterPanelData, buildProgressionPanelData, buildEconomyPanelData, buildRightPanelData, buildBoardDisplayData,
  isInCreation, getPlayerLevel
});

registerGameplayRoutes(app, {
  db,
  worldStore,
  worldRoutes,
  REGIONS,
  requireSession,
  persistSession,
  setSession,
  isInCreation,
  isDead,
  isReady,
  createFreshState,
  processCreationInput,
  buildCharacterPanelData,
  getPlayerLevel,
  spendFreePoint,
  recalculateResources,
  detectCombatIntent,
  detectFleeIntent,
  isPassiveAction,
  applyCombatRound,
  applyFleeAttempt,
  checkAmbientEncounter,
  spawnEnemy,
  buildEnemyInspectData,
  updateActionProgress,
  buildEnemyPanelData,
  resolveProfessionTask,
  processPendingProgressEvents,
  processClassOfferResponse,
  processProfessionOfferResponse,
  buildProgressionPanelData,
  detectCoinIntent,
  addCoin,
  processPendingCoinEvents,
  tryOpenShop,
  tryCloseShop,
  checkShopCustomerEvent,
  recoverGear,
  saveGearAtDeath,
  buildEconomyPanelData,
  checkIntimacyAvailable,
  changeReputation,
  formatCoin,
  equipCraftedItem,
  sellCraftedItem,
  detectEquipIntent,
  processEquipCommand,
  addCompanion,
  removeCompanion,
  detectCompanionIntent,
  getCompanionsDisplay,
  buildBackpackSummary,
  addItem,
  removeItem,
  findInventoryItem,
  hasItem,
  processNarrative,
  buildRightPanelData,
  detectBoardIntent,
  detectQuestAccept,
  refreshBoard,
  getBoardQuests,
  acceptQuestByIndex,
  acceptQuest,
  buildBoardDisplayData,
  buildBoardInspectHint,
  checkQuestProgress,
  processQuestCompletions,
  buildActiveQuestContext
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
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});


// =============================================
// START SERVER
// =============================================
// Exported for tests: start only when run directly (node server.js) or
// when EMBER_AUTOSTART isn't disabled.
let server = null;
function start(port = PORT) {
  server = app.listen(port, () => {
    console.log(`[Server] Ember and Ash running on http://localhost:${server.address().port}`);
  });
  return server;
}
if (process.env.EMBER_NO_AUTOSTART !== '1') start();


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
  if (!server) process.exit(0);
  server.close(() => {
    console.log('[Server] Closed cleanly.');
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

module.exports = { app, start, sessions, persistSession, worldStore };