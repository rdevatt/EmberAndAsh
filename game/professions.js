'use strict';

// =============================================================
// EMBER AND ASH — PROFESSIONS
// Class and profession unlock checks, task detection,
// XP calculation, and offer/confirmation flow.
// No AI calls. No database calls. Pure game logic.
// =============================================================

const {
  CLASSES,
  PROFESSIONS,
  PROF_LEVEL_XP,
  PROFESSION_TASKS
} = require('./constants');

const {
  getProfessionLevel,
  processClassLevelUp,
  processProfessionLevelUp,
  recalculateResources,
  buildCraftedGearItem,
  detectCraftingIntent
} = require('./character');


// =============================================
// UNLOCK CHECKS
// =============================================
function checkClassUnlock(state) {
  if (state.combatClass) return null;
  if (state.pendingClassOffer) return null;

  for (const [key, cls] of Object.entries(CLASSES)) {
    if ((state.actionProgress[`class_${key}`] || 0) >= cls.requirement) {
      return key;
    }
  }
  return null;
}

function checkProfessionUnlock(state) {
  if (state.profession) return null;
  if (state.pendingProfOffer) return null;

  for (const [key, prof] of Object.entries(PROFESSIONS)) {
    if ((state.actionProgress[`prof_${key}`] || 0) >= prof.requirement) {
      return key;
    }
  }
  return null;
}

function checkProfessionLevelUp(state) {
  if (!state.profession) return false;

  const currentLevel = state.professionLevel || 1;
  const newLevel     = getProfessionLevel(state.profXP || 0);

  return newLevel > currentLevel;
}


// =============================================
// CLASS OFFER FLOW
// =============================================
function buildClassOffer(classKey) {
  const cls = CLASSES[classKey];
  if (!cls) return null;

  return {
    key:     classKey,
    label:   cls.label,
    desc:    cls.desc,
    message: cls.unlockMessage,
    prompt: [
      '',
      '========================================',
      '   C L A S S   O F F E R',
      '========================================',
      `  ${cls.label.toUpperCase()}`,
      `  ${cls.desc}`,
      '',
      '  Your actions have shaped you toward',
      '  this path. Accept it?',
      '',
      '  Type "yes" to accept.',
      '  Type "no" to decline and reset.',
      '========================================'
    ].join('\n')
  };
}

function processClassOfferResponse(state, input) {
  const key = state.pendingClassOffer;
  if (!key) return { handled: false };

  const cls   = CLASSES[key];
  const t     = input.toLowerCase().trim();
  const isYes = ['yes', 'accept', 'take it', 'i accept', 'unlock it', 'i want it', 'confirm'].some(w => t.includes(w));
  const isNo  = ['no', 'refuse', 'decline', 'not yet', 'skip', 'pass', 'dismiss', 'reject'].some(w => t.includes(w));

  if (isYes) {
    state.combatClass         = key;
    state.classLevel          = 1;
    state.pendingClassOffer   = null;

    return {
      handled:  true,
      accepted: true,
      key,
      message: [
        '',
        '========================================',
        '   C L A S S   U N L O C K E D',
        '========================================',
        `  ${cls.label.toUpperCase()}`,
        `  ${cls.unlockMessage}`,
        '========================================'
      ].join('\n')
    };
  }

  if (isNo) {
    // Reset counter so player can pursue a different path
    state.actionProgress[`class_${key}`] = 0;
    state.pendingClassOffer              = null;

    return {
      handled:  true,
      accepted: false,
      key,
      message:  '[Understood. The path remains open — your actions will shape what you become.]'
    };
  }

  // Neither yes nor no — remind them offer is pending
  return {
    handled:  true,
    accepted: null,
    pending:  true,
    message:  buildClassOffer(key).prompt
  };
}


// =============================================
// PROFESSION OFFER FLOW
// =============================================
function buildProfessionOffer(profKey) {
  const prof = PROFESSIONS[profKey];
  if (!prof) return null;

  return {
    key:   profKey,
    label: prof.label,
    desc:  prof.desc,
    prompt: [
      '',
      '========================================',
      ' P R O F E S S I O N   O F F E R',
      '========================================',
      `  ${prof.label.toUpperCase()}`,
      `  ${prof.desc}`,
      '',
      '  Your work has shaped you toward',
      '  this profession. Claim it?',
      '',
      '  Type "yes" to accept.',
      '  Type "no" to decline and reset.',
      '========================================'
    ].join('\n')
  };
}

function processProfessionOfferResponse(state, input) {
  const key = state.pendingProfOffer;
  if (!key) return { handled: false };

  const prof  = PROFESSIONS[key];
  const t     = input.toLowerCase().trim();
  const isYes = ['yes', 'accept', 'take it', 'i accept', 'unlock it', 'i want it', 'confirm'].some(w => t.includes(w));
  const isNo  = ['no', 'refuse', 'decline', 'not yet', 'skip', 'pass', 'dismiss', 'reject'].some(w => t.includes(w));

  if (isYes) {
    state.profession      = key;
    state.professionLevel = 1;
    state.pendingProfOffer = null;

    // Apply first level stat bonuses
    const lvlData = prof.levels[0];
    if (lvlData) {
      for (const [stat, bonus] of Object.entries(lvlData.statBonus)) {
        state.stats[stat] = (state.stats[stat] || 5) + bonus;
      }
      recalculateResources(state);
    }

    return {
      handled:  true,
      accepted: true,
      key,
      rankLabel: lvlData ? lvlData.label : '',
      message: [
        '',
        '========================================',
        ' P R O F E S S I O N   U N L O C K E D',
        '========================================',
        `  ${prof.label.toUpperCase()}`,
        `  ${prof.desc}`,
        '',
        `  Rank : ${lvlData ? lvlData.label : 'Novice'}`,
        `  ${lvlData ? lvlData.desc : ''}`,
        '========================================'
      ].join('\n')
    };
  }

  if (isNo) {
    state.actionProgress[`prof_${key}`] = 0;
    state.pendingProfOffer              = null;

    return {
      handled:  true,
      accepted: false,
      key,
      message:  '[Understood. Your craft is still unformed — keep working and it will find its shape.]'
    };
  }

  // Pending reminder
  return {
    handled:  true,
    accepted: null,
    pending:  true,
    message:  buildProfessionOffer(key).prompt
  };
}


// =============================================
// PROFESSION TASK DETECTION
// Returns the difficulty level of the task in player input,
// or null if no recognizable profession task found.
// =============================================
function detectProfessionTaskLevel(text, profKey) {
  const tasks = PROFESSION_TASKS[profKey];
  if (!tasks) return null;

  const t    = text.toLowerCase();
  let best   = null;

  for (const task of tasks) {
    if (task.keywords.some(k => t.includes(k))) {
      if (!best || task.level > best.level) best = task;
    }
  }

  return best ? best.level : null;
}


// =============================================
// PROFESSION TASK XP
// Scales XP by task difficulty vs current profession level.
// Higher risk = higher reward. Too far above = failure chance.
// =============================================
function calculateProfessionTaskXP(taskLevel, professionLevel) {
  const gap = taskLevel - professionLevel;

  // Completely impossible — zero XP
  if (gap > 20) return 0;

  // Below current level — reduced XP
  if (gap <= 0) return Math.max(1, Math.floor(taskLevel * 0.5));

  // Above current level — bonus XP
  return Math.round(taskLevel * (1 + gap * 0.05));
}


// =============================================
// CRAFTED ITEM GENERATOR (internal)
// Tries to produce a gear item from a crafting action.
// Returns null if the input is not a crafting attempt
// or if the profession doesn't produce equippable gear.
// =============================================
const CRAFTING_PROFESSIONS = new Set(['blacksmith','alchemist','woodsman','hunter','scholar','cook','scout','merchant']);

function _tryGenerateCraftedItem(state, input, profLvl) {
  if (!state.profession) return null;
  if (!CRAFTING_PROFESSIONS.has(state.profession)) return null;

  const craftedItem = buildCraftedGearItem(state.profession, profLvl, input);
  if (!craftedItem) return null;

  // Add to crafted gear inventory (separate from string inventory)
  if (!state.craftedGear) state.craftedGear = [];
  state.craftedGear.push({ ...craftedItem, id: `cg_${Date.now()}_${Math.random().toString(36).slice(2,7)}` });

  return craftedItem;
}


// =============================================
// PROFESSION TASK RESOLUTION
// Returns result object with XP, success flag, and narrative hint.
// =============================================
function resolveProfessionTask(state, input) {
  if (!state.profession) return null;

  const taskLevel = detectProfessionTaskLevel(input, state.profession);
  if (taskLevel === null) return null;

  const profLvl  = getProfessionLevel(state.profXP || 0);
  const taskXP   = calculateProfessionTaskXP(taskLevel, profLvl);
  const profData = PROFESSIONS[state.profession];

  // Completely out of reach
  if (taskXP === 0) {
    return {
      success:    false,
      impossible: true,
      xp:         0,
      hint: `[PROFESSION TASK IMPOSSIBLE — completely beyond current skill as ${profData ? profData.label : 'this profession'}. Describe failure or inability to attempt.]`
    };
  }

  const taskGap = taskLevel - profLvl;

  // Task above skill level — chance of failure
  if (taskGap > 0) {
    const failChance = Math.min(0.80, taskGap / 20);

    if (Math.random() < failChance) {
      const failXP = Math.max(1, Math.floor(taskXP * 0.15));
      state.pendingProfXP = (state.pendingProfXP || 0) + failXP;

      return {
        success:    false,
        impossible: false,
        xp:         failXP,
        taskLevel,
        taskGap,
        hint: `[PROFESSION TASK ABOVE SKILL — failed attempt. The work falls short. Narrate struggle, wasted effort, or a ruined result. +${failXP} minimal XP for trying.]`
      };
    }

    // Succeeded against the odds — bonus XP
    const bonusMultiplier = 1.0 + (taskGap * 0.15);
    const bonusXP         = Math.round(taskXP * bonusMultiplier);
    state.pendingProfXP   = (state.pendingProfXP || 0) + bonusXP;

    const craftedItemBonus = _tryGenerateCraftedItem(state, input, profLvl);
    if (craftedItemBonus) {
      return {
        success:    true,
        impossible: false,
        xp:         bonusXP,
        taskLevel,
        taskGap,
        bonus:      true,
        craftedItem: craftedItemBonus,
        hint: `[PROFESSION TASK ABOVE SKILL — succeeded against the odds! Crafted: "${craftedItemBonus.name}" (${craftedItemBonus.quality})${craftedItemBonus.statMods ? ' with exceptional stat modifiers' : ''}. Narrate the difficulty and the satisfying result. +${bonusXP} bonus XP. Item now in inventory — can be equipped or sold for premium.]`
      };
    }

    return {
      success:    true,
      impossible: false,
      xp:         bonusXP,
      taskLevel,
      taskGap,
      bonus:      true,
      hint: `[PROFESSION TASK ABOVE SKILL — succeeded against the odds. Narrate the difficulty, the close call, and the satisfying result. +${bonusXP} bonus XP rewarded.]`
    };
  }

  // Normal task within skill range
  state.pendingProfXP = (state.pendingProfXP || 0) + taskXP;

  // Check if this was a crafting action — generate a gear item if so
  const craftedItem = _tryGenerateCraftedItem(state, input, profLvl);
  if (craftedItem) {
    return {
      success:    true,
      impossible: false,
      xp:         taskXP,
      taskLevel,
      taskGap:    0,
      bonus:      false,
      craftedItem,
      hint: `[PROFESSION TASK — within skill range. Crafted: "${craftedItem.name}" (${craftedItem.quality})${craftedItem.statMods ? ' with stat modifiers' : ''}. +${taskXP} profession XP. The item is now in their inventory — it can be equipped or sold for a premium.]`
    };
  }

  return {
    success:    true,
    impossible: false,
    xp:         taskXP,
    taskLevel,
    taskGap:    0,
    bonus:      false,
    hint: `[PROFESSION TASK — within skill range. Competent work. +${taskXP} profession XP.]`
  };
}


// =============================================
// PROCESS ALL PENDING PROFESSION/CLASS EVENTS
// Called from the event processor after each action.
// Returns array of event result objects for narrative use.
// =============================================
function processPendingProgressEvents(state) {
  const events = [];

  // Class level up check
  if (state.combatClass) {
    const clsResult = processClassLevelUp(state);
    if (clsResult) {
      events.push({ type: 'classLevelUp', ...clsResult });
    }
  }

  // Profession level up check
  if (state.profession && checkProfessionLevelUp(state)) {
    const profResult = processProfessionLevelUp(state);
    if (profResult) {
      events.push({ type: 'professionLevelUp', ...profResult });
    }
  }

  // New class unlock check
  const newClassKey = checkClassUnlock(state);
  if (newClassKey) {
    state.pendingClassOffer = newClassKey;
    events.push({
      type:  'classOffer',
      key:   newClassKey,
      offer: buildClassOffer(newClassKey)
    });
  }

  // New profession unlock check
  const newProfKey = checkProfessionUnlock(state);
  if (newProfKey) {
    state.pendingProfOffer = newProfKey;
    events.push({
      type:  'professionOffer',
      key:   newProfKey,
      offer: buildProfessionOffer(newProfKey)
    });
  }

  return events;
}


// =============================================
// UI DATA BUILDER
// Returns clean profession/class data for left panel.
// =============================================
function buildProgressionPanelData(state) {
  const cls       = state.combatClass  ? CLASSES[state.combatClass]       : null;
  const prof      = state.profession   ? PROFESSIONS[state.profession]    : null;
  const profLvl   = state.professionLevel || 1;
  const profLvlData = prof ? prof.levels[Math.min(profLvl, prof.levels.length) - 1] : null;

  return {
    // Class
    hasClass:       !!cls,
    className:      cls ? cls.label : null,
    classDesc:      cls ? cls.desc  : null,
    classLevel:     state.classLevel || 0,
    classXP:        state.classXP   || 0,

    // Profession
    hasProfession:  !!prof,
    professionName: prof ? prof.label : null,
    professionDesc: prof ? prof.desc  : null,
    professionLevel:profLvl,
    professionRank: profLvlData ? profLvlData.label : null,
    professionXP:   state.profXP || 0,

    // Pending offers
    pendingClassOffer: state.pendingClassOffer
      ? buildClassOffer(state.pendingClassOffer)
      : null,
    pendingProfOffer: state.pendingProfOffer
      ? buildProfessionOffer(state.pendingProfOffer)
      : null,

    // Free points
    freePoints: state.freePoints || 0
  };
}


module.exports = {
  // Unlock checks
  checkClassUnlock,
  checkProfessionUnlock,
  checkProfessionLevelUp,

  // Class offer
  buildClassOffer,
  processClassOfferResponse,

  // Profession offer
  buildProfessionOffer,
  processProfessionOfferResponse,

  // Task resolution
  detectProfessionTaskLevel,
  calculateProfessionTaskXP,
  resolveProfessionTask,

  // Event processing
  processPendingProgressEvents,

  // UI
  buildProgressionPanelData
};