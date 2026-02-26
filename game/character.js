'use strict';

// =============================================================
// EMBER AND ASH — CHARACTER
// Handles creation phases, stat calculation, XP, leveling,
// free point allocation, and resource recalculation.
// No AI calls. No database calls. Pure game logic.
// =============================================================

const {
  BACKGROUNDS,
  MAGICAL_BACKGROUNDS,
  REGIONS,
  STARTING_ENVIRONMENTS,
  GEAR_QUALITIES,
  STARTING_GEAR,
  STARTING_SPELLS,
  MAX_LEVEL,
  CLASS_LEVEL_XP,
  PROF_LEVEL_XP,
  CLASSES,
  PROFESSIONS,
  BUILD_MODS,
  BUILD_KEYWORDS,
  AGE_BANDS,
  NSFW_KEYWORDS,
  BACKGROUND_KEYWORDS,
  FREEFORM_SKILL_CONFIG,
} = require('./constants');

const {
  clampResources,
  isInCreation
} = require('./state');


// =============================================
// XP & LEVELING
// =============================================
function getXPForLevel(level) {
  if (level <= 1) return 0;
  return Math.floor(level * (level - 1) / 2) * 10;
}

function getPlayerLevel(totalXP) {
  if (!totalXP || totalXP <= 0) return 1;
  let level = 1;
  while (level < MAX_LEVEL && totalXP >= getXPForLevel(level + 1)) level++;
  return level;
}

function getXPToNextLevel(totalXP) {
  const level = getPlayerLevel(totalXP);
  if (level >= MAX_LEVEL) return null;
  return getXPForLevel(level + 1) - totalXP;
}

function getProfessionLevel(profXP) {
  if (!profXP || profXP <= 0) return 1;
  for (let i = PROF_LEVEL_XP.length - 1; i >= 1; i--) {
    if (profXP >= PROF_LEVEL_XP[i]) return i;
  }
  return 1;
}


// =============================================
// RESOURCE CALCULATION
// Always derive max values from current stats + level.
// Call recalculateResources any time stats or level changes.
// =============================================
function calculateMaxHP(vit, level) {
  // With base-10 stats, halved coefficient keeps HP in a similar range to old base-5 system
  return vit * 5 + level * 3;
}

function calculateMaxMana(int_, wis, level) {
  return int_ * 3 + wis * 2 + level * 2;
}

function calculateMaxStamina(vit, dex, level) {
  return vit * 3 + dex * 2 + level * 2;
}

function recalculateResources(state) {
  const s     = state.stats;
  const level = getPlayerLevel(state.totalXP || 0);

  const newMaxHp      = calculateMaxHP(s.vit, level);
  const newMaxMana    = calculateMaxMana(s.int, s.wis, level);
  const newMaxStamina = calculateMaxStamina(s.vit, s.dex, level);

  // Scale current values proportionally if max changed
  if (state.maxHp > 0) {
    state.hp = Math.round((state.hp / state.maxHp) * newMaxHp);
  }
  if (state.maxMana > 0) {
    state.mana = Math.round((state.mana / state.maxMana) * newMaxMana);
  }
  if (state.maxStamina > 0) {
    state.stamina = Math.round((state.stamina / state.maxStamina) * newMaxStamina);
  }

  state.maxHp      = newMaxHp;
  state.maxMana    = newMaxMana;
  state.maxStamina = newMaxStamina;

  return clampResources(state);
}


// =============================================
// PHYSICAL / NSFW DETECTION UTILITIES
// =============================================

/**
 * Detects a build type from free-form description text.
 * When multiple build keywords match, returns the most extreme (highest str mod).
 * Defaults to 'average' if nothing detected.
 */
function detectBuild(text) {
  const t       = text.toLowerCase();
  let   matches = [];

  for (const [keyword, buildKey] of Object.entries(BUILD_KEYWORDS)) {
    if (t.includes(keyword)) matches.push(buildKey);
  }

  if (matches.length === 0) return 'average';
  if (matches.length === 1) return matches[0];

  // Multiple matches: prefer highest absolute str modifier (most extreme build)
  return matches.reduce((best, key) => {
    const bestMod = Math.abs((BUILD_MODS[best] || BUILD_MODS.average).str);
    const thisMod = Math.abs((BUILD_MODS[key]  || BUILD_MODS.average).str);
    return thisMod > bestMod ? key : best;
  }, matches[0]);
}

/**
 * Checks whether a description contains NSFW content.
 * Returns true if any trigger keyword is found.
 * The caller is responsible for setting state.nsfwEnabled.
 */
function detectNSFW(text) {
  const t = text.toLowerCase();
  return NSFW_KEYWORDS.some(kw => t.includes(kw));
}

/**
 * Tries to match free-form background text to a known background key.
 * Checks BACKGROUND_KEYWORDS phrases in order of specificity (longer phrases win).
 * Returns a background key string or null if no match.
 */
function detectBackgroundFreeform(text, availableKeys) {
  const t = text.toLowerCase();

  // Sort categories by longest phrase first to prefer specific matches
  const entries = Object.entries(BACKGROUND_KEYWORDS);

  for (const [bgKey, phrases] of entries) {
    if (availableKeys && !availableKeys.includes(bgKey)) continue;
    // Sort phrases longest-first within each category
    const sorted = [...phrases].sort((a, b) => b.length - a.length);
    for (const phrase of sorted) {
      if (t.includes(phrase)) return bgKey;
    }
  }
  return null;
}


// =============================================
// STAT CALCULATION FROM BACKGROUND + AGE + BUILD
// Design intent: a neutral adult at prime age with average
// build starts at 10 in every stat. Backgrounds, age, and
// build shift from that baseline.
// =============================================
function calculateStats(age, backgroundKey, buildKey) {
  const base   = 10;  // neutral, prime-age, average-build person = 10 across the board
  const bg     = BACKGROUNDS[backgroundKey];
  const build  = BUILD_MODS[buildKey || 'average'] || BUILD_MODS.average;
  const statKeys = ['str', 'dex', 'vit', 'int', 'wis', 'cha'];
  const stats  = {};

  // 1. Base + background mods
  statKeys.forEach(s => {
    stats[s] = base + (bg.mods[s] || 0);
  });

  // 2. Age band modifiers
  const ageBand = AGE_BANDS.find(b => age >= b.min && age <= b.max) || AGE_BANDS[1]; // default Prime
  statKeys.forEach(s => {
    stats[s] += (ageBand.mods[s] || 0);
  });

  // 3. Build modifiers
  statKeys.forEach(s => {
    stats[s] += (build[s] || 0);
  });

  // Floor at 1 — no stat can reach zero
  statKeys.forEach(s => { if (stats[s] < 1) stats[s] = 1; });

  return stats;
}


// =============================================
// BACKGROUND FILTERING
// Returns all backgrounds (regular + magical) valid for given age/gender.
// =============================================
function getAvailableBackgrounds(age, gender) {
  const allBackgrounds = { ...BACKGROUNDS };
  return Object.entries(allBackgrounds).filter(([, bg]) => {
    if (bg.minAge !== null && age < bg.minAge) return false;
    if (bg.maxAge !== null && age > bg.maxAge) return false;
    if (bg.genderReq !== null && gender.toLowerCase() !== bg.genderReq) return false;
    return true;
  });
}


// =============================================
// GEAR BUILDER
// =============================================
function buildGearItem(src, isArmor) {
  if (!src) return null;
  const q = GEAR_QUALITIES[Math.max(0, Math.min(src.tier, GEAR_QUALITIES.length - 1))];
  return {
    name:        src.name,
    quality:     q.label,
    tier:        q.tier,
    levelReq:    q.levelReq,
    weaponBonus: isArmor ? 0 : q.weaponBonus,
    armorLevel:  isArmor ? q.armorLevel : 0,
    statMods:    src.statMods  || null,
    isCrafted:   src.isCrafted || false,
    sellBonus:   src.sellBonus || 0,
    craftedBy:   src.craftedBy || null
  };
}

// =============================================
// CRAFTED GEAR ITEM BUILDER
// Generates an equippable gear item from a profession
// crafting attempt, with stat modifiers driven by
// player-described goals and profession type.
// =============================================
const CRAFT_GOAL_KEYWORDS = {
  str: ['sharp','deadly','powerful','heavy','strong','brutal','crushing','mighty','fierce','vicious','hard-hitting','penetrating'],
  dex: ['quick','swift','fast','light','nimble','agile','precise','balanced','elegant','graceful','accurate','responsive'],
  vit: ['tough','durable','sturdy','solid','thick','reinforced','protective','resilient','heavy-duty','unbreakable','enduring'],
  int: ['enchanted','arcane','runed','magical','inscribed','imbued','scholarly','focused','channeling','sigil'],
  wis: ['warding','blessed','sacred','wise','insightful','protective','woven','spiritual','meditative'],
  cha: ['beautiful','ornate','elegant','impressive','decorative','polished','ceremonial','noble','prestigious','refined']
};

const PROFESSION_STAT_AFFINITY = {
  blacksmith: { str:2, vit:1 },
  alchemist:  { int:2, wis:1 },
  scout:      { dex:2, wis:1 },
  merchant:   { cha:2, int:1 },
  cook:       { vit:2, wis:1 },
  hunter:     { dex:2, str:1 },
  scholar:    { int:2, wis:1 },
  woodsman:   { str:2, vit:1 }
};

const CRAFTING_DETECT_KEYWORDS = [
  'forge','craft','make','create','smith','brew','sew','weave','carve','fashion','construct',
  'build','assemble','prepare','mix','compound','distil','stitch','hammer','shape','work',
  'whittle','knap','bind','inscribe','enchant'
];

// Universal primitive/improvised items — craftable by ANYONE regardless of profession.
// Quality is always crude/rough without a profession, but they are valid equippable gear.
const UNIVERSAL_WEAPONS = [
  'club','stick','stone knife','stone axe','rock','flint knife','flint axe','bone knife',
  'sharpened stick','crude spear','primitive spear','crude club','branch','makeshift club',
  'rock-headed club','knapped blade','flint blade','stone tool','bone tool','tooth knife',
  'sharpened bone','jaw blade','antler pick','wooden spear','crude bow','rough spear',
  'stone','knapped','flint','chipped stone','chipped flint'
];

const UNIVERSAL_ARMOR = [
  'hood','cap','wrap','binding','pelt','hide','cloak','tunic','vest',
  'makeshift hood','wolf pelt hood','rabbit hide cap','bark vest','wrapped hide',
  'hide wrap','bone pauldron','lashed hide','crude shield','bark shield','wicker shield',
  'makeshift armor','crude armor','rough armor','padded wrap','fur cloak','animal hide',
  'pelt cloak','hide cloak','tanned hide','leather wrap','wolf hood','wolf cloak',
  'wolf pelt','deer hide','rabbit pelt','bear pelt','boar hide'
];

const CRAFTABLE_WEAPONS = {
  blacksmith: ['sword','blade','dagger','axe','hammer','mace','spear','shield','shortsword','longsword','hatchet','maul'],
  alchemist:  ['staff','wand','focus','rod'],
  woodsman:   ['staff','club','bow','arrow','spear','shaft','shortbow','longbow','quarterstaff'],
  hunter:     ['bow','spear','javelin','arrow','shortbow','hunting spear','throwing knife'],
  scholar:    ['staff','tome','focus','rod'],
  merchant:   ['shortsword','dagger','club'],
  cook:       ['knife','cleaver','skillet','butcher knife'],
  scout:      ['shortbow','dagger','shortsword','sling','hand crossbow']
};

const CRAFTABLE_ARMOR = {
  blacksmith: ['armor','chainmail','plate','helm','gauntlets','greaves','shield','breastplate','coif','vambrace'],
  alchemist:  ['cloak','robe','gloves','band','ring'],
  woodsman:   ['shield','hide armor','bark armor','bark vest','hide cloak','fur armor'],
  hunter:     ['leather armor','hide armor','cloak','pelt armor','fur armor','leather hood'],
  scholar:    ['robe','cloak','cap'],
  merchant:   ['vest','coat'],
  cook:       ['apron','gloves'],
  scout:      ['leather armor','cloak','hood','soft armor','padded vest','face wrap']
};

function detectCraftingIntent(input, profKey) {
  const t = input.toLowerCase();
  const hasCraftVerb = CRAFTING_DETECT_KEYWORDS.some(k => t.includes(k));
  if (!hasCraftVerb) return null;

  // Check profession-specific lists first
  const weaponList = CRAFTABLE_WEAPONS[profKey] || [];
  const armorList  = CRAFTABLE_ARMOR[profKey]   || [];

  const isProfWeapon = weaponList.some(w => t.includes(w));
  const isProfArmor  = armorList.some(a => t.includes(a));

  // Fall back to universal primitive lists (any player can craft these)
  const isUniversalWeapon = !isProfWeapon && UNIVERSAL_WEAPONS.some(w => t.includes(w));
  const isUniversalArmor  = !isProfArmor  && UNIVERSAL_ARMOR.some(a => t.includes(a));

  const isWeapon = isProfWeapon || isUniversalWeapon;
  const isArmor  = isProfArmor  || isUniversalArmor;

  if (!isWeapon && !isArmor) return null;

  // Try to extract item name from input (up to 5 words after craft verb)
  let itemName = null;
  for (const verb of CRAFTING_DETECT_KEYWORDS) {
    const idx = t.indexOf(verb);
    if (idx !== -1) {
      const after = t.slice(idx + verb.length).trim().split(/\s+/).slice(0, 5).join(' ');
      itemName = after.replace(/^(a|an|the)\s+/i,'').trim();
      break;
    }
  }

  return {
    isArmor:    isArmor && !isWeapon,
    isPrimitive: !isProfWeapon && !isProfArmor, // crude quality cap if no profession match
    itemName:   itemName || (isArmor ? 'improvised armor' : 'improvised weapon')
  };
}

function buildCraftedGearItem(profKey, profLevel, input) {
  const intent = detectCraftingIntent(input, profKey);
  if (!intent) return null;

  // Primitive/universal crafting: no profession needed, but quality capped at crude (tier 0)
  // Profession crafting: tier scales with level
  let tier;
  if (intent.isPrimitive || !profKey) {
    // Improvised item — always crude quality regardless of level
    // Even a master blacksmith making a "rock club" gets crude quality for that specific item
    tier = 0;
  } else {
    // Tier driven by profession level
    const tierMap = [0, 0, 1, 2, 3, 5];
    tier = tierMap[Math.min(profLevel, tierMap.length - 1)];
  }
  tier = Math.min(tier, GEAR_QUALITIES.length - 1);
  const quality = GEAR_QUALITIES[tier];

  // Parse goal keywords from input
  const t    = input.toLowerCase();
  const mods = {};
  for (const [stat, keywords] of Object.entries(CRAFT_GOAL_KEYWORDS)) {
    if (keywords.some(k => t.includes(k))) {
      mods[stat] = (mods[stat] || 0) + 1;
    }
  }

  // Profession affinity mods — only applied if this is a profession item (not primitive)
  if (!intent.isPrimitive && profKey) {
    const affinity = PROFESSION_STAT_AFFINITY[profKey] || {};
    for (const [stat, weight] of Object.entries(affinity)) {
      if (!mods[stat]) mods[stat] = weight > 1 ? 1 : 0;
    }
  }

  // Cap: each mod max 3, max 3 stat entries total
  const finalMods = {};
  let count = 0;
  for (const [stat, val] of Object.entries(mods).sort((a,b) => b[1]-a[1])) {
    if (count >= 3 || val <= 0) continue;
    finalMods[stat] = Math.min(3, val);
    count++;
  }

  // Primitive items get minimal weapon/armor bonus (+1) regardless of quality tier
  const effectiveProfLevel = (intent.isPrimitive || !profKey) ? 0 : profLevel;
  const sellBonus = Math.round(quality.weaponBonus * (1 + effectiveProfLevel * 0.2) * 10);

  return {
    name:        intent.itemName,
    quality:     quality.label,
    tier,
    levelReq:    quality.levelReq,
    weaponBonus: intent.isArmor ? 0 : Math.max(1, quality.weaponBonus),
    armorLevel:  intent.isArmor ? Math.max(1, quality.armorLevel) : 0,
    statMods:    Object.keys(finalMods).length > 0 ? finalMods : null,
    isCrafted:   true,
    isPrimitive: intent.isPrimitive || false,
    craftedBy:   profKey || 'improvised',
    sellBonus
  };
}

function getStartingGear(backgroundKey) {
  // Universal base items — every character starts with these
  // Clothing provides 1 armor each (shirt + trousers + shoes = 3 total clothing armor)
  const universalClothing = [
    'basic linen shirt (1 armor)',
    'plain trousers (1 armor)',
    'worn leather shoes (1 armor)',
  ];

  // Universal fallback knife — overridden if background provides a better weapon
  const universalKnife = { name:'simple belt knife', tier:0 };

  const src = STARTING_GEAR[backgroundKey];

  // Use background weapon if one exists; otherwise the universal knife
  const weaponSrc = (src && src.weapon) ? src.weapon : universalKnife;
  const weapon    = buildGearItem(weaponSrc, false);
  const armor     = (src && src.armor) ? buildGearItem(src.armor, true) : null;

  // Clothing armor: always 3 points (shirt 1 + trousers 1 + shoes 1)
  // Stored separately from armor slot so players can wear both
  const clothingArmor = 3;

  const inv = [...universalClothing, 'waterskin'];

  // Ranged weapon (currently: Hunter background)
  if (src && src.ranged) {
    const rq = GEAR_QUALITIES[Math.min(src.ranged.tier, GEAR_QUALITIES.length - 1)];
    inv.push(`${src.ranged.name} (${rq.label}) — range 20m, damage 1–2`);
  }

  // Soldiers and guards get a shield note
  const shieldBackgrounds = new Set(['soldier', 'guard', 'guardchild', 'mercenary']);
  if (shieldBackgrounds.has(backgroundKey)) {
    inv.push('battered wooden shield (2 armor, 1 hand)');
  }

  return { weapon, armor, clothingArmor, inventory: inv };
}

/**
 * Returns the starting spell data for a background, or null.
 */
function getStartingSpell(backgroundKey) {
  const bg = BACKGROUNDS[backgroundKey];
  if (!bg || !bg.isMagical || !bg.startingSpell) return null;
  return STARTING_SPELLS[bg.startingSpell] || null;
}

function getActiveWeapon(state) {
  const level = getPlayerLevel(state.totalXP || 0);
  const w     = state.gear && state.gear.weapon;
  return (w && level >= w.levelReq) ? w : null;
}

function getActiveArmor(state) {
  const level = getPlayerLevel(state.totalXP || 0);
  const a     = state.gear && state.gear.armor;
  return (a && level >= a.levelReq) ? a : null;
}


// =============================================
// CHARACTER CREATION — PHASE PROCESSORS
// Each function takes (state, input) and returns
// { state, prompt, done, error }
// =============================================

// =============================================
// CHARACTER CREATION — PHASE PROCESSORS
//
// Phase 1: Name, age, gender
// Phase 2: Physical description (height, build, features) + NSFW detection
// Phase 3: Background — list selection OR free-form description
// Phase 4: Starting environment (forest / plains / village / city)
// Phase 5: Done
//
// Each function: (state, input) → { state, prompt, done, error }
// =============================================

// -----------------------------------------------
// Phase 1: Name, age, gender
// -----------------------------------------------
function processPhase1(state, input) {
  const ageMatch = input.match(/\b([1-9]\d?)\b/);
  const age      = ageMatch ? parseInt(ageMatch[1]) : null;

  if (!age || age < 10 || age > 90) {
    return {
      state,
      prompt: 'Please provide your age (10–90).\nExample: "My name is Dara, I am 26 years old and female."',
      done:  false,
      error: true
    };
  }

  // Gender detection
  const t = input.toLowerCase();
  let gender = 'other';
  if ((t.includes('male') && !t.includes('female')) || t.includes(' man') || t.includes(' boy') || t.includes(' lad')) {
    gender = 'male';
  } else if (t.includes('female') || t.includes('woman') || t.includes('girl') || t.includes('lass')) {
    gender = 'female';
  }

  // Name: grab first capitalized word that isn't a common non-name
  const NON_NAMES = new Set(['I','My','The','A','An','Age','Male','Female','Man','Woman','Year','Years','Old','Am','Is']);
  const words     = input.match(/\b[A-Z][a-z]{1,}/g) || [];
  const nameWord  = words.find(w => !NON_NAMES.has(w));
  const name      = nameWord || null;

  state.creation.name   = name;
  state.creation.age    = age;
  state.creation.gender = gender;
  state.creation.phase  = 2;

  const gLabel  = gender === 'other' ? 'Unknown gender' : gender.charAt(0).toUpperCase() + gender.slice(1);
  const nameLine = name ? `${name}. ` : '';

  // Determine available age-band label
  const ageBand = AGE_BANDS.find(b => age >= b.min && age <= b.max) || { label: 'Prime' };

  const prompt = `${nameLine}${gLabel}, age ${age} — ${ageBand.label}.\n\n` +
    `Now tell me what I can see.\n\n` +
    `Describe your height, build, and anything that makes you recognizable — ` +
    `scars, tattoos, unusual features, your eyes, your hair, your hands.\n\n` +
    `There is no wrong answer. Be as brief or detailed as you like.\n\n` +
    `Example: "Six feet tall, lean and long-armed, pale skin, dark eyes, a healed burn scar across my left cheek."\n` +
    `Example: "Short and broad, red beard, missing two fingers on my right hand, eyes that are too close together."`;

  return { state, prompt, done: false, error: false };
}


// -----------------------------------------------
// Phase 2: Physical description, build detection, NSFW check
// -----------------------------------------------
function processPhase2(state, input) {
  if (input.trim().length < 4) {
    return {
      state,
      prompt: 'Give me something to work with — even a single sentence.\nExample: "Average height, stocky, grey eyes."',
      done:  false,
      error: true
    };
  }

  // NSFW detection — any explicit content in description enables mature scenes
  const nsfwDetected = detectNSFW(input);
  if (nsfwDetected) {
    state.nsfwEnabled = true;
    // No announcement — just quietly enable it
  }

  // Build detection
  const buildKey       = detectBuild(input);
  const buildData      = BUILD_MODS[buildKey];

  state.creation.physicalDescription = input.trim();
  state.creation.buildKey            = buildKey;
  state.creation.phase               = 3;

  // Prepare background list
  const available = getAvailableBackgrounds(state.creation.age, state.creation.gender);
  state.creation.availableBackgrounds = available.map(([key]) => key);

  // Group backgrounds for display: standard vs magical
  const standardBgs = available.filter(([, bg]) => !bg.isMagical);
  const magicalBgs  = available.filter(([, bg]) =>  bg.isMagical);

  let bgLines = standardBgs.map(([, bg], i) => `${i + 1}. **${bg.label}** — ${bg.desc}`).join('\n');
  if (magicalBgs.length > 0) {
    bgLines += '\n\n*✦ Magical Backgrounds (grant a starting spell):*\n';
    bgLines += magicalBgs.map(([, bg], i) =>
      `${standardBgs.length + i + 1}. **${bg.label}** *(${bg.startingSpell === 'mana_bolt' ? 'Mana Bolt' : 'Divine Bolt'})* — ${bg.desc}`
    ).join('\n');
  }

  const buildDesc = buildData ? ` ${buildData.label} build.` : '';

  const prompt =
    `${input.trim()}.${buildDesc}\n\n` +
    `Now — what shaped you before this moment?\n\n` +
    `Select a background from the list, type its number or name, ` +
    `or describe your history in your own words and I will place you.\n\n` +
    bgLines;

  return { state, prompt, done: false, error: false };
}


// -----------------------------------------------
// Phase 3: Background — list selection or free-form
// -----------------------------------------------
function processPhase3(state, input) {
  const availKeys    = state.creation.availableBackgrounds || [];
  const availEntries = availKeys.map(key => [key, BACKGROUNDS[key]]);
  const t            = input.toLowerCase().trim();
  let chosenKey      = null;

  // 1. Try number selection
  const numMatch = input.match(/\b(\d+)\b/);
  if (numMatch) {
    const idx = parseInt(numMatch[1]) - 1;
    if (idx >= 0 && idx < availEntries.length) chosenKey = availEntries[idx][0];
  }

  // 2. Try exact key or label match
  if (!chosenKey) {
    for (const [k, bg] of availEntries) {
      if (t.includes(k) || t.includes(bg.label.toLowerCase())) {
        chosenKey = k;
        break;
      }
    }
  }

  // 3. Try partial word match on label
  if (!chosenKey) {
    for (const [k, bg] of availEntries) {
      const words = bg.label.toLowerCase().split(/[\s'\/]+/);
      if (words.some(w => w.length > 3 && t.includes(w))) {
        chosenKey = k;
        break;
      }
    }
  }

  // 4. Free-form keyword detection — Primal Hunter style
  if (!chosenKey) {
    chosenKey = detectBackgroundFreeform(input, availKeys);
  }

  if (!chosenKey) {
    const standardBgs = availEntries.filter(([, bg]) => !bg.isMagical);
    const magicalBgs  = availEntries.filter(([, bg]) =>  bg.isMagical);
    let bgLines = standardBgs.map(([, bg], i) => `${i + 1}. ${bg.label} — ${bg.desc}`).join('\n');
    if (magicalBgs.length > 0) {
      bgLines += '\n\n✦ Magical:\n' + magicalBgs.map(([, bg], i) =>
        `${standardBgs.length + i + 1}. ${bg.label} — ${bg.desc}`).join('\n');
    }
    return {
      state,
      prompt: `I could not place that. Type a number, a background name, or describe your history in more detail.\n\n${bgLines}`,
      done:  false,
      error: true
    };
  }

  state.creation.background = chosenKey;
  state.creation.phase      = 4;

  const bg = BACKGROUNDS[chosenKey];
  const spellNote = bg.isMagical
    ? `\n\n*You carry the first spell of your kind: ${bg.startingSpell === 'mana_bolt' ? 'Mana Bolt' : 'Divine Bolt'}.*`
    : '';

  // Environment selection prompt
  const envLines = Object.entries(STARTING_ENVIRONMENTS).map(([key, env], i) => {
    const danger  = `Lv${env.monsterLevel[0]}–${env.monsterLevel[1]}`;
    const pop     = env.populationCount;
    const beast   = Math.round(env.beastChance * 100);
    const ambush  = Math.round(env.ambushChance * 100);
    return (
      `${i + 1}. **${env.label}** (Danger: ${danger})\n` +
      `   Population: ${pop}\n` +
      `   Beast encounters: ${beast}% | Ambush chance: ${ambush}%\n` +
      `   "${env.desc}"`
    );
  }).join('\n\n');

  const prompt =
    `${bg.label}.${spellNote}\n\n` +
    `One final question — where does your story begin?\n\n` +
    `${envLines}\n\n` +
    `Type a number or the name of your starting environment.`;

  return { state, prompt, done: false, error: false };
}


// -----------------------------------------------
// Phase 4: Starting environment — build character — begin
// -----------------------------------------------
function processPhase4(state, input) {
  const envEntries = Object.entries(STARTING_ENVIRONMENTS);
  const t          = input.toLowerCase().trim();
  let chosenEnvKey = null;

  // Number match
  const numMatch = input.match(/\b(\d+)\b/);
  if (numMatch) {
    const idx = parseInt(numMatch[1]) - 1;
    if (idx >= 0 && idx < envEntries.length) chosenEnvKey = envEntries[idx][0];
  }

  // Name match
  if (!chosenEnvKey) {
    for (const [k, env] of envEntries) {
      if (t.includes(k) || t.includes(env.label.toLowerCase())) {
        chosenEnvKey = k;
        break;
      }
    }
  }

  // Keyword fallback
  if (!chosenEnvKey) {
    const keywordMap = {
      deep_forest:   ['forest','wood','woods','trees','deep forest','wilderness','wild'],
      open_plains:   ['plains','plain','grassland','fields','open','road','travel'],
      small_village: ['village','town','hamlet','settlement','small town','community'],
      bustling_city: ['city','urban','metropolis','capital','port','harbour','harbor'],
    };
    for (const [k, words] of Object.entries(keywordMap)) {
      if (words.some(w => t.includes(w))) { chosenEnvKey = k; break; }
    }
  }

  if (!chosenEnvKey) {
    const envLines = envEntries.map(([, env], i) => `${i + 1}. ${env.label} — ${env.desc}`).join('\n\n');
    return {
      state,
      prompt: `I didn't recognize that starting location. Type the number or name.\n\n${envLines}`,
      done:  false,
      error: true
    };
  }

  const env       = STARTING_ENVIRONMENTS[chosenEnvKey];
  const age       = state.creation.age;
  const gender    = state.creation.gender;
  const bgKey     = state.creation.background;
  const buildKey  = state.creation.buildKey || 'average';
  const name      = state.creation.name || null;

  // ---- Build character ----
  state.character = {
    name,
    age,
    gender,
    background:          bgKey,
    startingEnvironment: chosenEnvKey,
    // Primary region for the named-region system — derived from environment
    region:              env.mapsToRegions[0] || 'thornwick',
    description:         state.creation.physicalDescription || '',
    buildKey,
  };

  state.stats           = calculateStats(age, bgKey, buildKey);
  state.totalXP         = 0;
  state.classXP         = 0;
  state.profXP          = 0;
  state.freePoints      = 0;
  state.combatClass     = null;
  state.classLevel      = 0;
  state.profession      = null;
  state.professionLevel = 0;
  state.actionProgress  = {};
  state.inCombat        = false;
  state.currentEnemy    = null;
  state.deathCount      = 0;
  state.deathLocation   = null;
  state.shopOpen        = false;
  state.sceneContext    = 'neutral';
  state.storySummary    = '';
  state.nsfwEnabled     = state.nsfwEnabled || false;
  state.coin            = env.startingCoin || 150;
  state.freeformSkills  = {};  // tracks player-invented skills and their use count

  // Starting gear (universal clothing base + background weapon)
  const startGear        = getStartingGear(bgKey);
  state.gear             = { weapon: startGear.weapon, armor: startGear.armor };
  state.clothingArmor    = startGear.clothingArmor || 3;
  state.inventory        = startGear.inventory;

  // Starting spell for magical backgrounds
  const startSpell = getStartingSpell(bgKey);
  state.spells     = startSpell ? [startSpell] : [];
  state.reputation = {};

  // Starting resources
  const s          = state.stats;
  state.maxHp      = calculateMaxHP(s.vit, 1);
  state.hp         = state.maxHp;
  state.maxMana    = calculateMaxMana(s.int, s.wis, 1);
  state.mana       = state.maxMana;
  state.maxStamina = calculateMaxStamina(s.vit, s.dex, 1);
  state.stamina    = state.maxStamina;

  state.creation.phase = 5;
  state.showStatScreen = true;

  return {
    state,
    prompt:         null,
    done:           true,
    error:          false,
    environmentKey: chosenEnvKey,
    regionKey:      state.character.region,
  };
}


// =============================================
// CREATION ROUTER
// Routes input to correct phase processor.
// =============================================
function processCreationInput(state, input) {
  const phase = state.creation.phase;
  if (phase === 1) return processPhase1(state, input);
  if (phase === 2) return processPhase2(state, input);
  if (phase === 3) return processPhase3(state, input);
  if (phase === 4) return processPhase4(state, input);
  return { state, prompt: null, done: true, error: false };
}


// =============================================
// LEVELING UP
// Called from the event processor when XP crosses a threshold.
// Returns { levelsGained, freePointsAwarded, resourcesUpdated }
// =============================================
function processLevelUp(state) {
  const prevLevel = getPlayerLevel((state.totalXP || 0) - (state.pendingXP || 0));
  const newLevel  = getPlayerLevel(state.totalXP || 0);

  if (newLevel <= prevLevel) return null;

  const levelsGained = newLevel - prevLevel;
  state.freePoints   = (state.freePoints || 0) + levelsGained;

  // Recalculate max resources for new level
  recalculateResources(state);

  return {
    levelsGained,
    prevLevel,
    newLevel,
    freePointsAwarded: levelsGained
  };
}


// =============================================
// CLASS LEVEL UP
// =============================================
function processClassLevelUp(state) {
  if (!state.combatClass || !state.classXP) return null;

  const prevClsLvl = state.classLevel || 1;
  let newClsLvl    = prevClsLvl;

  while (
    newClsLvl < CLASS_LEVEL_XP.length - 1 &&
    state.classXP >= CLASS_LEVEL_XP[newClsLvl + 1]
  ) {
    newClsLvl++;
  }

  if (newClsLvl <= prevClsLvl) return null;

  state.classLevel = newClsLvl;
  const cls        = CLASSES[state.combatClass];

  if (cls) {
    for (const [stat, bonus] of Object.entries(cls.statPerLevel)) {
      state.stats[stat] = (state.stats[stat] || 5) + bonus;
    }
    recalculateResources(state);
  }

  return {
    className:  cls ? cls.label : state.combatClass,
    prevLevel:  prevClsLvl,
    newLevel:   newClsLvl,
    bonuses:    cls ? cls.statPerLevel : {}
  };
}


// =============================================
// PROFESSION LEVEL UP
// =============================================
function processProfessionLevelUp(state) {
  if (!state.profession) return null;

  const prevProfLvl = state.professionLevel || 1;
  const newProfLvl  = getProfessionLevel(state.profXP || 0);

  if (newProfLvl <= prevProfLvl) return null;

  state.professionLevel = newProfLvl;
  const prof            = PROFESSIONS[state.profession];
  const lvlData         = prof ? prof.levels[Math.min(newProfLvl, prof.levels.length) - 1] : null;

  if (lvlData) {
    for (const [stat, bonus] of Object.entries(lvlData.statBonus)) {
      state.stats[stat] = (state.stats[stat] || 5) + bonus;
    }
    recalculateResources(state);
  }

  return {
    profName:  prof ? prof.label : state.profession,
    newLevel:  newProfLvl,
    rankLabel: lvlData ? lvlData.label : '',
    bonuses:   lvlData ? lvlData.statBonus : {}
  };
}


// =============================================
// FREE POINT SPENDING
// =============================================
const STAT_MAP = {
  str: 'str', strength: 'str',
  dex: 'dex', dexterity: 'dex',
  vit: 'vit', vitality: 'vit',
  int: 'int', intelligence: 'int',
  wis: 'wis', wisdom: 'wis',
  cha: 'cha', charisma: 'cha'
};

function spendFreePoint(state, input) {
  if ((state.freePoints || 0) <= 0) {
    return { success: false, message: 'No free stat points available.' };
  }

  const t     = input.toLowerCase();
  const found = Object.keys(STAT_MAP).find(k => t.includes(k));

  if (!found) {
    return { success: false, message: 'Specify a stat: STR, DEX, VIT, INT, WIS, or CHA.' };
  }

  const statKey = STAT_MAP[found];
  state.stats[statKey]++;
  state.freePoints--;

  // Recalculate resources if a resource-affecting stat changed
  if (['vit', 'int', 'wis', 'dex'].includes(statKey)) {
    recalculateResources(state);
  }

  return {
    success:    true,
    stat:       statKey.toUpperCase(),
    newValue:   state.stats[statKey],
    remaining:  state.freePoints,
    message:    `${statKey.toUpperCase()} is now ${state.stats[statKey]}. Free points remaining: ${state.freePoints}.`
  };
}


// =============================================
// STATUS LABELS
// Used by narrative and UI panels.
// =============================================
function getHPLabel(hp, maxHp) {
  const p = hp / maxHp;
  if (p >= 0.8)  return 'Uninjured';
  if (p >= 0.5)  return 'Wounded';
  if (p >= 0.25) return 'Seriously Wounded';
  if (p >= 0.10) return 'Critically Wounded';
  return 'Near Death';
}

function getStaminaLabel(stamina, maxStamina) {
  const p = stamina / maxStamina;
  if (p >= 0.7)  return 'Fresh';
  if (p >= 0.4)  return 'Winded';
  if (p >= 0.15) return 'Exhausted';
  return 'Spent';
}

function getReputationLabel(rep) {
  if (rep >= 80)  return 'Celebrated';
  if (rep >= 50)  return 'Well Respected';
  if (rep >= 20)  return 'Known Favorably';
  if (rep >= 5)   return 'Recognized';
  if (rep >= -5)  return 'Unknown';
  if (rep >= -20) return 'Mistrusted';
  if (rep >= -50) return 'Disliked';
  if (rep >= -80) return 'Despised';
  return 'Wanted';
}


// =============================================
// UI DATA BUILDER
// Returns a clean object for the left panel display.
// No formatting — the frontend handles presentation.
// =============================================
function buildCharacterPanelData(state) {
  const level      = getPlayerLevel(state.totalXP || 0);
  const xpToNext   = getXPToNextLevel(state.totalXP || 0);
  const bg         = state.character ? BACKGROUNDS[state.character.background] : null;
  const region     = state.character ? REGIONS[state.character.region] : null;
  const rep        = (state.reputation && state.character)
    ? (state.reputation[state.character.region] || 0)
    : 0;

  return {
    // Identity
    name:        state.character ? state.character.description : null,
    age:         state.character ? state.character.age : null,
    gender:      state.character ? state.character.gender : null,
    background:  bg ? bg.label : null,
    region:      region ? region.label : null,

    // Level & XP
    level,
    totalXP:     state.totalXP || 0,
    xpToNext,

    // Attributes
    stats:       { ...state.stats },

    // Resources
    hp:          state.hp,
    maxHp:       state.maxHp,
    hpLabel:     getHPLabel(state.hp, state.maxHp),
    mana:        state.mana,
    maxMana:     state.maxMana,
    stamina:     state.stamina,
    maxStamina:  state.maxStamina,
    staminaLabel:getStaminaLabel(state.stamina, state.maxStamina),

    // Progression
    combatClass:     state.combatClass,
    classLevel:      state.classLevel || 0,
    profession:      state.profession,
    professionLevel: state.professionLevel || 0,
    freePoints:      state.freePoints || 0,

    // Economy
    coin:        state.coin || 0,
    inventory:   [...(state.inventory || [])],
    weapon:      state.gear ? state.gear.weapon : null,
    armor:       state.gear ? state.gear.armor  : null,

    // Standing
    reputation:      rep,
    reputationLabel: getReputationLabel(rep),

    // Deaths
    deathCount:  state.deathCount || 0,

    // Companions
    companions:  [...(state.companions || [])]
  };
}


module.exports = {
  // XP & levels
  getXPForLevel,
  getPlayerLevel,
  getXPToNextLevel,
  getProfessionLevel,

  // Resources
  calculateMaxHP,
  calculateMaxMana,
  calculateMaxStamina,
  recalculateResources,

  // Stats
  calculateStats,
  getAvailableBackgrounds,

  // Physical / detection utilities
  detectBuild,
  detectNSFW,
  detectBackgroundFreeform,

  // Gear
  buildGearItem,
  buildCraftedGearItem,
  detectCraftingIntent,
  getStartingGear,
  getStartingSpell,
  getActiveWeapon,
  getActiveArmor,

  // Creation
  processCreationInput,
  processPhase1,
  processPhase2,
  processPhase3,
  processPhase4,

  // Progression
  processLevelUp,
  processClassLevelUp,
  processProfessionLevelUp,
  spendFreePoint,

  // Labels
  getHPLabel,
  getStaminaLabel,
  getReputationLabel,

  // UI
  buildCharacterPanelData
};