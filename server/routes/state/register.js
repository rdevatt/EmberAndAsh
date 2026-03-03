'use strict';

module.exports = function registerStateRoutes(app, deps) {
  const {
    db,
    requireSession,
    buildCharacterPanelData,
    buildProgressionPanelData,
    buildEconomyPanelData,
    buildRightPanelData,
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
      inCreation: isInCreation(state),
      isReady: isReady(state)
    });
  });

  app.get('/api/history', requireSession, (req, res) => {
    const saveId = req.session.saveId;
    if (!saveId) return res.json({ success: true, history: [] });

    const history = db.getRecentHistory(saveId, 30);
    res.json({ success: true, history });
  });
};
