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
const durability = require('../../../game/durability');
const endless   = require('../../../game/endless');
const legacy    = require('../../../game/legacy');
const romance   = require('../../../game/romance');
const politics  = require('../../../game/politics');
const infamy    = require('../../../game/infamy');
const { removeCompanion } = require('../../../game/economy');
const { REGIONS } = require('../../../game/constants');

const FACTION_CMD   = /^(?:factions?|reputation|standing|standings|faction standing)[.!?]*$/i;
const ABILITY_CMD   = /^(?:abilities|skills|my abilities|spells|my spells|spellbook|powers)[.!?]*$/i;
const RECRUIT_CMD   = /^(?:i\s+)?(?:recruit|ask\s+(.+?)\s+to\s+(?:join|come|travel)|invite)\s*(.*?)[.!?]*$/i;
const HIRE_CMD      = /^(?:i\s+)?(?:hire|recruit)\s+(?:a\s+)?(?:sellsword|mercenary|merc|bodyguard|hireling)[.!?]*$/i;
const DISMISS_CMD   = /^(?:i\s+)?(?:dismiss|send away|part ways with|release)\s+(.+?)[.!?]*$/i;
const COMPANION_CMD = /^(?:companions|check companions|my companions|party|my party)[.!?]*$/i;

module.exports = function createWorldCommands(h) {
  const { sendCommand, narrateAndRespond, startEncounter, appendHint, spawnEnemy, getPlayerLevel, addTime } = h;
  const chronicle = require('../../../game/chronicle');
  const T = chronicle.TIME_COST;

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

    // ---------------- the living world ----------------
    const W = chronicle.worldOf(state);
    if (/^(?:chronicle|history|world history|the chronicle|timeline)[.!?]*$/i.test(cmd)) return sendCommand(req, res, chronicle.buildChronicleText(W), 'chronicle', { persist: false });
    if (/^(?:date|calendar|what day is it|time|the date)[.!?]*$/i.test(cmd)) {
      const a = chronicle.ageOf(state, W);
      return sendCommand(req, res, `${chronicle.formatDate(chronicle.nowHour(W))}\n${W.era.name}${W.realm ? ` — ${W.realm.title} rules` : ''}.\nYou are ${a} (${chronicle.ageBand(chronicle.bodyAge(state, W))}); natural span about ${Number.isFinite(chronicle.lifespan(state)) ? chronicle.lifespan(state) : '∞'} years.`, 'date', { persist: false });
    }
    if (/^(?:crises|crisis|news|world news)[.!?]*$/i.test(cmd)) return sendCommand(req, res, endless.crisisText(W), 'crises', { persist: false });
    if (/^(?:politics|wars|diplomacy|the powers|alliances)[.!?]*$/i.test(cmd)) return sendCommand(req, res, politics.buildPoliticsText(W, state), 'politics', { persist: false });
    if (/^(?:legends|heroes|figures|legacy)[.!?]*$/i.test(cmd)) return sendCommand(req, res, legacy.buildLegendsText(W, state), 'legends', { persist: false });
    if (/^(?:titles|my titles|renown)[.!?]*$/i.test(cmd)) {
      const ts = endless.titlesFor(state, W);
      return sendCommand(req, res, ts.length ? `Your titles: ${ts.join(' · ')}` : 'You have no titles yet. Deeds make titles.', 'titles', { persist: false });
    }
    if (/^(?:longevity|lifespan|immortality|aging|ageing)[.!?]*$/i.test(cmd)) {
      const opts = chronicle.longevityOptions(state, W);
      return sendCommand(req, res, ['PATHS TO A LONGER LIFE', ...opts.map(o => `  ${o.taken ? '✓' : o.available ? '•' : '✕'} ${o.label} — ${o.desc}`), '', 'When a path is open to you: "pursue <path name>".'].join('\n'), 'longevity', { persist: false });
    }
    if (state.deceased) return sendCommand(req, res, `${state.character.name} has died. Their story is part of the chronicle now. Choose "new character in this world", "new world", or resume another character from the Saves menu.`, 'deceased', { persist: false });

    // ---------------- combat-only guard ----------------
    if (state.inCombat) return null;

    // ---------------- living-world actions ----------------
    if (/^(?:answer the call|defend the region|face the crisis|end the crisis)[.!?]*$/i.test(cmd)) {
      const r = endless.startCrisisFight(state, W);
      if (!r.success) return sendCommand(req, res, r.message, 'crisis', { persist: false });
      startEncounter(state, r.enemy, `[CRISIS — ${r.enemy.label} (Lv${r.enemy.level}) threatens the region. ${r.enemy.desc}]`);
      events.push({ type: 'combatStart', label: r.enemy.label, level: r.enemy.level, boss: true });
      req.session.undoLocked = true; addTime(req, T.boss);
      return narrateAndRespond(req, res, input, events);
    }
    // ---------------- politics ----------------
    const enlistM = cmd.match(/^(?:i\s+)?(?:enlist with|join the side of|take the side of|fight for|swear (?:myself )?to|join)\s+(?:the\s+)?(wardens?|ember wardens|compact|free compact|remnant|veldrathi remnant|imperium|choir|ashen choir)\b/i);
    if (enlistM) { const r = politics.enlist(state, W, enlistM[1]); return sendCommand(req, res, r.message, 'politics', { persist: r.success }); }
    if (/^(?:i\s+)?(?:renounce (?:my )?allegiance|stay neutral|leave the war)[.!?]*$/i.test(cmd)) { const r = politics.renounce(state); return sendCommand(req, res, r.message, 'politics', { persist: r.success }); }
    if (/^(?:i\s+)?(?:fight in the war|join the battle|go to the front|fight on the front)[.!?]*$/i.test(cmd)) {
      const r = politics.startBattle(state, W);
      if (!r.success) return sendCommand(req, res, r.message, 'politics', { persist: false });
      startEncounter(state, r.enemy, `[WAR — a ${r.enemy.label} of the enemy side meets the player on the front line in ${REGIONS[state.character.region].label}.]`);
      events.push({ type: 'combatStart', label: r.enemy.label, level: r.enemy.level });
      req.session.undoLocked = true; addTime(req, 6);
      return narrateAndRespond(req, res, input, events);
    }
    const peaceM = cmd.match(/^(?:i\s+)?(?:negotiate|broker|mediate|seek)\s+(?:a\s+)?(?:peace|truce)(.*)$/i);
    if (peaceM) {
      const r = politics.negotiate(state, W, peaceM[1]);
      if (!r.success) return sendCommand(req, res, r.message, 'politics', { persist: false });
      req.session.undoLocked = true;
      return sendCommand(req, res, r.message, 'politics', { hours: r.hours });
    }
    const rulerM = cmd.match(/^(?:i\s+)?(declare war on|make peace with|ally with|form an alliance with)\s+(.+)$/i);
    if (rulerM) {
      const stance = /war/.test(rulerM[1]) ? 'war' : /peace/.test(rulerM[1]) ? 'truce' : 'alliance';
      const r = politics.declare(state, W, rulerM[2], stance);
      if (r.success) req.session.undoLocked = true;
      return sendCommand(req, res, r.message, 'politics', { persist: r.success });
    }

    const sagaCmd = endless.handleSagaCommand(state, W, input);
    if (sagaCmd) {
      if (sagaCmd.info || sagaCmd.started) return sendCommand(req, res, sagaCmd.message, 'saga', { persist: !!sagaCmd.started || /walk away/.test(sagaCmd.message) });
      if (sagaCmd.advance) {
        addTime(req, sagaCmd.hours || 4);
        sys(events, sagaCmd.message);
        const r = endless.onSagaEvent(state, W, { type: 'investigated' });
        if (r) { sys(events, r.message); if (r.levelUp) events.push(r.levelUp); }
        appendHint(state, `[SAGA — the player investigates. ${sagaCmd.message}]`);
        return narrateAndRespond(req, res, input, events);
      }
      if (sagaCmd.spawn) {
        startEncounter(state, sagaCmd.spawn, `[SAGA ${sagaCmd.boss ? 'BOSS' : 'FOE'} — ${sagaCmd.spawn.label} (Lv${sagaCmd.spawn.level}).]`);
        events.push({ type: 'combatStart', label: sagaCmd.spawn.label, level: sagaCmd.spawn.level, boss: !!sagaCmd.boss });
        req.session.undoLocked = true; addTime(req, 1);
        return narrateAndRespond(req, res, input, events);
      }
    }
    const governMatch = cmd.match(/^(?:i\s+)?(?:govern|rule)(?:\s+(?:the realm\s+)?(?:for|with|through)?\s*(.*))?$/i);
    if (governMatch) {
      const r = endless.govern(state, W, governMatch[1]);
      if (!r.success) return sendCommand(req, res, r.message, 'govern', { persist: false });
      req.session.undoLocked = true;
      return sendCommand(req, res, r.message, 'govern', { hours: r.hours });
    }
    const foundMatch = cmd.match(/^(?:i\s+)?(?:found|establish)\s+(?:an? )?(?:order|guild|school|company)?\s*(?:called|named)?\s*(.+)$/i);
    if (foundMatch && /\b(order|guild|school|company|brotherhood|sisterhood|academy|fellowship)\b/i.test(cmd)) {
      const r = endless.foundOrder(state, W, foundMatch[1]);
      if (!r.success) return sendCommand(req, res, r.message, 'found', { persist: false });
      req.session.undoLocked = true;
      return sendCommand(req, res, r.message, 'found', { hours: r.hours });
    }
    if (/^(?:i\s+)?(?:train|study|practise|practice|meditate)\b.*\bfor\b/i.test(cmd)) {
      const r = endless.train(state, W, cmd);
      if (!r.success) return sendCommand(req, res, r.message, 'train', { persist: false });
      req.session.undoLocked = true;
      return sendCommand(req, res, r.message + (r.levelUp ? `\nLevel ${r.levelUp.newLevel}!` : ''), 'train', { hours: r.hours });
    }
    const pursue = cmd.match(/^(?:i\s+)?(?:pursue|seek|undertake|perform|take)\s+(?:the\s+)?(?:path of\s+(?:the\s+)?)?(.+)$/i);
    if (pursue) {
      const target = pursue[1].toLowerCase();
      const id = Object.keys(chronicle.LONGEVITY_PATHS).find(k => chronicle.LONGEVITY_PATHS[k].label.toLowerCase().split(/\s+/).filter(w => w.length > 3).some(w => target.includes(w.replace(/['’]s$/, ''))));
      if (id) {
        const r = chronicle.pursueLongevity(state, W, id, { countMaterial: world.countMaterial, consumeMaterial: world.consumeMaterial });
        if (r.success) req.session.undoLocked = true;
        return sendCommand(req, res, r.message, 'longevity', { persist: r.success, hours: r.success ? 7 * 24 : 0 });
      }
    }
    const lesson = cmd.match(/^(?:i\s+)?(?:learn from|ask for a lesson from|take a lesson from|study under)\s+(.+)$/i);
    if (lesson) {
      const f = legacy.findFigure(W, state, lesson[1]);
      if (!f || f.status === 'deceased' || f.seat !== state.character.region) return sendCommand(req, res, 'No such teacher is here.', 'legacy', { persist: false });
      if (legacy.relation(f, W, state) !== 'mentor' && legacy.relation(f, W, state) !== 'patron') return sendCommand(req, res, `${f.name} has no interest in teaching you.`, 'legacy', { persist: false });
      const msg = legacy.takeLesson(f, state);
      return sendCommand(req, res, msg || `${f.name} has already taught you what they can.`, 'legacy', { persist: !!msg, hours: msg ? 24 : 0 });
    }

    // ---------------- scholar's scrolls ----------------
    if (/^(?:i\s+)?(?:read|study|use|learn from)\s+(?:the\s+|a\s+|my\s+)?spell scroll$/i.test(cmd)) {
      const { STARTING_SPELLS } = require('../../../game/constants');
      const idx = (state.inventory || []).findIndex(i => (typeof i === 'string' ? i : i.name) === 'spell scroll');
      if (idx < 0) return sendCommand(req, res, 'You have no spell scroll. Scholars can scribe them ("craft spell scroll").', 'scroll', { persist: false });
      if (!Array.isArray(state.spells)) state.spells = [];
      const order = (state.stats.wis || 10) > (state.stats.int || 10) ? ['divine_bolt', 'mana_bolt'] : ['mana_bolt', 'divine_bolt'];
      const spellId = order.find(id => !state.spells.some(sp => sp && sp.id === id));
      if (!spellId) return sendCommand(req, res, 'The scroll teaches nothing you do not already know.', 'scroll', { persist: false });
      state.inventory.splice(idx, 1);
      state.spells.push({ ...STARTING_SPELLS[spellId] });
      return sendCommand(req, res, `You study the scroll until the words burn themselves into memory. Spell learned: ${STARTING_SPELLS[spellId].label} ("cast ${STARTING_SPELLS[spellId].label}").`, 'scroll');
    }

    // ---------------- repair & reforge ----------------
    const repairMatch = cmd.match(/^(?:i\s+)?(?:repair|mend|fix)(?:\s+(?:my\s+|the\s+)?(gear|equipment|everything|all|weapon|armou?r|sword|blade|bow|staff|dagger|axe|mace|spear|mail|leather armou?r))?$/i);
    if (repairMatch) {
      const what = /weapon|sword|blade|bow|staff|dagger|axe|mace|spear/.test(repairMatch[1] || '') ? 'weapon' : /armou?r|mail|leather/.test(repairMatch[1] || '') ? 'armor' : 'all';
      const result = durability.repair(state, what);
      return sendCommand(req, res, result.message, 'repair', { persist: result.success });
    }
    const reforgeMatch = cmd.match(/^(?:i\s+)?reforge\s*(?:my\s+|the\s+)?(.*)$/i);
    if (reforgeMatch) {
      const result = durability.reforge(state, reforgeMatch[1]);
      return sendCommand(req, res, result.message, 'reforge', { persist: result.success });
    }

    // ---------------- crafting ----------------
    const craft = crafting.detectCraft(state, input);
    if (craft) {
      const result = crafting.craft(state, craft);
      if (!result.success) return sendCommand(req, res, result.message, 'craft', { persist: false });
      events.push({ type: 'itemCrafted', item: result.item });
      addTime(req, result.item && typeof result.item.tier === 'number' ? T.craftGear : T.craftItem);
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
      addTime(req, 0);
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
      addTime(req, T.boss);
      sys(events, `BOSS: ${result.enemy.label} — Lv${result.enemy.level}, ${result.enemy.maxHP} HP. Watch for telegraphed attacks and defend against them. Type "abilities" for your options.`);
      req.session.undoLocked = true;
      return narrateAndRespond(req, res, input, events);
    }

    if (campaign.detectRift(input)) {
      const result = endless.startRift(state);
      if (!result.success) return sendCommand(req, res, result.message, 'rift', { persist: false });
      startEncounter(state, result.enemy, `[RIFT ${result.depth} — an echo of a past foe, ${result.enemy.label}, steps out of the rift.]`);
      if (result.affixes.length) sys(events, `RIFT ${result.depth} (Lv${result.enemy.level}): ${result.affixes.map(a => `${a.label} — ${a.desc}`).join('; ')}.`);
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

    // ---------------- romance (and villainy) ----------------
    const love = romance.handle(state, input, { removeCompanion });
    if (love) {
      if (!love.success) return sendCommand(req, res, love.message, 'romance', { persist: false });
      req.session.undoLocked = true;
      addTime(req, love.hours || 0);
      sys(events, love.message);
      if (love.event) events.push(love.event);
      if (love.hint) appendHint(state, love.hint);
      if (love.event && love.event.partner) req.sceneNpc = love.event.type === 'villainy' ? null : love.event.partner;
      return narrateAndRespond(req, res, input, events);
    }

    // ---------------- talking to named people ----------------
    const talk = world.detectTalkIntent(input);
    if (talk) {
      const fig = legacy.findFigure(W, state, talk.target);
      if (fig && fig.status !== 'deceased' && fig.seat === state.character.region) {
        const d = legacy.figureDialogue(fig, W, state);
        req.sceneNpc = fig.name;
        sys(events, d.text);
        addTime(req, T.talk);
        appendHint(state, `[LEGEND — the player meets ${fig.name}, ${fig.title}, a legendary figure of this world (a past hero). Relation: ${d.relation}. Personality: ${(fig.personality || []).join(', ')}. Stay faithful to: ${d.text}]`);
        return narrateAndRespond(req, res, input, events);
      }
      if (fig && fig.status === 'deceased') return sendCommand(req, res, `${fig.name} is dead — ${chronicle.figureStatus(fig, W)}.`, 'talk', { persist: false });
      if (fig && fig.seat && REGIONS[fig.seat]) return sendCommand(req, res, `${fig.name} holds their seat in ${REGIONS[fig.seat].label}.`, 'talk', { persist: false });
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
        addTime(req, T.talk);
        if (story) {
          pushCampaign(events, story);
          req.session.undoLocked = true;
          appendHint(state, `[STORY CONVERSATION — ${npc.name} (${npc.role}). What they say is fixed: ${story.messages[0] || ''} Voice it naturally; do not add new facts or rewards.]`);
          return narrateAndRespond(req, res, input, events);
        }
        const shunned = factions.isShunnedBy(state, npc.faction);
        const holder = chronicle.currentHolder(W, npc);
        req.sceneNpc = holder.name;
        const rumor = legacy.rumorFor(W, state.character.region, state.actionCount || 0);
        const wronged = state.npcRelationships && state.npcRelationships[npc.id] && state.npcRelationships[npc.id].wronged;
        const reaction = infamy.greetingReaction(state);
        const line = wronged
          ? `${holder.name} backs away from you, white-faced. "Stay away from me."`
          : shunned
          ? `${holder.name} turns away. The ${factions.FACTIONS[npc.faction].label} want nothing to do with you.`
          : reaction ? `${holder.name}, ${npc.role}: ${reaction}`
          : (postgameLine(state, holder) || `${holder.name}, ${npc.role}${holder.age ? ` (${holder.age})` : ''}: "${holder.greet}"`) + (rumor && !story ? `\n${rumor}` : '');
        sys(events, line + (rosterId && !shunned ? `\n${comps.ROSTER[rosterId].personality}` : ''));
        appendHint(state, `[NPC — the player talks with ${npc.name}, ${npc.role} (${factions.FACTIONS[npc.faction] ? factions.FACTIONS[npc.faction].label : 'local'}). ${shunned ? 'They are hostile to the player.' : `They say: "${npc.greet}"`} Keep them consistent with that. Do not grant items, coin or quests.]`);
        return narrateAndRespond(req, res, input, events);
      }
    }

    // ---------------- exploration ----------------
    const legacyPlace = /^(?:i\s+)?(?:explore|visit|enter|investigate|search)\b/i.test(cmd) ? legacy.findLegacyPlace(W, state, cmd) : null;
    if (legacyPlace) {
      if (!state.discoveredLandmarks) state.discoveredLandmarks = {};
      const key = `${state.character.region}:${legacyPlace.id}`;
      addTime(req, 2);
      if (legacyPlace.kind === 'tomb' && legacyPlace.relic && !legacyPlace.relic.claimedBy) {
        const level = Math.max(getPlayerLevel(state.totalXP || 0), REGIONS[state.character.region].levelRange[0]);
        const enemy = spawnEnemy(state.character.region, level);
        if (enemy) {
          enemy.label = `Tomb-warden of ${legacyPlace.figure.name}`;
          enemy.maxHP = enemy.currentHP = Math.round(enemy.maxHP * 1.8);
          enemy.meta = { relic: legacyPlace.figure.characterId };
          startEncounter(state, enemy, `[TOMB — ${legacyPlace.desc} A guardian rises.]`);
          sys(events, `${legacyPlace.desc}`);
          req.session.undoLocked = true;
          return narrateAndRespond(req, res, input, events);
        }
      }
      sys(events, legacyPlace.desc);
      if (!state.discoveredLandmarks[key]) {
        state.discoveredLandmarks[key] = { at: state.actionCount || 0 };
        const { grantXP } = require('../../../game/character');
        const xp = 20 * Math.min(100, getPlayerLevel(state.totalXP || 0));
        const lu = grantXP(state, xp);
        sys(events, `You learn something of the world's past. +${xp} XP.`);
        if (lu) events.push(lu);
      }
      appendHint(state, `[HISTORY — ${legacyPlace.desc}]`);
      return narrateAndRespond(req, res, input, events);
    }

    const explore = world.detectExploreIntent(state, input);
    if (explore && explore.type === 'list') return sendCommand(req, res, world.buildLandmarkList(state), 'explore', { persist: false });
    if (explore && explore.type === 'landmark') {
      const result = world.exploreLandmark(state, explore.text);
      if (result.already) return sendCommand(req, res, result.message, 'explore', { persist: false });
      const hz = world.applyHazard(state);
      if (hz && !hz.warded) sys(events, hz.message);
      addTime(req, T.explore);
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
      addTime(req, T.gather);
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
