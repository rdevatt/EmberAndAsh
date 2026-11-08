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
  getEffectiveStats,
  getActiveWeapon,
  getActiveArmor,
  getHPLabel,
  getStaminaLabel
} = require('./character');

// =============================================
// STATUS EFFECT CONSTANTS
// =============================================
const BLEED_THRESHOLD = 0.35; // Below 35% HP, severe wounds cause bleeding
const BLEED_BODY_PARTS = ['throat', 'head', 'leg', 'arm', 'ribs'];
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

const LEGACY_REGION_ALIASES = {
  ashwood_shallow:      ['ashwood'],
  ashwood_deep:         ['ashwood'],
  sunkenfen_edge:       ['sunkenfen'],
  sunkenfen_deep:       ['sunkenfen'],
  blackstone_foothills: ['blackstone'],
  blackstone_peaks:     ['blackstone'],
  veldrath_border:      ['veldrath'],
  old_veldrath:         ['veldrath'],
  frozennorth_reaches:  ['frozennorth']
};

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
function spawnEnemy(regionKey, playerLevel, options = {}) {
  const region = REGIONS[regionKey];
  if (!region) return null;

  const regionRange = region.levelRange || region.monsterLevel;
  if (!Array.isArray(regionRange) || regionRange.length < 2) return null;
  const [rMin, rMax] = regionRange;
  const regionCandidates = new Set([regionKey, ...(LEGACY_REGION_ALIASES[regionKey] || [])]);

  const validEnemies = Object.entries(ENEMIES).filter(([, e]) => {
    const enemyRegions = Array.isArray(e.regions) ? e.regions : [];
    if (!enemyRegions.some(r => regionCandidates.has(r))) return false;
    const [eMin, eMax] = e.levelRange;
    return eMin <= rMax && eMax >= rMin;
  });

  if (!validEnemies.length) return null;

  // Prefer enemies whose own level band is near the player's level so a
  // level-1 character doesn't draw a level-8 brute just because both live
  // in the same region. Widen the window until something qualifies.
  let pool = validEnemies;
  for (const spread of [2, 4, 8]) {
    const near = validEnemies.filter(([, e]) => e.levelRange[0] <= playerLevel + spread && e.levelRange[1] >= playerLevel - spread);
    if (near.length) { pool = near; break; }
  }

  // Active hunt/clear quests bias spawns toward their targets so bounties
  // are actually completable.
  // Rare/named enemies only appear when a quest names them exactly
  // ("Clear: Cave Troll"), never as a by-product of a broad hunt.
  const targets = options.preferTargets || [];
  const isNamedTarget = (e) => targets.some(t => normalizeLabel(e.label) === normalizeLabel(t));
  const allowed = ([, e]) => !e.isRare || isNamedTarget(e);

  pool = pool.filter(allowed);
  if (!pool.length) pool = validEnemies.filter(allowed);
  if (!pool.length) pool = validEnemies;

  if (targets.length && Math.random() < 0.6) {
    const matches = ([, e]) => targets.some(t => enemyMatchesTarget(e.label, t)) && allowed([null, e]);
    // Prefer level-appropriate matches; fall back to any matching enemy.
    const wanted = pool.filter(matches);
    const anyWanted = wanted.length ? wanted : validEnemies.filter(matches);
    if (anyWanted.length) pool = anyWanted;
  }

  const [key, enemy]  = pool[Math.floor(Math.random() * pool.length)];
  const [eMin, eMax]  = enemy.levelRange;
  const lvlMin        = Math.max(eMin, rMin);
  const lvlMax        = Math.min(eMax, rMax);
  // Spawn within a window centred on the player's level (-2..+2).
  const targetLevel   = Math.max(lvlMin, Math.min(lvlMax,
    playerLevel + Math.floor(Math.random() * 5) - 2
  ));

  return buildEnemyInstance(key, enemy, targetLevel);
}

// Turns an ENEMIES template into a live combat instance at a given level.
// Balance target: an even-level fight lasts ~5-8 rounds and a careful
// player wins most of the time while losing a meaningful chunk of HP.
function buildEnemyInstance(key, enemy, targetLevel) {
  const effectiveStr  = 5 + (enemy.mods.str || 0) + Math.floor(targetLevel * 0.5);
  const effectiveDex  = 5 + (enemy.mods.dex || 0) + Math.floor(targetLevel * 0.3);
  const effectiveVit  = 5 + (enemy.mods.vit || 0) + Math.floor(targetLevel * 0.4);
  const maxHP         = Math.max(8, Math.round(enemy.hpBase * 0.6 + effectiveVit * 3 + targetLevel * 2));

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
    effectiveVit,
    isRare:       !!enemy.isRare
  };
}

// Loose match between an enemy label ("Forest Wolf") and a quest target
// ("wolves", "Road Wolves", "Cave Troll"). Compares singularized words.
function singularize(word) {
  const w = String(word || '').toLowerCase();
  if (w.endsWith('ves') && w.length > 4) return w.slice(0, -3) + 'f';   // wolves -> wolf
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (/(ss|us)$/.test(w)) return w;
  if (w.endsWith('es') && /(ch|sh|x)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && w.length > 3) return w.slice(0, -1);
  return w;
}

function normalizeLabel(text) {
  return String(text || '').toLowerCase().split(/[\s-]+/).map(singularize).join(' ').trim();
}

const GENERIC_TARGET_WORDS = new Set(['the', 'of', 'a', 'an', 'and', 'dead', 'ancient', 'giant', 'great', 'dire', 'elder', 'wild', 'swarm', 'pack', 'corrupted', 'spawn']);

function enemyMatchesTarget(enemyLabel, target) {
  const labelWords  = String(enemyLabel || '').toLowerCase().split(/[\s-]+/).map(singularize);
  const targetWords = String(target || '').toLowerCase().split(/[\s-]+/).map(singularize).filter(w => w && !GENERIC_TARGET_WORDS.has(w));
  if (!targetWords.length) return false;
  // Full label match (e.g. "Cave Troll" === "cave troll") or the target's head noun appears in the label.
  const head = targetWords[targetWords.length - 1];
  return labelWords.includes(head) || targetWords.every(w => labelWords.includes(w));
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
// STATUS EFFECTS SYSTEM
// Bleeding, poison, etc.
// =============================================
function applyStatusEffects(state) {
  const results = [];
  if (!state.statusEffects) state.statusEffects = [];

  for (let i = state.statusEffects.length - 1; i >= 0; i--) {
    const effect = state.statusEffects[i];

    if (effect.type === 'bleed' && effect.target === 'enemy' && state.currentEnemy) {
      state.currentEnemy.currentHP = Math.max(0, state.currentEnemy.currentHP - effect.damage);
      results.push({ type: 'bleed', target: 'enemy', damage: effect.damage, source: effect.source });
    }

    effect.remaining--;
    if (effect.remaining <= 0) {
      state.statusEffects.splice(i, 1);
    }
  }

  return results;
}

function checkBleedApplication(enemy, bodyPart, damage) {
  const hpPct = enemy.currentHP / enemy.maxHP;

  if (BLEED_BODY_PARTS.includes(bodyPart) && damage >= 5 && hpPct < BLEED_THRESHOLD) {
    return {
      type: 'bleed',
      target: 'enemy',
      remaining: 3,
      damage: Math.ceil(damage * 0.25),
      source: bodyPart
    };
  }
  return null;
}


// =============================================
// COMPANION COMBAT RESOLUTION
// =============================================
function resolveCompanionAttacks(state, enemy) {
  if (!state.companions || state.companions.length === 0) return [];

  const results = [];
  const playerLevel = getPlayerLevel(state.totalXP || 0);

  for (const companion of state.companions) {
    // Companion stats scale with player level
    const companionStr = 8 + Math.floor(playerLevel * 0.6);
    const companionDex = 8 + Math.floor(playerLevel * 0.5);

    const hitChance = Math.min(0.75, Math.max(0.25,
      0.50 + (companionDex - enemy.effectiveDex) / 25
    ));

    const hit = Math.random() < hitChance;
    const baseDamage = Math.max(1, companionStr - 6 + Math.floor(Math.random() * 4));
    const damage = hit ? baseDamage : 0;

    results.push({
      name: companion.name,
      hit,
      damage,
      hitChance: Math.round(hitChance * 100)
    });

    if (hit && damage > 0) {
      enemy.currentHP = Math.max(0, enemy.currentHP - damage);
    }
  }

  return results;
}

// =============================================
// SPELLS
// =============================================
function detectSpellCast(state, input) {
  const spells = Array.isArray(state.spells) ? state.spells : [];
  if (!spells.length) return null;
  const t = String(input || '').toLowerCase();
  const named = spells.find(sp => sp && sp.label && t.includes(sp.label.toLowerCase()));
  if (named) return { spell: named };
  if (/\b(cast|spell|bolt|channel|invoke|conjure|smite)\b/.test(t)) return { spell: spells[0] };
  return null;
}

function applySpellToResult(result, spell, stats, quality, playerLevel, enemy) {
  const isHoly     = spell.type === 'holy' || spell.type === 'divine';
  const castStat   = isHoly ? (stats.wis || 10) : (stats.int || 10);
  const qualityMod = { crude: -0.1, basic: -0.05, decent: 0, skilled: 0.05, masterful: 0.1 }[quality] || 0;
  const hitChance  = Math.min(0.95, Math.max(0.3, 0.75 + (castStat - 10) / 40 + qualityMod));
  const hit        = Math.random() < hitChance;
  const dmgRange   = spell.damage || { min: 4, max: 8 };
  const base       = dmgRange.min + Math.floor(Math.random() * (dmgRange.max - dmgRange.min + 1));
  const undeadBonus = (spell.bonusVsUndead && /skeleton|zombie|ghoul|wraith|lich|undead|dead|shade|spectre|revenant|husk|bone/i.test(enemy.label || ''))
    ? spell.bonusVsUndead : 0;
  const damage     = hit ? Math.max(1, Math.round(base + undeadBonus + Math.max(0, castStat - 10) * 0.75 + Math.floor(playerLevel / 2))) : 0;
  result.playerHit    = hit;
  result.playerCrit   = false;
  result.playerDamage = damage;
  result.hitChance    = Math.round(hitChance * 100);
  result.spellCast    = spell.label;
  result.staminaCost  = 0;
  result.bodyPart     = 'body';
}

function getCombatStaminaCost(dex) {
  return Math.max(2, 7 - Math.floor((dex || 10) / 5));
}

// =============================================
// COMBAT ROUND RESOLUTION
// Returns a result object — never modifies state directly.
// Caller is responsible for applying results to state.
// =============================================
function resolveCombatRound(playerStats, actionQuality, bodyPartKey, weaponBonus, hasArmor, armorLevel, stamina, maxStamina, enemy, playerLevel = 1) {
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
  // Level adds a little raw power so progression is felt even before gear/points.
  const levelBonus   = Math.floor(Math.max(1, playerLevel) / 2);
  const rawPlayerDmg = Math.max(1, Math.round(
    (Math.max(1, playerStats.str - 7) + weaponBonus + levelBonus) * bp.damageMod * (playerCrit ? 2 : 1)
  ));
  const playerDamage = playerHit ? rawPlayerDmg : 0;
  const staminaCost  = getCombatStaminaCost(playerStats.dex);

  // Enemy counterattack
  const enemyHitChance = Math.min(0.85, Math.max(0.1,
    0.50 + (enemy.effectiveDex - playerStats.dex) / 20
  ));
  const enemyHit       = Math.random() < enemyHitChance;
  const armorReduce    = (hasArmor && armorLevel) ? armorLevel * 2 : 0;
  const rawEnemyDmg    = Math.max(1, Math.round(
    (enemy.effectiveStr * 1.5 + (enemy.level || 1) * 0.5) * (Math.random() * 0.5 + 0.75)
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

  // Apply status effects at start of round (bleeding, etc.)
  const statusResults = applyStatusEffects(state);

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

  const stats        = getEffectiveStats(state);
  const activeWeapon = getActiveWeapon(state);
  const activeArmor  = getActiveArmor(state);

  // Spellcasting: if the player invokes a known spell and has the mana,
  // the spell replaces the weapon attack for this round.
  const spellAttempt = detectSpellCast(state, input);
  let spell = null;
  if (spellAttempt && spellAttempt.spell) {
    if ((state.mana || 0) >= spellAttempt.spell.manaCost) {
      spell = spellAttempt.spell;
      state.mana = Math.max(0, state.mana - spell.manaCost);
    }
  }

  // Stamina drain (spells cost mana instead)
  const staminaCost = spell ? 0 : getCombatStaminaCost(stats.dex);
  state.stamina     = Math.max(0, state.stamina - staminaCost);

  const result = resolveCombatRound(
    stats,
    score.quality,
    bodyPartKey,
    activeWeapon ? activeWeapon.weaponBonus : 0,
    !!activeArmor,
    activeArmor ? activeArmor.armorLevel : 0,
    state.stamina,
    state.maxStamina,
    enemy,
    playerLevel
  );

  if (spell) applySpellToResult(result, spell, stats, score.quality, playerLevel, enemy);
  if (spellAttempt && spellAttempt.spell && !spell) result.spellFailed = 'mana';

  // Apply player damage
  if (result.playerHit) {
    enemy.currentHP = Math.max(0, enemy.currentHP - result.playerDamage);

    // Check for bleed application on significant hits
    const bleed = checkBleedApplication(enemy, bodyPartKey, result.playerDamage);
    if (bleed) {
      if (!state.statusEffects) state.statusEffects = [];
      // Don't stack multiple bleeds from same source
      const existingBleed = state.statusEffects.find(e => e.type === 'bleed' && e.target === 'enemy');
      if (!existingBleed) {
        state.statusEffects.push(bleed);
        result.appliedBleed = bleed;
      }
    }
  }

  // Companion attacks
  const companionResults = resolveCompanionAttacks(state, enemy);
  result.companionAttacks = companionResults;

  // Update enemy reference after all damage applied
  state.currentEnemy = enemy;

  // Apply enemy damage to player
  if (result.enemyHit) {
    state.hp = Math.max(0, state.hp - result.enemyDamage);
  }

  // Store status effect results for combat log
  result.statusEffectDamage = statusResults;

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
    state.statusEffects    = (state.statusEffects || []).filter(e => e.target !== 'enemy');
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
  const hint       = buildCombatNarrativeHint(result, enemy, state.hp, state.maxHp, state.stamina, state.maxStamina, enemyKilled, companionResults);
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
    0.5 + (getEffectiveStats(state).dex - enemy.effectiveDex) / 20
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
  const regionRange = region ? (region.levelRange || region.monsterLevel) : null;
  const dangerFactor = regionRange ? (regionRange[1] / 15) : 0;

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

  // Status effect damage at start of round
  if (result.statusEffectDamage && result.statusEffectDamage.length > 0) {
    for (const eff of result.statusEffectDamage) {
      if (eff.target === 'enemy') {
        lines.push(`🩸 ${enemy.label} bleeds — ${eff.damage} damage`);
      }
    }
  }

  // Player action
  if (result.spellFailed === 'mana') {
    lines.push(`✧ Not enough mana to cast — you fall back on a physical attack`);
  }
  if (result.spellCast) {
    lines.push(result.playerHit
      ? `✧ ${result.spellCast} strikes the ${enemy.label} — ${result.playerDamage} damage`
      : `✧ ${result.spellCast} misses — ${result.hitChance}% hit chance`);
  } else if (result.playerHit) {
    const crit = result.playerCrit ? ' ⚡ CRITICAL HIT' : '';
    lines.push(`▶ You strike the ${enemy.label}'s ${result.bodyPart}${crit}`);
    lines.push(`  Damage dealt: ${result.playerDamage}`);
    if (result.appliedBleed) {
      lines.push(`  ⚠ Wound is bleeding!`);
    }
  } else {
    lines.push(`▶ You miss — ${result.hitChance}% hit chance, attack goes wide`);
  }

  // Companion attacks
  if (result.companionAttacks && result.companionAttacks.length > 0) {
    for (const ca of result.companionAttacks) {
      if (ca.hit) {
        lines.push(`▷ ${ca.name} strikes — ${ca.damage} damage`);
      } else {
        lines.push(`▷ ${ca.name} misses`);
      }
    }
  }

  // Enemy HP status (with actual numbers now)
  const ePct = enemy.currentHP / enemy.maxHP;
  const eLabel = ePct <= 0 ? 'DEAD' :
                 ePct < 0.15 ? 'Near Death' :
                 ePct < 0.35 ? 'Critically Wounded' :
                 ePct < 0.60 ? 'Seriously Wounded' :
                 ePct < 0.80 ? 'Wounded' : 'Mostly Unharmed';
  const eBar = buildMiniBar(ePct, 12);
  lines.push(`  ${enemy.label}: ${eBar} ${enemy.currentHP}/${enemy.maxHP} [${eLabel}]`);

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
function buildCombatNarrativeHint(result, enemy, playerHP, maxHP, stamina, maxStamina, enemyKilled, companionResults = []) {
  const lines = ['[COMBAT NARRATIVE INSTRUCTIONS — write visceral, present-tense prose. Do NOT repeat numbers; those appear in the combat log the player already sees.]'];

  // Status effects
  if (result && result.statusEffectDamage && result.statusEffectDamage.length > 0) {
    lines.push(`[The ${enemy.label} is BLEEDING from previous wounds. Describe blood loss, weakening, the toll it takes.]`);
  }

  if (result) {
    if (result.spellCast) {
      lines.push(result.playerHit
        ? `[SPELL HIT — the player's ${result.spellCast} struck the ${enemy.label}. Describe the magic landing.]`
        : `[SPELL MISSED — the player's ${result.spellCast} went wide. Do NOT describe it hitting.]`);
    } else if (result.playerHit) {
      const critNote = result.playerCrit ? ' — a CRITICAL strike, devastating impact' : '';
      lines.push(`[PLAYER HIT — MANDATORY: The attack LANDED on the ${enemy.label}'s ${result.bodyPart}${critNote}. Describe solid contact, impact, pain reaction. The player SUCCEEDED.]`);
      if (result.appliedBleed) {
        lines.push(`[The wound is BLEEDING badly. Describe blood flowing, the severity of the cut.]`);
      }
    } else {
      lines.push(`[PLAYER MISSED — MANDATORY: The attack FAILED. It did NOT connect. Do NOT describe the attack landing or dealing damage. Describe the swing going wide, a stumble, overextension, or the enemy dodging. The player feels frustrated. NO DAMAGE WAS DEALT.]`);
    }

    // Companion actions
    if (companionResults && companionResults.length > 0) {
      for (const ca of companionResults) {
        if (ca.hit) {
          lines.push(`[${ca.name} HIT the ${enemy.label}. Describe their attack landing — arrow, blade, spell — and the enemy reacting to multiple threats.]`);
        } else {
          lines.push(`[${ca.name} attacked but missed. A brief moment of their weapon or spell going wide.]`);
        }
      }
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
    lines.push(`[${enemy.label} IS DEAD — MANDATORY: The fight is OVER. Describe the final blow, the body collapsing, going still. Victory.]`);
  } else if (enemy) {
    const ePct = enemy.currentHP / enemy.maxHP;
    if      (ePct < 0.15) lines.push(`[ENEMY STATUS: ${enemy.label} is NEARLY DEAD (${Math.round(ePct*100)}% HP) — MUST appear staggering, desperate, about to collapse. One or two hits from death.]`);
    else if (ePct < 0.35) lines.push(`[ENEMY STATUS: ${enemy.label} is BADLY WOUNDED (${Math.round(ePct*100)}% HP) — MUST appear visibly injured, bleeding, movements ragged and slow.]`);
    else if (ePct < 0.60) lines.push(`[ENEMY STATUS: ${enemy.label} is WOUNDED (${Math.round(ePct*100)}% HP) — Should show some toll, fighting more cautiously, but still dangerous.]`);
    else                  lines.push(`[ENEMY STATUS: ${enemy.label} is MOSTLY UNHARMED (${Math.round(ePct*100)}% HP) — Still fresh, confident, aggressive. NOT wounded, NOT staggering, NOT dying.]`);
  }

lines.push('[Write 3–5 sentences of combat prose. CRITICAL: Your narrative MUST match the mechanical outcome above. If the player MISSED, do NOT describe their attack connecting. If the enemy is UNHARMED, do NOT describe it dying or collapsing. The combat log shows players the truth — your narrative must not contradict it.]');  return lines.join('\n');
}


// =============================================
// UI DATA BUILDER
// Returns clean object for the right panel enemy display.
// =============================================
function buildEnemyPanelData(state) {
  if (!state.inCombat || !state.currentEnemy) return null;

  const enemy = state.currentEnemy;
  const ePct  = enemy.currentHP / enemy.maxHP;

  // Check for active bleed on enemy
  const isBleeding = state.statusEffects && 
    state.statusEffects.some(e => e.type === 'bleed' && e.target === 'enemy');

  return {
    label:      enemy.label,
    desc:       enemy.desc,
    behavior:   enemy.behavior,
    level:      enemy.level,
    currentHP:  enemy.currentHP,
    maxHP:      enemy.maxHP,
    hpPercent:  Math.round(ePct * 100),
    hpLabel:    ePct <= 0 ? 'DEAD' :
                ePct < 0.15 ? 'Near Death' :
                ePct < 0.35 ? 'Critically Wounded' :
                ePct < 0.60 ? 'Seriously Wounded' :
                ePct < 0.80 ? 'Wounded' : 'Uninjured',
    isBleeding,
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
  buildEnemyInstance,
  enemyMatchesTarget,
  singularize,
  isEnemyUnbeatable,
  calculateEnemyXP,

  // Resolution
  resolveCombatRound,
  applyCombatRound,
  applyFleeAttempt,
  checkAmbientEncounter,

  // Companions
  resolveCompanionAttacks,

  // Spells
  detectSpellCast,

  // Status Effects
  applyStatusEffects,
  checkBleedApplication,

  // Inspect
  buildEnemyInspectData,

  // Narrative
  buildCombatNarrativeHint,
  buildCombatLog,
  buildMiniBar,

  // UI
  buildEnemyPanelData
};