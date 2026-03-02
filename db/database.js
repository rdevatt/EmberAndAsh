'use strict';

// =============================================================
// EMBER AND ASH — DATABASE
// Player accounts, session saves, and story history.
// Uses SQLite via better-sqlite3 — no server required,
// single file database, zero configuration.
// =============================================================

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const { serializeState, deserializeState } = require('../game/state');


// =============================================
// DATABASE SETUP
// =============================================
const DB_DIR  = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'emberandash.db');

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');


// =============================================
// SCHEMA
// Run once on startup. Safe to run repeatedly.
// =============================================
function initializeSchema() {
  db.exec(`
    -- Players table
    -- One row per registered player account
    CREATE TABLE IF NOT EXISTS players (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      username     TEXT    UNIQUE NOT NULL,
      password_hash TEXT   NOT NULL,
      email        TEXT    UNIQUE,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      last_login   TEXT,
      nsfw_enabled INTEGER NOT NULL DEFAULT 0,
      settings     TEXT    NOT NULL DEFAULT '{}'
    );

    -- Saves table
    -- One row per saved game slot per player
    CREATE TABLE IF NOT EXISTS saves (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id    INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      slot         INTEGER NOT NULL DEFAULT 1,
      character_name TEXT,
      region       TEXT,
      level        INTEGER NOT NULL DEFAULT 1,
      state_json   TEXT    NOT NULL,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(player_id, slot)
    );

    -- Story history table
    -- Rolling log of player actions and AI responses
    -- Used for right panel history display
    CREATE TABLE IF NOT EXISTS story_history (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      save_id      INTEGER NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
      action_count INTEGER NOT NULL,
      player_input TEXT    NOT NULL,
      ai_response  TEXT    NOT NULL,
      scene_context TEXT,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Guest sessions table
    -- Temporary sessions for players not logged in
    -- Cleaned up after 24 hours of inactivity
    CREATE TABLE IF NOT EXISTS guest_sessions (
      session_id   TEXT    PRIMARY KEY,
      state_json   TEXT    NOT NULL,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Remember tokens table
    -- Persistent login tokens for "remember me" functionality
    CREATE TABLE IF NOT EXISTS remember_tokens (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id    INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      token        TEXT    UNIQUE NOT NULL,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      expires_at   TEXT    NOT NULL DEFAULT (datetime('now', '+30 days'))
    );

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_saves_player    ON saves(player_id);
    CREATE INDEX IF NOT EXISTS idx_history_save    ON story_history(save_id);
    CREATE INDEX IF NOT EXISTS idx_history_actions ON story_history(save_id, action_count);
    CREATE INDEX IF NOT EXISTS idx_guest_updated   ON guest_sessions(updated_at);
    CREATE INDEX IF NOT EXISTS idx_remember_token  ON remember_tokens(token);
    CREATE INDEX IF NOT EXISTS idx_remember_player ON remember_tokens(player_id);
  `);

  console.log('[DB] Schema initialized.');
}


// =============================================
// PLAYER ACCOUNTS
// =============================================

// Create a new player account
// Password should already be hashed before calling this
function createPlayer(username, passwordHash, email = null) {
  try {
    const stmt = db.prepare(`
      INSERT INTO players (username, password_hash, email)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(username, passwordHash, email);
    return { success: true, playerId: result.lastInsertRowid };
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return { success: false, error: 'Username or email already taken.' };
    }
    console.error('[DB] createPlayer error:', err.message);
    return { success: false, error: 'Database error.' };
  }
}

// Fetch player by username for login
function getPlayerByUsername(username) {
  const stmt = db.prepare(`
    SELECT id, username, password_hash, email, nsfw_enabled, settings
    FROM players
    WHERE username = ?
  `);
  return stmt.get(username) || null;
}

// Fetch player by ID
function getPlayerById(playerId) {
  const stmt = db.prepare(`
    SELECT id, username, email, nsfw_enabled, settings, created_at, last_login
    FROM players
    WHERE id = ?
  `);
  return stmt.get(playerId) || null;
}

// Update last login timestamp
function recordLogin(playerId) {
  const stmt = db.prepare(`
    UPDATE players SET last_login = datetime('now') WHERE id = ?
  `);
  stmt.run(playerId);
}

// Update player NSFW setting
function setNSFWSetting(playerId, enabled) {
  const stmt = db.prepare(`
    UPDATE players SET nsfw_enabled = ? WHERE id = ?
  `);
  stmt.run(enabled ? 1 : 0, playerId);
}

// Update player settings JSON
function updatePlayerSettings(playerId, settings) {
  const stmt = db.prepare(`
    UPDATE players SET settings = ? WHERE id = ?
  `);
  stmt.run(JSON.stringify(settings), playerId);
}


// =============================================
// REMEMBER TOKENS
// Persistent login tokens for "remember me"
// =============================================

// Store a remember-me token for persistent login
function storeRememberToken(playerId, token) {
  try {
    // Delete any existing tokens for this player (one active token per player)
    const deleteStmt = db.prepare(`
      DELETE FROM remember_tokens WHERE player_id = ?
    `);
    deleteStmt.run(playerId);

    // Insert new token with 30-day expiry
    const stmt = db.prepare(`
      INSERT INTO remember_tokens (player_id, token, expires_at)
      VALUES (?, ?, datetime('now', '+30 days'))
    `);
    stmt.run(playerId, token);
    return true;
  } catch (err) {
    console.error('[DB] storeRememberToken error:', err.message);
    return false;
  }
}

// Get player by remember token (for auto-login)
function getPlayerByRememberToken(token) {
  const stmt = db.prepare(`
    SELECT p.id, p.username, p.email, p.nsfw_enabled, p.settings
    FROM players p
    JOIN remember_tokens rt ON p.id = rt.player_id
    WHERE rt.token = ? AND rt.expires_at > datetime('now')
  `);
  return stmt.get(token) || null;
}

// Delete a remember token (for logout)
function deleteRememberToken(token) {
  const stmt = db.prepare(`
    DELETE FROM remember_tokens WHERE token = ?
  `);
  stmt.run(token);
}

// Clean up expired remember tokens
function cleanExpiredRememberTokens() {
  const stmt = db.prepare(`
    DELETE FROM remember_tokens WHERE expires_at < datetime('now')
  `);
  const result = stmt.run();
  if (result.changes > 0) {
    console.log(`[DB] Cleaned ${result.changes} expired remember token(s).`);
  }
}


// =============================================
// GAME SAVES
// =============================================

// Save game state to a slot
function saveGame(playerId, slot, state) {
  const level     = state.totalXP ? require('../game/character').getPlayerLevel(state.totalXP) : 1;
  const charName  = state.character ? state.character.description : null;
  const region    = state.character ? state.character.region : null;
  const stateJson = serializeState(state);

  const stmt = db.prepare(`
    INSERT INTO saves (player_id, slot, character_name, region, level, state_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(player_id, slot) DO UPDATE SET
      character_name = excluded.character_name,
      region         = excluded.region,
      level          = excluded.level,
      state_json     = excluded.state_json,
      updated_at     = datetime('now')
  `);

  try {
    const result = stmt.run(playerId, slot, charName, region, level, stateJson);
    return { success: true, saveId: result.lastInsertRowid };
  } catch (err) {
    console.error('[DB] saveGame error:', err.message);
    return { success: false, error: 'Failed to save game.' };
  }
}

// Load game state from a slot
function loadGame(playerId, slot) {
  const stmt = db.prepare(`
    SELECT id, state_json, updated_at, level, region, character_name
    FROM saves
    WHERE player_id = ? AND slot = ?
  `);
  const row = stmt.get(playerId, slot);
  if (!row) return null;

  return {
    saveId:        row.id,
    state:         deserializeState(row.state_json),
    updatedAt:     row.updated_at,
    level:         row.level,
    region:        row.region,
    characterName: row.character_name
  };
}

// Load game state by save ID (for auto-login)
function loadSaveById(saveId) {
  const stmt = db.prepare(`
    SELECT id, player_id, slot, state_json, updated_at, level, region, character_name
    FROM saves
    WHERE id = ?
  `);
  const row = stmt.get(saveId);
  if (!row) return null;

  return {
    saveId:        row.id,
    playerId:      row.player_id,
    slot:          row.slot,
    state:         deserializeState(row.state_json),
    updatedAt:     row.updated_at,
    level:         row.level,
    region:        row.region,
    characterName: row.character_name
  };
}

// Get all save slots for a player (summary only, no full state)
function getSaveSlots(playerId) {
  const stmt = db.prepare(`
    SELECT id, slot, character_name, region, level, updated_at
    FROM saves
    WHERE player_id = ?
    ORDER BY slot ASC
  `);
  return stmt.all(playerId);
}

// Alias for getSaveSlots (server.js uses getSaves in some places)
function getSaves(playerId) {
  return getSaveSlots(playerId);
}

// Alias for loadSaveById (server.js uses loadSave in auto-login)
function loadSave(saveId) {
  return loadSaveById(saveId);
}

// Delete a save slot
function deleteSave(playerId, slot) {
  const stmt = db.prepare(`
    DELETE FROM saves WHERE player_id = ? AND slot = ?
  `);
  const result = stmt.run(playerId, slot);
  return result.changes > 0;
}

// Get save ID for a player/slot
function getSaveId(playerId, slot) {
  const stmt = db.prepare(`
    SELECT id FROM saves WHERE player_id = ? AND slot = ?
  `);
  const row = stmt.get(playerId, slot);
  return row ? row.id : null;
}


// =============================================
// STORY HISTORY
// =============================================

// Append a story entry
function appendStoryHistory(saveId, actionCount, playerInput, aiResponse, sceneContext = null) {
  const stmt = db.prepare(`
    INSERT INTO story_history (save_id, action_count, player_input, ai_response, scene_context)
    VALUES (?, ?, ?, ?, ?)
  `);
  try {
    stmt.run(saveId, actionCount, playerInput, aiResponse, sceneContext);
    return true;
  } catch (err) {
    console.error('[DB] appendStoryHistory error:', err.message);
    return false;
  }
}

// Get recent story history for display
function getRecentHistory(saveId, limit = 20) {
  const stmt = db.prepare(`
    SELECT action_count, player_input, ai_response, scene_context, created_at
    FROM story_history
    WHERE save_id = ?
    ORDER BY action_count DESC
    LIMIT ?
  `);
  return stmt.all(saveId, limit).reverse();
}

// Get total action count for a save
function getActionCount(saveId) {
  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM story_history WHERE save_id = ?
  `);
  const row = stmt.get(saveId);
  return row ? row.count : 0;
}

// Trim old history to keep DB size manageable
// Keeps most recent N entries per save
function trimHistory(saveId, keepCount = 200) {
  const stmt = db.prepare(`
    DELETE FROM story_history
    WHERE save_id = ? AND id NOT IN (
      SELECT id FROM story_history
      WHERE save_id = ?
      ORDER BY action_count DESC
      LIMIT ?
    )
  `);
  stmt.run(saveId, saveId, keepCount);
}


// =============================================
// GUEST SESSIONS
// Temporary saves for players not logged in.
// =============================================

function saveGuestSession(sessionId, state) {
  const stateJson = serializeState(state);
  const stmt      = db.prepare(`
    INSERT INTO guest_sessions (session_id, state_json, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(session_id) DO UPDATE SET
      state_json = excluded.state_json,
      updated_at = datetime('now')
  `);
  try {
    stmt.run(sessionId, stateJson);
    return true;
  } catch (err) {
    console.error('[DB] saveGuestSession error:', err.message);
    return false;
  }
}

function loadGuestSession(sessionId) {
  const stmt = db.prepare(`
    SELECT state_json, updated_at
    FROM guest_sessions
    WHERE session_id = ?
  `);
  const row = stmt.get(sessionId);
  if (!row) return null;

  return {
    state:     deserializeState(row.state_json),
    updatedAt: row.updated_at
  };
}

function deleteGuestSession(sessionId) {
  const stmt = db.prepare(`
    DELETE FROM guest_sessions WHERE session_id = ?
  `);
  stmt.run(sessionId);
}

// Clean up guest sessions older than 24 hours
function cleanExpiredGuestSessions() {
  const stmt = db.prepare(`
    DELETE FROM guest_sessions
    WHERE updated_at < datetime('now', '-24 hours')
  `);
  const result = stmt.run();
  if (result.changes > 0) {
    console.log(`[DB] Cleaned ${result.changes} expired guest session(s).`);
  }
}


// =============================================
// MAINTENANCE
// =============================================

// Run cleanup tasks — call periodically
function runMaintenance() {
  cleanExpiredGuestSessions();
  cleanExpiredRememberTokens();

  // Trim history for all saves to keep DB lean
  const saves = db.prepare('SELECT id FROM saves').all();
  for (const save of saves) {
    trimHistory(save.id, 200);
  }

  console.log('[DB] Maintenance complete.');
}

// Get basic DB stats for monitoring
function getStats() {
  const players      = db.prepare('SELECT COUNT(*) as c FROM players').get().c;
  const saves        = db.prepare('SELECT COUNT(*) as c FROM saves').get().c;
  const guestSessions= db.prepare('SELECT COUNT(*) as c FROM guest_sessions').get().c;
  const historyRows  = db.prepare('SELECT COUNT(*) as c FROM story_history').get().c;

  return { players, saves, guestSessions, historyRows };
}

// Close database connection cleanly on shutdown
function closeDatabase() {
  db.close();
  console.log('[DB] Connection closed.');
}


// =============================================
// INITIALIZATION
// =============================================
initializeSchema();

// Run guest session cleanup on startup
cleanExpiredGuestSessions();

// Schedule maintenance every 6 hours
setInterval(runMaintenance, 6 * 60 * 60 * 1000);


module.exports = {
  // Players
  createPlayer,
  getPlayerByUsername,
  getPlayerById,
  recordLogin,
  setNSFWSetting,
  updatePlayerSettings,

  // Remember tokens
  storeRememberToken,
  getPlayerByRememberToken,
  deleteRememberToken,
  cleanExpiredRememberTokens,

  // Saves
  saveGame,
  loadGame,
  loadSaveById,
  getSaveSlots,
  getSaves,       // alias for getSaveSlots
  loadSave,       // alias for loadSaveById
  deleteSave,
  getSaveId,

  // History
  appendStoryHistory,
  getRecentHistory,
  getActionCount,
  trimHistory,

  // Guest sessions
  saveGuestSession,
  loadGuestSession,
  deleteGuestSession,
  cleanExpiredGuestSessions,

  // Maintenance
  runMaintenance,
  getStats,
  closeDatabase
};