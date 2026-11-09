'use strict';

const { buildOpeningHint } = require('./utils');
const { resolveCorpseLoot } = require('../../../game/loot');
const { createStateSnapshot, restoreStateSnapshot } = require('../../../game/state');
const { grantXP, getXPForLevel } = require('../../../game/character');
const { getQuestTargets, buildQuestJournal, abandonQuest } = require('../../../game/quests');
const { detectTravelIntent, travelTo, buildMapText, getRevivalRegion } = require('../../../game/travel');
const { applySocialRapport, describeUpgrade } = require('../../../game/economy');
const { buildShopText, buyItem, drinkPotion } = require('../../../game/shop');
const createWorldCommands = require('./world-commands');
const { extraPanels } = require('../extra-panels');
const campaign  = require('../../../game/campaign');
const comps     = require('../../../game/companions');
const factions  = require('../../../game/factions');
const world     = require('../../../game/world');
const tactics   = require('../../../game/combat-tactics');
const chronicle = require('../../../game/chronicle');
const endless   = require('../../../game/endless');
const legacy    = require('../../../game/legacy');
const { buildScene } = require('../../../game/scene');
const appearance = require('../../../game/appearance');
const { getTierForLevelPublic } = { getTierForLevelPublic: (lvl) => { const { GEAR_QUALITIES } = require('../../../game/constants'); let t = 0; for (const q of GEAR_QUALITIES) if (lvl >= q.levelReq) t = q.tier; return t; } };

const MAX_INPUT_LENGTH = 2000;

function stripTrailingPunctuation(value) {
  return String(value || '').trim().replace(/[.!?]+$/g, '').trim();
}

const HELP_TEXT = [
  'HOW TO PLAY',
  'Describe what you do in plain words — "I search the abandoned cart", "I ask the innkeeper about work".',
  'Detailed, tactical combat actions ("I feint left and slash at its knee") hit more often than "attack".',
  '',
  'Story:    story (main quest) · talk to <name> · confront <boss> · choose N · factions',
  'Combat:   attack / fight <target> · defend · <ability name> · cast <spell> · drink potion · flee · inspect',
  '          abilities (list yours) — watch for ⚠ telegraphed attacks and defend against them',
  'After:    loot the body · recover gear (where you died)',
  'World:    explore (places here) · explore <place> · gather · map · travel to <region>',
  'Craft:    recipes · materials · craft <item> ("forge a sword", "brew healing potion", "make a fur-lined cloak") · read spell scroll',
  'Rest:     rest (short) · make camp (full heal, risk of ambush) · rent a room at the inn (safe, costs coin)',
  'Trade:    shop · buy <item> · sell <item> · drink potion / drink mana potion',
  'Quests:   check board · accept quest N · quests · abandon quest N',
  'Gear:     gear / backpack · equip <item> · unequip <item> · drop <item> · repair gear · reforge <item> (blacksmiths)',
  'Growth:   stats · spend point on <stat>   (offers: answer "yes" or "no")',
  'Party:    companions · recruit <name> · hire a sellsword · dismiss <name>',
  'Shop:     open shop · close shop (merchants: sell your own goods)'
].join('\n');

// Words that follow "take"/"grab" in actions that are not item pickups.
const NON_PICKUP_OBJECTS = /^(?:a |an |the |my |some |another )?(?:swing|swipe|stab|shot|break|breath|deep breath|rest|look|peek|glance|step|steps|seat|moment|minute|chance|aim|cover|position|stance|quest|job|contract|bounty|notice|it easy|care|note|turn|walk|stroll|nap|sip|drink|bite|hold|heart|time|offer|deal|lead|charge|point|route|road|path|stairs|risk|guard|watch|stock|aim at|hit|knee)\b/i;

const MAX_LOOSE_COIN = 25; // copper per free-form "take the coins" pickup

module.exports = function registerGameplayRoutes(app, deps) {
  const {
    db,
    REGIONS,
    requireSession,
    persistSession,
    setSession,
    isInCreation,
    isDead,
    processCreationInput,
    buildCharacterPanelData,
    getPlayerLevel,
    spendFreePoint,
    detectCombatIntent,
    detectFleeIntent,
    isPassiveAction,
    applyCombatRound,
    applyFleeAttempt,
    checkAmbientEncounter,
    spawnEnemy,
    buildEnemyInspectData,
    updateActionProgress,
    buildEnemyPanelData,
    resolveProfessionTask,
    processPendingProgressEvents,
    processClassOfferResponse,
    processProfessionOfferResponse,
    buildProgressionPanelData,
    detectCoinIntent,
    addCoin,
    processPendingCoinEvents,
    tryOpenShop,
    tryCloseShop,
    checkShopCustomerEvent,
    recoverGear,
    saveGearAtDeath,
    buildEconomyPanelData,
    changeReputation,
    formatCoin,
    detectEquipIntent,
    processEquipCommand,
    addCompanion,
    removeCompanion,
    detectCompanionIntent,
    getCompanionsDisplay,
    buildBackpackSummary,
    addItem,
    removeItem,
    findInventoryItem,
    hasItem,
    processNarrative,
    buildRightPanelData,
    detectBoardIntent,
    detectQuestAccept,
    getBoardQuests,
    acceptQuestByIndex,
    acceptQuest,
    buildBoardDisplayData,
    buildBoardInspectHint,
    checkQuestProgress,
    processQuestCompletions,
    buildActiveQuestContext
  } = deps;

  // ---------------------------------------------
  // Response helpers
  // ---------------------------------------------
  function allPanels(state) {
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

  // Instant (non-narrative) command reply. Every command returns full panels
  // so the UI never shows stale HP/coin/inventory.
  async function sendCommand(req, res, output, commandType, { persist = true, hours = 0 } = {}) {
    const state = req.session.state;
    req.timeDefault = false;                 // menus and instant commands take no time
    const notes = settleTime(req, hours);
    if (notes.length) { output = `${output || ''}\n\n${notes.join('\n')}`; persist = true; }
    if (persist) await persistSession(req.sessionId);
    req.session.lastEvents = [];
    req.session.lastCombatLog = null;
    setSession(req.sessionId, req.session);
    return res.json({ success: true, output, isCommand: true, commandType, undoable: false, ...allPanels(state), scene: safeScene(state, { commandType, input: req.body && req.body.input }) });
  }

  function safeScene(state, ctx) {
    try { return buildScene(state, ctx); } catch (e) { console.error('[Scene] build failed:', e.message); return null; }
  }

  function appendHint(state, hint) {
    if (!hint) return;
    state.pendingContextHint = state.pendingContextHint ? `${state.pendingContextHint}\n\n${hint}` : hint;
  }

  // ---------------------------------------------
  // Shared game-flow helpers
  // ---------------------------------------------

  // Applies death: level loss, gear left at the death site, revive.
  // recentDeaths is still tracked (other systems read it).
  const RECENT_DEATH_WINDOW = 50; // actions
  function applyDeath(state, events) {
    const playerLevel = getPlayerLevel(state.totalXP || 0);
    const now         = state.actionCount || 0;
    state.deathCount  = (state.deathCount || 0) + 1;
    state.recentDeaths = (state.recentDeaths || []).filter(a => now - a < RECENT_DEATH_WINDOW);
    state.recentDeaths.push(now);
    // Below level 100 a death costs one level and the progress toward the
    // next. It used to stack to three for deaths in quick succession, which
    // in campaign playtests turned one bad stretch into a spiral (a bard fell
    // from 80 to 69 at the Crucible, out of its level range, and took 2,400
    // actions to climb back). It also never takes you below the level the
    // current story chapter requires, so the road ahead stays open. Beyond
    // 100 a single level can be worth a whole campaign, so legends instead
    // lose a quarter of their progress toward the next level.
    let levelsLost = 0, newLevel = playerLevel, xpLost = null;
    if (playerLevel < 100) {
      let floor = 1;
      try { const cur = campaign.getCurrentStep(state); if (cur && cur.chapter && cur.chapter.minLevel) floor = Math.min(playerLevel, cur.chapter.minLevel); } catch (e) { /* no campaign */ }
      newLevel   = Math.max(1, floor, playerLevel - 1);
      levelsLost = playerLevel - newLevel;
      state.totalXP = getXPForLevel(newLevel);
    } else {
      const XPm = require('../../../game/character/xp');
      const floor = XPm.toBig(getXPForLevel(playerLevel));
      const progress = XPm.toBig(state.totalXP) - floor;
      const loss = progress / 4n;
      state.totalXP = XPm.fromBig(XPm.toBig(state.totalXP) - loss);
      xpLost = XPm.formatXP(XPm.fromBig(loss));
    }
    state.inCombat     = false;
    state.currentEnemy = null;
    tactics.clearCombatEffects(state);
    state.pendingEnemyKill = null;
    req_undoLock(state);

    const hadGear = saveGearAtDeath(state);   // also recalculates resources
    state.hp      = state.maxHp;
    state.stamina = state.maxStamina;
    state.mana    = state.maxMana;
    changeReputation(state, state.character.region, -5);

    // Wake at the nearest settlement rather than in a hostile wild.
    // Whoever you were escorting does not survive your death.
    const failed = (state.activeQuests || []).filter(q => q.type === 'escort');
    if (failed.length) {
      state.activeQuests = state.activeQuests.filter(q => q.type !== 'escort');
      for (const q of failed) events.push({ type: 'system', message: `QUEST FAILED — ${q.label}. Your charge did not survive.` });
    }
    const revival = getRevivalRegion(state);
    if (revival && revival !== state.character.region) {
      state.character.region = revival;
      state.boardQuests      = [];
      state.currentLocation  = null;
      state.currentNPC       = null;
      state.shopOpen         = false;
    }
    state.lastDefeatedEnemyLoot = null;

    const regionLabel = buildCharacterPanelData(state).region || 'the region';
    events.push({ type: 'death', deathCount: state.deathCount, levelsLost: Math.min(levelsLost, playerLevel - 1), newLevel, hadGear, regionLabel, xpLost });
    appendHint(state, `[DEATH — the player was killed and revived at the nearest citadel in ${regionLabel}. Describe waking cold and diminished. Their gear was left where they fell.]`);
  }

  // Applies an enemy kill: XP + level-ups, corpse loot, quest progress.
  function applyKill(state, events, input) {
    const kill = state.pendingEnemyKill;
    if (!kill) return;
    state.pendingEnemyKill = null;

    events.push({ type: 'enemyKill', label: kill.label, xp: kill.xp });
    state.lastDefeatedEnemyLoot = { label: kill.label, level: kill.level || 1, looted: false, ts: Date.now(), isBoss: !!kill.isBoss };

    const levelUp = grantXP(state, kill.xp, { classXP: true });
    if (levelUp) events.push(levelUp);
    comps.onVictory(state);
    // Hard-won boss fights leave a mark.
    if (kill.isBoss && state.hp < state.maxHp * 0.15) {
      const spots = ['cheek', 'brow', 'jaw', 'chin', 'neck', 'forehead'];
      const where = spots[(state.campaign && state.campaign.bossesDefeated ? state.campaign.bossesDefeated.length : 0) % spots.length];
      if (appearance.addScar(state, where)) events.push({ type: 'system', message: `The fight leaves you a scar across the ${where}.` });
    }

    const meta = kill.meta || {};
    if (meta.landmark) {
      const done = world.completeLandmark(state, meta.landmark.region, meta.landmark.id);
      if (done.success) {
        events.push({ type: 'system', message: done.message });
        if (done.levelUp) events.push(done.levelUp);
        worldCommands.pushCampaign(events, campaign.onEvent(state, { type: 'landmark', region: meta.landmark.region, id: meta.landmark.id }));
      }
    }
    if (meta.boss) {
      worldCommands.pushCampaign(events, campaign.onEvent(state, { type: 'bossDefeated', boss: meta.boss }));
      appendHint(state, `[BOSS DEFEATED — ${kill.label} has fallen. This is a turning point in the story. Make it feel earned.]`);
    }
    if (meta.rift) {
      const msg = endless.onRiftCleared(state, meta.rift);
      if (msg) events.push({ type: 'system', message: msg });
    }
    const W = chronicle.worldOf(state);
    if (meta.crisis && W) {
      const msg = endless.onCrisisWon(state, W, meta.crisis);
      if (msg) events.push({ type: 'system', message: msg });
    }
    if (meta.saga && W) {
      const r = endless.onSagaEvent(state, W, { type: 'kill', meta });
      if (r) { events.push({ type: 'system', message: r.message }); if (r.levelUp) events.push(r.levelUp); }
    }
    if (meta.war && W) {
      const msg = require('../../../game/politics').onBattleWon(state, W, meta.war);
      if (msg) events.push({ type: 'system', message: msg });
    }
    if (meta.relic && W) {
      const r = legacy.claimRelic(W, state, meta.relic);
      events.push({ type: 'system', message: r.message });
    }
    // Great milestones enter the chronicle.
    const lvl = getPlayerLevel(state.totalXP || 0);
    if (W && lvl >= 100 && lvl % 25 === 0) chronicle.addAchievement(W, state, `reaches the ${lvl}th level of mastery`, `level:${state.characterId}:${lvl}`);

    applyQuestUpdates(state, events, input, [{ type: 'enemyDefeated', enemyLabel: kill.label, meta }]);
  }

  function applyQuestUpdates(state, events, input, gameEvents) {
    if (!state.activeQuests || state.activeQuests.length === 0) return;
    const updates = checkQuestProgress(state, input, gameEvents);
    for (const u of updates) {
      if (u.type === 'guardian') {
        spawnGuardian(state, u);
      } else {
        events.push({ ...u, updateType: u.type, type: 'questProgress' });
      }
    }
    for (const c of processQuestCompletions(state)) {
      events.push({ type: 'questComplete', quest: c.quest, reward: c.reward, hint: c.hint });
      if (c.levelUp) events.push(c.levelUp);
      appendHint(state, c.hint);
      // Bounties earn the standing of whoever holds sway locally, and the
      // regard of companions who call this region home.
      const region = (c.quest && c.quest.region) || state.character.region;
      const applied = factions.changeStanding(state, { [factions.getRegionFaction(region)]: 3 }, 'bounty');
      const note = factions.formatStandingChanges(applied);
      if (note) events.push({ type: 'system', message: `Standing: ${note}` });
      for (const r of comps.onQuestCompleted(state, region)) events.push({ type: 'system', message: `${r.name} hears of your work (rapport ${r.rapport}).` });
    }
  }

  // Retrieve quests: reaching the site starts a fight with its guardian.
  function spawnGuardian(state, update) {
    if (state.inCombat || !state.character) return;
    const level = getPlayerLevel(state.totalXP || 0);
    const enemy = spawnEnemy(state.character.region, level + 1);
    if (!enemy) return;
    enemy.meta = { questGuardian: update.questId };
    state.inCombat     = true;
    state.currentEnemy = enemy;
    tactics.clearCombatEffects(state);
    appendHint(state, `[QUEST SITE — the player reached ${update.location}. A ${enemy.label} guards what they came for and attacks. ${enemy.desc}]`);
  }

  function startEncounter(state, enemy, hint) {
    state.inCombat     = true;
    state.currentEnemy = enemy;
    tactics.clearCombatEffects(state);
    appendHint(state, hint);
  }

  // Combat rounds and story decisions can't be rewound (no rerolling fate).
  let currentReq = null;
  function req_undoLock() { if (currentReq) currentReq.session.undoLocked = true; }

  const worldCommands = createWorldCommands({
    sendCommand, narrateAndRespond: (...a) => narrateAndRespond(...a), startEncounter, appendHint, spawnEnemy, getPlayerLevel,
    addTime: (req, h) => addTime(req, h),
    executeCharacter: (req, cause) => endCharacter(req.session.state, cause)
  });

  // ---------------------------------------------
  // Time: each request accumulates the hours its actions take; they are
  // applied once, only when the request succeeds. Commands, menus and
  // conversations cost nothing.
  // ---------------------------------------------
  function addTime(req, hours) { if (req) { req.timeHours = (req.timeHours || 0) + hours; req.timeDefault = false; } }
  function settleTime(req, extraHours = 0) {
    const hours = (req.timeHours || 0) + extraHours + (req.timeDefault ? chronicle.TIME_COST.action : 0);
    req.timeHours = 0; req.timeDefault = false;
    if (!hours || !chronicle.worldOf(req.session.state) || !req.session.state.character || !req.session.state.character.region) return [];
    const st = req.session.state;
    // Nobody walks for days or sleeps with a blade in hand.
    if (hours >= 6 && !st.inCombat) st.weaponDrawn = false;
    const monthBefore = Math.floor(chronicle.nowDay(chronicle.worldOf(st)) / 30);
    const result = chronicle.advanceTime(st, hours);
    const monthsPassed = Math.floor(chronicle.nowDay(chronicle.worldOf(st)) / 30) - monthBefore;
    if (monthsPassed > 0) {
      // Others commit crimes, the law works its cases, slaves work or run.
      result.messages.push(...require('../../../game/crime').monthly(st, monthsPassed));
      result.messages.push(...require('../../../game/slavery').monthly(st, monthsPassed));
    }
    const W = chronicle.worldOf(st);
    // Old age claims those who outlive their span.
    if (W && !st.deceased && chronicle.isPastLifespan(st, W)) {
      const msg = endCharacter(st, 'old age');
      if (msg) result.messages.push(msg);
    }
    return result.messages;
  }

  // A character's life ends — of old age, or on the gallows. Their story
  // passes into the chronicle and the world goes on.
  function endCharacter(st, cause) {
    const W = chronicle.worldOf(st);
    if (!W || st.deceased) return null;
    st.deceased = true;
    st.inCombat = false; st.currentEnemy = null;
    chronicle.recordFigure(W, st, { status: 'deceased' });
    const fig = W.figures.find(f => f.characterId === st.characterId);
    if (fig) { fig.deathYear = chronicle.dateOf(chronicle.nowHour(W)).year; fig.tomb = st.character.region; if (cause === 'executed') fig.executed = true; }
    if (fig && st.gear && st.gear.weapon && !W.relics.some(r => r.figureId === st.characterId)) W.relics.push({ id: `relic_${st.characterId}`, figureId: st.characterId, name: `${st.character.name}'s ${st.gear.weapon.name}`, region: st.character.region, claimedBy: null });
    const title = cause === 'executed' ? `${st.character.name} is executed for their crimes` : `${st.character.name} dies of old age at ${chronicle.ageOf(st, W)}`;
    chronicle.addEvent(W, { type: 'death', importance: 4, title, actor: chronicle.actorOf(st), region: st.character.region }, `death:${st.characterId}`);
    return `\n— ${st.character.name.toUpperCase()} ${cause === 'executed' ? 'IS EXECUTED' : 'DIES OF OLD AGE'} —\nTheir story passes into the chronicle. Choose "new character in this world" to continue in the world they shaped, or "new world".`;
  }

  async function narrateAndRespond(req, res, input, events, extra = {}) {
    const state     = req.session.state;
    for (const note of settleTime(req)) events.push({ type: 'system', message: note });
    const progress  = processPendingProgressEvents(state);
    events.push(...progress);

    const narrative = await processNarrative(state, input, events);
    await persistSession(req.sessionId);

    const output = extra.combatLog ? (narrative.fullOutput || '') + extra.combatLog : narrative.fullOutput;

    req.session.lastOutput       = output;
    req.session.lastCombatLog    = extra.combatLog || null;
    req.session.lastCombatResult = extra.combatLog ? state.pendingCombatResult : null;
    req.session.lastEvents       = events;
    setSession(req.sessionId, req.session);

    if (req.session.saveId) {
      db.appendStoryHistory(req.session.saveId, state.actionCount || 0, input, narrative.narrative || '', state.sceneContext || 'neutral');
    }

    const scene = safeScene(state, { combatResult: extra.combatResult || null, killed: !!extra.killed, killedEnemy: extra.killedEnemy || null, events, npcName: req.sceneNpc || null, input });
    return res.json({ success: true, output, undoable: !req.session.undoLocked, ...allPanels(state), rightPanel: narrative.rightPanel, scene });
  }

  // Runs one combat round (or flee) and narrates it. Shared by /action and /edit-action.
  async function handleCombatTurn(req, res, input, events) {
    const state = req.session.state;
    req.session.undoLocked = true;
    req.timeDefault = false;

    if (detectFleeIntent(input)) {
      const fleeing = state.currentEnemy;
      const fleeResult = applyFleeAttempt(state);
      if (fleeResult.success) {
        tactics.clearCombatEffects(state);
        if (fleeing && fleeing.isBoss) events.push({ type: 'system', message: `You escape. ${fleeing.label} will be waiting, fully recovered, when you return.` });
      }
      state.pendingContextHint = fleeResult.hint;
      if (isDead(state)) applyDeath(state, events);
      return narrateAndRespond(req, res, input, events);
    }

    const enemyBefore  = state.currentEnemy;
    const combatResult = applyCombatRound(state, input);
    state.pendingContextHint = combatResult.hint;
    updateActionProgress(state, input);
    if (combatResult.enemyKilled || !state.inCombat) addTime(req, chronicle.TIME_COST.fight);

    if (combatResult.enemyKilled) applyKill(state, events, input);
    if (isDead(state)) applyDeath(state, events);

    return narrateAndRespond(req, res, input, events, { combatLog: combatResult.combatLog, combatResult: combatResult.result, killed: combatResult.enemyKilled, killedEnemy: combatResult.enemyKilled ? enemyBefore : null });
  }

  // ---------------------------------------------
  // MAIN ACTION ROUTE
  // ---------------------------------------------
  app.post('/api/action', requireSession, async (req, res) => {
    const { input } = req.body || {};
    if (!input || typeof input !== 'string' || input.trim().length === 0) {
      return res.status(400).json({ error: 'Input required.' });
    }

    const state      = req.session.state;
    const cleanInput = input.trim().slice(0, MAX_INPUT_LENGTH);
    const events     = [];

    req.session.stateSnapshot = createStateSnapshot(state);
    req.session.lastInput     = cleanInput;
    req.session.undoLocked    = false;
    currentReq = req;
    req.timeHours = 0;
    req.timeDefault = !isInCreation(state);       // narrated actions take an hour
    const worldNow = chronicle.worldOf(state);
    req.session.worldHourSnapshot = worldNow ? chronicle.nowHour(worldNow) : null;

    try {
      // =========================================
      // CHARACTER CREATION
      // =========================================
      if (isInCreation(state)) {
        if (!state.creation.phase || state.creation.phase < 1) state.creation.phase = 1;
        const result = processCreationInput(state, cleanInput);

        if (!result) {
          console.error('[Creation] processCreationInput returned null for phase', state.creation.phase, 'input:', JSON.stringify(cleanInput));
          return res.status(500).json({ error: `Creation phase ${state.creation.phase} returned no result. Check console.` });
        }

        if (result.done) {
          state.pendingContextHint = buildOpeningHint(state);
          state.creationPrompt     = null;
        } else {
          state.creationPrompt = result.prompt;
        }

        // Born into an age that already has its legends: a first saga at home.
        let narrativeExtra = '';
        const Wc = result.done ? chronicle.worldOf(state) : null;
        if (Wc) chronicle.ensureCharacterIdentity(state, Wc);
        if (Wc && Wc.ending && !state.starterSagaGiven) {
          campaign.ensureCampaign(state);
          state.saga = endless.generateSaga(state, Wc, { starter: true });
          state.starterSagaGiven = true;
          narrativeExtra = `\n\n${Wc.era.name}, ${chronicle.formatDate(chronicle.nowHour(Wc))}.${Wc.realm ? ` ${Wc.realm.title} rules.` : ''}\nYour first saga — ${state.saga.title}: ${state.saga.steps[0].objective}. ("sagas" shows it; "legends" and "chronicle" tell you what came before.)`;
        }

        const narrative = await processNarrative(state, cleanInput, events);
        if (narrativeExtra) narrative.fullOutput = (narrative.fullOutput || '') + narrativeExtra;
        await persistSession(req.sessionId);

        if (result.done) appearance.ensureAppearance(state);
        return res.json({
          success:       true,
          scene:         result.done ? safeScene(state, {}) : null,
          output:        narrative.fullOutput,
          creationError: !!result.error,
          creationPhase: state.creation.phase,
          ...allPanels(state),
          rightPanel:    narrative.rightPanel
        });
      }

      // =========================================
      // AFTER THE STORY: continue / new character here / new world
      // =========================================
      const { worldRoutes } = deps;
      const lowerCmd = stripTrailingPunctuation(cleanInput.toLowerCase());
      if (worldRoutes && /^(?:new character in (?:this|the same) world|new character here|begin anew in this world|a new generation)(?:,?\s*(\d+)\s*years? later)?$/.test(lowerCmd)) {
        const yrs = (lowerCmd.match(/(\d+)\s*years?/) || [])[1];
        const r = await worldRoutes.startNewCharacter(req, { mode: 'same', years: yrs !== undefined ? parseInt(yrs, 10) : 20 });
        if (r.error) return sendCommand(req, res, r.error, 'world', { persist: false });
        return res.json({ ...r.body, isCommand: true, commandType: 'newCharacter' });
      }
      if (worldRoutes && /^(?:new world|start a new world|start an entirely new world|fresh world)$/.test(lowerCmd)) {
        const r = await worldRoutes.startNewCharacter(req, { mode: 'new' });
        if (r.error) return sendCommand(req, res, r.error, 'world', { persist: false });
        return res.json({ ...r.body, isCommand: true, commandType: 'newWorld' });
      }
      if (/^(?:continue|continue as (?:this|my) character|go on|carry on)$/.test(lowerCmd) && state.campaign && state.campaign.ending && state.campaign.afterEnding === 'pending') {
        state.campaign.afterEnding = 'continue';
        return sendCommand(req, res, `${state.character.name}'s story goes on. The world has changed and so have you. Try "sagas", "crises", "chronicle", "titles", "legends" — and the rift still waits at the Throne.`, 'continue');
      }

      // States saved mid-death by older versions: resolve before anything else.
      if (isDead(state)) applyDeath(state, events);

      // =========================================
      // PENDING CLASS / PROFESSION OFFERS
      // Only a clear yes/no answers an offer; anything else keeps playing.
      // =========================================
      for (const [pending, processor, acceptedType, declinedType] of [
        ['pendingClassOffer', processClassOfferResponse, 'classAccepted', 'classDeclined'],
        ['pendingProfOffer',  processProfessionOfferResponse, 'professionAccepted', 'professionDeclined']
      ]) {
        if (!state[pending]) continue;
        const result = processor(state, cleanInput);
        if (!result.handled) continue;
        if (result.accepted === true)  events.push({ type: acceptedType, message: result.message, key: result.key });
        if (result.accepted === false) events.push({ type: declinedType, message: result.message });
        // An offer reply is a short beat; narrate it and stop here.
        return narrateAndRespond(req, res, cleanInput, events);
      }

      const t   = cleanInput.toLowerCase().trim();
      const cmd = stripTrailingPunctuation(t);

      // =========================================
      // INFORMATION COMMANDS
      // =========================================
      if (['help', 'commands', '?', 'how to play'].includes(cmd)) {
        return sendCommand(req, res, HELP_TEXT, 'help', { persist: false });
      }

      if (['quests', 'quest log', 'journal', 'my quests', 'active quests', 'check quests'].includes(cmd)) {
        return sendCommand(req, res, buildQuestJournal(state), 'quests', { persist: false });
      }

      const abandonMatch = cmd.match(/^(?:abandon|drop|cancel) (?:quest|the quest|bounty)\s*#?(\d+)$/);
      if (abandonMatch) {
        const idx   = parseInt(abandonMatch[1], 10) - 1;
        const quest = (state.activeQuests || [])[idx];
        if (!quest) return sendCommand(req, res, `No active quest numbered ${abandonMatch[1]}. Type "quests" to see your journal.`, 'quests', { persist: false });
        abandonQuest(state, quest.id);
        return sendCommand(req, res, `Abandoned: ${quest.label}.`, 'quests');
      }

      if (['check stats', 'status', 'character sheet', 'view stats', 'my stats', 'stats'].includes(cmd)) {
        return sendCommand(req, res, null, 'stats', { persist: false });
      }

      if (['check gear', 'gear', 'inventory', 'check inventory', 'my inventory', 'equipment', 'my gear', 'inv', 'i'].includes(cmd)) {
        return sendCommand(req, res, buildBackpackSummary(state), 'gear', { persist: false });
      }

      if (['backpack', 'my backpack', 'check backpack', 'open backpack'].includes(cmd)) {
        return sendCommand(req, res, buildBackpackSummary(state), 'backpack', { persist: false });
      }

      for (const msg of comps.tickContracts(state)) events.push({ type: 'system', message: msg });

      // Drawing or sheathing a weapon is the player's call, in their own words.
      if (!state.inCombat && /^i\b/i.test(cleanInput)) {
        const agency = require('../../../game/agency');
        agency.updateWeaponInHand(state, cleanInput, null);
        agency.updateDress(state, cleanInput);
      }

      // Story, factions, companions, exploration, gathering, crafting.
      const worldResponse = await worldCommands.handle(req, res, cleanInput, cmd, events);
      if (worldResponse) return worldResponse;

      // =========================================
      // TRAVEL
      // =========================================
      const travelIntent = detectTravelIntent(cleanInput);
      if (travelIntent && travelIntent.type === 'map') {
        return sendCommand(req, res, buildMapText(state), 'map', { persist: false });
      }
      if (travelIntent && travelIntent.type === 'travel') {
        const result = travelTo(state, travelIntent.destination);
        if (!result.success) return sendCommand(req, res, result.message, 'travel', { persist: false });

        events.push({ type: 'travel', from: result.from, to: result.to, message: result.message });
        const upHill = (REGIONS[result.to].tier || 1) > (REGIONS[result.from] ? REGIONS[result.from].tier : 1);
        addTime(req, upHill ? chronicle.TIME_COST.travelUp : chronicle.TIME_COST.travelSame);
        state.pendingContextHint = result.hint;
        const arrival = REGIONS[result.to];
        if (arrival && arrival.settlement) events.push({ type: 'system', message: `${arrival.settlement.name} (${arrival.settlement.kind}) — inn: ${arrival.settlement.inn}. Type "explore" to see what is here.` });
        const hz = world.applyHazard(state);
        if (hz) events.push({ type: 'system', message: hz.message });
        if (state.profession === 'scout' && arrival) {
          events.push({ type: 'system', message: `Scout's eye: ${arrival.landmarks.map(l => l.name + (l.guarded ? ' (guarded)' : '')).join(', ')}${arrival.reagent ? `; rare ${arrival.reagent} grows here` : ''}.` });
        }
        // A warrant waits in this town; slaves draw eyes where they are outlawed.
        const crimeLib = require('../../../game/crime');
        const arrest = crimeLib.checkWarrant(state);
        if (arrest) events.push({ type: 'system', message: arrest });
        const seenSlaves = require('../../../game/slavery').onArrive(state);
        if (seenSlaves) events.push({ type: 'system', message: seenSlaves });
        applyQuestUpdates(state, events, cleanInput, [{ type: 'arrived', region: result.to }]);
        worldCommands.pushCampaign(events, campaign.onEvent(state, { type: 'arrived', region: result.to }));
        const W = chronicle.worldOf(state);
        if (W) {
          const sg = endless.onSagaEvent(state, W, { type: 'arrived', region: result.to });
          if (sg) events.push({ type: 'system', message: sg.message });
          const crisisHere = endless.activeCrises(W).find(c => c.region === result.to);
          if (crisisHere) events.push({ type: 'system', message: `⚠ ${crisisHere.title}: ${crisisHere.text} ("answer the call")` });
          const pol = require('../../../game/politics');
          const front = pol.activeWars(W).find(w => pol.fronts(W, w.a, w.b).includes(result.to));
          if (front) events.push({ type: 'system', message: `⚔ ${REGIONS[result.to].label} is a front in the war between ${pol.NAMES[front.a]} and ${pol.NAMES[front.b]}. Prices are up; "politics" for more.` });
          const settlement = W.settlements[result.to];
          if (settlement && settlement.status !== 'thriving') events.push({ type: 'system', message: `${REGIONS[result.to].label} is ${settlement.status}.` });
        }

        // The road is not always quiet.
        if (Math.random() < 0.25) {
          const enemy = spawnEnemy(result.to, getPlayerLevel(state.totalXP || 0), { preferTargets: getQuestTargets(state) });
          if (enemy && (enemy.level - getPlayerLevel(state.totalXP || 0)) < 20) {
            startEncounter(state, enemy, `[ROAD ENCOUNTER — on arrival, a ${enemy.label} blocks the way. ${enemy.desc} Behavior: ${enemy.behavior}.]`);
          }
        }
        return narrateAndRespond(req, res, cleanInput, events);
      }

      // =========================================
      // MERCHANTS & POTIONS
      // =========================================
      if (['shop', 'browse', 'browse wares', 'merchant', 'visit merchant', 'visit the merchant', 'wares', 'market', 'trade'].includes(cmd)) {
        return sendCommand(req, res, buildShopText(state), 'shop', { persist: false });
      }
      const buyMatch = cleanInput.match(/^(?:i\s+)?(?:buy|purchase)\s+(.+)/i);
      if (buyMatch) {
        const result = buyItem(state, buyMatch[1]);
        if (!result.notStocked) return sendCommand(req, res, result.message, 'buy', { persist: result.success });
      }
      const potionMatch = cleanInput.match(/^(?:i\s+)?(?:drink|quaff|use|down|eat)\s+(?:a\s+|the\s+|my\s+|some\s+)?(healing\s+|mana\s+|hearty\s+)?(potion|meal|draught|food)\b/i);
      if (potionMatch && !state.inCombat) {
        const kind = /mana/i.test(potionMatch[1] || '') ? 'mana' : /meal|food|hearty/i.test((potionMatch[1] || '') + potionMatch[2]) ? 'meal' : 'healing';
        const result = drinkPotion(state, kind);
        return sendCommand(req, res, result.message, 'potion', { persist: result.success });
      }

      // =========================================
      // RESTING (long rest checked first — "sleep" is a long rest)
      // =========================================
      const isLongRest = ['long rest', 'sleep', 'make camp', 'set up camp', 'camp', 'full rest', 'rest fully', 'go to sleep', 'sleep for the night'].includes(cmd) ||
        t.includes('long rest') || t.includes('make camp') || t.includes('set up camp') ||
        /\b(rent a room|get a room|take a room|sleep at the|stay the night|sleep in the|rest at the inn|rest at the tavern)\b/.test(t);
      const isShortRest = !isLongRest && (['rest', 'recover', 'take a break', 'catch my breath', 'sit down', 'rest up', 'short rest'].includes(cmd) ||
        t.startsWith('rest ') || t.includes('rest for') || t.includes('take a rest'));

      if (isLongRest || isShortRest) {
        if (state.inCombat) {
          return sendCommand(req, res, "You can't rest while in combat!", 'rest', { persist: false });
        }
      }

      if (isLongRest) {
        // Safe rest: a paid room in a settlement (regions with a town or board).
        // Anywhere else is the wild, with a tier-scaled (capped) ambush chance.
        const region      = REGIONS[state.character.region] || {};
        const hasTown     = !!(region.cityPresent || region.hasBountyBoard);
        const wantsRoom   = /\b(inn|tavern|room|bed|lodge|hostel|barracks|guild|temple|sanctuary|shelter|safehouse)\b/.test(t);
        const roomCost    = 20 * (region.tier || 1);
        let isSafe = false;
        let roomNote = '';
        if (wantsRoom && hasTown) {
          if ((state.coin || 0) >= roomCost) {
            state.coin -= roomCost;
            isSafe = true;
            roomNote = ` (${formatCoin(roomCost)} for the room)`;
          } else {
            roomNote = `\n\nYou can't afford a room (${formatCoin(roomCost)}), so you sleep rough.`;
          }
        } else if (wantsRoom && !hasTown) {
          roomNote = '\n\nThere is no inn out here — you make camp in the wild.';
        }

        if (!isSafe) {
          const ambushChance = Math.min(0.35, 0.10 + (region.tier || 1) * 0.025);
          if (Math.random() < ambushChance) {
            const playerLevel = getPlayerLevel(state.totalXP || 0);
            const enemy = spawnEnemy(state.character.region, playerLevel);
            if (enemy) {
              state.inCombat     = true;
              state.currentEnemy = enemy;
              state.stamina = Math.min(state.maxStamina, state.stamina + Math.floor(state.maxStamina * 0.3));
              state.hp      = Math.min(state.maxHp, state.hp + Math.floor(state.maxHp * 0.15));
              state.mana    = Math.min(state.maxMana, state.mana + Math.floor(state.maxMana * 0.15));
              return sendCommand(req, res,
                `You settle down to rest, but your sleep is cut short—${roomNote}\n\nA ${enemy.label} has found you!\n\nYou scramble to your feet, still groggy from interrupted sleep.`,
                'ambush');
            }
          }
        }
        const currentLoc = isSafe ? 'inn' : '';

        state.stamina = state.maxStamina;
        state.hp      = state.maxHp;
        state.mana    = state.maxMana;
        state.restedSinceAction = true;

        const restMessage = isSafe
          ? `You settle in for a peaceful night's rest${roomNote}.\n\nThe ${currentLoc || 'shelter'} keeps you safe through the night.`
          : `You find a spot to rest, keeping one eye open.${roomNote}\n\nHours pass. You wake feeling restored.`;
        return sendCommand(req, res,
          `${restMessage}\n\nStamina: ${state.stamina}/${state.maxStamina} (full)\nHP: ${state.hp}/${state.maxHp} (full)\nMana: ${state.mana}/${state.maxMana} (full)`,
          'longRest', { hours: chronicle.worldOf(state) ? chronicle.hoursUntilMorning(chronicle.worldOf(state)) : 8 });
      }

      if (isShortRest) {
        if (state.restedSinceAction) {
          return sendCommand(req, res, "You've rested as much as a short break allows. Do something first, or make camp for a long rest.", 'rest', { persist: false });
        }
        const oldStamina = state.stamina, oldHp = state.hp, oldMana = state.mana;
        state.stamina = Math.min(state.maxStamina, state.stamina + Math.floor(state.maxStamina * 0.5));
        state.hp      = Math.min(state.maxHp,      state.hp      + Math.floor(state.maxHp * 0.25));
        state.mana    = Math.min(state.maxMana,    state.mana    + Math.floor(state.maxMana * 0.25));
        state.restedSinceAction = true;
        return sendCommand(req, res,
          `You take a moment to rest and recover.\n\n` +
          `Stamina: +${state.stamina - oldStamina} (${state.stamina}/${state.maxStamina})\n` +
          `HP: +${state.hp - oldHp} (${state.hp}/${state.maxHp})\n` +
          `Mana: +${state.mana - oldMana} (${state.mana}/${state.maxMana})`,
          'rest', { hours: chronicle.TIME_COST.shortRest });
      }

      // =========================================
      // CHARACTER / SETTINGS COMMANDS
      // =========================================
      if (t.startsWith('set companion ') || t.startsWith('add companion ')) {
        return sendCommand(req, res, 'Companions have to be earned. Type "companions" to see who might join you and what they need.', 'companion', { persist: false });
      }

      if (/\b(spend|allocate|put|add)\b/.test(t) && /\b(str|strength|dex|dexterity|vit|vitality|int|intelligence|wis|wisdom|cha|charisma)\b/.test(t)) {
        const result = spendFreePoint(state, cleanInput);
        return sendCommand(req, res, result.message, 'freePoint', { persist: result.success });
      }

      if (['nsfw on', 'nsfw off', 'enable nsfw', 'disable nsfw'].includes(cmd)) {
        const enabled = cmd.includes('on') || cmd.includes('enable');
        if (enabled && (state.character.age || 0) < 18) {
          return sendCommand(req, res, '[Adult content is unavailable for characters under 18.]', 'nsfw', { persist: false });
        }
        if (enabled) state.adultConfirmed = true;
        require('../../../game/content-prefs').updatePrefs(state, enabled ? { romance: 'mature', sexual: 'mature' } : { romance: 'mild', sexual: 'off' });
        state.nsfwEnabled = enabled;
        if (req.session.playerId) db.setNSFWSetting(req.session.playerId, enabled);
        return sendCommand(req, res, enabled
          ? '[Adult content enabled. Intimate scenes will play out fully when earned.]'
          : '[Adult content disabled. Intimate scenes will fade to black.]', 'nsfw');
      }

      // =========================================
      // ENEMY INSPECTION (only meaningful in a fight)
      // =========================================
      if (state.inCombat && ['inspect', 'size up', 'assess', 'read the enemy', 'study enemy'].some(w => t.includes(w))) {
        const inspectData = buildEnemyInspectData(state);
        const traits = tactics.describeTraits(state.currentEnemy);
        const traitText = `\nWeak to: ${traits.weak.join(', ') || 'nothing obvious'} · Resists: ${traits.strong.join(', ') || 'nothing obvious'}${traits.immune.length ? ` · Immune: ${traits.immune.join(', ')}` : ''}`;
        events.push({ type: 'inspect', content: formatInspectResult(inspectData) + traitText });
        return narrateAndRespond(req, res, cleanInput, events);
      }

      if ((t.includes('recover') || t.includes('retrieve')) && (t.includes('gear') || t.includes('equipment') || t.includes('belongings'))) {
        const result = recoverGear(state);
        if (!result.success) return sendCommand(req, res, result.message, 'recoverGear', { persist: false });
        events.push({ type: 'gearRecovered', ...result });
        return narrateAndRespond(req, res, cleanInput, events);
      }

      // =========================================
      // SHOP
      // =========================================
      if (t.includes('open shop') || t.includes('set up shop') || t.includes('open stall')) {
        const result = tryOpenShop(state);
        if (!result.success) return sendCommand(req, res, result.message, 'shop', { persist: false });
        appendHint(state, `[SHOP OPENED — the player set up a market stall. ${result.message}]`);
      }

      if (t.includes('close shop') || t.includes('pack up shop')) {
        const result = tryCloseShop(state);
        return sendCommand(req, res, result.message, 'shop', { persist: result.success });
      }

      // =========================================
      // INVENTORY COMMANDS
      // =========================================
      const showMatch = cleanInput.match(/^(?:show|examine|inspect)\s+(?:the\s+|my\s+)?(.+)/i);
      if (showMatch && !state.inCombat) {
        const itemName = stripTrailingPunctuation(showMatch[1]);
        const item = itemName ? findInventoryItem(state, itemName) : null;
        if (item) {
          const name = typeof item === 'string' ? item : item.name;
          return sendCommand(req, res, `In your backpack: ${name}.`, 'inventory', { persist: false });
        }
        // Not an item — "examine the strange door" is a story action.
      }

      const dropMatch = cleanInput.match(/^(?:drop|discard|throw away)\s+(?:the\s+|my\s+)?(.+)/i);
      if (dropMatch && !state.inCombat) {
        const itemName = stripTrailingPunctuation(dropMatch[1]);
        if (!itemName) return sendCommand(req, res, 'Drop what item?', 'inventory', { persist: false });
        const removed = removeItem(state, itemName);
        if (!removed) return sendCommand(req, res, `You do not have "${itemName}" in your backpack.`, 'inventory', { persist: false });
        return sendCommand(req, res, `Dropped from backpack: ${itemName}.`, 'inventory');
      }

      const sellMatch = cleanInput.match(/^sell\s+(?:the\s+|my\s+)?(.+)/i);
      if (sellMatch && !state.inCombat) {
        const itemName = stripTrailingPunctuation(sellMatch[1]);
        if (!itemName) return sendCommand(req, res, 'Sell what item?', 'inventory', { persist: false });
        const sold = sellInventoryOrEquipped(state, itemName);
        if (!sold) return sendCommand(req, res, `You do not have "${itemName}" in your backpack or equipped gear.`, 'inventory', { persist: false });
        // Merchants know how to haggle: +5% resale per profession level.
        if (state.profession === 'merchant') sold.value = Math.round(sold.value * (1 + 0.05 * Math.max(1, state.professionLevel || 1)));
        addCoin(state, sold.value);
        return sendCommand(req, res, `Sold ${sold.name} for ${formatCoin(sold.value)}.`, 'inventory');
      }

      // =========================================
      // LOOTING THE LAST KILL
      // =========================================
      const lastLoot = state.lastDefeatedEnemyLoot;
      const labelWords = lastLoot && lastLoot.label ? lastLoot.label.toLowerCase().split(/\s+/).filter(w => w.length > 2) : [];
      const corpseLootIntent =
        (/\b(loot|search|take|strip|rummage|check)\b/.test(t) && /(corpse|body|bodies|remains|carcass|bandit|guard|cultist|raider|thug|enemy)/i.test(t)) ||
        (/\b(loot|search)\b/.test(t) && lastLoot && !lastLoot.looted && (labelWords.some(w => t.includes(w)) || /\b(it|them|him|her)\b/.test(t) || cmd === 'loot'));

      if (corpseLootIntent) {
        if (state.inCombat && state.currentEnemy && state.currentEnemy.currentHP > 0) {
          return sendCommand(req, res, 'You cannot loot a body while still in active combat.', 'loot', { persist: false });
        }
        if (!lastLoot || !lastLoot.label) return sendCommand(req, res, 'There is no recently defeated body to loot.', 'loot', { persist: false });
        if (lastLoot.looted) return sendCommand(req, res, 'You already looted that body.', 'loot', { persist: false });

        const resolvedLoot = resolveCorpseLoot(lastLoot.label);
        const items        = resolvedLoot.items;
        // Coin scales gently with the enemy's level.
        const coinReward   = Math.round(resolvedLoot.coinReward * (1 + (lastLoot.level || 1) / 10));

        const lootTier = Math.max(0, getTierForLevelPublic(lastLoot.level || 1) - (lastLoot.isBoss || Math.random() < 0.25 ? 0 : 1));
        for (const item of items) addItem(state, { name: item, tier: lootTier, type: 'loot' });
        const material = lootMaterial(lastLoot.label);
        if (material) { world.addMaterial(state, material, 1); items.push(material); }
        if (coinReward > 0) addCoin(state, coinReward);
        state.lastDefeatedEnemyLoot.looted = true;
        appendHint(state, `[LOOT ACQUIRED — player looted ${lastLoot.label}: ${items.join(', ')}${coinReward > 0 ? ` and ${formatCoin(coinReward)}` : ''}. Narrate this naturally.]`);

        // Point out gear that would beat what's equipped (loot scales to your level when equipped).
        const upgrades = [];
        const seenSlots = new Set();
        for (const item of items) {
          const up = describeUpgrade(state, item);
          if (up && !seenSlots.has(up.slot)) { seenSlots.add(up.slot); upgrades.push(`"equip ${item}" (${up.slot})`); }
        }
        const upgradeNote = upgrades.length ? `\nUpgrade available — type ${upgrades.join(' or ')}.` : '';

        return sendCommand(req, res,
          `Looted ${lastLoot.label}: ${items.join(', ')}.${coinReward > 0 ? ` Added to coin pouch: ${formatCoin(coinReward)}.` : ''}${upgradeNote}`,
          'loot');
      }

      if ((/\bput\s+all\b/.test(t) || /\bstash\b/.test(t) || /\bstore\b/.test(t)) && /\b(backpack|pack|bag)\b/.test(t)) {
        const moved = [];
        if (state.gear && state.gear.weapon) { moved.push(state.gear.weapon.name); addItem(state, state.gear.weapon); state.gear.weapon = null; }
        if (state.gear && state.gear.armor)  { moved.push(state.gear.armor.name);  addItem(state, state.gear.armor);  state.gear.armor  = null; }
        deps.recalculateResources(state);
        return sendCommand(req, res, moved.length ? `Moved to backpack: ${moved.join(', ')}.` : 'Nothing equipped to move into your backpack.', 'backpackStash');
      }

      // =========================================
      // FREE-FORM PICKUPS ("take the lantern, the rope and the coins")
      // =========================================
      if (!state.inCombat && !detectCombatIntent(cleanInput) && !detectQuestAccept(stripTrailingPunctuation(cleanInput))) {
        const pickup = parsePickup(cleanInput);
        if (pickup) {
          const takenItems = [];
          let coinGained = 0;
          for (const phrase of pickup) {
            // Money: "coins", "a purse", "10 gold", "silver pieces" — but not "silver locket".
            if (/\b(coins?|purse|coin pouch)\b/i.test(phrase) || /^(?:\d+\s*)?(?:gold|silver|copper)(?:\s+(?:pieces?|marks?|crowns?))?$/i.test(phrase)) {
              const amount = Math.max(0, MAX_LOOSE_COIN - coinGained);
              if (amount > 0) { coinGained += amount; }
            } else {
              // Picked up from the scene: real enough to carry, worthless to merchants,
              // and crude if used as a weapon — words alone don't make treasure.
              addItem(state, { name: phrase, type: 'scavenged', tier: 0, value: 1 });
              takenItems.push(phrase);
            }
          }
          if (coinGained > 0) addCoin(state, coinGained);

          if (takenItems.length > 0 || coinGained > 0) {
            const hints = [];
            if (takenItems.length > 0) hints.push(`player now has ${takenItems.map(i => `"${i}"`).join(', ')} in their inventory`);
            if (coinGained > 0) hints.push(`player found ${formatCoin(coinGained)} in loose coin`);
            appendHint(state, `[ITEM ACQUIRED — ${hints.join(' and ')}. Narrate this naturally.]`);

            const parts = [];
            if (takenItems.length > 0) parts.push(`Added to backpack: ${takenItems.join(', ')}.`);
            if (coinGained > 0) parts.push(`Added to coin pouch: ${formatCoin(coinGained)} (loose change).`);
            return sendCommand(req, res, parts.join(' '), 'loot');
          }
        }
      }

      // =========================================
      // EQUIP / UNEQUIP (command-style input only, never mid-attack)
      // =========================================
      if (state.inCombat && /^(?:i\s+)?(?:equip|unequip|wear|wield|put on|don|swap)\b/i.test(cleanInput)) {
        return sendCommand(req, res, 'There is no time to change gear mid-fight.', 'equip', { persist: false });
      }
      if (!detectCombatIntent(cleanInput) &&
          /^(?:i\s+)?(?:equip|unequip|wear|wield|put on|don|strap on|switch to|swap|replace|take off|stow|sheathe|unwield|remove)\b/i.test(cleanInput)) {
        const equipIntent = detectEquipIntent(cleanInput);
        const equipResult = equipIntent ? processEquipCommand(state, equipIntent) : null;
        if (equipResult) {
          if (equipResult.success) {
            appendHint(state, `[GEAR UPDATED — ${equipResult.message}. Narrate this naturally.]`);
          }
          return sendCommand(req, res, equipResult.message, equipIntent.intent === 'equip' ? 'equip' : 'unequip', { persist: !!equipResult.success });
        }
      }

      // =========================================
      // COMPANIONS
      // =========================================
      const companionIntent = detectCompanionIntent(cleanInput, state);
      if (companionIntent && companionIntent.npcName && !state.inCombat) {
        const npcName = stripTrailingPunctuation(companionIntent.npcName);
        if (companionIntent.intent === 'join' && npcName && false) {
          const npcKey  = npcName.toLowerCase().replace(/\s+/g, '_');
          const rapport = state.npcRelationships && state.npcRelationships[npcKey] ? state.npcRelationships[npcKey].rapport || 0 : 0;
          if (rapport >= 30) {
            const result = addCompanion(state, {
              name: npcName.charAt(0).toUpperCase() + npcName.slice(1),
              description: 'A companion met in your travels.',
              role: 'ally'
            });
            if (result.success) {
              events.push({ type: 'companionJoined', companion: result.companion });
              appendHint(state, `[COMPANION JOINED — ${result.companion.name} has agreed to travel with the player. Narrate this naturally as a meaningful moment.]`);
            } else {
              appendHint(state, `[COMPANION LIMIT — ${result.message}]`);
            }
          } else {
            appendHint(state, `[COMPANION DECLINED — ${npcName} doesn't know the player well enough yet (rapport ${rapport}/30). They are not ready to commit to traveling together. Narrate a polite decline.]`);
            events.push({ type: 'companionDeclined', name: npcName, rapport });
          }
        } else if (companionIntent.intent === 'leave') {
          const result = removeCompanion(state, npcName);
          if (result.success) {
            events.push({ type: 'companionLeft', companion: result.companion });
            appendHint(state, `[COMPANION LEFT — ${result.companion.name} has parted ways with the player. Narrate this farewell naturally.]`);
          }
        }
      }

      // =========================================
      // COMBAT
      // =========================================
      if (state.inCombat && state.currentEnemy && state.currentEnemy.currentHP <= 0) {
        state.inCombat = false;
        state.currentEnemy = null;
      }

      if (state.inCombat && state.currentEnemy) {
        return handleCombatTurn(req, res, cleanInput, events);
      }

      // =========================================
      // NON-COMBAT ACTION
      // =========================================
      state.restedSinceAction = false;
      const normalizedBoardInput = stripTrailingPunctuation(cleanInput);

      if (detectBoardIntent(normalizedBoardInput)) {
        appendHint(state, buildBoardInspectHint(state));
      }

      if (detectQuestAccept(normalizedBoardInput) && /\b(quest|job|bounty|contract|posting|notice|hunt|clear|escort|patrol|retrieve|scout|advance|move on|\d+)\b/i.test(normalizedBoardInput)) {
        const numMatch = normalizedBoardInput.match(/\b([1-9]\d*)\b/);
        let result = null;
        if (numMatch) {
          result = acceptQuestByIndex(state, parseInt(numMatch[1], 10));
        } else {
          const t2 = normalizedBoardInput.toLowerCase();
          const typeWords = { hunt: ['hunt'], clear: ['clear'], escort: ['escort'], patrol: ['patrol'], retrieve: ['retrieve'], scout: ['scout'], advance: ['advance', 'move on'] };
          const shown = (state.boardQuests && state.boardQuests.length) ? state.boardQuests : getBoardQuests(state);
          const q = shown.find(q => (typeWords[q.type] || []).some(w => t2.includes(w)));
          if (q) result = acceptQuest(state, q.id);
        }
        if (result && result.success) {
          events.push({ type: 'questAccepted', quest: result.quest });
          appendHint(state, result.hint || `[QUEST ACCEPTED: "${result.quest.label}" — narrate naturally.]`);
        } else if (result && !result.success) {
          events.push({ type: 'questAcceptFailed', message: result.message });
        }
      }

      applyQuestUpdates(state, events, cleanInput, []);

      if (!state.inCombat && detectCombatIntent(cleanInput) && state.character) {
        const playerLevel = getPlayerLevel(state.totalXP || 0);
        const enemy       = spawnEnemy(state.character.region, playerLevel, { preferTargets: getQuestTargets(state) });
        if (enemy) {
          const unbeatable = (enemy.level - playerLevel) >= 20;
          startEncounter(state, enemy, unbeatable
            ? `[ENEMY SPAWNED: ${enemy.label} — far beyond the player. Cannot be defeated. Narrate absolute dominance.]`
            : `[ENEMY SPAWNED: ${enemy.label} Lv${enemy.level}. ${enemy.desc} Behavior: ${enemy.behavior}. Player attacked first. Begin the combat scene.]`);
          events.push({ type: 'combatStart', label: enemy.label, level: enemy.level });
        }
      }

      if (!state.inCombat && !isPassiveAction(cleanInput)) {
        const ambientEnemy = checkAmbientEncounter(state);
        if (ambientEnemy) {
          startEncounter(state, ambientEnemy, `[AMBIENT ENCOUNTER — a ${ambientEnemy.label} appears unexpectedly. ${ambientEnemy.desc} Behavior: ${ambientEnemy.behavior}. Player did not seek this fight — introduce naturally. They can fight, flee, or attempt to avoid it.]`);
          events.push({ type: 'combatStart', label: ambientEnemy.label, level: ambientEnemy.level, ambient: true });
        }
      }

      if (state.shopOpen && !state.inCombat) {
        const shopEvent = checkShopCustomerEvent(state);
        if (shopEvent) appendHint(state, shopEvent.hint);
      }

      if (!state.inCombat) {
        const taskResult = resolveProfessionTask(state, cleanInput);
        if (taskResult) {
          appendHint(state, taskResult.hint);
          if (taskResult.craftedItem) events.push({ type: 'itemCrafted', item: taskResult.craftedItem });
          if (state.pendingProfXP && state.pendingProfXP > 0) {
            state.profXP        = (state.profXP || 0) + state.pendingProfXP;
            state.pendingProfXP = 0;
          }
        }
        updateActionProgress(state, cleanInput);
        const social = applySocialRapport(state, cleanInput);
        if (social) events.push({ type: 'rapport', ...social });
      }

      const coinIntent = detectCoinIntent(cleanInput);
      if (coinIntent && coinIntent.intent === 'spend') {
        state.pendingCoinSpend = (state.pendingCoinSpend || 0) + coinIntent.amount;
      }
      // Earning coin by *saying* so ("I receive 50 gold") is not a thing —
      // coin comes from loot, quests, and sales.

      for (const ce of processPendingCoinEvents(state)) {
        if (ce.type === 'coinSpend') {
          if (ce.success) events.push({ type: 'coinSpent', display: ce.display, total: ce.total });
          else { events.push({ type: 'coinSpendFailed', hint: ce.hint }); appendHint(state, ce.hint); }
        }
      }

      if (!state.inCombat) {
        state.stamina = Math.min(state.maxStamina, (state.stamina || 0) + Math.floor((state.maxStamina || 10) * 0.15));
        state.mana    = Math.min(state.maxMana,    (state.mana    || 0) + Math.floor((state.maxMana    || 10) * 0.10));
      }

      appendHint(state, buildActiveQuestContext(state));
      return narrateAndRespond(req, res, cleanInput, events);
    } catch (err) {
      console.error('[Action] Unhandled error:', err);
      return res.status(500).json({ error: 'Something went wrong processing that action.', detail: err.message });
    }
  });

  app.post('/api/retry-narrative', requireSession, async (req, res) => {
    const state     = req.session.state;
    const lastInput = req.session.lastInput;
    if (!lastInput) return res.status(400).json({ error: 'No previous action to retry.' });
    if (!req.session.lastEvents && !req.session.lastOutput) return res.status(400).json({ error: 'Nothing to retry.' });

    try {
      const events    = req.session.lastEvents || [];
      const narrative = await processNarrative(state, lastInput, events);
      const fullOutput = req.session.lastCombatLog ? (narrative.fullOutput || '') + req.session.lastCombatLog : narrative.fullOutput;
      req.session.lastOutput = fullOutput;
      setSession(req.sessionId, req.session);
      await persistSession(req.sessionId);
      return res.json({ success: true, output: fullOutput, ...allPanels(state), rightPanel: narrative.rightPanel });
    } catch (err) {
      console.error('[RetryNarrative] Error:', err);
      return res.status(500).json({ error: 'Failed to regenerate narrative.' });
    }
  });

  app.post('/api/undo', requireSession, async (req, res) => {
    if (!req.session.stateSnapshot) return res.status(400).json({ error: 'Nothing to undo.' });
    if (req.session.undoLocked) return res.status(409).json({ error: 'Fate does not rewind: combat rounds and story decisions cannot be undone.', code: 'UNDO_LOCKED' });
    try {
      restoreStateSnapshot(req.session.state, req.session.stateSnapshot);
      const w = chronicle.worldOf(req.session.state);
      if (w && typeof req.session.worldHourSnapshot === 'number') { w.calendar.hour = req.session.worldHourSnapshot; chronicle.syncAge(req.session.state, w); }
      const undoneInput = req.session.lastInput;
      req.session.stateSnapshot   = null;
      req.session.lastInput       = null;
      req.session.lastOutput      = null;
      req.session.lastCombatLog   = null;
      req.session.lastCombatResult = null;
      req.session.lastEvents      = null;
      setSession(req.sessionId, req.session);
      await persistSession(req.sessionId);

      const state = req.session.state;
      return res.json({
        success: true,
        message: 'Action undone. You can try something different.',
        undoneInput,
        ...allPanels(state),
        rightPanel: {
          ...buildRightPanelData(state),
          enemy: state.currentEnemy ? buildEnemyPanelData(state) : null
        }
      });
    } catch (err) {
      console.error('[Undo] Error:', err);
      return res.status(500).json({ error: 'Failed to undo action.' });
    }
  });

  // Replays the last action with new text. Combat and normal actions are
  // re-run through the same handlers as /api/action.
  app.post('/api/edit-action', requireSession, async (req, res) => {
    const { input } = req.body || {};
    if (!input || typeof input !== 'string' || input.trim().length === 0) {
      return res.status(400).json({ error: 'New input required.' });
    }
    if (!req.session.stateSnapshot) return res.status(400).json({ error: 'No previous action to edit.' });
    if (isInCreation(req.session.state)) return res.status(400).json({ error: 'Cannot edit during character creation.' });
    if (req.session.undoLocked) return res.status(409).json({ error: 'Fate does not rewind: combat rounds and story decisions cannot be edited.', code: 'UNDO_LOCKED' });

    try {
      restoreStateSnapshot(req.session.state, req.session.stateSnapshot);
      req.session.stateSnapshot = createStateSnapshot(req.session.state);
      const cleanInput = stripTrailingPunctuation(input.trim().slice(0, MAX_INPUT_LENGTH)) || input.trim();
      req.session.lastInput = cleanInput;
      setSession(req.sessionId, req.session);

      const state  = req.session.state;
      const events = [];
      if (state.inCombat && state.currentEnemy) {
        return handleCombatTurn(req, res, cleanInput, events);
      }
      appendHint(state, buildActiveQuestContext(state));
      return narrateAndRespond(req, res, cleanInput, events);
    } catch (err) {
      console.error('[EditAction] Error:', err);
      return res.status(500).json({ error: 'Failed to process edited action.' });
    }
  });

  // ---------------------------------------------
  // Selling
  // ---------------------------------------------
  function computeSellValue(item) {
    if (item && typeof item === 'object') {
      const tier        = Math.max(0, item.tier || 0);
      const weaponScore = Math.max(0, item.weaponBonus || 0) * 15;
      const armorScore  = Math.max(0, item.armorLevel || 0) * 18;
      const modScore    = item.statMods
        ? Object.values(item.statMods).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0) * 20
        : 0;
      if (typeof item.value === 'number') return Math.max(0, item.value);
      if (item.type === 'material') return 6;
      if (item.type === 'potion' || item.type === 'ward') return 8;
      const base = 15 + tier * 12 + weaponScore + armorScore + modScore;
      return Math.max(10, Math.round(base * (1 + (item.sellBonus || 0))));
    }
    const name = String(item || '').toLowerCase();
    if (/sword|blade|axe|mace|hammer|spear|staff|bow|weapon|knife|dagger/.test(name)) return 80;
    if (/armor|armour|leather|mail|plate|tunic|tabard|boots|shield|helm/.test(name)) return 60;
    if (/pouch|coin|ring|gem|relic|focus|charm|scale|fang|pelt|hide|tusk|claw|shard|core/.test(name)) return 100;
    return 20;
  }

  function sellInventoryOrEquipped(state, itemName) {
    const invItem = findInventoryItem(state, itemName);
    if (invItem) {
      const name = typeof invItem === 'string' ? invItem : invItem.name;
      const value = computeSellValue(invItem);
      removeItem(state, name);
      return { name, value };
    }
    const crafted = (state.craftedGear || []).findIndex(g => g.name && g.name.toLowerCase().includes(itemName.toLowerCase()));
    if (crafted !== -1) {
      const item = state.craftedGear.splice(crafted, 1)[0];
      return { name: item.name, value: computeSellValue(item) };
    }
    for (const slot of ['weapon', 'armor']) {
      const equipped = state.gear && state.gear[slot];
      if (equipped && equipped.name.toLowerCase().includes(itemName.toLowerCase())) {
        state.gear[slot] = null;
        deps.recalculateResources(state);
        return { name: equipped.name, value: computeSellValue(equipped) };
      }
    }
    return null;
  }
};

// Creatures leave crafting materials behind.
function lootMaterial(label) {
  const l = String(label || '').toLowerCase();
  if (/skeleton|bone|ghoul|lich|barrow|grave|tomb|zombie|dead/.test(l)) return Math.random() < 0.5 ? 'bone' : null;
  if (/wolf|boar|bear|hound|hyena|deer|stag|cat|beast|scorpion|drake|wyvern|basilisk|rat/.test(l)) return Math.random() < 0.6 ? 'hide' : null;
  if (/golem|construct|colossus|gate|monument|automaton/.test(l)) return Math.random() < 0.6 ? 'iron ore' : null;
  if (/dryad|treant|thorn|sprite|druid/.test(l)) return Math.random() < 0.5 ? 'herbs' : null;
  return Math.random() < 0.15 ? 'herbs' : null;
}

// Parses "take the lantern, the rope and some coins" into item phrases,
// or null when the input isn't a pickup ("take a swing", "take the quest").
function parsePickup(input) {
  const m = String(input || '').trim().match(/^(?:i\s+)?(?:take|pick up|grab|loot|pocket|collect)\s+(.+?)[.!?]*$/i);
  if (!m) return null;
  const body = m[1].replace(/\s+(?:from|off of|off|out of)\s+.*$/i, '');
  if (NON_PICKUP_OBJECTS.test(body)) return null;
  const phrases = body.split(/\s*,\s*|\s+and\s+/i)
    .map(p => p.replace(/^(?:a|an|the|some|my|all the|all)\s+/i, '').trim())
    .filter(p => p.length > 0 && p.length < 50)
    .filter(p => !/^(bandit|guard|cultist|raider|thug|enemy|corpse|body|it|them|everything|all)$/i.test(p));
  return phrases.length ? phrases : null;
}

function formatInspectResult(inspectData) {
  if (!inspectData.available) {
    return `[${inspectData.reason || 'Cannot inspect.'}]`;
  }
  if (inspectData.scoutLevel === 0) {
    return `[${inspectData.flavor}]`;
  }

  const d     = inspectData.data;
  const lines = [
    '',
    '========================================',
    '        E N E M Y   R E A D',
    '========================================',
    `  ${d.label}`,
    `  ${d.desc}`,
    '----------------------------------------'
  ];

  if (d.condition)  lines.push(`  Condition  : ${d.condition}`);
  if (d.behavior)   lines.push(`  Behavior   : ${d.behavior.charAt(0).toUpperCase() + d.behavior.slice(1)}`);
  if (d.threat)     lines.push(`  Threat     : ${d.threat}`);
  if (d.read)       lines.push(`  Read       : ${d.read}`);
  if (d.fullStats) {
    lines.push(`  Power      : Level ${d.fullStats.level}`);
    lines.push(`  Strength   : ${d.fullStats.strength}`);
    lines.push(`  Agility    : ${d.fullStats.agility}`);
    lines.push(`  Endurance  : ${d.fullStats.endurance}`);
    lines.push(`  HP         : ${d.fullStats.hp}/${d.fullStats.maxHP}`);
  }

  lines.push('========================================', '');
  return lines.join('\n');
}

module.exports.parsePickup = parsePickup;
