'use strict';

const { extraPanels } = require('../extra-panels');

module.exports = function registerAuthRoutes(app, deps) {
  const {
    db,
    uuidv4,
    hashPassword,
    verifyPassword,
    setSession,
    getSession,
    persistSession,
    newCreationState,
    isReady,
    isInCreation,
    buildOpeningPrompt,
    buildCharacterPanelData,
    buildProgressionPanelData,
    buildEconomyPanelData,
    buildRightPanelData,
    buildBoardDisplayData
  } = deps;

  function panels(state) {
    return {
      character:   buildCharacterPanelData(state),
      progression: buildProgressionPanelData(state),
      economy:     buildEconomyPanelData(state),
      rightPanel:  buildRightPanelData(state),
      board:       buildBoardDisplayData(state),
      ...extraPanels(state, !state.character || !state.character.region || (state.creation && state.creation.phase < 5))
    };
  }

  // Everything the client needs to resume play after any auth step.
  function sessionPayload(sessionId, state, extra = {}) {
    const inCreation = isInCreation(state);
    return {
      success:      true,
      sessionId,
      inCreation,
      isReady:      isReady(state),
      hasCharacter: isReady(state),
      creationPhase: state.creation ? state.creation.phase : null,
      // Re-show the current creation question so the client never sits on a blank prompt.
      output:       inCreation && (!state.creation.phase || state.creation.phase <= 1) ? buildOpeningPrompt() : undefined,
      storySummary: state.storySummary || '',
      ...panels(state),
      ...extra
    };
  }

  // Pick the state a newly logged-in session should play:
  //   1. a finished guest character from this browser, saved into a free slot
  //      (or slot 1 only if the account has no saves at all)
  //   2. otherwise the account's most recently played save
  //   3. otherwise a brand-new character at the first creation question
  function resolveLoginState(playerId, guestSessionId) {
    const slots     = db.getSaveSlots(playerId);
    const usedSlots = new Set(slots.map(s => s.slot));

    if (guestSessionId) {
      const live  = getSession(guestSessionId);
      const guest = live && !live.playerId ? { state: live.state } : db.loadGuestSession(guestSessionId);
      if (guest && isReady(guest.state)) {
        const freeSlot = [1, 2, 3].find(n => !usedSlots.has(n));
        if (freeSlot) {
          db.deleteGuestSession(guestSessionId);
          return { state: guest.state, slot: freeSlot, carriedGuest: true };
        }
      }
    }

    const latest = db.getLatestSave(playerId);
    if (latest) {
      const slot = slots.find(s => s.id === latest.saveId);
      return { state: latest.state, slot: slot ? slot.slot : 1, saveId: latest.saveId };
    }

    return { state: newCreationState(), slot: 1 };
  }

  app.post('/api/auth/register', async (req, res) => {
    const { username, password, email } = req.body || {};

    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Username and password required.' });
    }
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 3-20 characters.' });
    }
    if (!/^[A-Za-z0-9_.-]+$/.test(username)) {
      return res.status(400).json({ error: 'Username may only contain letters, numbers, and _ . -' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const hash   = await hashPassword(password);
    const result = db.createPlayer(username, hash, email || null);

    if (!result.success) {
      return res.status(409).json({ error: result.error });
    }

    res.json({ success: true, playerId: result.playerId });
  });

  app.post('/api/auth/login', async (req, res) => {
    const { username, password, sessionId, rememberMe } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required.' });
    }

    const player = db.getPlayerByUsername(username);
    if (!player) return res.status(401).json({ error: 'Invalid credentials.' });

    const valid = await verifyPassword(password, player.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });

    db.recordLogin(player.id);

    const resolved     = resolveLoginState(player.id, sessionId);
    const newSessionId = uuidv4();
    setSession(newSessionId, {
      state:    resolved.state,
      playerId: player.id,
      saveSlot: resolved.slot,
      saveId:   resolved.saveId || null
    });
    resolved.state.nsfwEnabled = !!player.nsfw_enabled && ((resolved.state.character && resolved.state.character.age) || 0) >= 18;
    syncContentPrefs(player, resolved.state);
    await persistSession(newSessionId);

    let rememberToken = null;
    if (rememberMe) {
      rememberToken = uuidv4();
      db.storeRememberToken(player.id, rememberToken);
    }

    res.json(sessionPayload(newSessionId, resolved.state, {
      username:     player.username,
      rememberToken,
      saveSlot:     resolved.slot,
      carriedGuest: !!resolved.carriedGuest,
      nsfwEnabled:  !!player.nsfw_enabled
    }));
  });

  app.post('/api/auth/auto-login', async (req, res) => {
    const { rememberToken } = req.body || {};
    if (!rememberToken) return res.status(400).json({ error: 'No token.' });

    const player = db.getPlayerByRememberToken(rememberToken);
    if (!player) return res.status(401).json({ error: 'Token expired or invalid.' });

    const resolved     = resolveLoginState(player.id, null);
    syncContentPrefs(db.getPlayerById(player.id), resolved.state);
    const newSessionId = uuidv4();
    setSession(newSessionId, {
      state:    resolved.state,
      playerId: player.id,
      saveSlot: resolved.slot,
      saveId:   resolved.saveId || null
    });
    await persistSession(newSessionId);

    // Keep the token stable so other tabs/devices stay signed in.
    res.json(sessionPayload(newSessionId, resolved.state, {
      username:     player.username,
      rememberToken,
      autoLoggedIn: true,
      saveSlot:     resolved.slot,
      nsfwEnabled:  !!player.nsfw_enabled
    }));
  });

  // Content preferences belong to the player: the account's choices apply to
  // whichever character is loaded; a guest's choices are kept on first login.
  function syncContentPrefs(player, state) {
    const cp = require('../../../game/content-prefs');
    let settings = {};
    try { settings = JSON.parse((player && player.settings) || '{}'); } catch (e) { settings = {}; }
    if (settings.contentPrefs) cp.applyAccountSettings(state, settings);
    else if (state.contentPrefs && player) {
      settings.contentPrefs = { ...state.contentPrefs };
      settings.adultConfirmed = !!state.adultConfirmed;
      db.updatePlayerSettings(player.id, settings);
    }
  }

  app.post('/api/auth/logout', (req, res) => {
    const { rememberToken } = req.body || {};
    const sessionId = req.headers['x-session-id'];
    if (rememberToken) db.deleteRememberToken(rememberToken);
    if (sessionId) db.deletePlayerSession(sessionId);
    res.json({ success: true });
  });

  app.post('/api/auth/guest', async (req, res) => {
    const existingId = (req.body || {}).sessionId;
    if (existingId) {
      const live     = getSession(existingId);
      const existing = live && !live.playerId ? { state: live.state } : db.loadGuestSession(existingId);
      if (existing) {
        setSession(existingId, { state: existing.state, playerId: null, saveSlot: null, saveId: null });
        return res.json(sessionPayload(existingId, existing.state, { resumed: true }));
      }
    }

    const sessionId = uuidv4();
    const state     = newCreationState();
    setSession(sessionId, { state, playerId: null, saveSlot: null, saveId: null });
    await persistSession(sessionId);

    res.json({ ...sessionPayload(sessionId, state, { resumed: false }), output: buildOpeningPrompt() });
  });
};
