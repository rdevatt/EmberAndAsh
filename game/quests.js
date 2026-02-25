'use strict';

// =============================================================
// EMBER AND ASH — QUESTS
// Bounty board generation, quest tracking, and completion.
// No AI calls. No database calls. Pure game logic.
//
// Quest lifecycle:
//   1. Player approaches bounty board (or types "check board" etc.)
//   2. generateBoardQuests() produces 3-5 quests for current region/level
//   3. Player accepts a quest → stored in state.activeQuests[]
//   4. Each action checks quest progress deterministically
//   5. Completion fires reward + narrative hint
// =============================================================

const {
  REGIONS,
  WORLD_TIERS,
  QUEST_TYPES,
  QUEST_REWARD_BASE,
  QUEST_DIFFICULTY,
  HUNT_TEMPLATES,
  PATROL_TEMPLATES,
  ESCORT_TEMPLATES,
  RETRIEVE_TEMPLATES,
  SCOUT_TEMPLATES,
  ADVANCE_QUESTS,
  getNextTierRegions,
} = require('./constants');

const { getPlayerLevel } = require('./character');
const { addCoin, formatCoin: fmtCoin } = require('./economy');


// =============================================
// BOUNTY BOARD DETECTION
// Detects whether player input is asking to
// check, read, or interact with the board.
// =============================================
const BOARD_KEYWORDS = [
  'bounty board','notice board','wanted board','check board',
  'bounty post','read the board','look at the board','see the board',
  'check notices','check quests','available quests','check jobs',
  'look for work','find work','jobs','contracts','bounties',
  'what\'s on the board','board','notices'
];

function detectBoardIntent(input) {
  const t = input.toLowerCase();
  return BOARD_KEYWORDS.some(k => t.includes(k));
}

const QUEST_ACCEPT_KEYWORDS = ['accept','take it','take the quest','i\'ll do it','i will do it','sign up','take job','take this','do this one','i accept'];
const QUEST_COMPLETE_KEYWORDS = ['complete','done','finished','report back','turn in','hand in','collect reward','claim reward','quest done'];

function detectQuestAccept(input) {
  const t = input.toLowerCase();
  return QUEST_ACCEPT_KEYWORDS.some(k => t.includes(k));
}

function detectQuestComplete(input) {
  const t = input.toLowerCase();
  return QUEST_COMPLETE_KEYWORDS.some(k => t.includes(k));
}


// =============================================
// REWARD CALCULATOR
// Returns { coin, xp } for a quest given tier + difficulty.
// =============================================
function calculateQuestReward(tier, difficultyKey, isAdvance = false) {
  const diff    = QUEST_DIFFICULTY[difficultyKey] || QUEST_DIFFICULTY.normal;
  const baseCoin = QUEST_REWARD_BASE.coin * tier * diff.coinMult;
  const baseXP   = QUEST_REWARD_BASE.xp   * tier * diff.xpMult;

  const multiplier = isAdvance ? 3.0 : 1.0;

  return {
    coin: Math.round(baseCoin * multiplier),
    xp:   Math.round(baseXP   * multiplier)
  };
}


// =============================================
// QUEST GENERATOR
// Builds a list of quests for the current board.
// Always builds:
//   - 1-2 hunt quests (normal difficulty)
//   - 1 patrol or retrieve quest
//   - 1 escort or scout quest (slightly harder)
//   - 1 advance quest (if player level >= area max + 1)
// =============================================
function generateBoardQuests(state) {
  const regionKey   = state.character && state.character.region;
  const region      = regionKey ? REGIONS[regionKey] : null;
  if (!region) return [];

  if (!region.hasBountyBoard) return [];

  const tier        = region.tier || 1;
  const playerLevel = getPlayerLevel(state.totalXP || 0);
  const [areaMin, areaMax] = region.levelRange || [1, 10];
  const quests      = [];
  let   idCounter   = Date.now();

  // ---- HUNT quests ----
  const huntPool = HUNT_TEMPLATES.filter(t => t.tier <= tier);
  const huntTpl  = huntPool[huntPool.length - 1] || HUNT_TEMPLATES[0];

  const diff1 = playerLevel < areaMin ? 'hard' : playerLevel > areaMax ? 'easy' : 'normal';
  const target1 = huntTpl.targets[Math.floor(Math.random() * huntTpl.targets.length)];
  const count1  = huntTpl.counts[Math.floor(Math.random() * huntTpl.counts.length)];
  const giver1  = huntTpl.givers[Math.floor(Math.random() * huntTpl.givers.length)];

  quests.push({
    id:         `q_${idCounter++}`,
    type:       QUEST_TYPES.HUNT,
    tier,
    difficulty: diff1,
    label:      `Hunt: ${count1} ${target1}`,
    desc:       `${giver1} is posting ${fmtCoin(calculateQuestReward(tier, diff1).coin)} for proof of ${count1} ${target1} killed in this area.`,
    target:     target1,
    targetCount:count1,
    progress:   0,
    giver:      giver1,
    regionKey,
    reward:     calculateQuestReward(tier, diff1),
    hint:       `[QUEST ACTIVE — Hunt: kill ${count1} ${target1}. Progress: ${0}/${count1}. Narrate the hunt naturally. Update progress when appropriate enemies are defeated.]`
  });

  // Second hunt at harder difficulty
  const target2 = region.rareMonsters ? region.rareMonsters[Math.floor(Math.random() * region.rareMonsters.length)] : target1;
  const diff2   = 'hard';
  quests.push({
    id:         `q_${idCounter++}`,
    type:       QUEST_TYPES.CLEAR,
    tier,
    difficulty: diff2,
    label:      `Clear: ${target2} spotted near the ${_getRandomLandmark(tier)}`,
    desc:       `A ${target2} has been causing trouble. The post offers ${fmtCoin(calculateQuestReward(tier, diff2).coin)} for confirmed elimination.`,
    target:     target2,
    targetCount:1,
    progress:   0,
    giver:      giver1,
    regionKey,
    reward:     calculateQuestReward(tier, diff2),
    hint:       `[QUEST ACTIVE — Clear: defeat the ${target2}. This is a single named target, harder than typical. Narrate as a notable encounter.]`
  });

  // ---- PATROL or RETRIEVE ----
  if (Math.random() < 0.5) {
    const ptpl = PATROL_TEMPLATES.filter(t => t.tier <= tier).pop() || PATROL_TEMPLATES[0];
    quests.push({
      id:         `q_${idCounter++}`,
      type:       QUEST_TYPES.PATROL,
      tier,
      difficulty: 'normal',
      label:      `Patrol: ${ptpl.task}`,
      desc:       `${ptpl.giver} needs someone to ${ptpl.task} for ${ptpl.duration}. Pay on completion: ${fmtCoin(calculateQuestReward(tier,'normal').coin)}.`,
      target:     ptpl.task,
      targetCount:1,
      progress:   0,
      giver:      ptpl.giver,
      regionKey,
      reward:     calculateQuestReward(tier, 'normal'),
      hint:       `[QUEST ACTIVE — Patrol: ${ptpl.task} for ${ptpl.duration}. Narrate the guard duty naturally. Mark complete when player has clearly fulfilled the task.]`
    });
  } else {
    const rtpl = RETRIEVE_TEMPLATES.filter(t => t.tier <= tier).pop() || RETRIEVE_TEMPLATES[0];
    quests.push({
      id:         `q_${idCounter++}`,
      type:       QUEST_TYPES.RETRIEVE,
      tier,
      difficulty: 'normal',
      label:      `Retrieve: ${rtpl.item} from ${rtpl.location}`,
      desc:       `${rtpl.giver} will pay ${fmtCoin(calculateQuestReward(tier,'normal').coin)} for the ${rtpl.item} recovered from ${rtpl.location}. Expect resistance.`,
      target:     rtpl.item,
      targetCount:1,
      progress:   0,
      giver:      rtpl.giver,
      regionKey,
      reward:     calculateQuestReward(tier, 'normal'),
      hint:       `[QUEST ACTIVE — Retrieve: bring back the ${rtpl.item} from ${rtpl.location}. Narrate the retrieval naturally. Mark complete when item is secured.]`
    });
  }

  // ---- ESCORT or SCOUT ----
  if (Math.random() < 0.5) {
    const etpl = ESCORT_TEMPLATES.filter(t => t.tier <= tier).pop() || ESCORT_TEMPLATES[0];
    const destRegion = etpl.to ? REGIONS[etpl.to] : null;
    quests.push({
      id:         `q_${idCounter++}`,
      type:       QUEST_TYPES.ESCORT,
      tier,
      difficulty: 'hard',
      label:      `Escort: ${etpl.npc} to ${destRegion ? destRegion.label : 'safety'}`,
      desc:       `${etpl.giver} posts ${fmtCoin(calculateQuestReward(tier,'hard').coin)} to see ${etpl.npc} reach ${destRegion ? destRegion.label : 'their destination'} alive.`,
      target:     etpl.npc,
      targetCount:1,
      progress:   0,
      destination:etpl.to,
      giver:      etpl.giver,
      regionKey,
      reward:     calculateQuestReward(tier, 'hard'),
      hint:       `[QUEST ACTIVE — Escort: keep ${etpl.npc} alive on the road to ${destRegion ? destRegion.label : 'their destination'}. Narrate travel and hazards naturally. Mark complete on safe arrival.]`
    });
  } else {
    const stpl = SCOUT_TEMPLATES.filter(t => t.tier <= tier).pop() || SCOUT_TEMPLATES[0];
    quests.push({
      id:         `q_${idCounter++}`,
      type:       QUEST_TYPES.SCOUT,
      tier,
      difficulty: 'hard',
      label:      `Scout: ${stpl.location}`,
      desc:       `${stpl.giver} offers ${fmtCoin(calculateQuestReward(tier,'hard').coin)} (plus ${stpl.reward}) for a full report on ${stpl.location}. Go in. Come back.`,
      target:     stpl.location,
      targetCount:1,
      progress:   0,
      giver:      stpl.giver,
      regionKey,
      reward:     calculateQuestReward(tier, 'hard'),
      hint:       `[QUEST ACTIVE — Scout: explore ${stpl.location} and return with information. Narrate the exploration naturally. Mark complete when player has clearly scouted the area.]`
    });
  }

  // ---- ADVANCE QUEST (fires when player is 1+ level over area cap) ----
  if (playerLevel >= areaMax + 1) {
    const advPool = ADVANCE_QUESTS[tier];
    if (advPool && advPool.length > 0) {
      const adv         = advPool[Math.floor(Math.random() * advPool.length)];
      const destRegion  = REGIONS[adv.dest];
      const advReward   = calculateQuestReward(tier, 'normal', true);

      quests.push({
        id:         `q_${idCounter++}`,
        type:       QUEST_TYPES.ADVANCE,
        tier,
        difficulty: 'normal',
        isAdvance:  true,
        label:      `⟶ MOVE ON: ${adv.label}`,
        desc:       `${adv.task} Destination: ${destRegion ? destRegion.label : adv.dest}. ${adv.reward}.`,
        task:       adv.task,
        destination:adv.dest,
        targetCount:1,
        progress:   0,
        giver:      'Notice Board',
        regionKey,
        reward:     advReward,
        hint:       `[ADVANCE QUEST — This player has outgrown ${region.label}. Quest: ${adv.label}. Task: ${adv.task}. Destination: ${destRegion ? destRegion.label : adv.dest}. Narrate the call to move on naturally. This is a story beat — the world is bigger than this region.]`
      });
    }
  }

  return quests;
}


// =============================================
// BOARD STATE MANAGEMENT
// Quests on the board are stored in state.boardQuests.
// Accepted quests move to state.activeQuests.
// Completed quests move to state.completedQuests.
// =============================================
function refreshBoard(state) {
  state.boardQuests = generateBoardQuests(state);
  return state.boardQuests;
}

function getBoardQuests(state) {
  if (!state.boardQuests || state.boardQuests.length === 0) {
    return refreshBoard(state);
  }
  return state.boardQuests;
}

function acceptQuest(state, questId) {
  if (!state.boardQuests) return { success:false, message:'No board quests available.' };

  const idx = state.boardQuests.findIndex(q => q.id === questId);
  if (idx === -1) return { success:false, message:'Quest not found on board.' };

  const quest = state.boardQuests[idx];

  // Limit active quests to 3
  if ((state.activeQuests || []).length >= 3) {
    return { success:false, message:'You already have 3 active quests. Complete or abandon one first.' };
  }

  if (!state.activeQuests) state.activeQuests = [];
  state.activeQuests.push({ ...quest, acceptedAt: state.actionCount || 0 });
  state.boardQuests.splice(idx, 1);

  return {
    success:  true,
    quest,
    message:  `Quest accepted: "${quest.label}". ${quest.desc}`,
    hint:     quest.hint
  };
}

function acceptQuestByIndex(state, displayIndex) {
  const quests = getBoardQuests(state);
  const idx    = displayIndex - 1;
  if (idx < 0 || idx >= quests.length) {
    return { success:false, message:`No quest numbered ${displayIndex}.` };
  }
  return acceptQuest(state, quests[idx].id);
}

function abandonQuest(state, questId) {
  if (!state.activeQuests) return { success:false };
  const idx = state.activeQuests.findIndex(q => q.id === questId);
  if (idx === -1) return { success:false };
  const q = state.activeQuests.splice(idx, 1)[0];
  return { success:true, quest:q };
}


// =============================================
// QUEST PROGRESS CHECKER
// Called after every player action when there
// are active quests. Checks whether any quest
// conditions have been met.
// =============================================
function checkQuestProgress(state, playerInput, gameEvents) {
  if (!state.activeQuests || state.activeQuests.length === 0) return [];

  const updates = [];
  const t       = playerInput.toLowerCase();

  for (const quest of state.activeQuests) {
    // --- HUNT / CLEAR: check combat kill events ---
    if (quest.type === QUEST_TYPES.HUNT || quest.type === QUEST_TYPES.CLEAR) {
      const killEvents = (gameEvents || []).filter(e => e.type === 'kill' || e.type === 'enemyDefeated');
      for (const evt of killEvents) {
        const enemyLabel = evt.enemyLabel || evt.enemy || '';
        const targetWords = quest.target.toLowerCase().split(' ');
        const matches = targetWords.some(word => enemyLabel.toLowerCase().includes(word));
        if (matches) {
          quest.progress = Math.min(quest.targetCount, (quest.progress || 0) + 1);
          updates.push({ questId:quest.id, type:'progress', progress:quest.progress, total:quest.targetCount });
        }
      }
    }

    // --- PATROL: time-based — mark complete after N actions ---
    if (quest.type === QUEST_TYPES.PATROL) {
      const actionsOnQuest = (state.actionCount || 0) - (quest.acceptedAt || 0);
      if (actionsOnQuest >= 5 && quest.progress < 1) {
        quest.progress = 1;
        updates.push({ questId:quest.id, type:'progress', progress:1, total:1 });
      }
    }

    // --- RETRIEVE / SCOUT: keyword detection in player input ---
    if (quest.type === QUEST_TYPES.RETRIEVE || quest.type === QUEST_TYPES.SCOUT) {
      const targetWords = quest.target.toLowerCase().split(' ');
      const retrieved   = targetWords.some(w => t.includes(w));
      const returnWords = ['return','back','report','bring back','come back','heading back'];
      const returning   = returnWords.some(w => t.includes(w));
      if ((retrieved || returning) && quest.progress < 1) {
        quest.progress = 1;
        updates.push({ questId:quest.id, type:'progress', progress:1, total:1 });
      }
    }

    // --- ESCORT: detect arrival keywords ---
    if (quest.type === QUEST_TYPES.ESCORT) {
      const arrivalWords = ['arrived','made it','safe','delivered','we\'re here','at the destination'];
      if (arrivalWords.some(w => t.includes(w)) && quest.progress < 1) {
        quest.progress = 1;
        updates.push({ questId:quest.id, type:'progress', progress:1, total:1 });
      }
    }

    // --- ADVANCE: detect travel to destination ---
    if (quest.type === QUEST_TYPES.ADVANCE && quest.destination) {
      const destRegion = REGIONS[quest.destination];
      const destWords  = destRegion
        ? destRegion.label.toLowerCase().split(' ')
        : [quest.destination.toLowerCase()];
      const traveling  = ['travel to','head to','go to','journey to','set out for','leaving for','depart for'].some(w => t.includes(w));
      const mentions   = destWords.some(w => t.includes(w));
      if (traveling && mentions && quest.progress < 1) {
        quest.progress = 1;
        updates.push({ questId:quest.id, type:'progress', progress:1, total:1 });
      }
    }
  }

  return updates;
}


// =============================================
// QUEST COMPLETION
// Checks whether any active quest is now done.
// Returns completed quests with their rewards.
// =============================================
function processQuestCompletions(state) {
  if (!state.activeQuests || state.activeQuests.length === 0) return [];

  const completed = [];

  for (let i = state.activeQuests.length - 1; i >= 0; i--) {
    const quest = state.activeQuests[i];

    if (quest.progress >= quest.targetCount) {
      // Apply rewards
      const reward = quest.reward || { coin:0, xp:0 };
      addCoin(state, reward.coin);
      state.totalXP = (state.totalXP || 0) + reward.xp;

      // Track completion
      if (!state.completedQuests) state.completedQuests = [];
      state.completedQuests.push({
        ...quest,
        completedAt: state.actionCount || 0,
        reward
      });

      state.activeQuests.splice(i, 1);

      // For advance quests — update region knowledge
      if (quest.type === QUEST_TYPES.ADVANCE && quest.destination) {
        if (!state.knownRegions) state.knownRegions = [];
        if (!state.knownRegions.includes(quest.destination)) {
          state.knownRegions.push(quest.destination);
        }
      }

      completed.push({
        quest,
        reward,
        hint: _buildCompletionHint(quest, reward)
      });
    }
  }

  return completed;
}


// =============================================
// QUEST CONTEXT HINT BUILDER
// Generates the narrative hint for active quests
// injected into each AI prompt turn.
// =============================================
function buildActiveQuestContext(state) {
  if (!state.activeQuests || state.activeQuests.length === 0) return '';

  const lines = ['[ACTIVE QUESTS — reference naturally, do not state mechanically]'];

  for (const q of state.activeQuests) {
    const progressStr = q.targetCount > 1
      ? ` (${q.progress}/${q.targetCount})`
      : '';
    lines.push(`  • ${q.label}${progressStr} — ${q.giver}`);
  }

  return lines.join('\n');
}


// =============================================
// BOARD DISPLAY BUILDER
// Returns structured data for the UI panel.
// =============================================
function buildBoardDisplayData(state) {
  const regionKey = state.character && state.character.region;
  const region    = regionKey ? REGIONS[regionKey] : null;

  if (!region || !region.hasBountyBoard) {
    return {
      available:    false,
      boardLabel:   null,
      quests:       [],
      activeQuests: state.activeQuests || []
    };
  }

  const quests = getBoardQuests(state);

  return {
    available:    true,
    boardLabel:   region.boardLabel || 'Bounty Board',
    regionLabel:  region.label,
    quests:       quests.map((q, i) => ({
      index:      i + 1,
      id:         q.id,
      type:       q.type,
      difficulty: q.difficulty,
      label:      q.label,
      desc:       q.desc,
      giver:      q.giver,
      reward:     q.reward,
      coinDisplay: fmtCoin(q.reward.coin),
      isAdvance:  !!q.isAdvance
    })),
    activeQuests: (state.activeQuests || []).map(q => ({
      id:          q.id,
      label:       q.label,
      type:        q.type,
      progress:    q.progress || 0,
      targetCount: q.targetCount || 1,
      isComplete:  (q.progress || 0) >= (q.targetCount || 1),
      coinDisplay: fmtCoin((q.reward || {}).coin || 0)
    }))
  };
}


// =============================================
// BOARD INSPECTION TEXT
// Generates the in-game text shown to the player
// when they read the board. Used as AI hint.
// =============================================
function buildBoardInspectHint(state) {
  const regionKey = state.character && state.character.region;
  const region    = regionKey ? REGIONS[regionKey] : null;
  if (!region || !region.hasBountyBoard) {
    return '[No bounty board in this area. There may be work to find through other means — innkeepers, travelers, locals asking for help.]';
  }

  const quests      = getBoardQuests(state);
  const playerLevel = getPlayerLevel(state.totalXP || 0);
  const [,areaMax]  = region.levelRange || [1,10];
  const overLevel   = playerLevel >= areaMax + 1;

  const lines = [
    `[BOUNTY BOARD — ${region.boardLabel || region.label}]`,
    `[${quests.length} active postings. Player is ${overLevel ? 'OVER LEVEL for this area' : 'within area level range'}.]`,
    ''
  ];

  for (let i = 0; i < quests.length; i++) {
    const q = quests[i];
    lines.push(`[${i+1}] ${q.isAdvance ? '⟶ ADVANCE QUEST: ' : ''}${q.label}`);
    lines.push(`    ${q.desc}`);
    lines.push(`    Reward: ${fmtCoin(q.reward.coin)} + XP | Difficulty: ${q.difficulty}`);
    lines.push('');
  }

  lines.push('[Player can accept a quest by saying "I\'ll take quest 1" or "accept the hunt quest" etc.]');
  if (overLevel) {
    lines.push('[ADVANCE QUEST IS AVAILABLE — this player has outgrown this area and should be nudged toward the next region. The advance quest is a narrative bridge.]');
  }

  return lines.filter(Boolean).join('\n');
}


// =============================================
// INTERNAL HELPERS
// =============================================
const LANDMARKS = {
  1: ['north road','old mill','forest edge','river crossing','village gate','eastern field'],
  2: ['outpost ruins','barrow hill','fog-covered bridge','old fort','moor path'],
  3: ['mine entrance','old watchtower','collapsed bridge','expedition camp','upper pass'],
  4: ['inner sanctum','ancient gate','ritual circle','dead camp','the deep reaches'],
};

function _getRandomLandmark(tier) {
  const pool = LANDMARKS[Math.min(tier, 4)] || LANDMARKS[1];
  return pool[Math.floor(Math.random() * pool.length)];
}

function _buildCompletionHint(quest, reward) {
  const coinStr = fmtCoin(reward.coin);
  const xpStr   = `+${reward.xp} XP`;

  if (quest.type === QUEST_TYPES.ADVANCE) {
    return `[ADVANCE QUEST COMPLETED — "${quest.label}". Reward: ${coinStr}, ${xpStr}. The player has accepted the call to move on. Narrate the departure — something has shifted. A new chapter is opening. Do not describe the destination yet — just the leaving.]`;
  }

  return `[QUEST COMPLETED — "${quest.label}". Reward: ${coinStr}, ${xpStr}. Narrate the payoff naturally — returning to the giver, collecting the coin, the satisfaction of finished work. Keep it brief. Life continues.]`;
}


module.exports = {
  // Intent detection
  detectBoardIntent,
  detectQuestAccept,
  detectQuestComplete,

  // Board management
  refreshBoard,
  getBoardQuests,
  acceptQuest,
  acceptQuestByIndex,
  abandonQuest,

  // Progress tracking
  checkQuestProgress,
  processQuestCompletions,

  // Hint builders
  buildActiveQuestContext,
  buildBoardInspectHint,

  // UI
  buildBoardDisplayData
};