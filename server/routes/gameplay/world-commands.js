'use strict';

// =============================================================
// World, story, faction and companion commands for /api/action.
// Kept separate from register.js so the main route stays readable.
// Each handler returns a response (via the helpers) or null when
// the input is not one of its commands.
// =============================================================

const world     = require('../../../game/world');
const campaign  = require('../../../game/campaign');
const factions  = require('../../../game/factions');
const comps     = require('../../../game/companions');
const tactics   = require('../../../game/combat-tactics');
const crafting  = require('../../../game/crafting-recipes');
const { REGIONS } = require('../../../game/constants');

const FACTION_CMD   = /^(?:factions?|reputation|standing|standings|faction standing)[.!?]*$/i;
const ABILITY_CMD   = /^(?:abilities|skills|my abilities|spells|my spells|spellbook|powers)[.!?]*$/i;
const RECRUIT_CMD   = /^(?:i\s+)?(?:recruit|ask\s+(.+?)\s+to\s+(?:join|come|travel)|invite)\s*(.*?)[.!?]*$/i;
const HIRE_CMD      = /^(?:i\s+)?(?:hire|recruit)\s+(?:a\s+)?(?:sellsword|mercenary|merc|bodyguard|hireling)[.!?]*$/i;
const DISMISS_CMD   = /^(?:i\s+)?(?:dismiss|send away|part ways with|release)\s+(.+?)[.!?]*$/i;
const COMPANION_CMD = /^(?:companions|check companions|my companions|party|my party)[.!?]*$/i;

module.exports = function createWorldCommands(h) {
  const { sendCommand, narrateAndRespond, startEncounter, appendHint, spawnEnemy, getPlayerLevel } = h;

  function sys(events, message) { if (message) events.push({ type: 'system', message }); }

  // Folds a campaign result's messages/level-ups into the events list.
  function pushCampaign(events, result) {
    if (!result) return;
    for (const m of result.messages || []) sys(events, m);
    for (const lu of result.levelUps || []) events.push(lu);
    if (result.chapterComplete) events.push({ type: 'chapterComplete', chapter: result.chapterComplete });
  }

  async function handle(req, res, input, cmd, events) {
    const state = req.session.state;
    campaign.ensureCampaign(state);
    factions.ensureFactions(state);

    // ---------------- information ----------------
    if (campaign.STORY_PATTERN.test(cmd)) return sendCommand(req, res, campaign.buildStoryText(state), 'story', { persist: false });
    if (FACTION_CMD.test(cmd)) return sendCommand(req, res, factions.buildFactionText(state), 'factions', { persist: false });
    if (ABILITY_CMD.test(cmd)) return sendCommand(req, res, buildAbilityText(state), 'abilities', { persist: false });
    if (COMPANION_CMD.test(cmd)) return sendCommand(req, res, comps.buildCompanionText(state), 'companions', { persist: false });
    if (/^(?:recipes|crafting|craft list|what can i (?:craft|make|forge|brew))[.!?]*$/i.test(cmd)) return sendCommand(req, res, crafting.buildRecipeText(state), 'recipes', { persist: false });
    if (/^(?:materials|my materials)[.!?]*$/i.test(cmd)) return sendCommand(req, res, crafting.buildMaterialText(state), 'materials', { persist: false });

    // ---------------- combat-only guard ----------------
    if (state.inCombat) return null;

    // ---------------- crafting ----------------
    const craft = crafting.detectCraft(state, input);
    if (craft) {
      const result = crafting.craft(state, craft);
      if (!result.success) return sendCommand(req, res, result.message, 'craft', { persist: false });
      events.push({ type: 'itemCrafted', item: result.item });
      sys(events, result.message);
      appendHint(state, `[CRAFTED — the player made ${result.item.name} from their materials. Describe the work briefly. Do not invent other items.]`);
      return narrateAndRespond(req, res, input, events);
    }

    // ---------------- story choices ----------------
    const choice = campaign.detectChoice(cmd);
    if (choice) {
      const result = campaign.makeChoice(state, choice);
      if (!result.success) return sendCommand(req, res, result.message, 'story', { persist: false });
      pushCampaign(events, result);
      const loyalty = comps.onFactionChanges(state, result.choice && result.choice.factions
        ? Object.entries(result.choice.factions).map(([faction, delta]) => ({ faction, delta })) : []);
      for (const l of loyalty) sys(events, l);
      req.session.undoLocked = true;
      appendHint(state, `[STORY DECISION — the player chose: "${result.choice.label}". ${result.choice.text} Narrate the consequence in a few sentences. Do not add new rewards.]`);
      return narrateAndRespond(req, res, input, events);
    }

    // ---------------- boss confrontations ----------------
    const confront = campaign.detectConfront(state, input);
    if (confront) {
      const result = campaign.startBoss(state, confront);
      if (!result.success) return sendCommand(req, res, result.message, 'story', { persist: false });
      startEncounter(state, result.enemy, `[BOSS — ${result.enemy.label} (Lv${result.enemy.level}). ${result.enemy.desc} This is a major story battle. Make its arrival dramatic.]`);
      events.push({ type: 'combatStart', label: result.enemy.label, level: result.enemy.level, boss: true });
      sys(events, `BOSS: ${result.enemy.label} — Lv${result.enemy.level}, ${result.enemy.maxHP} HP. Watch for telegraphed attacks and defend against them. Type "abilities" for your options.`);
      req.session.undoLocked = true;
      return narrateAndRespond(req, res, input, events);
    }

    if (campaign.detectRift(input)) {
      const result = campaign.startRift(state);
      if (!result.success) return sendCommand(req, res, result.message, 'rift', { persist: false });
      startEncounter(state, result.enemy, `[RIFT ${result.depth} — an echo of a past foe, ${result.enemy.label}, steps out of the rift.]`);
      events.push({ type: 'combatStart', label: result.enemy.label, level: result.enemy.level, boss: true });
      req.session.undoLocked = true;
      return narrateAndRespond(req, res, input, events);
    }

    // ---------------- companions ----------------
    if (HIRE_CMD.test(cmd)) {
      const result = comps.hireSellsword(state);
      return sendCommand(req, res, result.message, 'companion', { persist: result.success });
    }
    const dismissMatch = cmd.match(DISMISS_CMD);
    if (dismissMatch && (state.companions || []).length) {
      const result = comps.dismiss(state, dismissMatch[1]);
      if (result.success) return sendCommand(req, res, result.message, 'companion');
    }
    const recruitMatch = cmd.match(RECRUIT_CMD);
    if (recruitMatch && /^(?:i\s+)?(?:recruit|ask|invite)/i.test(cmd)) {
      const target = (recruitMatch[1] || recruitMatch[2] || '').trim();
      if (target) {
        const result = comps.recruit(state, target);
        if (!result.unknown || /^(?:i\s+)?recruit/i.test(cmd)) {
          if (result.success) {
            events.push({ type: 'companionJoined', companion: result.companion });
            sys(events, result.message);
            appendHint(state, `[COMPANION JOINED — ${result.companion.name} now travels with the player. ${result.companion.description}]`);
            return narrateAndRespond(req, res, input, events);
          }
          return sendCommand(req, res, result.message, 'companion', { persist: false });
        }
      }
    }

    // ---------------- talking to named people ----------------
    const talk = world.detectTalkIntent(input);
    if (talk) {
      const story = campaign.handleTalk(state, talk.target);
      const npc = world.findNpcInRegion(state.character.region, talk.target) || (story && story.npc);
      if (story && (story.notHere || story.notReady)) {
        return sendCommand(req, res, story.message, 'talk', { persist: false });
      }
      if (npc && (story || world.findNpcInRegion(state.character.region, talk.target))) {
        const rosterId = comps.findRosterId(npc.name);
        if (rosterId) comps.onMeet(state, rosterId);
        world.recordMeeting(state, npc.id);
        state.currentNPC = npc.name;
        if (story) {
          pushCampaign(events, story);
          req.session.undoLocked = true;
          appendHint(state, `[STORY CONVERSATION — ${npc.name} (${npc.role}). What they say is fixed: ${story.messages[0] || ''} Voice it naturally; do not add new facts or rewards.]`);
          return narrateAndRespond(req, res, input, events);
        }
        const shunned = factions.isShunnedBy(state, npc.faction);
        const line = shunned
          ? `${npc.name} turns away. The ${factions.FACTIONS[npc.faction].label} want nothing to do with you.`
          : postgameLine(state, npc) || `${npc.name}, ${npc.role}: "${npc.greet}"`;
        sys(events, line + (rosterId && !shunned ? `\n${comps.ROSTER[rosterId].personality}` : ''));
        appendHint(state, `[NPC — the player talks with ${npc.name}, ${npc.role} (${factions.FACTIONS[npc.faction] ? factions.FACTIONS[npc.faction].label : 'local'}). ${shunned ? 'They are hostile to the player.' : `They say: "${npc.greet}"`} Keep them consistent with that. Do not grant items, coin or quests.]`);
        return narrateAndRespond(req, res, input, events);
      }
    }

    // ---------------- exploration ----------------
    const explore = world.detectExploreIntent(state, input);
    if (explore && explore.type === 'list') return sendCommand(req, res, world.buildLandmarkList(state), 'explore', { persist: false });
    if (explore && explore.type === 'landmark') {
      const result = world.exploreLandmark(state, explore.text);
      if (result.already) return sendCommand(req, res, result.message, 'explore', { persist: false });
      const hz = world.applyHazard(state);
      if (hz && !hz.warded) sys(events, hz.message);
      if (result.guardian) {
        const level = getPlayerLevel(state.totalXP || 0);
        const region = REGIONS[state.character.region];
        const enemy = spawnEnemy(state.character.region, Math.max(level, region.levelRange[0]) + 1);
        if (enemy) {
          enemy.label = `${enemy.label}, guardian of ${result.landmark.name.replace(/^the /, '')}`;
          enemy.maxHP = Math.round(enemy.maxHP * 1.4);
          enemy.currentHP = enemy.maxHP;
          enemy.xpMod = (enemy.xpMod || 1) * 1.5;
          enemy.meta = { landmark: { region: state.character.region, id: result.landmark.id } };
          startEncounter(state, enemy, `[LANDMARK — the player enters ${result.landmark.name}: ${result.landmark.desc} A ${enemy.label} guards it and attacks.]`);
          events.push({ type: 'combatStart', label: enemy.label, level: enemy.level });
          sys(events, `${result.landmark.name}: ${result.landmark.desc}\nSomething guards this place.`);
          return narrateAndRespond(req, res, input, events);
        }
      }
      if (result.success) {
        sys(events, result.message);
        if (result.levelUp) events.push(result.levelUp);
        pushCampaign(events, campaign.onEvent(state, { type: 'landmark', region: state.character.region, id: result.landmark.id }));
        appendHint(state, `[EXPLORATION — the player explores ${result.landmark.name}: ${result.landmark.desc}${result.lore ? ` They learn: ${result.lore}` : ''} Rewards are already granted; do not add more.]`);
        return narrateAndRespond(req, res, input, events);
      }
    }

    // ---------------- gathering ----------------
    const gatherIntent = world.detectGatherIntent(input);
    if (gatherIntent) {
      const result = world.gather(state, gatherIntent.target);
      if (!result.success) return sendCommand(req, res, result.message, 'gather', { persist: false });
      sys(events, result.message);
      const hz = world.applyHazard(state);
      if (hz && !hz.warded) sys(events, hz.message);
      appendHint(state, `[GATHERING — the player gathers ${result.material} in ${REGIONS[state.character.region].label}. Describe it briefly.]`);
      // Working the land draws attention.
      if (Math.random() < 0.15) {
        const enemy = spawnEnemy(state.character.region, getPlayerLevel(state.totalXP || 0));
        if (enemy) {
          startEncounter(state, enemy, `[AMBUSH WHILE GATHERING — a ${enemy.label} attacks. ${enemy.desc}]`);
          events.push({ type: 'combatStart', label: enemy.label, level: enemy.level, ambient: true });
        }
      }
      return narrateAndRespond(req, res, input, events);
    }

    return null;
  }

  function postgameLine(state, npc) {
    const c = state.campaign;
    if (!c || !c.ending) return null;
    const ending = campaign.ENDINGS[c.ending];
    return `${npc.name}, ${npc.role}: "They say you stood before the Throne itself. ${ending.title} — that is what they are calling it. ${npc.greet}"`;
  }

  function buildAbilityText(state) {
    const lines = ['ABILITIES', ''];
    const list = tactics.buildAbilityList(state);
    for (const a of list) lines.push(`  ${a.label} — ${a.desc}`);
    if (!state.combatClass) lines.push('', '  (No class yet. Fight, sneak, cast or pray in your own way and a class will be offered.)');
    const spells = state.spells || [];
    if (spells.length) {
      lines.push('', 'SPELLS');
      for (const s of spells) lines.push(`  ${s.label} — ${s.manaCost} mana · ${s.desc || ''}`);
    }
    lines.push('', 'In combat: name an ability ("I use Shield Bash"), "cast <spell>", "defend", "drink potion", or "flee".',
      'Defending blunts telegraphed attacks (⚠). "inspect" reveals an enemy\'s weaknesses.');
    return lines.join('\n');
  }

  return { handle, pushCampaign };
};
