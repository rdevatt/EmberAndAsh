'use strict';

const STAT_MAP = {
  str: 'str', strength: 'str',
  dex: 'dex', dexterity: 'dex',
  vit: 'vit', vitality: 'vit',
  int: 'int', intelligence: 'int',
  wis: 'wis', wisdom: 'wis',
  cha: 'cha', charisma: 'cha'
};

function spendFreePoint(state, input, recalculateResources) {
  if ((state.freePoints || 0) <= 0) {
    return { success: false, message: 'No free stat points available.' };
  }

  const t = input.toLowerCase();
  const found = Object.keys(STAT_MAP).find(k => t.includes(k));

  if (!found) {
    return { success: false, message: 'Specify a stat: STR, DEX, VIT, INT, WIS, or CHA.' };
  }

  const statKey = STAT_MAP[found];
  state.stats[statKey]++;
  state.freePoints--;

  if (['vit', 'int', 'wis', 'dex'].includes(statKey)) {
    recalculateResources(state);
  }

  return {
    success: true,
    stat: statKey.toUpperCase(),
    newValue: state.stats[statKey],
    remaining: state.freePoints,
    message: `${statKey.toUpperCase()} is now ${state.stats[statKey]}. Free points remaining: ${state.freePoints}.`
  };
}

function getHPLabel(hp, maxHp) {
  const p = hp / maxHp;
  if (p >= 0.8) return 'Uninjured';
  if (p >= 0.5) return 'Wounded';
  if (p >= 0.25) return 'Seriously Wounded';
  if (p >= 0.10) return 'Critically Wounded';
  return 'Near Death';
}

function getStaminaLabel(stamina, maxStamina) {
  const p = stamina / maxStamina;
  if (p >= 0.7) return 'Fresh';
  if (p >= 0.4) return 'Winded';
  if (p >= 0.15) return 'Exhausted';
  return 'Spent';
}

function getReputationLabel(rep) {
  if (rep >= 80) return 'Celebrated';
  if (rep >= 50) return 'Well Respected';
  if (rep >= 20) return 'Known Favorably';
  if (rep >= 5) return 'Recognized';
  if (rep >= -5) return 'Unknown';
  if (rep >= -20) return 'Mistrusted';
  if (rep >= -50) return 'Disliked';
  if (rep >= -80) return 'Despised';
  return 'Wanted';
}

function buildCharacterPanelData(state, deps) {
  const {
    getPlayerLevel,
    getXPToNextLevel,
    BACKGROUNDS,
    REGIONS
  } = deps;

  const level = getPlayerLevel(state.totalXP || 0);
  const xpToNext = getXPToNextLevel(state.totalXP || 0);
  const bg = state.character ? BACKGROUNDS[state.character.background] : null;
  const region = state.character ? REGIONS[state.character.region] : null;
  const rep = (state.reputation && state.character)
    ? (state.reputation[state.character.region] || 0)
    : 0;

  return {
    name: state.character ? state.character.description : null,
    age: state.character ? state.character.age : null,
    gender: state.character ? state.character.gender : null,
    background: bg ? bg.label : null,
    region: region ? region.label : null,
    level,
    totalXP: state.totalXP || 0,
    xpToNext,
    stats: { ...state.stats },
    hp: state.hp,
    maxHp: state.maxHp,
    hpLabel: getHPLabel(state.hp, state.maxHp),
    mana: state.mana,
    maxMana: state.maxMana,
    stamina: state.stamina,
    maxStamina: state.maxStamina,
    staminaLabel: getStaminaLabel(state.stamina, state.maxStamina),
    combatClass: state.combatClass,
    classLevel: state.classLevel || 0,
    profession: state.profession,
    professionLevel: state.professionLevel || 0,
    freePoints: state.freePoints || 0,
    coin: state.coin || 0,
    inventory: [...(state.inventory || [])],
    weapon: state.gear ? state.gear.weapon : null,
    armor: state.gear ? state.gear.armor : null,
    reputation: rep,
    reputationLabel: getReputationLabel(rep),
    deathCount: state.deathCount || 0,
    companions: [...(state.companions || [])]
  };
}

module.exports = {
  spendFreePoint,
  getHPLabel,
  getStaminaLabel,
  getReputationLabel,
  buildCharacterPanelData
};
