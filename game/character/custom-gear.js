'use strict';

const CUSTOM_WEAPON_PATTERNS = [
  'sword', 'blade', 'dagger', 'knife', 'axe', 'hatchet', 'mace', 'hammer',
  'club', 'cudgel', 'spear', 'pike', 'staff', 'quarterstaff', 'bow', 'crossbow',
  'sling', 'whip', 'flail', 'morningstar', 'scythe', 'sickle', 'pitchfork',
  'machete', 'cleaver', 'rapier', 'cutlass', 'sabre', 'saber', 'lance',
  'halberd', 'glaive', 'trident', 'warhammer', 'battleaxe', 'shortsword',
  'longsword', 'greatsword', 'broadsword', 'falchion', 'stiletto', 'dirk',
  'kukri', 'tomahawk', 'pick', 'pickaxe', 'mattock'
];

const CUSTOM_ARMOR_PATTERNS = [
  'armor', 'armour', 'chainmail', 'chain mail', 'plate', 'breastplate',
  'cuirass', 'hauberk', 'brigandine', 'gambeson', 'leather armor',
  'studded leather', 'scale mail', 'ring mail', 'splint mail', 'half plate',
  'full plate', 'mail shirt', 'chain shirt',
  'leather tunic', 'leather vest', 'padded vest', 'padded armor',
  'hide armor', 'fur armor', 'quilted armor'
];

const CUSTOM_CLOTHING_PATTERNS = [
  'cloak', 'cape', 'robe', 'robes', 'tunic', 'shirt', 'vest', 'jerkin',
  'coat', 'jacket', 'hood', 'cowl', 'hat', 'cap', 'boots', 'shoes',
  'sandals', 'gloves', 'gauntlets', 'bracers', 'belt', 'sash',
  'trousers', 'pants', 'breeches', 'leggings', 'skirt', 'dress',
  'clothes', 'clothing', 'garb', 'attire', 'outfit'
];

const CUSTOM_CONTAINER_PATTERNS = [
  'backpack', 'pack', 'satchel', 'bag', 'pouch', 'sack', 'rucksack',
  'knapsack', 'haversack', 'purse', 'wallet', 'belt pouch'
];

const CUSTOM_SUPPLY_PATTERNS = [
  'waterskin', 'water skin', 'canteen', 'flask', 'bottle', 'jug',
  'rations', 'food', 'bread', 'jerky', 'dried meat', 'provisions',
  'rope', 'torch', 'torches', 'lantern', 'lamp', 'tinderbox', 'flint',
  'bedroll', 'blanket', 'tent', 'cooking pot', 'pan', 'kettle',
  'needle', 'thread', 'fishing line', 'hook', 'net', 'snare',
  'compass', 'map', 'spyglass', 'mirror', 'soap', 'comb',
  'bandages', 'herbs', 'medicine', 'healing salve', 'antidote',
  'lockpick', 'lockpicks', 'thieves tools', 'crowbar', 'grappling hook',
  'chalk', 'ink', 'quill', 'parchment', 'paper', 'book', 'journal',
  'coin purse', 'coins', 'gold', 'silver', 'copper'
];

const GEAR_QUALITY_MODIFIERS = {
  'rusty': 0, 'rusted': 0, 'broken': 0, 'crude': 0, 'rough': 0,
  'worn': 0, 'old': 0, 'battered': 0, 'tattered': 0, 'ragged': 0,
  'damaged': 0, 'dented': 0, 'chipped': 0, 'cracked': 0,
  'simple': 1, 'plain': 1, 'common': 1, 'basic': 1, 'ordinary': 1,
  'decent': 2, 'good': 2, 'sturdy': 2, 'solid': 2, 'reliable': 2,
  'fine': 3, 'quality': 3, 'well-made': 3, 'well made': 3,
  'excellent': 4, 'superior': 4, 'masterwork': 5, 'master-crafted': 5
};

function parseCustomStartingGear(input) {
  const t = input.toLowerCase();
  const result = {
    weapon: null,
    armor: null,
    inventory: []
  };
  let foundAny = false;

  function getQualityTier(itemMatch, fullText) {
    const idx = fullText.indexOf(itemMatch);
    const prefix = fullText.slice(Math.max(0, idx - 30), idx).toLowerCase();

    for (const [word, tier] of Object.entries(GEAR_QUALITY_MODIFIERS)) {
      if (prefix.includes(word)) {
        return tier;
      }
    }
    return 1;
  }

  function buildItemName(baseItem, fullText) {
    const idx = fullText.toLowerCase().indexOf(baseItem.toLowerCase());
    const prefix = fullText.slice(Math.max(0, idx - 20), idx).trim();

    const words = prefix.split(/\s+/).filter(w => w.length > 0);
    const adjectives = words.slice(-2).filter(w =>
      Object.keys(GEAR_QUALITY_MODIFIERS).includes(w.toLowerCase()) ||
      ['old', 'new', 'worn', 'tattered', 'rusty', 'wooden', 'iron', 'steel',
       'leather', 'cloth', 'simple', 'heavy', 'light', 'short', 'long'].includes(w.toLowerCase())
    );

    if (adjectives.length > 0) {
      return adjectives.join(' ') + ' ' + baseItem;
    }
    return baseItem;
  }

  for (const weapon of CUSTOM_WEAPON_PATTERNS) {
    if (t.includes(weapon)) {
      const tier = getQualityTier(weapon, t);
      const name = buildItemName(weapon, input);
      result.weapon = { name, tier };
      foundAny = true;
      break;
    }
  }

  for (const armor of CUSTOM_ARMOR_PATTERNS) {
    if (t.includes(armor)) {
      const tier = getQualityTier(armor, t);
      const name = buildItemName(armor, input);
      result.armor = { name, tier };
      foundAny = true;
      break;
    }
  }

  for (const clothing of CUSTOM_CLOTHING_PATTERNS) {
    if (t.includes(clothing)) {
      const name = buildItemName(clothing, input);
      if (!result.armor || !result.armor.name.toLowerCase().includes(clothing)) {
        result.inventory.push(name);
        foundAny = true;
      }
    }
  }

  for (const container of CUSTOM_CONTAINER_PATTERNS) {
    if (t.includes(container)) {
      const name = buildItemName(container, input);
      result.inventory.push(name);
      foundAny = true;
    }
  }

  for (const supply of CUSTOM_SUPPLY_PATTERNS) {
    if (t.includes(supply)) {
      const name = buildItemName(supply, input);
      result.inventory.push(name);
      foundAny = true;
    }
  }

  result.inventory = [...new Set(result.inventory)];
  return foundAny ? result : null;
}

module.exports = {
  parseCustomStartingGear
};
