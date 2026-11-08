'use strict';

const { extraPanels } = require('../extra-panels');

module.exports = function registerStateRoutes(app, deps) {
  const {
    db,
    requireSession,
    buildCharacterPanelData,
    buildProgressionPanelData,
    buildEconomyPanelData,
    buildRightPanelData,
    buildBoardDisplayData,
    isInCreation,
    isReady
  } = deps;

  app.get('/api/state', requireSession, (req, res) => {
    const state = req.session.state;
    res.json({
      success: true,
      character: buildCharacterPanelData(state),
      progression: buildProgressionPanelData(state),
      economy: buildEconomyPanelData(state),
      rightPanel: buildRightPanelData(state),
      board: buildBoardDisplayData(state),
      ...extraPanels(state, isInCreation(state)),
      inCreation: isInCreation(state),
      creationPhase: state.creation ? state.creation.phase : null,
      isReady: isReady(state),
      isLoggedIn: !!req.session.playerId,
      saveSlot: req.session.saveSlot || null,
      storySummary: state.storySummary || ''
    });
  });

  app.get('/api/history', requireSession, (req, res) => {
    const saveId = req.session.saveId;
    if (!saveId) return res.json({ success: true, history: [] });

    const history = db.getRecentHistory(saveId, 30);
    res.json({ success: true, history });
  });
};
