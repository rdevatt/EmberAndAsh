'use strict';

const { extraPanels } = require('../extra-panels');

function stripTrailingPunctuation(value) {
  return String(value || '').trim().replace(/[.!?]+$/g, '').trim();
}

module.exports = function registerSaveRoutes(app, deps) {
  const {
    db,
    worldStore,
    requireSession,
    setSession,
    persistSession,
    createFreshState,
    buildOpeningPrompt,
    buildCharacterPanelData,
    buildRightPanelData,
    buildEconomyPanelData,
    equipCraftedItem,
    sellCraftedItem,
    newCreationState,
    isInCreation,
    buildProgressionPanelData,
    buildBoardDisplayData,
    getPlayerLevel
  } = deps;

  function panels(state) {
    return {
      character:   buildCharacterPanelData(state),
      progression: buildProgressionPanelData(state),
      economy:     buildEconomyPanelData(state),
      rightPanel:  buildRightPanelData(state),
      board:       buildBoardDisplayData(state),
      ...extraPanels(state, isInCreation(state)),
      inCreation:  isInCreation(state)
    };
  }

  // Clears per-action undo/retry data that belongs to a different state.
  function clearActionHistory(session) {
    session.stateSnapshot = null;
    session.lastInput     = null;
    session.lastOutput    = null;
    session.lastEvents    = null;
    session.lastCombatLog = null;
  }

  app.get('/api/saves', requireSession, (req, res) => {
    if (!req.session.playerId) {
      return res.status(401).json({ error: 'Must be logged in to view saves.' });
    }
    const slots = db.getSaveSlots(req.session.playerId);
    res.json({ success: true, slots });
  });

  app.post('/api/saves/load', requireSession, async (req, res) => {
    if (!req.session.playerId) return res.status(401).json({ error: 'Must be logged in.' });
    const slotNum = parseInt((req.body || {}).slot, 10) || 1;
    if (slotNum < 1 || slotNum > 3) return res.status(400).json({ error: 'Slot must be 1, 2, or 3.' });

    // Save the current game before switching away from it.
    await persistSession(req.sessionId);

    const save = db.loadGame(req.session.playerId, slotNum);
    if (!save) return res.status(404).json({ error: 'No save found in that slot.' });

    req.session.state    = save.state;
    req.session.saveSlot = slotNum;
    req.session.saveId   = save.saveId;
    clearActionHistory(req.session);
    setSession(req.sessionId, req.session);
    await persistSession(req.sessionId);

    res.json({
      success: true,
      slot: slotNum,
      ...panels(save.state),
      storySummary: save.state.storySummary || ''
    });
  });

  app.post('/api/saves/save', requireSession, async (req, res) => {
    if (!req.session.playerId) return res.status(401).json({ error: 'Must be logged in.' });

    await persistSession(req.sessionId);
    res.json({ success: true });
  });

  app.post('/api/saves/save-to-slot', requireSession, async (req, res) => {
    if (!req.session.playerId) return res.status(401).json({ error: 'Must be logged in.' });

    const { slot } = req.body;
    const slotNum = parseInt(slot);
    if (!slotNum || slotNum < 1 || slotNum > 3) {
      return res.status(400).json({ error: 'Slot must be 1, 2, or 3.' });
    }

    const result = db.saveGame(req.session.playerId, slotNum, req.session.state);
    if (!result.success) return res.status(500).json({ error: result.error || 'Failed to save.' });
    req.session.saveSlot = slotNum;
    req.session.saveId   = result.saveId;
    setSession(req.sessionId, req.session);
    await persistSession(req.sessionId);

    res.json({ success: true, slot: slotNum });
  });

  app.get('/api/saves/all', requireSession, (req, res) => {
    if (!req.session.playerId) {
      return res.json({ success: true, slots: [], isGuest: true });
    }

    const slots = [];
    for (let i = 1; i <= 3; i++) {
      const save = db.loadGame(req.session.playerId, i);
      if (save && save.state) {
        const s = save.state;
        const c = s.character || {};
        const { BACKGROUNDS, REGIONS } = require('../../../game/constants');
        slots.push({
          slot: i,
          empty: false,
          inCreation: isInCreation(s),
          name: c.name || 'Unnamed',
          background: (BACKGROUNDS[c.background] && BACKGROUNDS[c.background].label) || c.background || '—',
          level: getPlayerLevel(s.totalXP || 0),
          region: (REGIONS[c.region] && REGIONS[c.region].label) || c.region || '—',
          saveId: save.saveId,
          updatedAt: save.updatedAt || null
        });
      } else {
        slots.push({ slot: i, empty: true });
      }
    }

    res.json({ success: true, slots, currentSlot: req.session.saveSlot || 1 });
  });

  // Starts a new character in the current slot (the client confirms first).
  app.post('/api/game/reset', requireSession, async (req, res) => {
    // Never discard a character: the one being replaced goes to the archive
    // (resumable from the Worlds menu). The new one starts in a fresh world.
    const old = req.session.state;
    if (old && old.character && old.character.region && !isInCreation(old)) {
      const { getPlayerLevel } = require('../../../game/character');
      db.archiveCharacter(old.characterId || `c_legacy_${Date.now()}`, req.session.playerId ? `player:${req.session.playerId}` : `guest:${req.sessionId}`, old.worldId || null, old.character.name, getPlayerLevel(old.totalXP || 0), old);
      if (worldStore) worldStore.persist(old, req.session, req.sessionId);
    }
    const freshState = newCreationState();
    if (req.session.state && req.session.state.nsfwEnabled === false) freshState.nsfwEnabled = false;
    require('../../../game/content-prefs').inherit(req.session.state, freshState);

    req.session.state    = freshState;
    req.session.saveSlot = req.session.playerId ? (req.session.saveSlot || 1) : null;
    req.session.saveId   = null;
    clearActionHistory(req.session);
    setSession(req.sessionId, req.session);
    await persistSession(req.sessionId);

    res.json({ success: true, sessionId: req.sessionId, output: buildOpeningPrompt(), ...panels(freshState) });
  });

  // Creation "Back" button: rewind the server to an earlier creation phase
  // so the client and server never disagree about which question is next.
  app.post('/api/creation/back', requireSession, async (req, res) => {
    const state = req.session.state;
    if (!isInCreation(state)) return res.status(400).json({ error: 'Character creation is already complete.' });
    const target = parseInt((req.body || {}).phase, 10);
    if (!target || target < 1 || target >= (state.creation.phase || 1)) {
      return res.status(400).json({ error: 'Can only go back to an earlier creation step.' });
    }
    state.creation.phase = target;
    if (target <= 3) delete state.creation.customGear;
    setSession(req.sessionId, req.session);
    await persistSession(req.sessionId);
    res.json({ success: true, creationPhase: target });
  });

  app.post('/api/game/equip-crafted', requireSession, async (req, res) => {
    const normalizedItemName = stripTrailingPunctuation(req.body.itemName);
    if (!normalizedItemName) return res.status(400).json({ error: 'itemName required.' });

    const state = req.session.state;
    const result = equipCraftedItem(state, normalizedItemName);
    setSession(req.sessionId, req.session);
    if (result.success) await persistSession(req.sessionId);

    res.json({
      success: result.success,
      message: result.message,
      economy: buildEconomyPanelData(state),
      character: buildCharacterPanelData(state)
    });
  });

  app.post('/api/game/sell-crafted', requireSession, async (req, res) => {
    const normalizedItemName = stripTrailingPunctuation(req.body.itemName);
    if (!normalizedItemName) return res.status(400).json({ error: 'itemName required.' });

    const state = req.session.state;
    const result = sellCraftedItem(state, normalizedItemName);
    setSession(req.sessionId, req.session);
    if (result.success) await persistSession(req.sessionId);

    res.json({
      success: result.success,
      message: result.message,
      amount: result.amount,
      display: result.display,
      economy: buildEconomyPanelData(state),
      character: buildCharacterPanelData(state)
    });
  });
};
