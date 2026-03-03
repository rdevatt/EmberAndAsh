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
const { REGIONS } = require('../game/constants');
// Game modules
const { createFreshState, validateState, isInCreation, isReady, isDead } = require('../game/state');
const { processCreationInput, buildCharacterPanelData, getPlayerLevel, spendFreePoint, recalculateResources } = require('../game/character');
const { detectCombatIntent, detectFleeIntent, isPassiveAction, applyCombatRound, applyFleeAttempt, checkAmbientEncounter, spawnEnemy, buildEnemyInspectData, updateActionProgress, buildEnemyPanelData } = require('../game/combat');
const { resolveProfessionTask, processPendingProgressEvents, processClassOfferResponse, processProfessionOfferResponse, buildProgressionPanelData } = require('../game/professions');
const { 
  detectCoinIntent, processPendingCoinEvents, tryOpenShop, tryCloseShop, checkShopCustomerEvent, 
  recoverGear, saveGearAtDeath, buildEconomyPanelData, checkIntimacyAvailable, changeReputation, 
  formatCoin, equipCraftedItem, sellCraftedItem,
  // NEW: Equipment and companion functions
  detectEquipIntent, processEquipCommand, 
  addCompanion, removeCompanion, detectCompanionIntent, getCompanionsDisplay,
  buildBackpackSummary,
  addItem  // FIX: Import addItem for take/loot commands
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


registerAuthRoutes(app, {
  db,
  uuidv4,
  hashPassword,
  verifyPassword,
  setSession,
  createFreshState,
  isReady,
  isInCreation,
  buildOpeningPrompt
});

registerSaveRoutes(app, {
  db,
  requireSession,
  setSession,
  persistSession,
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
  refreshBoard,
  acceptQuest,
  acceptQuestByIndex,
  buildBoardDisplayData
});

registerSettingsRoutes(app, {
  db,
  requireSession,
  setSession
});

registerStateRoutes(app, {
  db,
  requireSession,
  buildCharacterPanelData,
  buildProgressionPanelData,
  buildEconomyPanelData,
  buildRightPanelData,
  isInCreation,
  isReady
});

registerGameplayRoutes(app, {
  db,
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