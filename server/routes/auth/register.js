'use strict';

module.exports = function registerAuthRoutes(app, deps) {
  const {
    db,
    uuidv4,
    hashPassword,
    verifyPassword,
    setSession,
    createFreshState,
    isReady,
    isInCreation,
    buildOpeningPrompt
  } = deps;

  app.post('/api/auth/register', async (req, res) => {
    const { username, password, email } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required.' });
    }
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 3-20 characters.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const hash = await hashPassword(password);
    const result = db.createPlayer(username, hash, email || null);

    if (!result.success) {
      return res.status(409).json({ error: result.error });
    }

    res.json({ success: true, playerId: result.playerId });
  });

  app.post('/api/auth/login', async (req, res) => {
    const { username, password, sessionId, rememberMe } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required.' });
    }

    const player = db.getPlayerByUsername(username);
    if (!player) return res.status(401).json({ error: 'Invalid credentials.' });

    const valid = await verifyPassword(password, player.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });

    db.recordLogin(player.id);

    let state = null;
    if (sessionId) {
      const guest = db.loadGuestSession(sessionId);
      if (guest && isReady(guest.state)) {
        state = guest.state;
        db.deleteGuestSession(sessionId);
      }
    }

    const newSessionId = uuidv4();
    setSession(newSessionId, {
      state: state || createFreshState(),
      playerId: player.id,
      saveSlot: 1,
      saveId: null
    });

    let rememberToken = null;
    if (rememberMe) {
      rememberToken = uuidv4();
      db.storeRememberToken(player.id, rememberToken);
    }

    res.json({
      success: true,
      sessionId: newSessionId,
      username: player.username,
      rememberToken,
      nsfwEnabled: !!player.nsfw_enabled
    });
  });

  app.post('/api/auth/auto-login', async (req, res) => {
    const { rememberToken } = req.body;
    if (!rememberToken) return res.status(400).json({ error: 'No token.' });

    const player = db.getPlayerByRememberToken(rememberToken);
    if (!player) return res.status(401).json({ error: 'Token expired or invalid.' });

    const saves = db.getSaves(player.id);
    let state = null;
    if (saves && saves.length > 0) {
      const latest = saves.sort((a, b) => b.updated_at - a.updated_at)[0];
      const loaded = db.loadSave(latest.id);
      if (loaded) state = loaded.state;
    }

    const newSessionId = uuidv4();
    setSession(newSessionId, {
      state: state || createFreshState(),
      playerId: player.id,
      saveSlot: 1,
      saveId: null
    });

    const newToken = uuidv4();
    db.storeRememberToken(player.id, newToken);

    res.json({
      success: true,
      sessionId: newSessionId,
      username: player.username,
      rememberToken: newToken,
      autoLoggedIn: true,
      hasCharacter: state && isReady(state),
      storySummary: state ? (state.storySummary || '') : '',
      nsfwEnabled: !!player.nsfw_enabled
    });
  });

  app.post('/api/auth/guest', (req, res) => {
    const sessionId = uuidv4();
    const state = createFreshState();

    const existingId = req.body.sessionId;
    if (existingId) {
      const existing = db.loadGuestSession(existingId);
      if (existing) {
        setSession(existingId, { state: existing.state, playerId: null, saveSlot: null, saveId: null });
        return res.json({
          success: true,
          sessionId: existingId,
          resumed: true,
          inCreation: isInCreation(existing.state),
          isReady: isReady(existing.state),
          storySummary: existing.state.storySummary || ''
        });
      }
    }

    state.creation.phase = 1;
    state.creationPrompt = buildOpeningPrompt();
    setSession(sessionId, { state, playerId: null, saveSlot: null, saveId: null });

    res.json({ success: true, sessionId, resumed: false, output: buildOpeningPrompt() });
  });
};
