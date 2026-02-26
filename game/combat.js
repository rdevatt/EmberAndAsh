'use strict';

// =============================================================
// EMBER AND ASH — COMBAT
// All combat resolution, enemy spawning, flee attempts,
// action scoring, and combat state management.
// No AI calls. No database calls. Pure math.
// =============================================================

const {
  ENEMIES,
  REGIONS,
  BODY_PARTS,
  CLASSES,
  PROFESSIONS
} = require('./constants');

const {
  getPlayerLevel,
  getActiveWeapon,
  getActiveArmor,
  getHPLabel,
  getStaminaLabel
} = require('./character');


// =============================================
// COMBAT INTENT DETECTION
// =============================================
const COMBAT_TRIGGERS = [
  'attack', 'charge at', 'strike at', 'swing at', 'shoot at',
  'stab', 'slash at', 'lunge at', 'throw at', 'cast at',
  'fight', 'draw sword', 'draw weapon', 'draw my blade',
  'raise my weapon', 'go for', 'take a swing', 'rush at',
  'lunge', 'thrust at', 'cut at'
];

const FLEE_TRIGGERS = [
  'flee', 'run away', 'escape', 'get away', 'retreat',
  'back away', 'get out of here', 'sprint away', 'bolt',
  'run for it', 'turn and run', 'disengage', 'fall back'
];

const PASSIVE_TRIGGERS = [
  'look', 'scan', 'watch', 'observe', 'examine', 'inspect',
  'check', 'listen', 'wait', 'rest', 'sit', 'stand',
  'think', 'consider', 'study', 'ask', 'say', 'speak', 'talk'
];

function detectCombatIntent(text) {
  const t = text.toLowerCase();
  return COMBAT_TRIGGERS.some(trigger => t.includes(trigger));
}

function detectFleeIntent(text) {
  const t = text.toLowerCase();
  return FLEE_TRIGGERS.some(w => t.includes(w));
}

function isPassiveAction(text) {
  const t = text.toLowerCase();
  return PASSIVE_TRIGGERS.some(w => t.startsWith(w) || t.includes(` ${w} `));
}


// =============================================
// BODY PART DETECTION
// =============================================
function detectTargetedBodyPart(text) {
  const t = text.toLowerCase();
  if (t.includes('throat') || t.includes('neck'))                                                                       return 'throat';
  if (t.includes('head') || t.includes('temple') || t.includes('jaw') || t.includes('skull') || t.includes('face'))    return 'head';
  if (t.includes('back') || t.includes('spine'))                                                                         return 'back';
  if (t.includes('knee'))                                                                                                 return 'knee';
  if (t.includes('rib'))                                                                                                  return 'ribs';
  if (t.includes('leg') || t.includes('shin') || t.includes('thigh') || t.includes('ankle'))                            return 'leg';
  if (t.includes('arm') || t.includes('shoulder') || t.includes('wrist') || t.includes('elbow'))                        return 'arm';
  return 'torso';
}


// =============================================
// ACTION QUALITY SCORING
// Rewards detailed, tactical player input.
// =============================================
const TACTICAL_WORDS = [
  'feint', 'dodge', 'roll', 'pivot', 'parry', 'riposte', 'flank',
  'sidestep', 'duck', 'lunge', 'thrust', 'sweep', 'deflect', 'disarm',
  'bait', 'overextend', 'step back', 'press forward', 'create an opening',
  'exploit', 'circle', 'draw out', 'weave', 'slip'
];

const DETAIL_WORDS = [
  'left', 'right', 'upper', 'lower', 'quick', 'slow', 'precise',
  'careful', 'swift', 'knee', 'head', 'shoulder', 'throat', 'wrist',
  'ankle', 'temple', 'spine', 'elbow', 'jaw', 'solar plexus',
  'weak point', 'blind spot', 'gap in', 'opening in', 'off-hand',
  'weight on', 'momentum', 'footing', 'stance'
];

function scoreAction(text) {
  const words         = text.trim().split(/\s+/).length;
  const t             = text.toLowerCase();
  const tacticalCount = TACTICAL_WORDS.filter(w => t.includes(w)).length;
  const detailCount   = DETAIL_WORDS.filter(w => t.includes(w)).length;
  const combined      = tacticalCount * 2 + detailCount;

  let quality, baseXP, hint;

  if      (words >= 20 && combined >= 4) { quality = 'masterful'; baseXP = 35; hint = '[MASTERFUL ACTION — precise, tactical, highly detailed. High success chance.]'; }
  else if (words >= 12 && combined >= 2) { quality = 'skilled';   baseXP = 20; hint = '[SKILLED ACTION — good tactical detail. Strong success chance.]'; }
  else if (words >= 6  && combined >= 1) { quality = 'decent';    baseXP = 12; hint = '[DECENT ACTION — some detail. Moderate success chance.]'; }
  else if (words >= 4)                   { quality = 'basic';     baseXP = 7;  hint = '[BASIC ACTION — minimal detail. Low success chance.]'; }
  else                                   { quality = 'crude';     baseXP = 3;  hint = '[CRUDE ACTION — barely described. Very low success chance.]'; }

  return { quality, baseXP, hint, words, tacticalCount, detailCount };
}


// =============================================
// AFFINITY DETECTION
// Tracks which class/profession paths player actions match.
// =============================================
function detectAffinities(text) {
  const t     = text.toLowerCase();
  const found = {};

  for (const [key, cls] of Object.entries(CLASSES)) {
    const hits = cls.affinities.filter(a => t.includes(a)).length;
    if (hits > 0) found[`class_${key}`] = hits;
  }

  for (const [key, prof] of Object.entries(PROFESSIONS)) {
    const hits = prof.affinities.filter(a => t.includes(a)).length;
    if (hits > 0) found[`prof_${key}`] = hits;
  }

  return found;
}

function updateActionProgress(state, text) {
  const affinities = detectAffinities(text);
  for (const [k, v] of Object.entries(affinities)) {
    state.actionProgress[k] = (state.actionProgress[k] || 0) + v;
  }
  return affinities;
}


// =============================================
// ENEMY SPAWNING
// =============================================
function spawnEnemy(regionKey, playerLevel) {
  const region = REGIONS[regionKey];
  if (!region) return null;

  const [rMin, rMax] = region.monsterLevel;

  const validEnemies = Object.entries(ENEMIES).filter(([, e]) => {
    if (!e.regions.includes(regionKey)) return false;
    const [eMin, eMax] = e.levelRange;
    return eMin <= rMax && eMax >= rMin;
  });

  if (!validEnemies.length) return null;

  const [key, enemy]  = validEnemies[Math.floor(Math.random() * validEnemies.length)];
  const [eMin, eMax]  = enemy.levelRange;
  const lvlMin        = Math.max(eMin, rMin);
  const lvlMax        = Math.min(eMax, rMax);
  const targetLevel   = Math.max(lvlMin, Math.min(lvlMax,
    playerLevel + Math.floor(Math.random() * 5 - 1)
  ));

  const effectiveStr  = 5 + (enemy.mods.str || 0) + Math.floor(targetLevel * 0.5);
  const effectiveDex  = 5 + (enemy.mods.dex || 0) + Math.floor(targetLevel * 0.3);
  const effectiveVit  = 5 + (enemy.mods.vit || 0) + Math.floor(targetLevel * 0.4);
  const maxHP         = enemy.hpBase + effectiveVit * 5 + targetLevel * 3;

  return {
    key,
    label:        enemy.label,
    level:        targetLevel,
    behavior:     enemy.behavior,
    desc:         enemy.desc,
    xpMod:        enemy.xpMod,
    currentHP:    maxHP,
    maxHP,
    effectiveStr,
    effectiveDex,
    effectiveVit
  };
}

function isEnemyUnbeatable(enemyLevel, playerLevel) {
  return (enemyLevel - playerLevel) >= 20;
}


// =============================================
// XP CALCULATION
// =============================================
function calculateEnemyXP(enemyLevel, playerLevel, xpMod) {
  const gap      = enemyLevel - playerLevel;
  const gapBonus = gap > 0 ? 1 + (gap * 0.1) : 1.0;
  return Math.round(enemyLevel * gapBonus * (xpMod || 1.0));
}


// =============================================
// COMBAT ROUND RESOLUTION
// Returns a result object — never modifies state directly.
// Caller is responsible for applying results to state.
// =============================================
function resolveCombatRound(playerStats, actionQuality, bodyPartKey, weaponBonus, hasArmor, armorLevel, stamina, maxStamina, enemy) {
  const bp           = BODY_PARTS[bodyPartKey] || BODY_PARTS.torso;
  const staminaPct   = maxStamina > 0 ? stamina / maxStamina : 1;
  const staminaMod   = staminaPct < 0.15 ? -0.3 : staminaPct < 0.4 ? -0.15 : 0;

  const qualityMods  = { crude: -0.2, basic: -0.1, decent: 0, skilled: 0.1, masterful: 0.2 };
  const qualityMod   = qualityMods[actionQuality] || 0;
  const dexAdvantage = (playerStats.dex - enemy.effectiveDex) / 20;

  // Player attack
  // Damage formula: (str - 8) represents "stat above 10 baseline = bonus damage"
  // At str=10 (average), base damage = 2 + weaponBonus. At str=14 (strong), = 6 + weaponBonus.
  const hitChance    = Math.min(0.95, Math.max(0.05,
    0.60 + dexAdvantage + bp.hitMod + qualityMod + staminaMod
  ));
  const playerHit    = Math.random() < hitChance;
  const critChance   = Math.min(0.5, playerStats.dex / 200 + bp.critBonus); // dex/200 for base-10 scale
  const playerCrit   = playerHit && Math.random() < critChance;
  const rawPlayerDmg = Math.max(1, Math.round(
    (Math.max(0, playerStats.str - 8) + weaponBonus) * bp.damageMod * (playerCrit ? 2 : 1)
  ));
  const playerDamage = playerHit ? rawPlayerDmg : 0;
  const staminaCost  = Math.max(2, Math.floor(15 - playerStats.dex * 0.25)); // adjusted for base-10 dex

  // Enemy counterattack
  const enemyHitChance = Math.min(0.85, Math.max(0.1,
    0.50 + (enemy.effectiveDex - playerStats.dex) / 20
  ));
  const enemyHit       = Math.random() < enemyHitChance;
  const armorReduce    = (hasArmor && armorLevel) ? armorLevel * 2 : 0;
  const rawEnemyDmg    = Math.max(1, Math.round(
    enemy.effectiveStr * 1.5 * (Math.random() * 0.5 + 0.75)
  ));
  const enemyDamage    = enemyHit ? Math.max(0, rawEnemyDmg - armorReduce) : 0;

  return {
    playerHit,
    playerCrit,
    playerDamage,
    enemyHit,
    enemyDamage,
    staminaCost,
    hitChance:  Math.round(hitChance * 100),
    bodyPart:   bp.label
  };
}


// =============================================
// APPLY COMBAT ROUND TO STATE
// Modifies state in place. Returns result + kill info.
// =============================================
function applyCombatRound(state, input) {
  const enemy       = state.currentEnemy;
  const playerLevel = getPlayerLevel(state.totalXP || 0);
  const score       = scoreAction(input);
  const bodyPartKey = detectTargetedBodyPart(input);

  // Unbeatable enemy — skip normal resolution
  if (isEnemyUnbeatable(enemy.level, playerLevel)) {
    const armor       = getActiveArmor(state);
    const armorReduce = armor ? armor.armorLevel * 2 : 0;
    const dmg         = Math.max(1, Math.round(enemy.effectiveStr * 2) - armorReduce);
    state.hp          = Math.max(0, state.hp - dmg);

    state.pendingCombatResult = {
      playerHit: false, playerDamage: 0, playerCrit: false,
      enemyHit: true, enemyDamage: dmg, staminaCost: 0, bodyPart: 'torso'
    };

    return {
      score,
      unbeatable:  true,
      enemyKilled: false,
      hint: `[IMPOSSIBLE FIGHT. Every attack fails. ${enemy.label} hits for ${dmg}. Player HP: ${state.hp}/${state.maxHp}. Flee or talk are the only options.]`
    };
  }

  // Stamina drain
  const staminaCost = Math.max(2, Math.floor(15 - state.stats.dex * 0.5));
  state.stamina     = Math.max(0, state.stamina - staminaCost);

  const activeWeapon = getActiveWeapon(state);
  const activeArmor  = getActiveArmor(state);

  const result = resolveCombatRound(
    state.stats,
    score.quality,
    bodyPartKey,
    activeWeapon ? activeWeapon.weaponBonus : 0,
    !!activeArmor,
    activeArmor ? activeArmor.armorLevel : 0,
    state.stamina,
    state.maxStamina,
    enemy
  );

  // Apply damage
  if (result.playerHit) {
    enemy.currentHP    = Math.max(0, enemy.currentHP - result.playerDamage);
    state.currentEnemy = enemy;
  }
  if (result.enemyHit) {
    state.hp = Math.max(0, state.hp - result.enemyDamage);
  }

  state.pendingCombatResult = result;

  // Check kill
  let enemyKilled  = false;
  let xpAwarded    = 0;

  if (enemy.currentHP <= 0) {
    xpAwarded    = calculateEnemyXP(enemy.level, playerLevel, enemy.xpMod);
    enemyKilled  = true;

    state.pendingEnemyKill = { label: enemy.label, level: enemy.level, xp: xpAwarded };
    state.inCombat         = false;
    state.currentEnemy     = null;
    state.stamina          = Math.min(state.maxStamina, state.stamina + 10);

    // Small reputation bump for defeating an enemy
    if (state.reputation && state.character) {
      const region = state.character.region;
      state.reputation[region] = Math.min(100,
        (state.reputation[region] || 0) + 1
      );
    }
  }

  // Build narrative hint (AI guidance) and player-visible combat log
  const hint       = buildCombatNarrativeHint(result, enemy, state.hp, state.maxHp, state.stamina, state.maxStamina, enemyKilled);
  const combatLog  = buildCombatLog(result, enemy, state.hp, state.maxHp, state.stamina, state.maxStamina, enemyKilled, score.quality);

  return {
    score,
    result,
    unbeatable:  false,
    enemyKilled,
    xpAwarded,
    combatLog,
    hint:        score.hint + '\n' + hint
  };
}


// =============================================
// FLEE RESOLUTION
// =============================================
function applyFleeAttempt(state) {
  const enemy      = state.currentEnemy;
  const fleeChance = Math.min(0.85, Math.max(0.15,
    0.5 + (state.stats.dex - enemy.effectiveDex) / 20
  ));
  const success    = Math.random() < fleeChance;

  if (success) {
    state.inCombat     = false;
    state.currentEnemy = null;
    state.pendingCombatResult = null;

    return {
      success: true,
      hint:    '[PLAYER SUCCESSFULLY FLEES. Describe them breaking away and escaping. The threat recedes. No XP awarded.]'
    };
  }

  // Failed flee — enemy gets a free hit
  const armor       = getActiveArmor(state);
  const armorReduce = armor ? armor.armorLevel * 2 : 0;
  const dmg         = Math.max(0,
    Math.round(enemy.effectiveStr * 2 * (Math.random() * 0.4 + 0.8)) - armorReduce
  );
  state.hp = Math.max(0, state.hp - dmg);

  state.pendingCombatResult = {
    playerHit: false, playerDamage: 0, playerCrit: false,
    enemyHit: true, enemyDamage: dmg, staminaCost: 5, bodyPart: 'back'
  };

  return {
    success: false,
    dmg,
    hint: `[FLEE FAILED. ${enemy.label} struck from behind for ${dmg}. Player HP: ${state.hp}/${state.maxHp}. Describe the blow catching them mid-turn. They did not escape.]`
  };
}


// =============================================
// AMBIENT ENCOUNTER CHECK
// Returns spawned enemy or null.
// =============================================
function checkAmbientEncounter(state) {
  if (state.inCombat || !state.character) return null;

  // 8% base chance
  if (Math.random() >= 0.08) return null;

  const region      = REGIONS[state.character.region];
  const dangerFactor = region ? (region.monsterLevel[1] / 15) : 0;

  if (Math.random() >= dangerFactor) return null;

  const playerLevel = getPlayerLevel(state.totalXP || 0);
  const enemy       = spawnEnemy(state.character.region, playerLevel);

  if (!enemy || isEnemyUnbeatable(enemy.level, playerLevel)) return null;

  return enemy;
}


// =============================================
// ENEMY INSPECT (Scout profession gated)
// =============================================
function buildEnemyInspectData(state) {
  const enemy = state.currentEnemy;
  if (!enemy) return { available: false, reason: 'No enemy present.' };

  const isScout    = state.profession === 'scout';
  const scoutLevel = isScout ? (state.professionLevel || 1) : 0;

  if (scoutLevel === 0) {
    return {
      available:   true,
      scoutLevel:  0,
      flavor:      'You have no training to systematically read a fighter. Trust your instincts.',
      data:        null
    };
  }

  const ePct      = enemy.currentHP / enemy.maxHP;
  const condition = ePct >= 0.80 ? 'Uninjured' :
                    ePct >= 0.50 ? 'Wounded' :
                    ePct >= 0.25 ? 'Seriously Wounded' :
                    ePct >= 0.10 ? 'Critically Wounded' : 'Near Death';

  const playerLevel  = getPlayerLevel(state.totalXP || 0);
  const levelGap     = enemy.level - playerLevel;
  const threatRating = levelGap >= 15 ? 'LETHAL — far beyond your ability' :
                       levelGap >= 8  ? 'Deadly — significantly outmatches you' :
                       levelGap >= 3  ? 'Dangerous — stronger than you' :
                       levelGap >= -2 ? 'Even — a real fight' :
                       levelGap >= -8 ? 'Manageable — you have the edge' :
                                        'Weak — little threat';

  const dominantStr  = enemy.effectiveStr >= enemy.effectiveDex + 3
    ? 'Built for raw power — hits hard, hits heavy.'
    : enemy.effectiveDex >= enemy.effectiveStr + 3
    ? 'Fast and elusive — hard to land a clean hit.'
    : 'Balanced fighter — no obvious single weakness.';

  return {
    available:  true,
    scoutLevel,
    data: {
      label:      enemy.label,
      desc:       enemy.desc,
      condition:  scoutLevel >= 1 ? condition    : null,
      behavior:   scoutLevel >= 2 ? enemy.behavior : null,
      threat:     scoutLevel >= 3 ? threatRating : null,
      read:       scoutLevel >= 4 ? dominantStr  : null,
      // Full stats only at max scout level
      fullStats:  scoutLevel >= 5 ? {
        level:      enemy.level,
        strength:   enemy.effectiveStr,
        agility:    enemy.effectiveDex,
        endurance:  enemy.effectiveVit,
        hp:         enemy.currentHP,
        maxHP:      enemy.maxHP
      } : null
    }
  };
}


// =============================================
// COMBAT LOG BUILDER (player-visible)
// Returns a formatted mechanical combat log that
// appears BELOW the narrative in the story output.
// Players see exact numbers here — narrative is prose only.
// =============================================
function buildCombatLog(result, enemy, playerHP, maxHP, playerStamina, maxStamina, enemyKilled, actionQuality) {
  if (!result) return null;

  const sep   = '─'.repeat(36);
  const lines = [`\n${sep}`];

  // Player action
  if (result.playerHit) {
    const crit = result.playerCrit ? ' ⚡ CRITICAL HIT' : '';
    lines.push(`▶ You strike the ${enemy.label}'s ${result.bodyPart}${crit}`);
    lines.push(`  Damage dealt: ${result.playerDamage}`);
    const ePct = enemy.currentHP / enemy.maxHP;
    const eLabel = ePct <= 0 ? 'DEAD' :
                   ePct < 0.15 ? 'Near Death' :
                   ePct < 0.35 ? 'Critically Wounded' :
                   ePct < 0.60 ? 'Seriously Wounded' :
                   ePct < 0.80 ? 'Wounded' : 'Mostly Unharmed';
    lines.push(`  ${enemy.label}: ${eLabel}`);
  } else {
    lines.push(`▶ You miss — ${result.hitChance}% hit chance, attack goes wide`);
  }

  // Enemy retaliation
  if (result.enemyHit) {
    lines.push(`◀ ${enemy.label} strikes back`);
    lines.push(`  Damage taken: ${result.enemyDamage}`);
  } else {
    lines.push(`◀ ${enemy.label} misses you`);
  }

  // Player status after the exchange
  const hpPct   = maxHP > 0 ? playerHP / maxHP : 1;
  const hpBar   = buildMiniBar(hpPct, 12);
  const stPct   = maxStamina > 0 ? playerStamina / maxStamina : 1;
  const stBar   = buildMiniBar(stPct, 12);
  const hpLabel = hpPct <= 0 ? 'DEAD' :
                  hpPct < 0.15 ? 'Critical' :
                  hpPct < 0.35 ? 'Badly Hurt' :
                  hpPct < 0.60 ? 'Wounded' :
                  hpPct < 0.80 ? 'Hurt' : 'OK';

  lines.push(`  HP  ${hpBar} ${playerHP}/${maxHP} [${hpLabel}]`);
  lines.push(`  STA ${stBar} ${playerStamina}/${maxStamina}`);
  lines.push(`  Action quality: ${actionQuality || 'basic'}`);

  if (enemyKilled) {
    lines.push(`✦ ${enemy.label} is dead.`);
  }

  lines.push(sep);
  return lines.join('\n');
}

function buildMiniBar(pct, width) {
  const filled = Math.round(Math.max(0, Math.min(1, pct)) * width);
  return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + ']';
}


// =============================================
// NARRATIVE HINT BUILDER
// Produces the bracketed instruction block
// passed to the AI as authorsNote guidance.
// Never shown to the player directly.
// =============================================
function buildCombatNarrativeHint(result, enemy, playerHP, maxHP, stamina, maxStamina, enemyKilled) {
  const lines = ['[COMBAT NARRATIVE INSTRUCTIONS — write visceral, present-tense prose. Do NOT repeat numbers; those appear in the combat log the player already sees.]'];

  if (result) {
    if (result.playerHit) {
      const critNote = result.playerCrit ? ' — a CRITICAL strike, devastating impact' : '';
      lines.push(`[Player HIT the ${enemy.label} in the ${result.bodyPart}${critNote}. Describe the physical impact, the sound, the enemy's reaction. Enemy is ${result.enemyDamage > 0 ? 'hurt' : 'barely affected'}.]`);
    } else {
      lines.push(`[Player MISSED. The swing went wide or was deflected. Describe the overextension, the stumble, the opening it creates. This felt bad.]`);
    }

    if (result.enemyHit) {
      const heavy = result.enemyDamage >= 15 ? 'a punishing blow' :
                    result.enemyDamage >= 8  ? 'a solid hit' : 'a glancing strike';
      lines.push(`[${enemy.label} landed ${heavy} on the player. Describe WHERE it connected — arms, ribs, head — and what it feels like. Don't say how much damage.]`);
    } else {
      lines.push(`[${enemy.label} attacked but missed. Describe the player's dodge, sidestep, parry, or the enemy overreaching.]`);
    }
  }

  const hpLabel    = getHPLabel(playerHP, maxHP);
  const stamLabel  = getStaminaLabel(stamina, maxStamina);
  lines.push(`[Player condition: ${hpLabel}. Stamina: ${stamLabel}. Reflect this in their movement — a badly hurt player moves slower, breathes harder, their grip falters.]`);

  if (enemyKilled || (enemy && enemy.currentHP <= 0)) {
    lines.push(`[${enemy.label} IS DEAD. End the fight. Describe the killing blow, the body going still, the sudden silence. Make it feel earned.]`);
  } else if (enemy) {
    const ePct = enemy.currentHP / enemy.maxHP;
    if      (ePct < 0.15) lines.push(`[${enemy.label} is NEARLY DEAD — staggering, barely upright, desperate.]`);
    else if (ePct < 0.35) lines.push(`[${enemy.label} is BADLY WOUNDED — clearly losing, movements ragged.]`);
    else if (ePct < 0.60) lines.push(`[${enemy.label} is WOUNDED — showing the toll, fighting more cautiously.]`);
    else                  lines.push(`[${enemy.label} is mostly unscathed — still dangerous, still confident.]`);
  }

  lines.push('[Write 3–5 sentences of combat prose. Keep it tight, immediate, physical. Do not use stat names, damage numbers, or HP values in the narrative — those are in the combat log below.]');
  return lines.join('\n');
}


// =============================================
// UI DATA BUILDER
// Returns clean object for the right panel enemy display.
// =============================================
function buildEnemyPanelData(state) {
  if (!state.inCombat || !state.currentEnemy) return null;

  const enemy = state.currentEnemy;
  const ePct  = enemy.currentHP / enemy.maxHP;

  return {
    label:      enemy.label,
    desc:       enemy.desc,
    behavior:   enemy.behavior,
    level:      enemy.level,
    hpPercent:  Math.round(ePct * 100),
    hpLabel:    ePct >= 0.80 ? 'Uninjured' :
                ePct >= 0.50 ? 'Wounded' :
                ePct >= 0.25 ? 'Seriously Wounded' :
                ePct >= 0.10 ? 'Critically Wounded' : 'Near Death',
    inCombat:   true
  };
}


module.exports = {
  // Detection
  detectCombatIntent,
  detectFleeIntent,
  isPassiveAction,
  detectTargetedBodyPart,

  // Scoring
  scoreAction,
  detectAffinities,
  updateActionProgress,

  // Spawning
  spawnEnemy,
  isEnemyUnbeatable,
  calculateEnemyXP,

  // Resolution
  resolveCombatRound,
  applyCombatRound,
  applyFleeAttempt,
  checkAmbientEncounter,

  // Inspect
  buildEnemyInspectData,

  // Narrative
  buildCombatNarrativeHint,
  buildCombatLog,
  buildMiniBar,

  // UI
  buildEnemyPanelData
};