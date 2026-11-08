'use strict';

// =============================================================
// Worlds, generations and the three paths after the main story:
//   A) continue as the same character
//   B) a new character in the same (changed) world, years later
//   C) a brand-new, independent world
// plus listing worlds/characters and resuming an archived character.
// Nothing is ever deleted: switching characters archives the old one.
// =============================================================

const chronicle = require('../../../game/chronicle');
const { extraPanels } = require('../extra-panels');

module.exports = function registerWorldRoutes(app, deps) {
  const {
    db, worldStore, requireSession, setSession, persistSession, newCreationState,
    buildCharacterPanelData, buildProgressionPanelData, buildEconomyPanelData, buildRightPanelData, buildBoardDisplayData,
    isInCreation, getPlayerLevel
  } = deps;

  function panels(state) {
    return {
      character: buildCharacterPanelData(state), progression: buildProgressionPanelData(state),
      economy: buildEconomyPanelData(state), rightPanel: buildRightPanelData(state), board: buildBoardDisplayData(state),
      ...extraPanels(state, isInCreation(state)), inCreation: isInCreation(state), creationPhase: state.creation ? state.creation.phase : null
    };
  }

  function ownerKeys(req) {
    const keys = [`guest:${req.sessionId}`];
    if (req.session.playerId) keys.push(`player:${req.session.playerId}`);
    return keys;
  }

  // Sets the current character aside (archive + legend record). Never deletes.
  function archiveCurrent(req, { asLegend = false } = {}) {
    const st = req.session.state;
    if (!st || !st.character || !st.character.region || isInCreation(st)) return null;
    const world = chronicle.worldOf(st);
    if (world && (asLegend || world.ending || st.deceased)) {
      chronicle.recordFigure(world, st, { status: st.deceased ? 'deceased' : (st.longevity && st.longevity.immortal ? 'immortal' : 'active') });
    }
    if (!st.characterId && world) chronicle.ensureCharacterIdentity(st, world);
    db.archiveCharacter(st.characterId, worldStore.ownerKeyOf(req.session, req.sessionId), st.worldId || null, st.character.name, getPlayerLevel(st.totalXP || 0), st);
    if (world) worldStore.persist(st, req.session, req.sessionId);
    return st.characterId;
  }

  function freeSlot(playerId, current) {
    const used = new Set(db.getSaveSlots(playerId).map(s => s.slot));
    for (let s = 1; s <= 3; s++) if (!used.has(s)) return s;
    return current || 1;
  }

  /**
   * mode 'same': new character in this world, `years` later (0–200).
   * mode 'new' : a new independent world.
   */
  async function startNewCharacter(req, { mode, years = 20, worldName = null }) {
    const st = req.session.state;
    const world = chronicle.worldOf(st);
    if (mode === 'same') {
      if (!world) return { status: 400, error: 'There is no world to continue.' };
      if (!world.ending && !st.deceased) return { status: 400, error: 'A new character can join this world once its great story has ended (or its hero has died). Start a new world instead, or finish the tale.' };
    }
    const archivedId = archiveCurrent(req, { asLegend: true });
    const fresh = newCreationState();
    if (st && st.nsfwEnabled === false) fresh.nsfwEnabled = false;

    let target;
    if (mode === 'same') {
      target = world;
      const y = Math.max(0, Math.min(200, Math.floor(Number(years) || 0)));
      if (y > 0) {
        // The years pass for everyone: people age, die, are succeeded; crises come and go.
        target.calendar.hour = chronicle.nowHour(target) + y * chronicle.DAYS_PER_YEAR * chronicle.HOURS_PER_DAY;
        chronicle.evolve(target, null);
        chronicle.addEvent(target, { type: 'era', title: `${y} years pass`, text: `A new generation comes of age in ${target.era.name}.` });
      }
    } else {
      target = worldStore.createWorld(worldStore.ownerKeyOf(req.session, req.sessionId), worldName ? String(worldName).slice(0, 60) : null);
    }
    fresh.worldId = target.id;
    chronicle.attachWorld(fresh, target);

    req.session.state = fresh;
    if (req.session.playerId) req.session.saveSlot = freeSlot(req.session.playerId, req.session.saveSlot);
    req.session.saveId = null;
    req.session.stateSnapshot = null;
    req.session.undoLocked = false;
    setSession(req.sessionId, req.session);
    await persistSession(req.sessionId);
    const intro = mode === 'same'
      ? `${target.era.name}, ${chronicle.formatDate(chronicle.nowHour(target))}. ${target.realm ? `${target.realm.title} holds the realm. ` : ''}Somewhere in this changed world, someone new is about to begin.\n\n`
      : `A new world: ${target.name}. Nothing that happened elsewhere has happened here.\n\n`;
    return { status: 200, body: { success: true, mode, worldId: target.id, archivedCharacterId: archivedId, output: intro + (fresh.creationPrompt || ''), ...panels(fresh) } };
  }

  async function resumeCharacter(req, characterId) {
    const row = db.loadArchivedCharacter(characterId);
    if (!row || !ownerKeys(req).includes(row.owner_key)) return { status: 404, error: 'No such character in your archive.' };
    if (req.session.state && req.session.state.characterId === characterId) return { status: 400, error: 'That character is already in play.' };
    archiveCurrent(req);
    const state = row.state;
    req.session.state = state;
    worldStore.bind(state, req.session, req.sessionId);
    if (req.session.playerId) req.session.saveSlot = req.session.saveSlot || freeSlot(req.session.playerId, 1);
    req.session.saveId = null;
    req.session.stateSnapshot = null;
    setSession(req.sessionId, req.session);
    await persistSession(req.sessionId);
    db.removeArchivedCharacter(characterId);
    const w = chronicle.worldOf(state);
    return { status: 200, body: { success: true, output: `You take up the life of ${state.character.name} again. ${w ? chronicle.formatDate(chronicle.nowHour(w)) : ''}`, ...panels(state) } };
  }

  function worldSummary(req) {
    const st = req.session.state;
    const w = chronicle.worldOf(st);
    return {
      current: w ? {
        id: w.id, name: w.name, date: chronicle.formatDate(chronicle.nowHour(w)), era: w.era.name,
        realm: w.realm ? w.realm.title : null, ending: w.ending,
        figures: w.figures.map(f => ({ id: f.characterId, name: f.name, title: f.title, status: chronicle.figureStatus(f, w), appearance: f.snapshot ? { ...f.snapshot, choices: undefined } : null })),
        crises: (w.crises || []).filter(c => c.status === 'active').map(c => ({ title: c.title, region: c.region, level: c.level })),
        history: w.history.slice(-40)
      } : null,
      worlds: db.listWorlds(ownerKeys(req)),
      archived: db.listArchivedCharacters(ownerKeys(req))
    };
  }

  app.get('/api/world', requireSession, (req, res) => res.json({ success: true, ...worldSummary(req) }));

  app.post('/api/world/continue', requireSession, async (req, res) => {
    const st = req.session.state;
    if (!st.campaign || !st.campaign.ending) return res.status(400).json({ error: 'Your story has not reached its end yet.' });
    st.campaign.afterEnding = 'continue';
    await persistSession(req.sessionId);
    res.json({ success: true, output: `${st.character.name}'s story goes on. The world is changed, and so are you: sagas, crises, the rift, and the realm itself await. ("sagas", "crises", "chronicle", "titles")`, ...panels(st) });
  });

  app.post('/api/world/new-character', requireSession, async (req, res) => {
    const { mode = 'same', years = 20, worldName = null } = req.body || {};
    if (!['same', 'new'].includes(mode)) return res.status(400).json({ error: 'mode must be "same" or "new".' });
    try {
      const r = await startNewCharacter(req, { mode, years, worldName });
      if (r.error) return res.status(r.status).json({ error: r.error });
      res.json(r.body);
    } catch (e) {
      console.error('[World] new character failed:', e);
      res.status(500).json({ error: 'Could not start a new character.' });
    }
  });

  app.post('/api/world/resume', requireSession, async (req, res) => {
    const { characterId } = req.body || {};
    if (!characterId || typeof characterId !== 'string') return res.status(400).json({ error: 'characterId required.' });
    const r = await resumeCharacter(req, characterId);
    if (r.error) return res.status(r.status).json({ error: r.error });
    res.json(r.body);
  });

  return { startNewCharacter, resumeCharacter, archiveCurrent, worldSummary };
};
