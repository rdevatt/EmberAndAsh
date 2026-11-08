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
  getRegionConnections,
} = require('./constants');

const { getPlayerLevel, grantXP } = require('./character');
const { enemyMatchesTarget } = require('./combat');
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
  // Hunt something that actually lives (and spawns) in this region.
  const regionTargets = (region.monsters && region.monsters.length) ? region.monsters : huntTpl.targets;
  const target1 = regionTargets[Math.floor(Math.random() * regionTargets.length)];
  const count1  = Math.min(5, huntTpl.counts[Math.floor(Math.random() * huntTpl.counts.length)]);
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
      location:   rtpl.location,
      targetCount:1,
      progress:   0,
      giver:      rtpl.giver,
      regionKey,
      reward:     calculateQuestReward(tier, 'normal'),
      hint:       `[QUEST ACTIVE — Retrieve: bring back the ${rtpl.item} from ${rtpl.location}. Something guards it. Narrate naturally.]`
    });
  }

  // ---- ESCORT or SCOUT ----
  if (Math.random() < 0.5) {
    const etplBase = ESCORT_TEMPLATES.filter(t => t.tier <= tier).pop() || ESCORT_TEMPLATES[0];
    // Escort destinations must be a different, directly reachable region.
    const neighbours = getRegionConnections(regionKey).filter(k => {
      const r = REGIONS[k];
      return r && (r.tier || 1) <= tier;
    });
    const destKey = (etplBase.to && etplBase.to !== regionKey && neighbours.includes(etplBase.to))
      ? etplBase.to
      : (neighbours.length ? neighbours[Math.floor(Math.random() * neighbours.length)] : null);
    const etpl = { ...etplBase, to: destKey };
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
      hint:       `[QUEST ACTIVE — Escort: keep ${etpl.npc} alive on the road to ${destRegion ? destRegion.label : 'their destination'}. Narrate travel and hazards naturally. Completes on arrival (travel there).]`
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
      location:   stpl.location,
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
    // Only offer destinations reachable by road from here; otherwise
    // build a generic advance quest toward a connected next-tier region.
    // Advance exactly one tier: some regions also connect to tiers further
    // up, which would send a freshly-advanced player somewhere lethal.
    const allNext  = getNextTierRegions(regionKey);
    const oneUp    = allNext.filter(k => (REGIONS[k].tier || 1) === tier + 1);
    const minTier  = Math.min(...allNext.map(k => REGIONS[k].tier || 1));
    const nextKeys = oneUp.length ? oneUp : allNext.filter(k => (REGIONS[k].tier || 1) === minTier);
    let advPool    = (ADVANCE_QUESTS[tier] || []).filter(a => nextKeys.includes(a.dest));
    if (advPool.length === 0 && nextKeys.length > 0) {
      advPool = nextKeys.map(k => ({
        label:  `The Road to ${REGIONS[k].label}`,
        dest:   k,
        task:   `Word has come from ${REGIONS[k].label}: they need capable hands, and this region has nothing left to teach you.`,
        reward: 'triple coin + safe passage'
      }));
    }
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
const BOARD_REFRESH_ACTIONS = 30;   // new postings go up every so often

function refreshBoard(state) {
  state.boardQuests      = generateBoardQuests(state);
  state.boardGeneratedAt = state.actionCount || 0;
  state.boardRegion      = state.character ? state.character.region : null;
  return state.boardQuests;
}

// The board refreshes when it's empty, stale, from another region, or when
// the player has outgrown the region and no "move on" posting is up yet.
function boardNeedsRefresh(state) {
  if (!state.boardQuests || state.boardQuests.length === 0) return true;
  const region = state.character ? state.character.region : null;
  if (state.boardRegion && state.boardRegion !== region) return true;
  if ((state.actionCount || 0) - (state.boardGeneratedAt || 0) >= BOARD_REFRESH_ACTIONS) return true;
  const r = region ? REGIONS[region] : null;
  if (r && r.levelRange) {
    const outgrown   = getPlayerLevel(state.totalXP || 0) >= r.levelRange[1] + 1;
    const hasAdvance = state.boardQuests.some(q => q.type === QUEST_TYPES.ADVANCE) ||
                       (state.activeQuests || []).some(q => q.type === QUEST_TYPES.ADVANCE);
    if (outgrown && !hasAdvance) return true;
  }
  return false;
}

function getBoardQuests(state) {
  if (boardNeedsRefresh(state)) return refreshBoard(state);
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

  // Accepting an advance quest reveals the road to its destination.
  if (quest.type === QUEST_TYPES.ADVANCE && quest.destination) {
    if (!state.knownRegions) state.knownRegions = [];
    if (!state.knownRegions.includes(quest.destination)) state.knownRegions.push(quest.destination);
  }
  state.boardQuests.splice(idx, 1);

  return {
    success:  true,
    quest,
    message:  `Quest accepted: "${quest.label}". ${quest.desc}`,
    hint:     quest.hint
  };
}

function acceptQuestByIndex(state, displayIndex) {
  // Use the postings the player last saw; only generate if there are none.
  const quests = (state.boardQuests && state.boardQuests.length) ? state.boardQuests : getBoardQuests(state);
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
const LOCATION_STOPWORDS = new Set(['the','of','a','an','from','to','in','on','at','north','south','east','west','old','near']);

function significantWords(text) {
  return String(text || '').toLowerCase().split(/[^a-z']+/)
    .filter(w => w.length > 2 && !LOCATION_STOPWORDS.has(w));
}

// True when the input clearly references a quest location ("search the bandit camp").
function mentionsLocation(input, location) {
  const words = significantWords(location);
  if (!words.length) return false;
  const t      = String(input || '').toLowerCase();
  const hits   = words.filter(w => t.includes(w)).length;
  return hits >= Math.min(2, words.length);
}

/**
 * Quest progress is driven by game events, not by keywords the player can
 * type at will:
 *   hunt/clear — kill events whose label matches the target
 *   retrieve   — reach the location, defeat its guardian, item secured
 *   scout      — reach the location, then report back
 *   patrol     — stay on duty for 5 actions in the quest's region
 *   escort / advance — arrive (travel) at the destination region
 * gameEvents: [{type:'enemyDefeated', enemyLabel}, {type:'arrived', region}]
 */
function checkQuestProgress(state, playerInput, gameEvents) {
  if (!state.activeQuests || state.activeQuests.length === 0) return [];

  const updates = [];
  const t       = String(playerInput || '').toLowerCase();
  const events  = gameEvents || [];
  const kills   = events.filter(e => e.type === 'kill' || e.type === 'enemyDefeated');
  const arrival = events.find(e => e.type === 'arrived');
  const here    = state.character ? state.character.region : null;

  for (const quest of state.activeQuests) {
    if ((quest.progress || 0) >= (quest.targetCount || 1)) continue;

    if (quest.type === QUEST_TYPES.HUNT || quest.type === QUEST_TYPES.CLEAR) {
      for (const evt of kills) {
        const label = evt.enemyLabel || evt.enemy || '';
        if (enemyMatchesTarget(label, quest.target)) {
          quest.progress = Math.min(quest.targetCount, (quest.progress || 0) + 1);
          updates.push({ questId:quest.id, label:quest.label, type:'progress', progress:quest.progress, total:quest.targetCount });
        }
      }
    }

    if (quest.type === QUEST_TYPES.PATROL) {
      if (!quest.regionKey || quest.regionKey === here) {
        quest.dutyActions = (quest.dutyActions || 0) + 1;
        if (quest.dutyActions >= 5) {
          quest.progress = 1;
          updates.push({ questId:quest.id, label:quest.label, type:'progress', progress:1, total:1 });
        }
      }
    }

    if (quest.type === QUEST_TYPES.RETRIEVE) {
      const location = quest.location || quest.target;
      if (quest.guardianPending && kills.length > 0) {
        quest.guardianPending = false;
        quest.progress = 1;
        updates.push({ questId:quest.id, label:quest.label, type:'progress', progress:1, total:1, message:`You recover the ${quest.target}.` });
      } else if (!quest.guardianPending && !state.inCombat && (mentionsLocation(t, location) || mentionsLocation(t, quest.target))) {
        // Reaching the site triggers a guardian fight (spawned by the caller).
        quest.guardianPending = true;
        updates.push({ questId:quest.id, label:quest.label, type:'guardian', location });
      }
    }

    if (quest.type === QUEST_TYPES.SCOUT) {
      if (!quest.scouted && mentionsLocation(t, quest.location || quest.target)) {
        quest.scouted = true;
        updates.push({ questId:quest.id, label:quest.label, type:'stage', message:'You have seen enough. Report back to collect your pay.' });
      } else if (quest.scouted && /\b(report|return|head back|go back|come back|turn in|hand in)\b/.test(t)) {
        quest.progress = 1;
        updates.push({ questId:quest.id, label:quest.label, type:'progress', progress:1, total:1 });
      }
    }

    if ((quest.type === QUEST_TYPES.ESCORT || quest.type === QUEST_TYPES.ADVANCE) && quest.destination) {
      if (arrival && arrival.region === quest.destination) {
        quest.progress = 1;
        updates.push({ questId:quest.id, label:quest.label, type:'progress', progress:1, total:1 });
      }
    }

    // Escort without a destination: deliver once the road is behind you.
    if (quest.type === QUEST_TYPES.ESCORT && !quest.destination) {
      if (arrival || /\b(arrived|delivered|we're here|we are here)\b/.test(t)) {
        quest.progress = 1;
        updates.push({ questId:quest.id, label:quest.label, type:'progress', progress:1, total:1 });
      }
    }
  }

  return updates;
}

// Labels the spawner should favour while hunt/clear quests are active.
function getQuestTargets(state) {
  const here = state.character ? state.character.region : null;
  return (state.activeQuests || [])
    .filter(q => (q.type === QUEST_TYPES.HUNT || q.type === QUEST_TYPES.CLEAR) && (q.progress || 0) < (q.targetCount || 1))
    .filter(q => !q.regionKey || q.regionKey === here)
    .map(q => q.target)
    .filter(Boolean);
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
      const levelUp = grantXP(state, reward.xp);

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
        levelUp,
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

  const activeQuestsDisplay = (state.activeQuests || []).map(q => ({
    id:          q.id,
    label:       q.label,
    type:        q.type,
    progress:    q.progress || 0,
    targetCount: q.targetCount || 1,
    isComplete:  (q.progress || 0) >= (q.targetCount || 1),
    coinDisplay: fmtCoin((q.reward || {}).coin || 0),
    status:      _questStatus(q)
  }));

  if (!region || !region.hasBountyBoard) {
    return {
      available:    false,
      boardLabel:   null,
      regionLabel:  region ? region.label : null,
      quests:       [],
      activeQuests: activeQuestsDisplay
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
    activeQuests: activeQuestsDisplay
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

// One-line "what do I do next" for each active quest (journal + panel).
function _questStatus(q) {
  const dest = q.destination && REGIONS[q.destination] ? REGIONS[q.destination].label : null;
  switch (q.type) {
    case QUEST_TYPES.HUNT:
    case QUEST_TYPES.CLEAR:
      return `Defeat ${q.target} (${q.progress || 0}/${q.targetCount || 1}). Pick fights in ${REGIONS[q.regionKey] ? REGIONS[q.regionKey].label : 'the area'}.`;
    case QUEST_TYPES.PATROL:
      return `Stay on duty in ${REGIONS[q.regionKey] ? REGIONS[q.regionKey].label : 'the area'} (${Math.min(5, q.dutyActions || 0)}/5 actions).`;
    case QUEST_TYPES.RETRIEVE:
      return q.guardianPending
        ? `Defeat whatever guards the ${q.target}.`
        : `Go to ${q.location || 'the site'} and recover the ${q.target}.`;
    case QUEST_TYPES.SCOUT:
      return q.scouted ? 'Report back to collect your pay.' : `Scout ${q.location || q.target}.`;
    case QUEST_TYPES.ESCORT:
    case QUEST_TYPES.ADVANCE:
      return dest ? `Travel to ${dest} (type "travel to ${dest}").` : 'Reach your destination safely.';
    default:
      return '';
  }
}

function buildQuestJournal(state) {
  const quests = state.activeQuests || [];
  if (!quests.length) return 'QUEST JOURNAL\nNo active quests. Check the bounty board ("check board") for work.';
  const lines = ['QUEST JOURNAL'];
  quests.forEach((q, i) => {
    lines.push(`${i + 1}. ${q.label} — reward ${fmtCoin((q.reward || {}).coin || 0)} + ${(q.reward || {}).xp || 0} XP`);
    lines.push(`   ${_questStatus(q)}`);
  });
  lines.push('Type "abandon quest N" to drop one.');
  return lines.join('\n');
}

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
  boardNeedsRefresh,
  getBoardQuests,
  acceptQuest,
  acceptQuestByIndex,
  abandonQuest,

  // Progress tracking
  checkQuestProgress,
  processQuestCompletions,
  getQuestTargets,
  mentionsLocation,

  // Hint builders
  buildActiveQuestContext,
  buildBoardInspectHint,

  // UI
  buildBoardDisplayData,
  buildQuestJournal
};