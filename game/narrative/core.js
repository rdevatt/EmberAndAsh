'use strict';

// =============================================================
// EMBER AND ASH — NARRATIVE
// Builds AI prompts, calls Groq, manages story summary,
// and assembles the right panel context data.
// This is the only file that talks to the AI.
// The AI writes prose. It never touches game logic.
// =============================================================

const Groq = require('groq-sdk');

const { BACKGROUNDS, REGIONS, WORLD_TIERS, CLASSES, PROFESSIONS } = require('../constants');

const {
  getPlayerLevel,
  getHPLabel,
  getStaminaLabel,
  getActiveWeapon,
  getActiveArmor
} = require('../character');

const { 
  getReputationLabel, 
  formatCoin,
  addItem,
  addCompanion,
  removeCompanion,
  equipWeapon,
  equipArmor
} = require('../economy');

const {
  detectItemsInNarrative,
  detectCompanionChangesInNarrative,
  applyDetectedChanges: applyDetectedChangesInternal,
  extractCurrentNPC
} = require('./detections');


// =============================================
// GROQ CLIENT
// =============================================
let groq = null;
function getGroqClient() {
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groq;
}
const MODEL          = 'llama-3.3-70b-versatile';
const MAX_TOKENS     = 600;   // Per narrative response
const SUMMARY_TOKENS = 300;   // Per summary update
const SUMMARY_EVERY  = 10;    // Update story summary every N actions


// =============================================
// SYSTEM PROMPT
// Defines the AI's role absolutely.
// Never changes. Never mentions game systems.
// =============================================
const SYSTEM_PROMPT = `You are the narrative engine for Ember and Ash, a text-based dark fantasy RPG.

YOUR ROLE:
- Write immersive, grounded prose describing what happens in the world
- You receive structured facts in brackets. Narrate ONLY from those facts
- You do not invent outcomes. You do not change who hit whom. You do not ignore results
- You write the scene as it happened according to the game engine

TONE:
- Dark, grounded, literary. Not heroic fantasy. Not grimdark torture porn.
- Think Joe Abercrombie, not Tolkien. Gritty but with humanity.
- Violence has weight. People have fears. The world is indifferent.
- Short punchy sentences in action. Longer breath in quiet moments.

STRICT RULES:
- NEVER mention HP, damage numbers, XP, levels, stats, or any game mechanic in narrative
- NEVER break the fourth wall
- NEVER use phrases like "your stats", "your inventory", "you have gained XP"
- DO reflect physical state through description — a wounded character moves differently, breathes harder
- DO use the character's appearance, background, and gear in your descriptions naturally
- Response length should match the scene. Quiet moments can breathe. Action can be punchy. Rich scenes deserve rich prose. Do not artificially cap length.
- End on an open beat — describe the world settling into stillness, waiting. Never write the player's next action or decision for them.

CHARACTER PHYSICALITY:
- The player's physical description is CANON. Use it. Reference it. Let NPCs react to it.
- Height, build, scars, distinctive features — these should appear naturally in narrative when relevant.
- If the character is tall, NPCs look up. If they're heavyset, furniture creaks. If they have visible scars, people notice.
- GENERAL FEATURES (height, build, scars, hair, face) can be referenced anytime — in combat, social scenes, exploration.
- INTIMATE FEATURES (genitalia, private body details) are ONLY referenced during intimate/sexual scenes. Never mention these in combat, shopping, or casual conversation.
- In physical or intimate scenes, the character's body as described is the body that exists in the story.
- Do not sanitize or ignore physical details the player established — they are part of the character, used in appropriate context.

PLAYER AGENCY — THIS IS ABSOLUTE AND INVIOLABLE:
- The player character is "you" but YOU DO NOT CONTROL THEM.
- NEVER write what the player character says. No dialogue from them. Not even implied speech.
- NEVER write what the player character thinks or feels internally. No "you feel proud", no "you realize", no "a sense of X washes over you".
- NEVER narrate the player's actions back to them. If they said "I stir the pot", do NOT write "You stir the pot" or "You busy yourself at the hearth". START with what happens NEXT — the smell rising, the fire crackling, an NPC reacting.
- NEVER decide what the player does after the current beat. No "you glance up", no "you turn to face", no "you consider your options".
- Write ONLY: the world's response, NPC actions and dialogue, environmental details, consequences of the player's stated action.
- End scenes in stillness. The world waits. The player chooses what happens next.

CORRECT EXAMPLE:
Player: "I stir the stew and add herbs"
WRONG: "You stir the stew carefully, adding a pinch of rosemary. The smell makes you smile."
RIGHT: "The herbs dissolve into the broth. Steam rises, carrying the scent of rosemary and thyme through the cabin. Elara inhales deeply. 'You know your way around a cookfire,' she says."

INTIMATE SCENES:
- If instructed to write an intimate scene, treat it as one story beat among many
- Write it with the same craft and restraint as any other scene
- The character's physical description applies fully — use the details the player established
- When it reaches a natural conclusion, return to the wider story
- Never escalate beyond what the instruction specifies
- Never re-initiate after conclusion unless the player does

CREATION PHASES:
- When given a creation prompt, output it exactly as provided, word for word
- Do not add commentary, do not continue the story, do not roleplay`;


// =============================================
// CONTEXT BLOCK BUILDERS
// Each builds one section of the AI prompt.
// Assembled in buildFullPrompt().
// =============================================

function buildCharacterContext(state) {
  if (!state.character || !state.stats) return '';

  const c          = state.character;
  const s          = state.stats;
  const bg         = BACKGROUNDS[c.background];
  const rg         = REGIONS[c.region];
  const playerLevel= getPlayerLevel(state.totalXP || 0);
  const cls        = state.combatClass  ? CLASSES[state.combatClass]    : null;
  const prof       = state.profession   ? PROFESSIONS[state.profession] : null;
  const hpLabel    = getHPLabel(state.hp || state.maxHp, state.maxHp || 1);
  const stamLabel  = getStaminaLabel(state.stamina || state.maxStamina, state.maxStamina || 1);
  const aw         = getActiveWeapon(state);
  const aa         = getActiveArmor(state);

  const weaponStr  = aw
    ? `${aw.name} (${aw.quality})`
    : (state.gear && state.gear.weapon ? `carries ${state.gear.weapon.name} but cannot use it yet` : 'unarmed');
  const armorStr   = aa
    ? `${aa.name} (${aa.quality})`
    : (state.gear && state.gear.armor ? `has ${state.gear.armor.name} but cannot use it yet` : 'unarmored');

  const rep        = state.reputation ? (state.reputation[c.region] || 0) : 0;
  const repLabel   = getReputationLabel(rep);
  const repNote    = rep >= 20  ? 'People are warm and forthcoming.'
                   : rep >= -20 ? 'People treat them as a stranger — neutral.'
                   : 'People are hostile or alert to their presence.';

  // Companions
  const companionStr = state.companions && state.companions.length > 0
    ? `Companions: ${state.companions.map(c => c.name).join(', ')}.`
    : 'Traveling alone.';

  return [
    '[CHARACTER — never state numbers, but DO use physical appearance contextually]',
    `${c.age}yo ${c.gender} | ${bg ? bg.label : c.background} | ${rg ? rg.label : 'Unknown'}`,
    c.description ? `Physical appearance: ${c.description}` : '',
    c.description ? '[Use general features (height, build, scars) anytime. Use intimate details ONLY in intimate scenes.]' : '',
    `STR ${s.str}  DEX ${s.dex}  VIT ${s.vit}  INT ${s.int}  WIS ${s.wis}  CHA ${s.cha}`,
    `Level ${playerLevel}` +
      (cls  ? ` | ${cls.label} Lv${state.classLevel || 1}` : '') +
      (prof ? ` | ${prof.label} Lv${state.professionLevel || 1}` : ''),
    `Physical: ${hpLabel}. Stamina: ${stamLabel}.`,
    `Gear: ${weaponStr}, ${armorStr}.`,
    `Coin: ${formatCoin(state.coin || 0)}. Carrying: ${state.inventory && state.inventory.length ? state.inventory.join(', ') : 'nothing notable'}.`,
    companionStr,
    `Reputation: ${repLabel}. ${repNote}`,
    state.shopOpen ? `Runs an active shop stall here.` : '',
    '[High stats = natural aptitude. Low stats = tendency toward failure or struggle.]',
    '[Do not mention any numbers or system terms in narrative.]'
  ].filter(Boolean).join('\n');
}

function buildRegionContext(state) {
  if (!state.character) return '';

  const r = REGIONS[state.character.region];
  if (!r) return '';

  const playerLevel  = getPlayerLevel(state.totalXP || 0);
  const [mn, mx]     = r.levelRange || r.monsterLevel || [1, 10];
  const tier         = r.tier || 1;
  const tierData     = WORLD_TIERS[tier - 1] || WORLD_TIERS[0];

  // Level gap indicators
  const overLevel    = playerLevel >= mx + 1;
  const underLevel   = playerLevel < mn;
  const gapNote      = overLevel
    ? `[PLAYER IS OVER-LEVELED FOR THIS AREA — they have mastered this region. Enemies should feel less threatening. The advance quest on the bounty board points them toward ${r.connections && r.connections.next && r.connections.next[0] ? REGIONS[r.connections.next[0]] ? REGIONS[r.connections.next[0]].label : r.connections.next[0] : 'the next region'}.]`
    : underLevel
    ? `[PLAYER IS UNDER-LEVELED — this area is dangerous to them. Enemies should feel overwhelming. Survival is uncertain.]`
    : '';

  return [
    `[REGION: ${r.label} | Tier ${tier}: ${tierData.label} | Danger Lv${mn}–${mx} | Player Lv${playerLevel}]`,
    `Setting: ${r.flavor}.`,
    `Common threats: ${r.monsters.slice(0, 3).join(', ')}.`,
    gapNote,
    `[Introduce only enemies appropriate to this region. Do not narrate this block directly.]`
  ].filter(Boolean).join('\n');
}

function buildCombatContext(state) {
  if (!state.inCombat || !state.currentEnemy) return '';

  const enemy  = state.currentEnemy;
  const ePct   = enemy.currentHP / enemy.maxHP;
  const status = ePct < 0.15 ? 'nearly dead — staggering, barely standing'
               : ePct < 0.35 ? 'badly wounded — clearly losing'
               : ePct < 0.60 ? 'wounded — showing the toll of the fight'
               : 'mostly unharmed so far';

  return [
    '[COMBAT ACTIVE]',
    `Fighting: ${enemy.label} (${status}, behavior: ${enemy.behavior})`,
    enemy.desc,
    'Maintain tension. Describe physical details — movement, weight, sound, impact.',
    'Never mention HP, damage numbers, levels, or stats in narrative.'
  ].join('\n');
}

function buildSceneContext(state) {
  const lines = [];

  if (state.currentLocation) {
    lines.push(`[Current location: ${state.currentLocation}]`);
  }

  if (state.currentNPC) {
    lines.push(`[Interacting with: ${state.currentNPC}]`);
  }

  if (state.sceneContext && state.sceneContext !== 'neutral') {
    lines.push(`[Scene tone: ${state.sceneContext}]`);
  }

  if (state.storySummary) {
    lines.push(`[Story so far: ${state.storySummary}]`);
  }

  return lines.join('\n');
}


function buildPendingHint(state) {
  if (!state.pendingContextHint) return '';
  const hint = state.pendingContextHint;
  state.pendingContextHint = null;
  return hint;
}


// =============================================
// FULL PROMPT ASSEMBLER
// Combines all context blocks into the final
// message sent to Groq.
// =============================================
function buildFullPrompt(state, playerInput) {
  const sections = [
    buildRegionContext(state),
    buildCharacterContext(state),
    buildCombatContext(state),
    buildSceneContext(state),
    buildPendingHint(state)
  ].filter(s => s && s.trim().length > 0);

  const contextBlock = sections.join('\n\n');

  // Reinforcement reminder placed right before player action
  const agencyReminder = '[REMEMBER: Do not restate the player\'s action. Do not write their dialogue, thoughts, or feelings. Start with what happens NEXT in the world.]';

  return contextBlock
    ? `${contextBlock}\n\n${agencyReminder}\n\n[Player action]: ${playerInput}`
    : `${agencyReminder}\n\n[Player action]: ${playerInput}`;
}


// =============================================
// GROQ API CALL
// Single responsibility: call the API and return text.
// All error handling lives here.
// =============================================
async function callGroq(prompt, systemOverride = null, history = []) {
  try {
    const response = await getGroqClient().chat.completions.create({
      model:       MODEL,
      max_tokens:  MAX_TOKENS,
      temperature: 0.85,
      messages: [
        {
          role:    'system',
          content: systemOverride || SYSTEM_PROMPT
        },
        ...history,
        {
          role:    'user',
          content: prompt
        }
      ]
    });

    return {
      success: true,
      text:    response.choices[0]?.message?.content?.trim() || '',
      tokens:  response.usage?.total_tokens || 0
    };

  } catch (err) {
    console.error('[Narrative] Groq call failed:', err.message);

    // Return a safe fallback so the game never hard-crashes on AI failure
    return {
      success: false,
      text:    'The world holds its breath for a moment. Then the story continues.',
      error:   err.message,
      tokens:  0
    };
  }
}


// =============================================
// STORY SUMMARY UPDATER
// Maintains a rolling summary of what has happened.
// Called every SUMMARY_EVERY actions.
// Feeds the right panel and helps the AI maintain continuity.
// =============================================
async function updateStorySummary(state, recentNarrative) {
  if (!recentNarrative || recentNarrative.length < 20) return;

  const existing = state.storySummary || '';

  const summaryPrompt = existing
    ? `Previous summary: ${existing}\n\nNew events: ${recentNarrative}\n\nWrite an updated summary in 2-3 sentences. Focus on what has changed and what matters most. Plain prose, no brackets.`
    : `Summarize these story events in 2-3 sentences. Focus on what happened and what matters. Plain prose, no brackets.\n\n${recentNarrative}`;

  const summarySystem = 'You are summarizing a fantasy RPG story. Write a concise 2-3 sentence summary in plain prose. No game mechanics, no brackets, no lists.';

  const result = await callGroq(summaryPrompt, summarySystem);

  if (result.success && result.text) {
    state.storySummary    = result.text;
    state.summaryUpdatedAt = state.actionCount || 0;
  }
}


// =============================================
// CREATION PROMPT HANDLER
// During character creation, output the stored
// prompt exactly — no AI generation needed.
// =============================================
function handleCreationOutput(state) {
  if (!state.creationPrompt) return null;
  const prompt = state.creationPrompt;
  state.creationPrompt = null;
  return prompt;
}


function applyDetectedChanges(state, items, companionChanges) {
  return applyDetectedChangesInternal(state, items, companionChanges, {
    addItem,
    addCompanion,
    removeCompanion,
    equipWeapon,
    equipArmor
  });
}


// =============================================
// EVENT NARRATIVE BUILDER
// Converts game events (level up, kill, death, etc.)
// into player-facing announcement strings.
// Appended after the main narrative response.
// =============================================
function buildEventAnnouncements(events) {
  if (!events || events.length === 0) return '';

  const lines = [];

  for (const evt of events) {
    switch (evt.type) {

      case 'enemyKill':
        lines.push(`\n[Defeated ${evt.label}. +${evt.xp} XP.]`);
        break;

      case 'levelUp':
        lines.push(`\n[LEVEL UP — You are now Level ${evt.newLevel}. +${evt.freePointsAwarded} free stat point(s). Type "spend point on [stat]" to allocate.]`);
        break;

      case 'classLevelUp':
        const bonusStr = Object.entries(evt.bonuses).map(([s, v]) => `+${v} ${s.toUpperCase()}`).join(', ');
        lines.push(`\n[CLASS LEVEL UP — ${evt.className} is now Level ${evt.newLevel}. Gained: ${bonusStr}.]`);
        break;

      case 'professionLevelUp':
        lines.push(`\n[PROFESSION LEVEL UP — ${evt.profName} Level ${evt.newLevel}: ${evt.rankLabel}.]`);
        break;

      case 'classOffer':
        lines.push(`\n${evt.offer.prompt}`);
        break;

      case 'professionOffer':
        lines.push(`\n${evt.offer.prompt}`);
        break;

      case 'classAccepted':
        lines.push(`\n${evt.message}`);
        break;

      case 'professionAccepted':
        lines.push(`\n${evt.message}`);
        break;

      case 'freePointSpent':
        lines.push(`\n[${evt.message}]`);
        break;

      case 'coinGain':
        lines.push(`\n[+${evt.display} received. Total: ${evt.total}.]`);
        break;

      case 'coinSpendFailed':
        lines.push(`\n[Insufficient funds.]`);
        break;

      case 'gearRecovered':
        lines.push(`\n[${evt.message}]`);
        break;

      case 'death':
        lines.push(buildDeathAnnouncement(evt));
        break;

      case 'statScreen':
        lines.push(`\n${evt.content}`);
        break;

      case 'inspect':
        lines.push(`\n${evt.content}`);
        break;

      case 'questAccepted':
        lines.push(`\n[QUEST ACCEPTED — "${evt.quest.label}". Reward on completion: ${evt.quest.reward ? formatCoin(evt.quest.reward.coin || 0) + ' + ' + (evt.quest.reward.xp || 0) + ' XP' : 'coin + XP'}.]`);
        break;

      case 'questProgress':
        if (evt.total > 1) {
          lines.push(`\n[Quest progress: ${evt.progress}/${evt.total}]`);
        }
        break;

      case 'questComplete':
        const r = evt.reward || {};
        lines.push(`\n\n— QUEST COMPLETE — "${evt.quest.label}"`);
        lines.push(`Reward: ${formatCoin(r.coin || 0)}, +${r.xp || 0} XP.`);
        if (evt.quest.type === 'advance') {
          lines.push(`[The road ahead is open. A new region awaits.]`);
        }
        break;

      // Item events - only show for explicit player equip commands, not auto-detection
      case 'itemReceived':
        // Silent - don't spam brackets for auto-detected items
        break;

      case 'itemEquipped':
        // Only show if it was a player command, not auto-detection
        if (!evt.auto) {
          lines.push(`\n[Gear updated: ${evt.message}]`);
        }
        break;

      case 'itemUnequipped':
        lines.push(`\n[${evt.message}]`);
        break;

      // Companion events - only show for explicit changes
      case 'companionJoined':
        if (!evt.auto) {
          lines.push(`\n[${evt.companion.name} has joined your party.]`);
        }
        break;

      case 'companionLeft':
        if (!evt.auto) {
          lines.push(`\n[${evt.companion.name} has left your party.]`);
        }
        break;
      
      case 'equipFailed':
        // Silent - the AI will handle this narratively via pendingContextHint
        break;
    }
  }

  return lines.join('');
}


// =============================================
// DEATH ANNOUNCEMENT
// =============================================
function buildDeathAnnouncement(evt) {
  const lines = [
    '\n\n— DARKNESS —\n',
    `You wake in the citadel, gasping. The stone is cold beneath you.\n`,
    `[DEATH #${evt.deathCount}]`,
    `Lost ${evt.levelsLost} level(s). You are now Level ${evt.newLevel}.`,
    `Revived at the nearest citadel in ${evt.regionLabel || 'the region'}.`,
    evt.hadGear
      ? 'Your equipment remains where you fell. Return there and type "recover gear" to retrieve it.'
      : '',
    'You are wearing only plain clothes. No weapons.'
  ].filter(Boolean);

  return '\n' + lines.join('\n');
}


// =============================================
// RIGHT PANEL DATA BUILDER
// Feeds the right panel: enemy/NPC info,
// current location, and story summary.
// =============================================
function buildRightPanelData(state) {
  const region = state.character ? REGIONS[state.character.region] : null;

  // Enemy panel
  let enemyData = null;
  if (state.inCombat && state.currentEnemy) {
    const enemy = state.currentEnemy;
    const ePct  = enemy.currentHP / enemy.maxHP;
    enemyData = {
      label:      enemy.label,
      desc:       enemy.desc,
      behavior:   enemy.behavior,
      hpPercent:  Math.round(ePct * 100),
      hpLabel:    ePct >= 0.80 ? 'Uninjured'
                : ePct >= 0.50 ? 'Wounded'
                : ePct >= 0.25 ? 'Seriously Wounded'
                : ePct >= 0.10 ? 'Critically Wounded' : 'Near Death'
    };
  }

  // NPC panel
  let npcData = null;
  if (!state.inCombat && state.currentNPC) {
    const npcKey = state.currentNPC.toLowerCase().replace(/\s+/g, '_');
    const rapport = state.npcRelationships && state.npcRelationships[npcKey]
      ? state.npcRelationships[npcKey].rapport || 0
      : 0;
    npcData = {
      name:    state.currentNPC,
      rapport,
      metBefore: state.npcRelationships && state.npcRelationships[npcKey]
        ? state.npcRelationships[npcKey].metBefore || false
        : false
    };
  }

  // Companions
  const companions = (state.companions || []).map(c => ({
    name: c.name,
    role: c.role || 'ally'
  }));

  return {
    // Location
    location:     state.currentLocation || (region ? region.label : 'Unknown'),
    locationDesc: region ? region.flavor : '',
    regionLabel:  region ? region.label : '',

    // Threat or NPC
    inCombat:     state.inCombat || false,
    enemy:        enemyData,
    npc:          npcData,

    // Scene
    sceneContext: state.sceneContext || 'neutral',

    // Story summary
    storySummary: state.storySummary || '',

    // Ambient threats
    regionThreats: region ? region.monsters.slice(0, 3) : [],

    // Companions
    companions
  };
}


// =============================================
// MAIN NARRATIVE PROCESSOR
// Called once per player action after all game
// logic has already run. Builds prompt, calls AI,
// parses output for items/companions, appends 
// event announcements, returns final output.
// =============================================
async function processNarrative(state, playerInput, events = []) {
  state.actionCount = (state.actionCount || 0) + 1;

  // Creation phase — output stored prompt directly, no AI needed
  const creationOutput = handleCreationOutput(state);
  if (creationOutput) {
    return {
      narrative:     creationOutput,
      announcements: '',
      fullOutput:    creationOutput,
      rightPanel:    buildRightPanelData(state),
      tokens:        0
    };
  }

  // Build prompt and call Groq with rolling conversation history
  const prompt   = buildFullPrompt(state, playerInput);
  const history  = (state.conversationHistory || []).slice(-20);
  const aiResult = await callGroq(prompt, null, history);

  // Store this exchange in history for next turn
  if (aiResult.success) {
    if (!state.conversationHistory) state.conversationHistory = [];
    state.conversationHistory.push({ role: 'user',      content: prompt });
    state.conversationHistory.push({ role: 'assistant', content: aiResult.text });
    if (state.conversationHistory.length > 20) {
      state.conversationHistory = state.conversationHistory.slice(-20);
    }
  }

  // ============================================
  // POST-PROCESS AI OUTPUT
  // Extract NPC names for tracking (lightweight, no item detection)
  // 
  // NOTE: Automatic item detection has been DISABLED because
  // regex-based parsing of narrative text creates too many
  // false positives. Items should be granted through:
  // 1. Explicit player commands ("equip sword")
  // 2. Game events (quest rewards, purchases, crafting)
  // 3. Manual GM-style commands if needed
  // ============================================
  if (aiResult.success && aiResult.text) {
    // Update current NPC being interacted with (lightweight detection)
    const detectedNPC = extractCurrentNPC(aiResult.text, state);
    if (detectedNPC) {
      state.currentNPC = detectedNPC;
      
      // Initialize NPC relationship if new
      const npcKey = detectedNPC.toLowerCase().replace(/\s+/g, '_');
      if (!state.npcRelationships) state.npcRelationships = {};
      if (!state.npcRelationships[npcKey]) {
        state.npcRelationships[npcKey] = { rapport: 10, metBefore: true };
      }
    }
  }

  // Build event announcements
  const announcements = buildEventAnnouncements(events);

  // Combine narrative + announcements
  const fullOutput = aiResult.text + announcements;

  // Update story summary periodically
  if (state.actionCount % SUMMARY_EVERY === 0) {
    await updateStorySummary(state, aiResult.text);
  }

  return {
    narrative:     aiResult.text,
    announcements,
    fullOutput,
    rightPanel:    buildRightPanelData(state),
    tokens:        aiResult.tokens,
    aiSuccess:     aiResult.success
  };
}


module.exports = {
  // Main processor
  processNarrative,

  // Individual builders (for testing)
  buildCharacterContext,
  buildRegionContext,
  buildCombatContext,
  buildSceneContext,
  buildFullPrompt,

  // Groq
  callGroq,

  // Summary
  updateStorySummary,

  // Events
  buildEventAnnouncements,
  buildDeathAnnouncement,

  // Detection (exported for testing)
  detectItemsInNarrative,
  detectCompanionChangesInNarrative,
  applyDetectedChanges,
  extractCurrentNPC,

  // UI
  buildRightPanelData
};