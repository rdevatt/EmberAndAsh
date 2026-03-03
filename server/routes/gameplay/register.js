'use strict';

const { buildOpeningHint } = require('./utils');
const { resolveCorpseLoot } = require('../../../game/loot');

module.exports = function registerGameplayRoutes(app, deps) {
  const {
    db,
    REGIONS,
    requireSession,
    persistSession,
    setSession,
    isInCreation,
    isDead,
    isReady,
    createFreshState,
    processCreationInput,
    buildCharacterPanelData,
    getPlayerLevel,
    spendFreePoint,
    recalculateResources,
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
    checkIntimacyAvailable,
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
    processNarrative,
    buildRightPanelData,
    detectBoardIntent,
    detectQuestAccept,
    refreshBoard,
    getBoardQuests,
    acceptQuestByIndex,
    acceptQuest,
    buildBoardDisplayData,
    buildBoardInspectHint,
    checkQuestProgress,
    processQuestCompletions,
    buildActiveQuestContext
  } = deps;

  app.post('/api/action', requireSession, async (req, res) => {
    const { input } = req.body;
    if (!input || typeof input !== 'string' || input.trim().length === 0) {
      return res.status(400).json({ error: 'Input required.' });
    }

    const state = req.session.state;

    const cleanInput = input.trim();
    const events     = [];

    const { createStateSnapshot } = require('../../../game/state');
    req.session.stateSnapshot = createStateSnapshot(state);
    req.session.lastInput = cleanInput;

    try {
      if (isInCreation(state)) {
        const result = processCreationInput(state, cleanInput);

        if (!result) {
          console.error('[Creation] processCreationInput returned null for phase', state.creation.phase, 'input:', JSON.stringify(cleanInput));
          return res.status(500).json({
            error: `Creation phase ${state.creation.phase} returned no result. Check console.`
          });
        }

        if (result.done) {
          state.pendingContextHint = buildOpeningHint(state);
          state.creationPrompt     = null;
        } else {
          state.creationPrompt = result.prompt;
        }

        const narrative = await processNarrative(state, cleanInput, events);
        await persistSession(req.sessionId);

        return res.json({
          success:    true,
          output:     narrative.fullOutput,
          character:  buildCharacterPanelData(state),
          rightPanel: narrative.rightPanel,
          inCreation: isInCreation(state)
        });
      }

      if (state.pendingClassOffer) {
        const result = processClassOfferResponse(state, cleanInput);
        if (result.handled) {
          if (result.accepted === true)  events.push({ type: 'classAccepted',  message: result.message, key: result.key });
          if (result.accepted === false) events.push({ type: 'classDeclined',  message: result.message });
          if (result.pending)            events.push({ type: 'statScreen',     content: result.message });

          const narrative = await processNarrative(state, cleanInput, events);
          await persistSession(req.sessionId);
          return res.json({
            success:     true,
            output:      narrative.fullOutput,
            character:   buildCharacterPanelData(state),
            progression: buildProgressionPanelData(state),
            rightPanel:  narrative.rightPanel
          });
        }
      }

      if (state.pendingProfOffer) {
        const result = processProfessionOfferResponse(state, cleanInput);
        if (result.handled) {
          if (result.accepted === true)  events.push({ type: 'professionAccepted', message: result.message, key: result.key });
          if (result.accepted === false) events.push({ type: 'professionDeclined', message: result.message });
          if (result.pending)            events.push({ type: 'statScreen',         content: result.message });

          const narrative = await processNarrative(state, cleanInput, events);
          await persistSession(req.sessionId);
          return res.json({
            success:     true,
            output:      narrative.fullOutput,
            character:   buildCharacterPanelData(state),
            progression: buildProgressionPanelData(state),
            rightPanel:  narrative.rightPanel
          });
        }
      }

      const t = cleanInput.toLowerCase().trim();

      if (['rest', 'sleep', 'recover', 'take a break', 'catch my breath', 'sit down', 'rest up'].includes(t) ||
          t.startsWith('rest ') || t.includes('rest for') || t.includes('take a rest')) {
        if (state.inCombat) {
          return res.json({ success: true, output: "You can't rest while in combat!", isCommand: true });
        }

        const staminaRecovery = Math.floor(state.maxStamina * 0.5);
        const hpRecovery = Math.floor(state.maxHp * 0.25);
        const manaRecovery = Math.floor(state.maxMana * 0.25);

        const oldStamina = state.stamina;
        const oldHp = state.hp;
        const oldMana = state.mana;

        state.stamina = Math.min(state.maxStamina, state.stamina + staminaRecovery);
        state.hp = Math.min(state.maxHp, state.hp + hpRecovery);
        state.mana = Math.min(state.maxMana, state.mana + manaRecovery);

        const staminaGained = state.stamina - oldStamina;
        const hpGained = state.hp - oldHp;
        const manaGained = state.mana - oldMana;

        await persistSession(req.sessionId);

        return res.json({
          success: true,
          output: `You take a moment to rest and recover.\n\n` +
                  `Stamina: +${staminaGained} (${state.stamina}/${state.maxStamina})\n` +
                  `HP: +${hpGained} (${state.hp}/${state.maxHp})\n` +
                  `Mana: +${manaGained} (${state.mana}/${state.maxMana})`,
          character: buildCharacterPanelData(state),
          isCommand: true,
          commandType: 'rest'
        });
      }

      if (['long rest', 'sleep', 'make camp', 'set up camp', 'camp', 'full rest', 'rest fully'].includes(t) ||
          t.includes('long rest') || t.includes('make camp') || t.includes('set up camp')) {
        if (state.inCombat) {
          return res.json({ success: true, output: "You can't rest while in combat!", isCommand: true });
        }

        const safeKeywords = ['inn', 'tavern', 'temple', 'church', 'home', 'house', 'bedroom',
                              'sanctuary', 'safehouse', 'barracks', 'guild', 'shelter', 'cabin',
                              'lodge', 'hostel', 'room', 'quarters', 'bed', 'rented', 'paid for'];
        const currentLoc = (state.currentLocation || '').toLowerCase();
        const recentContext = (state.sceneContext || '').toLowerCase();
        const lastStory = (state.storySummary || '').toLowerCase();
        const playerInput = cleanInput.toLowerCase();

        const isSafe = safeKeywords.some(loc =>
          currentLoc.includes(loc) ||
          recentContext.includes(loc) ||
          lastStory.includes(loc) ||
          playerInput.includes(loc)
        );

        let ambushed = false;
        if (!isSafe) {
          const region = REGIONS[state.character.region];
          const dangerMod = region && region.levelRange ? (region.levelRange[1] / 100) : 0;
          const ambushChance = 0.15 + dangerMod;
          ambushed = Math.random() < ambushChance;
        }

        if (ambushed) {
          const playerLevel = getPlayerLevel(state.totalXP || 0);
          const enemy = spawnEnemy(state.character.region, playerLevel);

          if (enemy) {
            state.inCombat = true;
            state.currentEnemy = enemy;

            state.stamina = Math.min(state.maxStamina, state.stamina + Math.floor(state.maxStamina * 0.3));
            state.hp = Math.min(state.maxHp, state.hp + Math.floor(state.maxHp * 0.15));
            state.mana = Math.min(state.maxMana, state.mana + Math.floor(state.maxMana * 0.15));

            await persistSession(req.sessionId);

            return res.json({
              success: true,
              output: `You settle down to rest, but your sleep is cut short—\n\n` +
                      `A ${enemy.label} has found you!\n\n` +
                      `You scramble to your feet, still groggy from interrupted sleep.`,
              character: buildCharacterPanelData(state),
              rightPanel: buildRightPanelData(state),
              isCommand: false
            });
          }
        }

        state.stamina = state.maxStamina;
        state.hp = state.maxHp;
        state.mana = state.maxMana;

        await persistSession(req.sessionId);

        const restMessage = isSafe
          ? `You settle in for a peaceful night's rest.\n\nThe ${currentLoc || 'shelter'} keeps you safe through the night.`
          : `You find a spot to rest, keeping one eye open.\n\nHours pass. You wake feeling restored.`;

        return res.json({
          success: true,
          output: `${restMessage}\n\n` +
                  `Stamina: ${state.stamina}/${state.maxStamina} (full)\n` +
                  `HP: ${state.hp}/${state.maxHp} (full)\n` +
                  `Mana: ${state.mana}/${state.maxMana} (full)`,
          character: buildCharacterPanelData(state),
          isCommand: true,
          commandType: 'longRest'
        });
      }

      if (['check stats', 'status', 'character sheet', 'view stats', 'my stats'].includes(t)) {
        const panel = buildCharacterPanelData(state);
        return res.json({ success: true, output: null, character: panel, isCommand: true, commandType:'stats' });
      }

      if (['check gear', 'gear', 'inventory', 'check inventory', 'my inventory', 'equipment', 'my gear'].includes(t)) {
        const panel = buildEconomyPanelData(state);
        return res.json({
          success: true,
          output: buildBackpackSummary(state),
          economy: panel,
          isCommand: true,
          commandType:'gear'
        });
      }

      if (['backpack', 'my backpack', 'check backpack', 'open backpack'].includes(t)) {
        const panel = buildEconomyPanelData(state);
        return res.json({
          success: true,
          output: buildBackpackSummary(state),
          economy: panel,
          isCommand: true,
          commandType: 'backpack'
        });
      }

      if (t.startsWith('set companion ') || t.startsWith('add companion ')) {
        const name = cleanInput.replace(/^(set|add) companion\s+/i, '').trim();
        if (!name) {
          return res.json({ success: true, output: 'Specify a companion name. Example: set companion Elara', isCommand: true });
        }

        const result = addCompanion(state, {
          name: name.charAt(0).toUpperCase() + name.slice(1).toLowerCase(),
          description: 'A companion who joined your journey.',
          role: 'ally'
        });

        await persistSession(req.sessionId);
        return res.json({
          success: true,
          output: result.success ? `${result.companion.name} has joined your party.` : result.message,
          economy: buildEconomyPanelData(state),
          isCommand: true,
          commandType: 'companion'
        });
      }

      if (['companions', 'check companions', 'my companions', 'party', 'my party'].includes(t)) {
        const companionData = getCompanionsDisplay(state);
        return res.json({
          success: true,
          output: companionData.hasCompanions ? `Your companions: ${companionData.display}` : 'You are traveling alone.',
          economy: buildEconomyPanelData(state),
          isCommand: true,
          commandType: 'companions'
        });
      }

      if (/\b(spend|allocate|put|add)\b/.test(t) && /\b(str|strength|dex|dexterity|vit|vitality|int|intelligence|wis|wisdom|cha|charisma)\b/.test(t)) {
        const result = spendFreePoint(state, cleanInput);
        events.push({ type: 'freePointSpent', ...result });
        return res.json({ success: true, output: result.message, character: buildCharacterPanelData(state), isCommand: true, commandType: 'freePoint' });
      }

      if (t === 'nsfw on' || t === 'nsfw off' || t === 'enable nsfw' || t === 'disable nsfw') {
        const enabled = t.includes('on') || t.includes('enable');
        state.nsfwEnabled = enabled;
        if (req.session.playerId) db.setNSFWSetting(req.session.playerId, enabled);
        return res.json({
          success: true,
          output: enabled
            ? '[Adult content enabled. Intimate scenes will play out fully when earned.]'
            : '[Adult content disabled. Intimate scenes will fade to black.]',
          isCommand: true,
          commandType:'nsfw'
        });
      }

      if (['inspect', 'size up', 'assess', 'read the enemy', 'study enemy'].some(w => t.includes(w))) {
        const inspectData = buildEnemyInspectData(state);
        events.push({ type: 'inspect', content: formatInspectResult(inspectData) });
        const narrative = await processNarrative(state, cleanInput, events);
        return res.json({ success: true, output: narrative.fullOutput, rightPanel: narrative.rightPanel });
      }

      if ((t.includes('recover') || t.includes('retrieve')) && (t.includes('gear') || t.includes('equipment') || t.includes('belongings'))) {
        const result = recoverGear(state);
        if (result.success) {
          events.push({ type: 'gearRecovered', ...result });
        }
        const narrative = await processNarrative(state, cleanInput, events);
        await persistSession(req.sessionId);
        return res.json({ success: true, output: narrative.fullOutput, economy: buildEconomyPanelData(state), rightPanel: narrative.rightPanel });
      }

      if (t.includes('open shop') || t.includes('set up shop') || t.includes('open stall')) {
        const result = tryOpenShop(state);
        if (!result.success) {
          return res.json({ success: true, output: result.message, isCommand: true });
        }
      }

      if (t.includes('close shop') || t.includes('pack up shop')) {
        const result = tryCloseShop(state);
        return res.json({ success: true, output: result.message, isCommand: true });
      }

      if ((t.includes('loot') || t.includes('search') || t.includes('take')) && (t.includes('corpse') || t.includes('body'))) {
        if (state.inCombat && state.currentEnemy && state.currentEnemy.currentHP > 0) {
          return res.json({ success: true, output: 'You cannot loot a body while still in active combat.', isCommand: true, commandType: 'loot' });
        }

        const lootState = state.lastDefeatedEnemyLoot;
        if (!lootState || !lootState.label) {
          return res.json({ success: true, output: 'There is no recently defeated body to loot.', isCommand: true, commandType: 'loot' });
        }

        if (lootState.looted) {
          return res.json({ success: true, output: 'You already looted that body.', isCommand: true, commandType: 'loot' });
        }

        const resolvedLoot = resolveCorpseLoot(lootState.label);
        const items = resolvedLoot.items;
        const coinReward = resolvedLoot.coinReward;

        for (const item of items) addItem(state, item);
        if (coinReward > 0) addCoin(state, coinReward);

        state.lastDefeatedEnemyLoot.looted = true;
        state.pendingContextHint = `[LOOT ACQUIRED — player looted ${lootState.label}: ${items.join(', ')}${coinReward > 0 ? ` and ${formatCoin(coinReward)}` : ''}. Narrate this naturally.]`;

        await persistSession(req.sessionId);
        return res.json({
          success: true,
          output: `Looted ${lootState.label}: ${items.join(', ')}.${coinReward > 0 ? ` Added to coin pouch: ${formatCoin(coinReward)}.` : ''}`,
          economy: buildEconomyPanelData(state),
          character: buildCharacterPanelData(state),
          isCommand: true,
          commandType: 'loot'
        });
      }

      if ((/\bput\s+all\b/.test(t) || /\bstash\b/.test(t) || /\bstore\b/.test(t)) && /\b(backpack|pack|bag)\b/.test(t)) {
        const moved = [];

        if (state.gear && state.gear.weapon) {
          moved.push(state.gear.weapon.name);
          addItem(state, state.gear.weapon);
          state.gear.weapon = null;
        }

        if (state.gear && state.gear.armor) {
          moved.push(state.gear.armor.name);
          addItem(state, state.gear.armor);
          state.gear.armor = null;
        }

        await persistSession(req.sessionId);

        return res.json({
          success: true,
          output: moved.length
            ? `Moved to backpack: ${moved.join(', ')}.`
            : 'Nothing equipped to move into your backpack.',
          economy: buildEconomyPanelData(state),
          character: buildCharacterPanelData(state),
          isCommand: true,
          commandType: 'backpackStash'
        });
      }

      const takePatterns = [
        /^(?:take|loot|pick up|grab)\s+(?:the\s+)?(.+?)(?:\s+from.+)?$/i
      ];

      const maybeTakeSegments = cleanInput
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const takenItems = [];
      let coinGained = 0;

      function parseCoinLoot(itemName) {
        const lower = itemName.toLowerCase();
        const isCoinLike = /(coin|coins|pouch|silver|gold|copper)/i.test(lower);
        if (!isCoinLike) return 0;

        let total = 0;
        const goldMatch = lower.match(/(\d+)\s*gold/);
        const silverMatch = lower.match(/(\d+)\s*silver/);
        const copperMatch = lower.match(/(\d+)\s*copper/);

        if (goldMatch) total += parseInt(goldMatch[1], 10) * 10000;
        if (silverMatch) total += parseInt(silverMatch[1], 10) * 100;
        if (copperMatch) total += parseInt(copperMatch[1], 10);

        if (total > 0) return total;

        if (/gold/.test(lower)) return 10000;
        if (/silver/.test(lower)) return 100;
        if (/copper/.test(lower)) return 1;

        if (/pouch|coins?/.test(lower)) return 50;
        return 0;
      }

      for (const segment of maybeTakeSegments) {
        for (const pattern of takePatterns) {
          const match = segment.match(pattern);
          if (!match || !match[1]) continue;

          const raw = match[1].trim().replace(/\s*(from|off of|off)\s+.*/i, '');
          const phraseParts = raw.split(/\s+and\s+/i).map(p => p.trim()).filter(Boolean);

          for (const phrase of phraseParts) {
            const itemName = phrase.replace(/^(a|an|the)\s+/i, '').trim();
            if (itemName.length > 0 && itemName.length < 50) {
              const coinFromItem = parseCoinLoot(itemName);
              if (coinFromItem > 0) {
                addCoin(state, coinFromItem);
                coinGained += coinFromItem;
                events.push({ type: 'coinEarned', amount: coinFromItem, message: `You collected ${formatCoin(coinFromItem)}.` });
              } else {
                addItem(state, itemName);
                takenItems.push(itemName);
                events.push({ type: 'itemTaken', item: itemName, message: `You picked up: ${itemName}` });
              }
            }
          }

          break;
        }
      }

      if (takenItems.length > 0 || coinGained > 0) {
        const hints = [];
        if (takenItems.length > 0) {
          hints.push(`player now has ${takenItems.map(i => `"${i}"`).join(', ')} in their inventory`);
        }
        if (coinGained > 0) {
          hints.push(`player gained ${formatCoin(coinGained)}`);
        }
        state.pendingContextHint = `[ITEM ACQUIRED — ${hints.join(' and ')}. Narrate this naturally.]`;
        await persistSession(req.sessionId);

        const outputParts = [];
        if (takenItems.length > 0) outputParts.push(`Added to backpack: ${takenItems.join(', ')}.`);
        if (coinGained > 0) outputParts.push(`Added to coin pouch: ${formatCoin(coinGained)}.`);

        return res.json({
          success: true,
          output: outputParts.join(' '),
          economy: buildEconomyPanelData(state),
          character: buildCharacterPanelData(state),
          isCommand: true,
          commandType: 'loot'
        });
      }

      const equipIntent = detectEquipIntent(cleanInput);
      if (equipIntent) {
        const equipResult = processEquipCommand(state, equipIntent);
        if (equipResult) {
          if (equipResult.success) {
            events.push({
              type: equipIntent.intent === 'equip' ? 'itemEquipped' : 'itemUnequipped',
              item: equipResult.item,
              slot: equipResult.slot,
              message: equipResult.message
            });
            state.pendingContextHint = `[GEAR UPDATED — ${equipResult.message}. Narrate this naturally.]`;
          } else if (equipResult.notFound) {
            state.pendingContextHint = equipResult.hint;
            events.push({ type: 'equipFailed', message: equipResult.message });
          }

          await persistSession(req.sessionId);
          return res.json({
            success: true,
            output: equipResult.message,
            character: buildCharacterPanelData(state),
            economy: buildEconomyPanelData(state),
            rightPanel: buildRightPanelData(state),
            isCommand: true,
            commandType: equipIntent.intent === 'equip' ? 'equip' : 'unequip'
          });
        }
      }

      const companionIntent = detectCompanionIntent(cleanInput, state);
      if (companionIntent && companionIntent.npcName) {
        if (companionIntent.intent === 'join') {
          const npcKey = companionIntent.npcName.toLowerCase();
          const rapport = state.npcRelationships && state.npcRelationships[npcKey]
            ? state.npcRelationships[npcKey].rapport || 0
            : 0;

          if (rapport >= 30) {
            const result = addCompanion(state, {
              name: companionIntent.npcName.charAt(0).toUpperCase() + companionIntent.npcName.slice(1),
              description: `A companion met in your travels.`,
              role: 'ally'
            });

            if (result.success) {
              events.push({ type: 'companionJoined', companion: result.companion });
              state.pendingContextHint = `[COMPANION JOINED — ${result.companion.name} has agreed to travel with the player. Narrate this naturally as a meaningful moment.]`;
            } else {
              state.pendingContextHint = `[COMPANION LIMIT — ${result.message}]`;
            }
          } else {
            state.pendingContextHint = `[COMPANION DECLINED — Not enough rapport (${rapport}/30) with ${companionIntent.npcName}. They are not ready to commit to traveling together. Narrate a polite decline.]`;
          }
        } else if (companionIntent.intent === 'leave') {
          const result = removeCompanion(state, companionIntent.npcName);
          if (result.success) {
            events.push({ type: 'companionLeft', companion: result.companion });
            state.pendingContextHint = `[COMPANION LEFT — ${result.companion.name} has parted ways with the player. Narrate this farewell naturally.]`;
          }
        }
      }

      if (isDead(state)) {
        const playerLevel  = getPlayerLevel(state.totalXP || 0);
        const levelsLost   = state.deathCount + 1;
        state.deathCount   = (state.deathCount || 0) + 1;
        const newLevel     = Math.max(1, playerLevel - levelsLost);
        const { getXPForLevel } = require('../../../game/character');
        state.totalXP      = getXPForLevel(newLevel);
        state.hp           = state.maxHp;
        state.stamina      = state.maxStamina;
        state.mana         = state.maxMana;
        state.inCombat     = false;
        state.currentEnemy = null;

        const hadGear = saveGearAtDeath(state);
        changeReputation(state, state.character.region, -5);

        const regionLabel = buildCharacterPanelData(state).region || 'the region';

        events.push({ type: 'death', deathCount: state.deathCount, levelsLost, newLevel, hadGear, regionLabel });
      }

      if (state.inCombat && state.currentEnemy && detectFleeIntent(cleanInput)) {
        const fleeResult = applyFleeAttempt(state);
        state.pendingContextHint = fleeResult.hint;

        const narrative = await processNarrative(state, cleanInput, events);
        await persistSession(req.sessionId);
        return res.json({ success: true, output: narrative.fullOutput, character: buildCharacterPanelData(state), rightPanel: narrative.rightPanel });
      }

      if (state.inCombat && state.currentEnemy) {
        if (state.currentEnemy.currentHP <= 0) {
          console.log('[Combat] Clearing stale combat state - enemy already dead');
          state.inCombat = false;
          state.currentEnemy = null;
        }
      }

      if (state.inCombat && state.currentEnemy && state.currentEnemy.currentHP > 0) {
        const combatResult = applyCombatRound(state, cleanInput);
        state.pendingContextHint = combatResult.hint;

        updateActionProgress(state, cleanInput);

        if (combatResult.enemyKilled) {
          events.push({
            type:  'enemyKill',
            label: state.pendingEnemyKill ? state.pendingEnemyKill.label : 'Enemy',
            xp:    state.pendingEnemyKill ? state.pendingEnemyKill.xp    : 0
          });

          state.lastDefeatedEnemyLoot = {
            label: state.pendingEnemyKill ? state.pendingEnemyKill.label : 'Enemy',
            looted: false,
            ts: Date.now()
          };

          if (state.pendingEnemyKill) {
            const { getPlayerLevel: gpl } = require('../../../game/character');
            const prevLevel  = gpl(state.totalXP || 0);
            state.totalXP    = (state.totalXP || 0) + state.pendingEnemyKill.xp;
            state.classXP    = (state.classXP  || 0) + state.pendingEnemyKill.xp;
            const newLevel   = gpl(state.totalXP);
            state.pendingEnemyKill = null;

            if (newLevel > prevLevel) {
              const pts        = newLevel - prevLevel;
              state.freePoints = (state.freePoints || 0) + pts;
              recalculateResources(state);
              events.push({ type: 'levelUp', prevLevel, newLevel, freePointsAwarded: pts });
            }
          }
        }

        const progressEvents = processPendingProgressEvents(state);
        events.push(...progressEvents);

        const narrative = await processNarrative(state, cleanInput, events);
        await persistSession(req.sessionId);

        const fullOutput = combatResult.combatLog
          ? (narrative.fullOutput || '') + combatResult.combatLog
          : narrative.fullOutput;

        req.session.lastOutput = fullOutput;
        req.session.lastCombatLog = combatResult.combatLog || null;
        req.session.lastCombatResult = state.pendingCombatResult;
        req.session.lastEvents = events;
        setSession(req.sessionId, req.session);

        return res.json({
          success: true,
          output: fullOutput,
          character: buildCharacterPanelData(state),
          progression: buildProgressionPanelData(state),
          economy: buildEconomyPanelData(state),
          rightPanel: narrative.rightPanel
        });
      }

      if (!state.inCombat && detectBoardIntent(cleanInput)) {
        state.pendingContextHint = buildBoardInspectHint(state);
      }

      if (!state.inCombat && detectQuestAccept(cleanInput) && state.boardQuests && state.boardQuests.length > 0) {
        const numMatch = cleanInput.match(/\b([1-9])\b/);
        if (numMatch) {
          const result = acceptQuestByIndex(state, parseInt(numMatch[1]));
          if (result.success) {
            events.push({ type: 'questAccepted', quest: result.quest });
            state.pendingContextHint = result.hint || `[QUEST ACCEPTED: "${result.quest.label}" — narrate naturally.]`;
          }
        } else {
          const t2 = cleanInput.toLowerCase();
          const quests = getBoardQuests(state);
          for (let i = 0; i < quests.length; i++) {
            const q = quests[i];
            if (
              (t2.includes('hunt') && q.type === 'hunt') ||
              (t2.includes('escort') && q.type === 'escort') ||
              (t2.includes('patrol') && q.type === 'patrol') ||
              (t2.includes('retrieve') && q.type === 'retrieve') ||
              (t2.includes('scout') && q.type === 'scout') ||
              (t2.includes('advance') && q.type === 'advance') ||
              (t2.includes('move on') && q.type === 'advance')
            ) {
              const result = acceptQuest(state, q.id);
              if (result.success) {
                events.push({ type: 'questAccepted', quest: result.quest });
                state.pendingContextHint = result.hint;
                break;
              }
            }
          }
        }
      }

      if (state.activeQuests && state.activeQuests.length > 0) {
        const killEvents = events.filter(e => e.type === 'enemyKill').map(e => ({ type:'enemyDefeated', enemyLabel: e.label || '' }));
        const questUpdates = checkQuestProgress(state, cleanInput, killEvents);
        if (questUpdates.length > 0) events.push(...questUpdates.map(u => ({ type:'questProgress', ...u })));

        const completions = processQuestCompletions(state);
        for (const c of completions) {
          events.push({ type:'questComplete', quest:c.quest, reward:c.reward, hint:c.hint });
          state.pendingContextHint = (state.pendingContextHint ? state.pendingContextHint + '\n\n' : '') + c.hint;
        }
      }

      if (detectCombatIntent(cleanInput) && state.character && !state.inCombat) {
        const playerLevel = getPlayerLevel(state.totalXP || 0);
        const enemy       = spawnEnemy(state.character.region, playerLevel);

        if (enemy) {
          state.inCombat     = true;
          state.currentEnemy = enemy;
          const unbeatable   = (enemy.level - playerLevel) >= 20;
          state.pendingContextHint = unbeatable
            ? `[ENEMY SPAWNED: ${enemy.label} — far beyond the player. Cannot be defeated. Narrate absolute dominance.]`
            : `[ENEMY SPAWNED: ${enemy.label} Lv${enemy.level}. ${enemy.desc} Behavior: ${enemy.behavior}. Player attacked first. Begin the combat scene.]`;
        }
      }

      if (!state.inCombat && !isPassiveAction(cleanInput)) {
        const ambientEnemy = checkAmbientEncounter(state);
        if (ambientEnemy) {
          state.inCombat     = true;
          state.currentEnemy = ambientEnemy;
          state.pendingContextHint = `[AMBIENT ENCOUNTER — a ${ambientEnemy.label} appears unexpectedly. ${ambientEnemy.desc} Behavior: ${ambientEnemy.behavior}. Player did not seek this fight — introduce naturally. They can fight, flee, or attempt to avoid it.]`;
        }
      }

      if (state.shopOpen && !state.inCombat) {
        const shopEvent = checkShopCustomerEvent(state);
        if (shopEvent) {
          state.pendingContextHint = shopEvent.hint;
        }
      }

      if (state.profession && !state.inCombat) {
        const taskResult = resolveProfessionTask(state, cleanInput);
        if (taskResult) {
          state.pendingContextHint = taskResult.hint;

          if (state.pendingProfXP && state.pendingProfXP > 0) {
            state.profXP         = (state.profXP || 0) + state.pendingProfXP;
            state.pendingProfXP  = 0;
          }
        }
      }

      if (!state.inCombat) {
        updateActionProgress(state, cleanInput);
      }

      const coinIntent = detectCoinIntent(cleanInput);
      if (coinIntent && coinIntent.intent === 'earn') {
        state.pendingCoinGain  = (state.pendingCoinGain  || 0) + coinIntent.amount;
      }
      if (coinIntent && coinIntent.intent === 'spend') {
        state.pendingCoinSpend = (state.pendingCoinSpend || 0) + coinIntent.amount;
      }

      const coinEvents = processPendingCoinEvents(state);
      for (const ce of coinEvents) {
        if (ce.type === 'coinSpend' && !ce.success) {
          events.push({ type: 'coinSpendFailed', hint: ce.hint });
          state.pendingContextHint = ce.hint;
        }
      }

      if (!state.inCombat) {
        const recovery = Math.floor((state.maxStamina || 10) * 0.15);
        state.stamina  = Math.min(state.maxStamina, (state.stamina || state.maxStamina) + recovery);
      }

      const progressEvents = processPendingProgressEvents(state);
      events.push(...progressEvents);

      const activeQuestCtx = buildActiveQuestContext(state);
      if (activeQuestCtx) {
        state.pendingContextHint = state.pendingContextHint
          ? state.pendingContextHint + '\n\n' + activeQuestCtx
          : activeQuestCtx;
      }

      const narrative = await processNarrative(state, cleanInput, events);

      await persistSession(req.sessionId);

      req.session.lastOutput = narrative.fullOutput;
      req.session.lastCombatLog = null;
      req.session.lastEvents = events;
      setSession(req.sessionId, req.session);

      if (req.session.saveId) {
        db.appendStoryHistory(
          req.session.saveId,
          state.actionCount || 0,
          cleanInput,
          narrative.narrative || '',
          state.sceneContext || 'neutral'
        );
      }

      return res.json({
        success: true,
        output: narrative.fullOutput,
        character: buildCharacterPanelData(state),
        progression: buildProgressionPanelData(state),
        economy: buildEconomyPanelData(state),
        rightPanel: narrative.rightPanel,
        board: buildBoardDisplayData(state),
        inCreation: isInCreation(state)
      });
    } catch (err) {
      console.error('[Action] Unhandled error:', err);
      return res.status(500).json({
        error:  'Something went wrong. Your progress has been saved.',
        detail: err.message
      });
    }
  });

  app.post('/api/retry-narrative', requireSession, async (req, res) => {
    const state = req.session.state;
    const lastInput = req.session.lastInput;

    if (!lastInput) {
      return res.status(400).json({ error: 'No previous action to retry.' });
    }

    try {
      const events = req.session.lastEvents || [];
      const narrative = await processNarrative(state, lastInput, events);

      const fullOutput = req.session.lastCombatLog
        ? (narrative.fullOutput || '') + req.session.lastCombatLog
        : narrative.fullOutput;

      req.session.lastOutput = fullOutput;
      setSession(req.sessionId, req.session);

      return res.json({
        success: true,
        output: fullOutput,
        character: buildCharacterPanelData(state),
        progression: buildProgressionPanelData(state),
        economy: buildEconomyPanelData(state),
        rightPanel: narrative.rightPanel,
        board: buildBoardDisplayData(state)
      });
    } catch (err) {
      console.error('[RetryNarrative] Error:', err);
      return res.status(500).json({ error: 'Failed to regenerate narrative.' });
    }
  });

  app.post('/api/undo', requireSession, async (req, res) => {
    const { restoreStateSnapshot } = require('../../../game/state');

    if (!req.session.stateSnapshot) {
      return res.status(400).json({ error: 'Nothing to undo.' });
    }

    try {
      restoreStateSnapshot(req.session.state, req.session.stateSnapshot);

      const undoneInput = req.session.lastInput;
      req.session.stateSnapshot = null;
      req.session.lastInput = null;
      req.session.lastOutput = null;
      req.session.lastCombatLog = null;
      req.session.lastCombatResult = null;
      req.session.lastEvents = null;

      setSession(req.sessionId, req.session);
      await persistSession(req.sessionId);

      return res.json({
        success: true,
        message: 'Action undone. You can try something different.',
        undoneInput: undoneInput,
        character: buildCharacterPanelData(req.session.state),
        progression: buildProgressionPanelData(req.session.state),
        economy: buildEconomyPanelData(req.session.state),
        rightPanel: {
          inCombat: req.session.state.inCombat || false,
          enemy: req.session.state.currentEnemy ? buildEnemyPanelData(req.session.state) : null,
          sceneContext:req.session.state.sceneContext || 'neutral'
        },
        board: buildBoardDisplayData(req.session.state)
      });
    } catch (err) {
      console.error('[Undo] Error:', err);
      return res.status(500).json({ error: 'Failed to undo action.' });
    }
  });

  app.post('/api/edit-action', requireSession, async (req, res) => {
    const { input } = req.body;
    const { restoreStateSnapshot, createStateSnapshot } = require('../../../game/state');

    if (!input || typeof input !== 'string' || input.trim().length === 0) {
      return res.status(400).json({ error: 'New input required.' });
    }

    if (!req.session.stateSnapshot) {
      return res.status(400).json({ error: 'No previous action to edit.' });
    }

    try {
      restoreStateSnapshot(req.session.state, req.session.stateSnapshot);

      req.session.stateSnapshot = createStateSnapshot(req.session.state);
      req.session.lastInput = input.trim();

      setSession(req.sessionId, req.session);

      const state = req.session.state;
      const cleanInput = input.trim();
      const events = [];

      if (isInCreation(state)) {
        return res.status(400).json({ error: 'Cannot edit during character creation.' });
      }

      if (state.inCombat && state.currentEnemy && !detectFleeIntent(cleanInput)) {
        const combatResult = applyCombatRound(state, cleanInput);
        state.pendingContextHint = combatResult.hint;
        updateActionProgress(state, cleanInput);

        if (combatResult.enemyKilled && state.pendingEnemyKill) {
          events.push({ type: 'enemyKill', label: state.pendingEnemyKill.label, xp: state.pendingEnemyKill.xp });

          const { getPlayerLevel: gpl } = require('../../../game/character');
          const prevLevel = gpl(state.totalXP || 0);
          state.totalXP = (state.totalXP || 0) + state.pendingEnemyKill.xp;
          state.classXP = (state.classXP || 0) + state.pendingEnemyKill.xp;
          const newLevel = gpl(state.totalXP);
          state.pendingEnemyKill = null;

          if (newLevel > prevLevel) {
            const pts = newLevel - prevLevel;
            state.freePoints = (state.freePoints || 0) + pts;
            recalculateResources(state);
            events.push({ type: 'levelUp', prevLevel, newLevel, freePointsAwarded: pts });
          }
        }

        const narrative = await processNarrative(state, cleanInput, events);
        await persistSession(req.sessionId);

        const fullOutput = combatResult.combatLog
          ? (narrative.fullOutput || '') + combatResult.combatLog
          : narrative.fullOutput;

        req.session.lastOutput = fullOutput;
        req.session.lastCombatLog = combatResult.combatLog || null;
        req.session.lastCombatResult = state.pendingCombatResult;
        req.session.lastEvents = events;
        setSession(req.sessionId, req.session);

        return res.json({
          success: true,
          output: fullOutput,
          character: buildCharacterPanelData(state),
          progression: buildProgressionPanelData(state),
          economy: buildEconomyPanelData(state),
          rightPanel: narrative.rightPanel
        });
      }

      const narrative = await processNarrative(state, cleanInput, events);
      await persistSession(req.sessionId);

      req.session.lastOutput = narrative.fullOutput;
      req.session.lastCombatLog = null;
      req.session.lastEvents = events;
      setSession(req.sessionId, req.session);

      return res.json({
        success: true,
        output: narrative.fullOutput,
        character: buildCharacterPanelData(state),
        progression: buildProgressionPanelData(state),
        economy: buildEconomyPanelData(state),
        rightPanel: narrative.rightPanel,
        board: buildBoardDisplayData(state)
      });
    } catch (err) {
      console.error('[EditAction] Error:', err);
      return res.status(500).json({ error: 'Failed to process edited action.' });
    }
  });
};

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
