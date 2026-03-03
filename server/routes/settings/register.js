'use strict';

module.exports = function registerSettingsRoutes(app, deps) {
  const { db, requireSession, setSession } = deps;

  app.post('/api/settings/nsfw', requireSession, (req, res) => {
    const { enabled } = req.body;
    req.session.state.nsfwEnabled = !!enabled;
    setSession(req.sessionId, req.session);

    if (req.session.playerId) {
      db.setNSFWSetting(req.session.playerId, !!enabled);
    }

    res.json({ success: true, nsfwEnabled: !!enabled });
  });
};
