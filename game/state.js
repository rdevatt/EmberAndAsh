'use strict';

// =============================================================
// EMBER AND ASH — STATE MANAGER
// Creates, validates, and manages player session state.
// No game logic lives here. Only structure and access.
// =============================================================

const { MAX_LEVEL } = require('./constants');


// =============================================
// DEFAULT STATE FACTORY
// Returns a clean state object for a new session.
// Never mutate this directly — always call createFreshState().
// =============================================
function createFreshState() {
  return {

    // --- Session ---
    sessionId:       null,   // UUID assigned on session start
    playerId:        null,   // DB player ID if logged in
    createdAt:       null,   // ISO timestamp
    lastActionAt:    null,   // ISO timestamp of last player input
    actionCount:     0,      // Total actions taken this session

    // --- Character Creation ---
    creation: {
      phase:                0,      // 0=not started, 1=age/gender, 2=background, 3=description, 4=region, 5=done
      age:                  null,
      gender:               null,
      background:           null,
      description:          null,
      region:               null,
      availableBackgrounds: []
    },

    // --- Character Core ---
    character: {
      age:         null,
      gender:      null,
      background:  null,
      region:      null,
      description: null
    },

    // --- Attributes ---
    stats: {
      str: 5,
      dex: 5,
      vit: 5,
      int: 5,
      wis: 5,
      cha: 5
    },

    // --- Resources ---
    hp:          50,
    maxHp:       50,
    mana:        30,
    maxMana:     30,
    stamina:     40,
    maxStamina:  40,

    // --- Progression ---
    totalXP:          0,
    classXP:          0,
    profXP:           0,
    freePoints:       0,
    combatClass:      null,
    classLevel:       0,
    profession:       null,
    professionLevel:  0,
    actionProgress:   {},   // tracks affinity hits toward class/profession unlock

    // --- Combat ---
    inCombat:             false,
    currentEnemy:         null,   // full enemy object when in combat
    pendingCombatResult:  null,   // result object passed to narrative builder

    // --- Scene ---
    sceneContext:    'neutral',   // from SCENE_CONTEXTS keys
    currentLocation: null,        // freeform string — tavern, forest road, etc.
    currentNPC:      null,        // NPC currently being interacted with
    npcRelationships: {},         // npcKey -> { rapport: 0-100, metBefore: bool }

    // --- NSFW ---
    nsfwEnabled:     false,       // player opt-in toggle

    // --- Economy ---
    coin:       0,
    inventory:  [],
    gear: {
      weapon: null,
      armor:  null
    },

    // --- Death ---
    deathCount:    0,
    deathLocation: null,
    savedGear:     null,    // gear saved at death site for recovery

    // --- Reputation ---
    reputation: {},         // regionKey -> -100 to 100

    // --- Shop ---
    shopOpen: false,

    // --- Companions ---
    companions: [],         // future expansion — array of companion objects

    // --- Pending Events ---
    // These are set by game logic and consumed by the narrative builder
    pendingContextHint:    null,
    pendingEnemyKill:      null,
    pendingXP:             0,
    pendingXPType:         'general',
    pendingProfXP:         0,
    pendingCoinGain:       0,
    pendingCoinSpend:      0,
    pendingClassOffer:     null,
    pendingProfOffer:      null,
    pendingProfessionEvent:null,
    showStatScreen:        false,

    // --- Story Summary ---
    // Rolling summary updated by narrative module every N turns
    storySummary:     '',
    summaryUpdatedAt: 0,

    // --- Conversation History ---
    // Rolling last 10 exchanges passed to Groq for continuity
    conversationHistory: []
  };
}


// =============================================
// STATE VALIDATION
// Ensures a loaded state has all required fields.
// Safe to call on states loaded from DB.
// =============================================
function validateState(state) {
  const defaults = createFreshState();

  // Top-level keys
  for (const key of Object.keys(defaults)) {
    if (state[key] === undefined) {
      state[key] = defaults[key];
    }
  }

  // Nested objects — merge missing keys without overwriting existing data
  const nestedKeys = ['creation', 'character', 'stats', 'gear'];
  for (const key of nestedKeys) {
    if (!state[key] || typeof state[key] !== 'object') {
      state[key] = defaults[key];
    } else {
      for (const subKey of Object.keys(defaults[key])) {
        if (state[key][subKey] === undefined) {
          state[key][subKey] = defaults[key][subKey];
        }
      }
    }
  }

  // Arrays
  if (!Array.isArray(state.inventory))  state.inventory  = [];
  if (!Array.isArray(state.companions)) state.companions = [];

  // Objects
  if (!state.reputation      || typeof state.reputation      !== 'object') state.reputation      = {};
  if (!state.actionProgress  || typeof state.actionProgress  !== 'object') state.actionProgress  = {};
  if (!state.npcRelationships|| typeof state.npcRelationships!== 'object') state.npcRelationships= {};

  return state;
}


// =============================================
// RESOURCE HELPERS
// Clamp and update HP, mana, stamina safely.
// =============================================
function clampResources(state) {
  state.hp      = Math.max(0, Math.min(state.hp,      state.maxHp));
  state.mana    = Math.max(0, Math.min(state.mana,    state.maxMana));
  state.stamina = Math.max(0, Math.min(state.stamina, state.maxStamina));
  return state;
}

function isDead(state) {
  return state.hp <= 0;
}

function isInCreation(state) {
  return state.creation.phase < 5;
}

function isReady(state) {
  return state.creation.phase >= 5 && state.character.region !== null;
}


// =============================================
// PENDING EVENT HELPERS
// Clean API for setting and consuming pending events.
// =============================================
function setPendingHint(state, hint) {
  state.pendingContextHint = hint;
}

function consumePendingHint(state) {
  const hint = state.pendingContextHint;
  state.pendingContextHint = null;
  return hint;
}

function setPendingXP(state, amount, type = 'general') {
  state.pendingXP     = (state.pendingXP || 0) + amount;
  state.pendingXPType = type;
}

function setPendingProfXP(state, amount) {
  state.pendingProfXP = (state.pendingProfXP || 0) + amount;
}

function setPendingCoinGain(state, copper) {
  state.pendingCoinGain = (state.pendingCoinGain || 0) + copper;
}

function setPendingCoinSpend(state, copper) {
  state.pendingCoinSpend = (state.pendingCoinSpend || 0) + copper;
}


// =============================================
// NPC RELATIONSHIP HELPERS
// =============================================
function getNPCRapport(state, npcKey) {
  if (!state.npcRelationships[npcKey]) return 0;
  return state.npcRelationships[npcKey].rapport || 0;
}

function changeNPCRapport(state, npcKey, amount) {
  if (!state.npcRelationships[npcKey]) {
    state.npcRelationships[npcKey] = { rapport: 0, metBefore: true };
  }
  const current = state.npcRelationships[npcKey].rapport;
  state.npcRelationships[npcKey].rapport = Math.max(-100, Math.min(100, current + amount));
  state.npcRelationships[npcKey].metBefore = true;
}

function hasMetNPC(state, npcKey) {
  return !!(state.npcRelationships[npcKey] && state.npcRelationships[npcKey].metBefore);
}


// =============================================
// SERIALIZATION
// For saving to and loading from the database.
// =============================================
function serializeState(state) {
  return JSON.stringify(state);
}

function deserializeState(raw) {
  try {
    const parsed = JSON.parse(raw);
    return validateState(parsed);
  } catch (e) {
    console.error('[State] Failed to deserialize state:', e.message);
    return createFreshState();
  }
}


// =============================================
// STATE SNAPSHOTS
// Deep clone state for undo/retry functionality.
// Snapshots exclude transient fields that shouldn't persist.
// =============================================
function createStateSnapshot(state) {
  // Deep clone the entire state
  const snapshot = JSON.parse(JSON.stringify(state));
  
  // Also capture the last combat result if any (for narrative-only retry)
  return {
    state: snapshot,
    timestamp: Date.now()
  };
}

function restoreStateSnapshot(currentState, snapshot) {
  // Restore all properties from snapshot to current state
  // We modify in place to preserve the session reference
  const snapshotState = snapshot.state;
  
  // Clear current state properties
  for (const key of Object.keys(currentState)) {
    if (key !== 'sessionId' && key !== 'playerId') {
      delete currentState[key];
    }
  }
  
  // Copy snapshot properties (except session identifiers)
  for (const key of Object.keys(snapshotState)) {
    if (key !== 'sessionId' && key !== 'playerId') {
      currentState[key] = JSON.parse(JSON.stringify(snapshotState[key]));
    }
  }
  
  return currentState;
}


module.exports = {
  createFreshState,
  validateState,
  clampResources,
  isDead,
  isInCreation,
  isReady,
  setPendingHint,
  consumePendingHint,
  setPendingXP,
  setPendingProfXP,
  setPendingCoinGain,
  setPendingCoinSpend,
  getNPCRapport,
  changeNPCRapport,
  hasMetNPC,
  serializeState,
  deserializeState,
  createStateSnapshot,
  restoreStateSnapshot
};