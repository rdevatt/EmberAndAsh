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
// Use Railway volume (/data) if available, otherwise local ./data directory
// EMBER_DB_PATH overrides everything (used by tests and local experiments).
// Safety: test runs (node --test sets NODE_TEST_CONTEXT) and development shells
// that set EMBER_REQUIRE_DB_PATH=1 must name an explicit, isolated database —
// they can never fall through to the real player database.
if (!process.env.EMBER_DB_PATH && (process.env.NODE_TEST_CONTEXT || process.env.EMBER_REQUIRE_DB_PATH === '1')) {
  throw new Error('[DB] Refusing to open the default (real) database: set EMBER_DB_PATH to an isolated file.');
}
const DB_PATH = process.env.EMBER_DB_PATH
  ? path.resolve(process.env.EMBER_DB_PATH)
  : path.join(fs.existsSync('/data') ? '/data' : path.join(__dirname, '..', 'data'), 'emberandash.db');
const DB_DIR  = path.dirname(DB_PATH);

console.log(`[DB] Database directory: ${DB_DIR}`);
console.log(`[DB] Database path: ${DB_PATH}`);

// Ensure data directory exists (only needed for local dev, /data is created by Railway)
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

    -- Player sessions table
    -- Maps a logged-in session ID to its account + save slot so a session
    -- survives server restarts and idle eviction from the in-memory store.
    -- Persistent worlds: calendar, chronicle, legacy figures, rulers, crises.
    -- One world can host many sequential characters.
    CREATE TABLE IF NOT EXISTS worlds (
      id          TEXT PRIMARY KEY,
      owner_key   TEXT NOT NULL,
      name        TEXT,
      data_json   TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_worlds_owner ON worlds(owner_key);

    -- Characters set aside when the player switches to another character or
    -- world. Nothing is deleted on a switch; any archived character can be
    -- resumed later.
    CREATE TABLE IF NOT EXISTS character_archive (
      character_id TEXT PRIMARY KEY,
      owner_key    TEXT NOT NULL,
      world_id     TEXT,
      name         TEXT,
      level        TEXT,
      state_json   TEXT NOT NULL,
      archived_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_archive_owner ON character_archive(owner_key);

    CREATE TABLE IF NOT EXISTS player_sessions (
      session_id   TEXT    PRIMARY KEY,
      player_id    INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      slot         INTEGER NOT NULL DEFAULT 1,
      updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
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
// tokenHash: the SHA-256 of the token (the raw token is never stored).
// Up to five devices stay signed in; the oldest is dropped beyond that.
function storeRememberToken(playerId, tokenHash) {
  const token = tokenHash;
  try {
    db.prepare(`
      DELETE FROM remember_tokens WHERE player_id = ? AND id NOT IN (
        SELECT id FROM remember_tokens WHERE player_id = ? ORDER BY expires_at DESC LIMIT 4)
    `).run(playerId, playerId);

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
// Looks a token up by its hash. Tokens issued before hashing was introduced
// are accepted once more and upgraded to their hash on the spot.
function getPlayerByRememberToken(tokenHash, rawLegacy = null) {
  const stmt = db.prepare(`
    SELECT p.id, p.username, p.email, p.nsfw_enabled, p.settings
    FROM players p
    JOIN remember_tokens rt ON p.id = rt.player_id
    WHERE rt.token = ? AND rt.expires_at > datetime('now')
  `);
  const found = stmt.get(tokenHash);
  if (found || !rawLegacy) return found || null;
  const legacy = stmt.get(rawLegacy);
  if (legacy) db.prepare('UPDATE remember_tokens SET token = ? WHERE token = ?').run(tokenHash, rawLegacy);
  return legacy || null;
}

// Delete a remember token (for logout): by hash, or a legacy raw token.
function deleteRememberToken(tokenHash, rawLegacy = null) {
  db.prepare('DELETE FROM remember_tokens WHERE token = ? OR token = ?').run(tokenHash, rawLegacy || tokenHash);
}

// Revoke everything for an account: all remember tokens and sessions.
function revokeAllForPlayer(playerId, exceptSessionId = null) {
  db.prepare('DELETE FROM remember_tokens WHERE player_id = ?').run(playerId);
  if (exceptSessionId) db.prepare('DELETE FROM player_sessions WHERE player_id = ? AND session_id <> ?').run(playerId, exceptSessionId);
  else db.prepare('DELETE FROM player_sessions WHERE player_id = ?').run(playerId);
}

function updatePasswordHash(playerId, hash) {
  db.prepare('UPDATE players SET password_hash = ? WHERE id = ?').run(hash, playerId);
}

function getPlayerAuthById(playerId) {
  return db.prepare('SELECT id, username, password_hash FROM players WHERE id = ?').get(playerId) || null;
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
  const charName  = state.character ? (state.character.name || null) : null;
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
    stmt.run(playerId, slot, charName, region, level, stateJson);
    // lastInsertRowid is stale on the UPDATE branch of an upsert — look the row up.
    return { success: true, saveId: getSaveId(playerId, slot) };
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
// PLAYER SESSIONS
// =============================================
function storePlayerSession(sessionId, playerId, slot) {
  db.prepare(`
    INSERT INTO player_sessions (session_id, player_id, slot, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(session_id) DO UPDATE SET
      player_id  = excluded.player_id,
      slot       = excluded.slot,
      updated_at = datetime('now')
  `).run(sessionId, playerId, slot);
}

function getPlayerSession(sessionId) {
  return db.prepare(`
    SELECT session_id, player_id, slot FROM player_sessions
    WHERE session_id = ? AND updated_at > datetime('now', '-30 days')
  `).get(sessionId) || null;
}

function deletePlayerSession(sessionId) {
  db.prepare('DELETE FROM player_sessions WHERE session_id = ?').run(sessionId);
}

// Most recently updated save for a player, or null.
function getLatestSave(playerId) {
  const row = db.prepare(`
    SELECT slot FROM saves WHERE player_id = ?
    ORDER BY updated_at DESC, slot ASC LIMIT 1
  `).get(playerId);
  return row ? loadGame(playerId, row.slot) : null;
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
    WHERE updated_at < datetime('now', '-14 days')
  `);
  const result = stmt.run();
  if (result.changes > 0) {
    console.log(`[DB] Cleaned ${result.changes} expired guest session(s).`);
  }
}


// =============================================
// WORLDS & CHARACTER ARCHIVE
// =============================================
function saveWorld(world, ownerKey) {
  const json = JSON.stringify(world);
  db.prepare(`
    INSERT INTO worlds (id, owner_key, name, data_json, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      owner_key = CASE WHEN excluded.owner_key LIKE 'player:%' THEN excluded.owner_key ELSE worlds.owner_key END,
      name = excluded.name, data_json = excluded.data_json, updated_at = datetime('now')
  `).run(world.id, ownerKey, world.name || null, json);
}

function loadWorld(worldId) {
  const row = db.prepare('SELECT data_json FROM worlds WHERE id = ?').get(worldId);
  if (!row) return null;
  try { return JSON.parse(row.data_json); } catch (e) { console.error('[DB] corrupt world', worldId); return null; }
}

function listWorlds(ownerKeys) {
  const keys = (Array.isArray(ownerKeys) ? ownerKeys : [ownerKeys]).filter(Boolean);
  if (!keys.length) return [];
  return db.prepare(`SELECT id, name, owner_key, data_json, updated_at FROM worlds WHERE owner_key IN (${keys.map(() => '?').join(',')}) ORDER BY updated_at DESC`)
    .all(...keys).map(r => { let d = {}; try { d = JSON.parse(r.data_json); } catch (e) { /* skip */ } return { id: r.id, name: r.name, updatedAt: r.updated_at, day: d.calendar ? d.calendar.day : 0, events: (d.history || []).length, figures: (d.figures || []).length, era: d.era || null }; });
}

function archiveCharacter(characterId, ownerKey, worldId, name, level, state) {
  db.prepare(`
    INSERT INTO character_archive (character_id, owner_key, world_id, name, level, state_json, archived_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(character_id) DO UPDATE SET owner_key = excluded.owner_key, world_id = excluded.world_id,
      name = excluded.name, level = excluded.level, state_json = excluded.state_json, archived_at = datetime('now')
  `).run(characterId, ownerKey, worldId || null, name || null, String(level || 1), serializeState(state));
}

function listArchivedCharacters(ownerKeys) {
  const keys = (Array.isArray(ownerKeys) ? ownerKeys : [ownerKeys]).filter(Boolean);
  if (!keys.length) return [];
  return db.prepare(`SELECT character_id, world_id, name, level, archived_at FROM character_archive WHERE owner_key IN (${keys.map(() => '?').join(',')}) ORDER BY archived_at DESC`).all(...keys);
}

function loadArchivedCharacter(characterId) {
  const row = db.prepare('SELECT * FROM character_archive WHERE character_id = ?').get(characterId);
  return row ? { ...row, state: deserializeState(row.state_json) } : null;
}

// Moving a character back into play: its archive row is replaced by the
// live save, so this only runs after the restored state has been persisted.
function removeArchivedCharacter(characterId) {
  db.prepare('DELETE FROM character_archive WHERE character_id = ?').run(characterId);
}

function reassignOwner(oldKey, newKey) {
  db.prepare('UPDATE worlds SET owner_key = ? WHERE owner_key = ?').run(newKey, oldKey);
  db.prepare('UPDATE character_archive SET owner_key = ? WHERE owner_key = ?').run(newKey, oldKey);
}

// =============================================
// MAINTENANCE
// =============================================

// Run cleanup tasks — call periodically
function runMaintenance() {
  cleanExpiredGuestSessions();
  cleanExpiredRememberTokens();
  db.prepare(`DELETE FROM player_sessions WHERE updated_at < datetime('now', '-30 days')`).run();

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

// Schedule maintenance every 6 hours (unref so tests/scripts can exit)
setInterval(runMaintenance, 6 * 60 * 60 * 1000).unref();


module.exports = {
  revokeAllForPlayer, updatePasswordHash, getPlayerAuthById,
  saveWorld,
  loadWorld,
  listWorlds,
  archiveCharacter,
  listArchivedCharacters,
  loadArchivedCharacter,
  removeArchivedCharacter,
  reassignOwner,
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
  getLatestSave,

  // Player sessions
  storePlayerSession,
  getPlayerSession,
  deletePlayerSession,

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