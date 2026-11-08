'use strict';

module.exports = function registerSettingsRoutes(app, deps) {
  const { db, requireSession, setSession, persistSession } = deps;

  app.post('/api/settings/nsfw', requireSession, async (req, res) => {
    const { enabled } = req.body || {};
    const state = req.session.state;
    const age   = state.character && state.character.age;
    // Adult content is never enabled for a character under 18.
    if (enabled && age && age < 18) {
      return res.status(400).json({ error: 'Adult content is unavailable for characters under 18.', nsfwEnabled: false });
    }
    state.nsfwEnabled = !!enabled;
    setSession(req.sessionId, req.session);
    await persistSession(req.sessionId);

    if (req.session.playerId) {
      db.setNSFWSetting(req.session.playerId, !!enabled);
    }

    res.json({ success: true, nsfwEnabled: !!enabled });
  });
};
