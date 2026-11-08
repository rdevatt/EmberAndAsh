'use strict';

const { GEAR_QUALITIES } = require('../constants');

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

// Idioms that use a crafting verb without crafting anything.
const CRAFT_IDIOMS = /\b(make (?:my|your|our|their|his|her) way|make sure|make camp|make do|make sense|make peace|make love|make a deal|make a run|make an escape|make it|work (?:on|out|through|for|with)|prepare (?:to|for|myself|yourself)|build up|shape up)\b/i;

function detectCraftingIntent(input, profKey) {
  const t = input.toLowerCase();
  if (CRAFT_IDIOMS.test(t)) return null;

  const weaponList = CRAFTABLE_WEAPONS[profKey] || [];
  const armorList  = CRAFTABLE_ARMOR[profKey]   || [];

  // The crafted object must be the direct object of the craft verb:
  // "forge a sharp sword", "carve a crude spear from the branch".
  // Take up to five words after the verb, stopping at prepositions.
  let phrase = null;
  for (const verb of CRAFTING_DETECT_KEYWORDS) {
    const m = t.match(new RegExp(`\\b${verb}(?:s|ed|ing)?\\s+(?:myself\\s+|me\\s+)?(?:a|an|the|some|my)?\\s*([a-z' -]+)`));
    if (!m) continue;
    // "work the hide into a cloak" -> the product is "a cloak"
    const raw = m[1].includes(' into ') ? m[1].split(' into ').pop().replace(/^(a|an|the)\s+/, '') : m[1];
    phrase = raw
      .split(/\s+(?:from|with|out|using|for|to|in|on|at|and|then|by|of)\b/)[0]
      .split(/\s+/).slice(0, 5).join(' ').trim();
    if (phrase) break;
  }
  if (!phrase) return null;

  const isProfWeapon = weaponList.some(w => phrase.includes(w));
  const isProfArmor  = armorList.some(a => phrase.includes(a));

  const isUniversalWeapon = !isProfWeapon && UNIVERSAL_WEAPONS.some(w => phrase.includes(w));
  const isUniversalArmor  = !isProfArmor  && UNIVERSAL_ARMOR.some(a => phrase.includes(a));

  const isWeapon = isProfWeapon || isUniversalWeapon;
  const isArmor  = isProfArmor  || isUniversalArmor;

  if (!isWeapon && !isArmor) return null;

  return {
    isArmor:    isArmor && !isWeapon,
    isPrimitive: !isProfWeapon && !isProfArmor,
    itemName:   phrase || (isArmor ? 'improvised armor' : 'improvised weapon')
  };
}

function buildCraftedGearItem(profKey, profLevel, input) {
  const intent = detectCraftingIntent(input, profKey);
  if (!intent) return null;

  let tier;
  if (intent.isPrimitive || !profKey) {
    tier = 0;
  } else {
    const tierMap = [0, 0, 1, 2, 3, 5];
    tier = tierMap[Math.min(profLevel, tierMap.length - 1)];
  }
  tier = Math.min(tier, GEAR_QUALITIES.length - 1);
  const quality = GEAR_QUALITIES[tier];

  const t    = input.toLowerCase();
  const mods = {};
  for (const [stat, keywords] of Object.entries(CRAFT_GOAL_KEYWORDS)) {
    if (keywords.some(k => t.includes(k))) {
      mods[stat] = (mods[stat] || 0) + 1;
    }
  }

  if (!intent.isPrimitive && profKey) {
    const affinity = PROFESSION_STAT_AFFINITY[profKey] || {};
    for (const [stat, weight] of Object.entries(affinity)) {
      if (!mods[stat]) mods[stat] = weight > 1 ? 1 : 0;
    }
  }

  const finalMods = {};
  let count = 0;
  for (const [stat, val] of Object.entries(mods).sort((a,b) => b[1]-a[1])) {
    if (count >= 3 || val <= 0) continue;
    finalMods[stat] = Math.min(3, val);
    count++;
  }

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

module.exports = {
  detectCraftingIntent,
  buildCraftedGearItem
};
