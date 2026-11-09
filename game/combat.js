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
const T = require('./combat-tactics');

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
  'back away', 'get out of here', 'sprint away', 'bolt for', 'bolt away', 'bolt out',
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
  // "I cast Mana Bolt", "a spell of escape" are attacks, not retreats.
  if (/\b(cast|spell|invoke|channel|conjure|use)\b/.test(t)) return false;
  return FLEE_TRIGGERS.some(w => new RegExp(`\\b${w}\\b`).test(t));
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
// Whole words only: "arrow" is not "row", "dinner" is not "inn".
const AFFINITY_RE = new Map();
function affinityRe(a) {
  if (!AFFINITY_RE.has(a)) AFFINITY_RE.set(a, new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'));
  return AFFINITY_RE.get(a);
}

function detectAffinities(text) {
  const t     = String(text || '').toLowerCase();
  const found = {};

  for (const [key, cls] of Object.entries(CLASSES)) {
    const hits = cls.affinities.filter(a => affinityRe(a).test(t)).length;
    if (hits > 0) found[`class_${key}`] = hits;
  }

  for (const [key, prof] of Object.entries(PROFESSIONS)) {
    const hits = prof.affinities.filter(a => affinityRe(a).test(t)).length;
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
  // Newcomers (below level 5) meet foes at most one level above them.
  const spread        = playerLevel < 5 ? 4 : 5;
  const targetLevel   = Math.max(lvlMin, Math.min(lvlMax,
    playerLevel + Math.floor(Math.random() * spread) - 2
  ));

  return buildEnemyInstance(key, enemy, targetLevel);
}

// Turns an ENEMIES template into a live combat instance at a given level.
// Balance target: an even-level fight lasts ~5-8 rounds and a careful
// player wins most of the time while losing a meaningful chunk of HP.
function buildEnemyInstance(key, enemy, targetLevel) {
  const effectiveStr  = 5 + (enemy.mods.str || 0) + Math.floor(targetLevel * 0.57);
  const effectiveDex  = 5 + (enemy.mods.dex || 0) + Math.floor(targetLevel * 0.3);
  const effectiveVit  = 5 + (enemy.mods.vit || 0) + Math.floor(targetLevel * 0.4);
  // Deeper tiers field tougher creatures so fights stay meaningful as gear improves.
  // Capped at ×2.5: beyond that, difficulty comes from mechanics, not HP.
  const depth         = Math.min(2.5, 1 + Math.max(0, targetLevel - 10) / 60);
  const maxHP         = Math.max(8, Math.round((enemy.hpBase * 0.6 + effectiveVit * 3 + targetLevel * 2) * depth));

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
  // Trivial foes teach nothing: far-weaker enemies give a sliver of XP,
  // so high levels can't be reached by farming the outer rim.
  const trivial  = gap < -25 ? 0.02 : gap < -10 ? 0.25 : 1;
  return Math.max(gap < -25 ? 0 : 1, Math.round(enemyLevel * gapBonus * (xpMod || 1.0) * trivial));
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
  return require('./companions').companionTurn(state, enemy, T.resistMultiplier);
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
  if (!enemy.traits) enemy.traits = T.getEnemyTraits(enemy);
  state.combatRound = (state.combatRound || 0) + 1;
  T.tickCooldowns(state);

  // Damage over time and regeneration land first.
  const tick   = T.tickEffects(state, enemy);
  const result = {
    preLines: tick.lines, playerLines: [], enemyLines: [],
    statusEffectDamage: tick.results,
    playerHit: false, playerCrit: false, playerDamage: 0,
    enemyHit: false, enemyDamage: 0, staminaCost: 0, hitChance: 0,
    bodyPart: (BODY_PARTS[bodyPartKey] || BODY_PARTS.torso).label
  };

  // Rift and saga environments: burning ground, mana drain.
  const env = enemy.environment || {};
  if (env.burnPct && state.hp > 0) {
    const burn = Math.max(1, Math.round(state.maxHp * env.burnPct));
    state.hp = Math.max(1, state.hp - burn);
    result.preLines.push(`🔥 The ground burns you — ${burn} damage`);
  }
  if (env.manaDrainPct && state.mana > 0) {
    const drain = Math.max(1, Math.round(state.maxMana * env.manaDrainPct));
    state.mana = Math.max(0, state.mana - drain);
    result.preLines.push(`✧ The rift drinks ${drain} of your mana`);
  }

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
      combatLog:   `\n${'─'.repeat(36)}\n✕ ${enemy.label} is far beyond you (Lv${enemy.level}). Your blows do nothing.\n◀ It strikes for ${dmg}. HP ${state.hp}/${state.maxHp}\n  Flee is the only option.\n${'─'.repeat(36)}`,
      hint: `[IMPOSSIBLE FIGHT. Every attack fails. ${enemy.label} hits for ${dmg}. Player HP: ${state.hp}/${state.maxHp}. Flee or talk are the only options.]`
    };
  }

  const stats        = getEffectiveStats(state);
  if (state.combatClass === 'paladin') Object.defineProperty(stats, '__paladin', { value: true, enumerable: false });
  let weapon         = getActiveWeapon(state);
  const armor        = getActiveArmor(state);
  const bp           = BODY_PARTS[bodyPartKey] || BODY_PARTS.torso;
  const qualityMod   = { crude: -0.2, basic: -0.1, decent: 0, skilled: 0.1, masterful: 0.2 }[score.quality] || 0;

  // ---------- choose the player's action ----------
  let action = 'attack', ability = null, spell = null, item = null;
  const stunned = T.hasEffect(state, 'player', 'stun');
  if (stunned) {
    action = 'stunned';
    result.playerLines.push('✕ You are stunned and cannot act');
  } else if (enemy.currentHP > 0) {
    item = T.detectCombatItem(input);
    if (item) action = 'item';
    if (!item) {
      ability = T.detectAbility(state, input);
      if (ability) {
        const err = T.payAbilityCost(state, ability);
        if (err) { result.playerLines.push(`✕ ${err} — you attack normally instead`); ability = null; }
        else action = 'ability';
      }
    }
    if (action === 'attack') {
      const attempt = detectSpellCast(state, input);
      if (attempt && attempt.spell) {
        const chr = require('./chronicle');
        const Wm = chr.worldOf(state);
        const manaCost = Math.ceil(attempt.spell.manaCost * (Wm ? chr.eraEffects(Wm).manaCostMult || 1 : 1));
        if ((state.mana || 0) >= manaCost) {
          spell = attempt.spell;
          state.mana = Math.max(0, state.mana - manaCost);
          action = 'spell';
        } else {
          result.spellFailed = 'mana';
        }
      }
    }
    if (action === 'attack' && T.detectDefend(input)) action = 'defend';
  }
  // The player's words decide what is in their hand. A weapon stays sheathed
  // until they draw or name it (or use a weapon technique by name); until
  // then they fight with their body. Their class does not decide this.
  const inHand = require('./agency').updateWeaponInHand(state, input, ability);
  if (!inHand) weapon = null;
  result.unarmed = !weapon;
  result.weaponUsed = weapon ? weapon.name : null;
  // The character's trade: an edge of its own kind (game/profession-perks.js).
  const perks = require('./profession-perks');
  const prof = perks.combatMods(state, enemy);
  if (prof.regen && state.hp > 0 && state.hp < state.maxHp) {
    const r = Math.max(1, Math.round(state.maxHp * prof.regen));
    state.hp = Math.min(state.maxHp, state.hp + r);
    result.preLines.push(`✚ You keep yourself together — +${r} HP`);
  }
  // Trade skills in a fight: study it (scholar), bribe it (merchant), steal from it (thief).
  if (action === 'attack' && !stunned) {
    const fs = perks.detectFightSkill(state, input);
    const used = fs ? perks.useFightSkill(state, fs) : null;
    if (used) {
      result.playerLines.push(`${used.success ? '✦' : '✕'} ${used.message}`);
      if (used.success && used.endsFight) {
        state.inCombat = false; state.currentEnemy = null;
        T.clearCombatEffects(state);
        state.pendingCombatResult = { ...result, bribed: true };
        return { score, enemyKilled: false, bribed: true, result, combatLog: `\n${'─'.repeat(36)}\n${result.playerLines.join('\n')}\n${'─'.repeat(36)}`, hint: `[BRIBED — the player paid ${enemy.label} to leave. Narrate the deal.]` };
      }
      if (used.success) action = 'trade';
    }
  }

  // ---------- resolve the player's action ----------
  const staminaPct  = state.maxStamina > 0 ? state.stamina / state.maxStamina : 1;
  const staminaMod  = staminaPct < 0.15 ? -0.3 : staminaPct < 0.4 ? -0.15 : 0;
  // Accuracy: trained strength counts as well as agility, so STR builds stay viable.
  // Accuracy follows the stat the fighter actually fights with.
  const accuracy    = Math.max(stats.dex, Math.round(T.attackStat(stats, weapon, null) * 0.8));
  // Differences in stats matter relative to how strong both sides are: at
  // level 500 a 100-point gap is not the gulf it is at level 10.
  const dexAdv      = (accuracy - enemy.effectiveDex) / (25 + playerLevel * 0.4);
  // Punching above your weight: every level a foe has over you counts.
  const levelGap    = Math.max(0, (enemy.level || 1) - playerLevel);
  const dmgMult     = T.playerDamageMultiplier(state, enemy) * prof.dmg;
  const D = require('./durability');
  const weaponBonus = (weapon ? Math.round((weapon.weaponBonus || 0) * D.durabilityFactor(weapon)) : 0) + (state.bonusWeaponDamage || 0);
  const profile     = T.weaponProfile(weapon);
  let evade = false, exposed = 1;

  const rollWeaponHit = (hitMod, critBonus, mult, element) => {
    const atk    = T.attackStat(stats, weapon, ability);
    const chance = Math.min(0.95, Math.max(0.05, 0.60 + dexAdv + bp.hitMod + qualityMod + staminaMod + (hitMod || 0) + prof.hit - (env.hitPenalty || 0) - levelGap * 0.01));
    const hit    = Math.random() < chance;
    const crit   = hit && (Math.random() < Math.min(critBonus >= 1 ? 1 : 0.4 + prof.crit, stats.dex / 250 + bp.critBonus + (critBonus || 0) + prof.crit));
    const raw    = (Math.max(1, atk - 7) + weaponBonus * prof.weapon + Math.floor(playerLevel / 2)) * bp.damageMod * (mult || 1) * (crit ? 2 : 1);
    const rm     = T.resistMultiplier(enemy, element || 'physical');
    const dmg    = hit ? Math.max(1, Math.round(raw * dmgMult * rm * (rm > 1.05 ? prof.weakness : 1))) : 0;
    return { hit, crit, dmg, chance };
  };

  const rollSpellHit = (power, element, castKey) => {
    const castStat = stats[castKey || 'int'] || 10;
    const chance = Math.min(0.95, Math.max(0.3, 0.78 + (castStat - 10) / 40 + qualityMod * 0.5));
    const hit    = Math.random() < chance;
    const crit   = hit && Math.random() < Math.min(0.4, castStat / 250);
    const base   = T.spellPower(state, stats, playerLevel, weapon, castKey) * (power || 1) * (0.85 + Math.random() * 0.3) * prof.spell;
    const rm     = T.resistMultiplier(enemy, element);
    const dmg    = hit ? Math.max(1, Math.round(base * dmgMult * rm * (rm > 1.05 ? prof.weakness : 1) * (crit ? 1.75 : 1))) : 0;
    return { hit, crit, dmg, chance };
  };

  const applyHits = (roll, element, label) => {
    result.hitChance = Math.round(roll.chance * 100);
    if (!roll.hit) { result.playerLines.push(`▶ ${label ? `${label} misses` : 'You miss'} — ${result.hitChance}% hit chance`); return 0; }
    const hadWard = enemy.ward > 0;
    const d = T.damageEnemy(enemy, roll.dmg, element, roll.crit);
    if (hadWard && enemy.wardShattered) { enemy.wardShattered = false; result.playerLines.push('  ◈ Your critical strike shatters its ward!'); }
    result.playerHit = true;
    result.playerCrit = result.playerCrit || roll.crit;
    result.playerDamage += d.dealt;
    const weak = T.resistMultiplier(enemy, element) > 1.05 ? ' (weakness!)' : T.resistMultiplier(enemy, element) < 0.95 ? ' (resisted)' : '';
    result.playerLines.push(`▶ ${label || `You strike the ${enemy.label}'s ${bp.label}`}${roll.crit ? ' ⚡ CRITICAL' : ''} — ${d.dealt} damage${weak}${d.absorbed ? ` (${d.absorbed} absorbed by its ward)` : ''}`);
    return d.dealt;
  };

  if (action === 'attack') {
    const cost = getCombatStaminaCost(stats.dex);
    state.stamina = Math.max(0, state.stamina - cost);
    result.staminaCost = cost;
    const roll = rollWeaponHit(0, 0, 1, 'physical');
    const dealt = applyHits(roll, 'physical');
    if (dealt) {
      const bleed = checkBleedApplication(enemy, bodyPartKey, dealt);
      if (bleed) {
        const r = T.addEffect(state, enemy, 'enemy', { type: 'bleed', remaining: 3 }, dealt);
        if (!r.immune) { result.appliedBleed = bleed; result.playerLines.push('  ⚠ The wound is bleeding!'); }
      }
    }
  } else if (action === 'spell') {
    const element = spell.type === 'divine' ? 'holy' : (spell.type || 'arcane');
    const castKey = (element === 'holy') ? 'wis' : 'int';
    const avg = ((spell.damage && spell.damage.min) || 4) / 2 + ((spell.damage && spell.damage.max) || 10) / 2;
    const power = Math.max(1, 1 + (avg - 7) / 40) + (spell.bonusVsUndead && enemy.traits.tags.includes('undead') ? 0.25 : 0);
    result.spellCast = spell.label;
    applyHits(rollSpellHit(power, element, castKey), element, `✧ ${spell.label}`);
  } else if (action === 'defend') {
    const regain = Math.round(state.maxStamina * 0.15);
    state.stamina = Math.min(state.maxStamina, state.stamina + regain);
    result.defended = true;
    result.playerLines.push(`🛡 You take a defensive stance (+${regain} stamina)`);
  } else if (action === 'item') {
    const potion = (state.inventory || []).find(i => (typeof i === 'string' ? i : i.name).toLowerCase().includes(item));
    if (!potion) {
      result.playerLines.push(`✕ You fumble for a ${item} you do not have`);
    } else {
      const idx = state.inventory.indexOf(potion);
      state.inventory.splice(idx, 1);
      if (item === 'elixir of might') {
        T.addEffect(state, enemy, 'player', { type: 'rage', remaining: 4 });
        result.playerLines.push('⚗ You drink an elixir of might — fury fills you (+40% damage)');
      } else if (item === 'warding draught') {
        T.addPlayerWard(state, Math.round(state.maxHp * 0.3));
        result.playerLines.push(`⚗ You drink a warding draught — a ward absorbs the next ${Math.round(state.maxHp * 0.3)} damage`);
      } else if (item === 'snare') {
        const r = T.addEffect(state, enemy, 'enemy', { type: 'stun', remaining: 1 });
        result.playerLines.push(r.immune ? `✕ ${enemy.label} tears through the snare` : `⚙ You spring a snare — ${enemy.label} is caught`);
      } else if (item === 'mana potion') {
        const before = state.mana;
        state.mana = Math.min(state.maxMana, state.mana + Math.ceil(state.maxMana * 0.4));
        result.playerLines.push(`⚗ You drink a mana potion — Mana +${state.mana - before}`);
      } else {
        const before = state.hp;
        state.hp = Math.min(state.maxHp, state.hp + Math.ceil(state.maxHp * ((potion && potion.heal) || 0.4) * prof.potion));
        result.playerLines.push(`⚗ You drink a healing potion — HP +${state.hp - before}`);
      }
      result.usedItem = item;
    }
  } else if (action === 'ability') {
    const a = ability;
    result.abilityUsed = a.label;
    const castKey = T.weaponProfile(weapon) && ({ wizard: 'int', sorcerer: 'cha', warlock: 'cha', cleric: 'wis', druid: 'wis', paladin: 'wis', bard: 'cha' })[state.combatClass];
    let dealtTotal = 0;
    if (a.kind === 'weapon') {
      const hits = a.hits || 1;
      for (let h = 0; h < hits && enemy.currentHP > 0; h++) {
        let mult = a.dmgMult || 1;
        if (a.execute && enemy.currentHP / enemy.maxHP < a.execute) mult *= 1.5;
        const roll = rollWeaponHit(a.hitMod, a.autoCrit ? 1 : a.critBonus, mult, a.element || 'physical');
        dealtTotal += applyHits(roll, a.element || 'physical', `✦ ${a.label}${hits > 1 ? ` (${h + 1}/${hits})` : ''}`);
      }
    } else if (a.kind === 'spell') {
      const power = a.wild ? 0.5 + Math.random() * 1.4 : a.power;
      // Wild magic: each surge comes out as a different element.
      const element = a.element === 'chaos' ? ['fire', 'frost', 'shadow', 'arcane', 'holy'][Math.floor(Math.random() * 5)] : a.element;
      dealtTotal += applyHits(rollSpellHit(power, element, castKey || 'int'), element, `✦ ${a.label}${a.element === 'chaos' ? ` (${element})` : ''}`);
    } else {
      result.playerLines.push(`✦ ${a.label}`);
    }
    if (a.status && (dealtTotal > 0 || a.kind === 'spell' && result.playerHit)) {
      const r = T.addEffect(state, enemy, 'enemy', a.status, dealtTotal);
      result.playerLines.push(r.immune ? `  ${enemy.label} is immune to ${a.status.type}` : `  ${enemy.label} is ${a.status.type === 'stun' ? 'stunned' : a.status.type === 'vulnerable' ? 'marked (takes +25% damage)' : a.status.type === 'weaken' ? 'weakened' : a.status.type + 'ed'}`);
    }
    if (a.status2 && dealtTotal > 0) T.addEffect(state, enemy, 'enemy', a.status2, dealtTotal);
    if (a.buff) { T.addEffect(state, enemy, 'player', a.buff); result.playerLines.push(`  ${a.buff.type === 'rage' ? 'Fury fills you (+30% damage, blows hurt less)' : 'You are inspired (+25% damage)'}`); }
    if (a.selfStatus) T.addEffect(state, enemy, 'player', a.selfStatus);
    if (a.heal) { const b = state.hp; state.hp = Math.min(state.maxHp, state.hp + Math.round(state.maxHp * a.heal)); result.playerLines.push(`  ✚ HP +${state.hp - b}`); }
    if (a.lifesteal && dealtTotal) { const b = state.hp; state.hp = Math.min(state.maxHp, state.hp + Math.round(dealtTotal * a.lifesteal)); result.playerLines.push(`  ✚ You drain ${state.hp - b} HP`); }
    if (a.ward) { T.addPlayerWard(state, Math.round(state.maxHp * a.ward)); result.playerLines.push(`  ◈ A ward absorbs the next ${Math.round(state.maxHp * a.ward)} damage`); }
    if (a.cleanse) T.cleansePlayer(state);
    if (a.restoreMana) { const b = state.mana; state.mana = Math.min(state.maxMana, state.mana + Math.round(state.maxMana * a.restoreMana)); result.playerLines.push(`  Mana +${state.mana - b}`); }
    if (a.evade) evade = true;
    if (a.exposed) exposed = a.exposed;
    if (a.aoe && enemy.summonRounds) { enemy.summonRounds = Math.max(0, enemy.summonRounds - 2); result.playerLines.push('  The volley scatters its allies'); }
  }

  // Ranged weapons get a free volley while the enemy closes in.
  const closingIn = profile.ranged && state.combatRound === 1 && action === 'attack';

  // Companion attacks
  const companionResults = enemy.currentHP > 0 ? resolveCompanionAttacks(state, enemy) : [];
  // Slaves set to fight stand with you — unless they would rather not.
  if (enemy.currentHP > 0 && (state.slaves || []).length) {
    const sl = require('./slavery').combatTurn(state, enemy);
    companionResults.push(...sl.attacks);
    result.preLines.push(...sl.betrayals);
  }
  result.companionAttacks = companionResults;

  // Boss phase triggers
  for (const line of T.checkPhases(enemy)) result.enemyLines.push(line);

  // ---------- enemy turn ----------
  if (enemy.currentHP > 0) {
    if (T.hasEffect(state, 'enemy', 'stun')) {
      result.enemyLines.push(`◀ ${enemy.label} is stunned and cannot act`);
    } else if (closingIn) {
      result.enemyLines.push(`◀ ${enemy.label} closes the distance under your fire`);
    } else {
      const plan = T.planEnemyTurn(state, enemy);
      result.enemyLines.push(...plan.lines);
      if (!plan.windingUp) {
        const hitChance = Math.min(0.8, Math.max(0.25, ((enemy.level || 1) < 5 ? 0.5 : 0.55) + (enemy.effectiveDex - stats.dex) / (40 + playerLevel * 0.6) + (plan.hitBonus || 0) - (armor && armor.armorLevel ? armor.armorLevel * 0.006 : 0) - prof.dodge));
        const magicResist = Math.min(0.35, Math.max(0, (stats.wis - 10) * 0.01));
        const armorReduce = armor && armor.armorLevel ? Math.round(armor.armorLevel * 2 * D.durabilityFactor(armor)) : 0;
        const strike = (mult) => {
          if (evade || Math.random() >= hitChance) return 0;
          let raw = (enemy.effectiveStr * 1.5 + (enemy.level || 1) * 0.5) * (Math.random() * 0.5 + 0.75) * mult * T.enemyDamageMultiplier(state, enemy) * exposed * (1 + levelGap * 0.03) * prof.armor;
          if (Math.random() < 0.05) raw *= 1.5;
          const physical = plan.element === 'physical' && !plan.ignoreArmor;
          let dmg = physical ? raw - armorReduce : raw * (1 - magicResist) - armorReduce * 0.4;
          if (result.defended) dmg *= plan.special ? 0.25 : 0.4;
          return Math.max(physical ? 0 : 1, Math.round(dmg));
        };
        let total = strike(plan.mult);
        if (total > 0) result.enemyHit = true;
        for (let x = 0; x < (plan.extraHits || 0); x++) total += strike(0.5);
        if (enemy.summonRounds > 0) {
          const minion = strike(0.4);
          total += minion;
          enemy.summonRounds--;
          result.enemyLines.push(minion ? `◀ Its allies strike you for ${minion}` : '◀ Its allies swing and miss');
        }
        // Guardian companions step into some of the blows.
        const share = state.companions && state.companions.length ? require('./companions').guardianShare(state) : 0;
        if (share && total > 0) {
          const taken = Math.round(total * share);
          total -= taken;
          if (taken) result.enemyLines.push(`◀ Your guardian takes ${taken} of the damage`);
        }
        const warded = T.absorbWithWard(state, total);
        state.hp = Math.max(0, state.hp - warded.dmg);
        result.enemyDamage = warded.dmg;
        result.enemyHit = result.enemyHit || warded.dmg > 0;
        if (result.enemyHit) {
          result.enemyLines.push(`◀ ${enemy.label} ${plan.special ? `hits with ${plan.special}` : 'strikes back'} — ${warded.dmg} damage${warded.absorbed ? ` (${warded.absorbed} absorbed by your ward)` : ''}${result.defended ? ' (defended)' : ''}`);
          if (plan.status && T.ENEMY_STATUS_SPECS[plan.status]) {
            T.addEffect(state, enemy, 'player', T.ENEMY_STATUS_SPECS[plan.status], warded.dmg || total);
            result.enemyLines.push(`  You are ${plan.status === 'weaken' ? 'weakened' : plan.status === 'bleed' ? 'bleeding' : plan.status === 'burn' ? 'burning' : 'poisoned'}`);
          }
        } else {
          result.enemyLines.push(evade ? `◀ ${enemy.label} strikes at shadows — you are not there` : `◀ ${enemy.label} misses you`);
        }
      }
    }
  }

  // Gear wears: weapons when they land blows, armour when it takes them.
  for (const l of D.wearGear(state, { struck: !!weapon && result.playerHit && (action === 'attack' || (ability && ability.kind === 'weapon')), wasHit: result.enemyHit })) result.enemyLines.push(l);

  // Casters recover a little mana each round they fight.
  if (T.getKnownAbilities(state).some(a => a.cost && a.cost.mana) || (state.spells || []).length) {
    state.mana = Math.min(state.maxMana, (state.mana || 0) + Math.max(1, Math.round(state.maxMana * 0.03)));
  }
  T.decayEffects(state);

  state.currentEnemy = enemy;
  state.pendingCombatResult = result;

  // Check kill
  let enemyKilled = false;
  let xpAwarded   = 0;
  if (enemy.currentHP <= 0) {
    xpAwarded   = calculateEnemyXP(enemy.level, playerLevel, enemy.xpMod);
    enemyKilled = true;
    state.pendingEnemyKill = { label: enemy.label, level: enemy.level, xp: xpAwarded, isBoss: !!enemy.isBoss, meta: enemy.meta || null };
    state.inCombat         = false;
    state.currentEnemy     = null;
    T.clearCombatEffects(state);
    if (state.buffs) { delete state.buffs.sharpened; delete state.buffs.padded; delete state.buffs.studied; delete state.buffs.next; }
    state.stamina          = Math.min(state.maxStamina, state.stamina + 10);
    if (state.reputation && state.character) {
      const region = state.character.region;
      state.reputation[region] = Math.min(100, (state.reputation[region] || 0) + 1);
    }
  }

  const hint      = buildCombatNarrativeHint(result, enemy, state.hp, state.maxHp, state.stamina, state.maxStamina, enemyKilled, companionResults);
  const combatLog = buildCombatLog(result, enemy, state.hp, state.maxHp, state.stamina, state.maxStamina, enemyKilled, score.quality, state);

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
  // Bosses are hard to escape; a rogue's Shadowstep or a scout's eye helps.
  const fleeChance = Math.min(0.85, Math.max(0.1,
    0.5 + (getEffectiveStats(state).dex - enemy.effectiveDex) / 20
    - (enemy.isBoss ? 0.25 : 0) + (state.profession === 'scout' ? 0.1 : 0)
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
function buildCombatLog(result, enemy, playerHP, maxHP, playerStamina, maxStamina, enemyKilled, actionQuality, state = null) {
  if (!result) return null;
  const sep   = '─'.repeat(36);
  const lines = [`\n${sep}`];

  for (const l of result.preLines || []) lines.push(l);
  if (result.spellFailed === 'mana') lines.push('✧ Not enough mana to cast — you fall back on a physical attack');
  if (result.playerLines) {
    for (const l of result.playerLines) lines.push(l);
  } else if (result.playerHit) {
    lines.push(`▶ You strike the ${enemy.label}'s ${result.bodyPart}${result.playerCrit ? ' ⚡ CRITICAL HIT' : ''} — ${result.playerDamage} damage`);
  } else {
    lines.push(`▶ You miss — ${result.hitChance}% hit chance`);
  }

  for (const ca of result.companionAttacks || []) {
    lines.push(ca.hit ? `▷ ${ca.name} ${ca.verb || 'strikes'} — ${ca.damage}${ca.heal ? ' HP restored' : ' damage'}` : `▷ ${ca.name} misses`);
  }

  const ePct = Math.max(0, enemy.currentHP) / enemy.maxHP;
  const eLabel = ePct <= 0 ? 'DEAD' : ePct < 0.15 ? 'Near Death' : ePct < 0.35 ? 'Critically Wounded' : ePct < 0.60 ? 'Seriously Wounded' : ePct < 0.80 ? 'Wounded' : 'Mostly Unharmed';
  lines.push(`  ${enemy.label}: ${buildMiniBar(ePct, 12)} ${Math.max(0, enemy.currentHP)}/${enemy.maxHP} [${eLabel}]${enemy.ward > 0 ? ` ◈${enemy.ward}` : ''}`);

  if (result.enemyLines) {
    for (const l of result.enemyLines) lines.push(l);
  } else if (result.enemyHit) {
    lines.push(`◀ ${enemy.label} strikes back — ${result.enemyDamage} damage`);
  } else if (!enemyKilled) {
    lines.push(`◀ ${enemy.label} misses you`);
  }

  const hpPct   = maxHP > 0 ? playerHP / maxHP : 1;
  const hpLabel = hpPct <= 0 ? 'DEAD' : hpPct < 0.15 ? 'Critical' : hpPct < 0.35 ? 'Badly Hurt' : hpPct < 0.60 ? 'Wounded' : hpPct < 0.80 ? 'Hurt' : 'OK';
  lines.push(`  HP  ${buildMiniBar(hpPct, 12)} ${playerHP}/${maxHP} [${hpLabel}]`);
  lines.push(`  STA ${buildMiniBar(maxStamina > 0 ? playerStamina / maxStamina : 1, 12)} ${playerStamina}/${maxStamina}${state && state.maxMana ? `   MANA ${state.mana}/${state.maxMana}` : ''}`);
  if (state) {
    const fx = (state.statusEffects || []).filter(e => e.remaining > 0 || e.type === 'ward').map(e => `${e.target === 'enemy' ? enemy.label + ': ' : ''}${e.type}${e.type === 'ward' ? ` ${e.amount}` : ` (${e.remaining})`}`);
    if (fx.length && !enemyKilled) lines.push(`  Effects: ${fx.join(', ')}`);
  }
  lines.push(`  Action quality: ${actionQuality || 'basic'}`);
  if (enemyKilled) lines.push(`✦ ${enemy.label} is dead.`);
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