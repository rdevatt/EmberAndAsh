'use strict';

function stripTrailingPunctuation(value) {
  return String(value || '').trim().replace(/[.!?]+$/g, '').trim();
}

module.exports = function registerSaveRoutes(app, deps) {
  const {
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
  } = deps;

  app.get('/api/saves', requireSession, (req, res) => {
    if (!req.session.playerId) {
      return res.status(401).json({ error: 'Must be logged in to view saves.' });
    }
    const slots = db.getSaveSlots(req.session.playerId);
    res.json({ success: true, slots });
  });

  app.post('/api/saves/load', requireSession, (req, res) => {
    const { slot } = req.body;
    if (!req.session.playerId) return res.status(401).json({ error: 'Must be logged in.' });

    const save = db.loadGame(req.session.playerId, slot || 1);
    if (!save) return res.status(404).json({ error: 'No save found in that slot.' });

    req.session.state = save.state;
    req.session.saveSlot = slot || 1;
    req.session.saveId = save.saveId;
    setSession(req.sessionId, req.session);

    res.json({
      success: true,
      character: buildCharacterPanelData(save.state),
      rightPanel: buildRightPanelData(save.state),
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

    db.saveGame(req.session.playerId, slotNum, req.session.state);
    req.session.saveSlot = slotNum;
    setSession(req.sessionId, req.session);

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
        const lvl = s.totalXP ? Math.floor(Math.sqrt(s.totalXP / 10)) + 1 : 1;
        slots.push({
          slot: i,
          empty: false,
          name: c.name || 'Unnamed',
          background: c.background || '—',
          level: Math.min(lvl, 100),
          region: c.region || '—',
          saveId: save.saveId,
          updatedAt: save.updatedAt || null
        });
      } else {
        slots.push({ slot: i, empty: true });
      }
    }

    res.json({ success: true, slots, currentSlot: req.session.saveSlot || 1 });
  });

  app.post('/api/game/reset', requireSession, async (req, res) => {
    const freshState = createFreshState();
    freshState.creation.phase = 1;
    freshState.creationPrompt = buildOpeningPrompt();

    req.session.state = freshState;
    req.session.saveSlot = req.session.saveSlot || 1;
    req.session.saveId = null;
    setSession(req.sessionId, req.session);

    if (req.session.playerId && req.session.saveSlot) {
      db.saveGame(req.session.playerId, req.session.saveSlot, freshState);
    } else {
      db.saveGuestSession(req.sessionId, freshState);
    }

    res.json({ success: true, output: buildOpeningPrompt() });
  });

  app.post('/api/game/equip-crafted', requireSession, (req, res) => {
    const normalizedItemName = stripTrailingPunctuation(req.body.itemName);
    if (!normalizedItemName) return res.status(400).json({ error: 'itemName required.' });

    const state = req.session.state;
    const result = equipCraftedItem(state, normalizedItemName);
    setSession(req.sessionId, req.session);

    res.json({
      success: result.success,
      message: result.message,
      economy: buildEconomyPanelData(state),
      character: buildCharacterPanelData(state)
    });
  });

  app.post('/api/game/sell-crafted', requireSession, (req, res) => {
    const normalizedItemName = stripTrailingPunctuation(req.body.itemName);
    if (!normalizedItemName) return res.status(400).json({ error: 'itemName required.' });

    const state = req.session.state;
    const result = sellCraftedItem(state, normalizedItemName);
    setSession(req.sessionId, req.session);

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
