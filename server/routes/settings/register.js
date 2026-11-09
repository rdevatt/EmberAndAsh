'use strict';

const contentPrefs = require('../../../game/content-prefs');

module.exports = function registerSettingsRoutes(app, deps) {
  const { db, requireSession, setSession, persistSession } = deps;

  function saveToAccount(req) {
    if (!req.session.playerId) return;
    const player = db.getPlayerById(req.session.playerId);
    let settings = {};
    try { settings = JSON.parse((player && player.settings) || '{}'); } catch (e) { settings = {}; }
    settings.contentPrefs = { ...contentPrefs.ensurePrefs(req.session.state) };
    settings.adultConfirmed = !!req.session.state.adultConfirmed;
    db.updatePlayerSettings(req.session.playerId, settings);
  }

  // Mature content: six categories, each off / mild / mature. Enforced here
  // and wherever content is produced; the UI only reflects it.
  app.get('/api/settings/content', requireSession, (req, res) => {
    res.json({ success: true, ...contentPrefs.describe(req.session.state) });
  });

  app.post('/api/settings/content', requireSession, async (req, res) => {
    const { prefs, adultConfirmed } = req.body || {};
    const state = req.session.state;
    if (adultConfirmed !== undefined) state.adultConfirmed = !!adultConfirmed;
    const result = contentPrefs.updatePrefs(state, prefs || {});
    if (result.rejected.length) return res.status(400).json({ error: 'Invalid content setting.', rejected: result.rejected, ...contentPrefs.describe(state) });
    setSession(req.sessionId, req.session);
    await persistSession(req.sessionId);
    saveToAccount(req);
    res.json({ success: true, ...contentPrefs.describe(state) });
  });

  app.post('/api/settings/nsfw', requireSession, async (req, res) => {
    const { enabled } = req.body || {};
    const state = req.session.state;
    const age   = state.character && state.character.age;
    // Adult content is never enabled for a character under 18.
    if (enabled && age && age < 18) {
      return res.status(400).json({ error: 'Adult content is unavailable for characters under 18.', nsfwEnabled: false });
    }
    // The old single toggle now maps onto the romance and sexual categories.
    if (enabled) state.adultConfirmed = true;
    contentPrefs.updatePrefs(state, enabled ? { romance: 'mature', sexual: 'mature' } : { romance: 'mild', sexual: 'off' });
    state.nsfwEnabled = !!enabled;
    setSession(req.sessionId, req.session);
    saveToAccount(req);
    await persistSession(req.sessionId);

    if (req.session.playerId) {
      db.setNSFWSetting(req.session.playerId, !!enabled);
    }

    res.json({ success: true, nsfwEnabled: !!enabled });
  });
};
