'use strict';

// =============================================================
// EMBER AND ASH — ECONOMY
// Coin transactions, inventory management, gear handling,
// shop logic, reputation, companion management, and death gear recovery.
// No AI calls. No database calls. Pure game logic.
// =============================================================

const {
  GEAR_QUALITIES,
  REGIONS
} = require('../constants');

const {
  getPlayerLevel,
  getReputationLabel,
  buildGearItem,
  recalculateResources
} = require('../character');

const {
  addCompanion,
  removeCompanion,
  getCompanion,
  changeCompanionLoyalty,
  detectCompanionIntent,
  getCompanionsDisplay,
  getLoyaltyLabel
} = require('./companions');

const {
  formatStatMods,
  createCraftedGearHandlers
} = require('./crafted-gear');


// =============================================
// COIN SYSTEM
// Internal unit is copper.
// 100 copper = 1 silver. 10,000 copper = 1 gold.
// =============================================
const COPPER_PER_SILVER = 100;
const SILVER_PER_GOLD   = 100;
const COPPER_PER_GOLD   = COPPER_PER_SILVER * SILVER_PER_GOLD;

function addCoin(state, copper) {
  state.coin = (state.coin || 0) + Math.floor(copper);
}

function spendCoin(state, copper) {
  const current = state.coin || 0;
  if (current < copper) return false;
  state.coin = current - Math.floor(copper);
  return true;
}

function formatCoin(copper) {
  const c  = Math.max(0, Math.floor(copper || 0));
  const g  = Math.floor(c / COPPER_PER_GOLD);
  const s  = Math.floor((c % COPPER_PER_GOLD) / COPPER_PER_SILVER);
  const cu = c % COPPER_PER_SILVER;
  const parts = [];
  if (g  > 0) parts.push(`${g} gold`);
  if (s  > 0) parts.push(`${s} silver`);
  if (cu > 0 || parts.length === 0) parts.push(`${cu} copper`);
  return parts.join(', ');
}

const {
  getCraftedGearInventory,
  equipCraftedItem,
  sellCraftedItem
} = createCraftedGearHandlers({ addCoin, formatCoin, recalculateResources, addItem });

function parseCoinFromText(text) {
  const t = text.toLowerCase();
  let total = 0;
  const goldMatch   = t.match(/(\d+)\s*gold/);
  const silverMatch = t.match(/(\d+)\s*silver/);
  const copperMatch = t.match(/(\d+)\s*copper/);
  if (goldMatch)   total += parseInt(goldMatch[1])   * COPPER_PER_GOLD;
  if (silverMatch) total += parseInt(silverMatch[1]) * COPPER_PER_SILVER;
  if (copperMatch) total += parseInt(copperMatch[1]);
  return total;
}

// Detects whether input implies earning or spending coin
function detectCoinIntent(text) {
  const t = text.toLowerCase();
  const earning  = ['receive', 'earn', 'paid', 'collect', 'find', 'reward', 'sell', 'sold', 'given'].some(w => t.includes(w));
  const spending = ['pay', 'spend', 'buy', 'purchase', 'cost', 'owe', 'buying'].some(w => t.includes(w));
  const amount   = parseCoinFromText(t);

  if (amount === 0) return null;

  return {
    amount,
    intent: earning ? 'earn' : spending ? 'spend' : null
  };
}


// =============================================
// INVENTORY MANAGEMENT
// =============================================
function addItem(state, item) {
  if (!state.inventory) state.inventory = [];
  // Store as object with name and metadata if possible
  if (typeof item === 'string') {
    state.inventory.push(item);
  } else {
    state.inventory.push(item);
  }
}

function removeItem(state, itemName) {
  if (!state.inventory) return false;
  const idx = state.inventory.findIndex(i => {
    const name = typeof i === 'string' ? i : i.name;
    return name.toLowerCase().includes(itemName.toLowerCase());
  });
  if (idx === -1) return false;
  state.inventory.splice(idx, 1);
  return true;
}

function hasItem(state, itemName) {
  if (!state.inventory) return false;
  return state.inventory.some(i => {
    const name = typeof i === 'string' ? i : i.name;
    return name.toLowerCase().includes(itemName.toLowerCase());
  });
}

function getInventoryDisplay(state) {
  if (!state.inventory || state.inventory.length === 0) return 'Nothing.';
  return state.inventory.map(i => typeof i === 'string' ? i : i.name).join(', ');
}

// Find an item in inventory by partial name match
function findInventoryItem(state, nameFragment) {
  if (!state.inventory || state.inventory.length === 0) return null;
  const frag = nameFragment.toLowerCase();
  return state.inventory.find(i => {
    const name = typeof i === 'string' ? i : i.name;
    return name.toLowerCase().includes(frag);
  });
}

function getItemName(item) {
  return typeof item === 'string' ? item : item.name;
}


// =============================================
// GEAR MANAGEMENT
// =============================================
function equipWeapon(state, weaponSrc) {
  const item = buildGearItem(weaponSrc, false);
  if (!item) return { success: false, message: 'Invalid weapon.' };

  const previous = state.gear && state.gear.weapon ? state.gear.weapon : null;
  if (previous) {
    addItem(state, previous);
  }

  state.gear.weapon = item;
  const stowText = previous ? ` Previous weapon stowed in backpack: ${previous.name}.` : '';
  return { success: true, item, message: `Equipped: ${item.name} (${item.quality}).${stowText}` };
}

function equipArmor(state, armorSrc) {
  const item = buildGearItem(armorSrc, true);
  if (!item) return { success: false, message: 'Invalid armor.' };

  const previous = state.gear && state.gear.armor ? state.gear.armor : null;
  if (previous) {
    addItem(state, previous);
  }

  state.gear.armor = item;
  const stowText = previous ? ` Previous armor stowed in backpack: ${previous.name}.` : '';
  return { success: true, item, message: `Equipped: ${item.name} (${item.quality}).${stowText}` };
}

function unequipWeapon(state) {
  if (!state.gear.weapon) {
    return { success: false, message: 'No weapon equipped.' };
  }
  const item = state.gear.weapon;
  state.gear.weapon = null;
  // Add to inventory
  addItem(state, item);
  return { success: true, item, message: `Unequipped: ${item.name}` };
}

function unequipArmor(state) {
  if (!state.gear.armor) {
    return { success: false, message: 'No armor equipped.' };
  }
  const item = state.gear.armor;
  state.gear.armor = null;
  // Add to inventory
  addItem(state, item);
  return { success: true, item, message: `Unequipped: ${item.name}` };
}


// =============================================
// EQUIPMENT DETECTION & PROCESSING
// Detects player intent to equip/unequip items
// =============================================
const EQUIP_KEYWORDS = [
  'equip', 'put on', 'wear', 'wield', 'arm myself', 'draw', 'ready',
  'don', 'strap on', 'take up', 'grab my', 'pick up my', 'use my',
  'replace', 'swap', 'switch to'
];

const UNEQUIP_KEYWORDS = [
  'unequip', 'remove', 'take off', 'drop', 'put away', 'sheathe',
  'stow', 'discard', 'set aside', 'put down'
];

const WEAPON_KEYWORDS = [
  'sword', 'blade', 'dagger', 'knife', 'axe', 'mace', 'hammer', 'club',
  'spear', 'staff', 'bow', 'crossbow', 'weapon', 'pitchfork', 'scythe',
  'hatchet', 'cutlass', 'rapier', 'longsword', 'shortsword', 'greatsword',
  'warhammer', 'battleaxe', 'flail', 'morning star', 'pike', 'halberd',
  'sickle', 'hook', 'mallet', 'cudgel', 'quarterstaff'
];

const ARMOR_KEYWORDS = [
  'armor', 'armour', 'leather', 'chainmail', 'plate', 'tunic', 'vest',
  'helmet', 'helm', 'shield', 'gauntlets', 'boots', 'greaves', 'cuirass',
  'breastplate', 'mail', 'padded', 'brigandine', 'gambeson', 'hauberk',
  'pauldrons', 'vambraces', 'chestplate', 'body armor'
];

function hashString(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function getTierForLevel(playerLevel) {
  const lvl = Math.max(1, Math.floor(playerLevel || 1));
  let bestTier = 0;
  for (const quality of GEAR_QUALITIES) {
    if (lvl >= quality.levelReq) bestTier = quality.tier;
  }
  return bestTier;
}

function buildProceduralStatMods(itemName, slot, tier, playerLevel) {
  const lvl = Math.max(1, Math.floor(playerLevel || 1));
  if (lvl < 8) return null;

  let points = 1;
  if (lvl >= 20) points++;
  if (lvl >= 35) points++;
  if (lvl >= 55) points++;
  if (lvl >= 75) points++;
  if (lvl >= 90) points++;
  points += Math.floor(Math.max(0, tier || 0) / 3);
  points = Math.min(points, 8);

  const pool = slot === 'armor'
    ? ['vit', 'str', 'dex', 'wis']
    : ['str', 'dex', 'vit', 'int'];

  const rng = createRng(hashString(`${itemName}|${slot}|${tier}|${Math.floor(lvl / 5)}`));
  const first = pool[Math.floor(rng() * pool.length)];
  let second = pool[Math.floor(rng() * pool.length)];
  if (second === first) {
    const idx = (pool.indexOf(first) + 1) % pool.length;
    second = pool[idx];
  }

  const primary = Math.max(1, Math.ceil(points * 0.65));
  const secondary = Math.max(0, points - primary);

  const mods = { [first]: primary };
  if (secondary > 0) mods[second] = secondary;
  return mods;
}

function classifyEquipSlot(name, explicitType = null) {
  const lowered = (name || '').toLowerCase();

  if (explicitType === 'armor') return 'armor';
  if (explicitType === 'weapon') return 'weapon';

  const isArmor = ARMOR_KEYWORDS.some(kw => lowered.includes(kw));
  if (isArmor) return 'armor';

  return 'weapon';
}

function buildBackpackSummary(state) {
  const inventory = Array.isArray(state.inventory) ? state.inventory : [];
  const crafted = Array.isArray(state.craftedGear) ? state.craftedGear : [];

  const carried = inventory.map(getItemName);
  const weaponCandidates = [];
  const armorCandidates = [];

  for (const item of inventory) {
    const name = getItemName(item);
    const slot = classifyEquipSlot(name, null);
    if (slot === 'armor') armorCandidates.push(name);
    else weaponCandidates.push(name);
  }

  for (const item of crafted) {
    if (!item || !item.name) continue;
    const explicitType = (item.armorLevel > 0 && item.weaponBonus === 0) ? 'armor' : 'weapon';
    const slot = classifyEquipSlot(item.name, explicitType);
    const label = `${item.name} (crafted)`;
    if (slot === 'armor') armorCandidates.push(label);
    else weaponCandidates.push(label);
  }

  const equippedWeapon = state.gear && state.gear.weapon ? state.gear.weapon.name : 'None';
  const equippedArmor = state.gear && state.gear.armor ? state.gear.armor.name : 'Unarmored';

  return [
    'BACKPACK',
    `Carrying: ${carried.length ? carried.join(', ') : 'Nothing.'}`,
    `Equipped weapon: ${equippedWeapon}`,
    `Equipped armor: ${equippedArmor}`,
    `Equippable as weapon: ${weaponCandidates.length ? weaponCandidates.join(', ') : 'None.'}`,
    `Equippable as armor: ${armorCandidates.length ? armorCandidates.join(', ') : 'None.'}`
  ].join('\n');
}

/**
 * Detects if the player wants to equip or unequip something.
 * Returns { intent: 'equip'|'unequip'|null, itemType: 'weapon'|'armor'|'unknown', itemName: string|null }
 */
function detectEquipIntent(text) {
  const t = text.toLowerCase();

  const replaceMatch = t.match(/(?:replace|swap)\s+.+?\s+(?:with|for)\s+(.+)/i);
  if (replaceMatch && replaceMatch[1]) {
    const candidate = replaceMatch[1].replace(/^(the|my|a|an)\s+/i, '').trim();
    if (candidate.length > 0) {
      const isWeapon = WEAPON_KEYWORDS.some(kw => candidate.includes(kw));
      const isArmor = ARMOR_KEYWORDS.some(kw => candidate.includes(kw));
      return {
        intent: 'equip',
        itemType: isWeapon ? 'weapon' : isArmor ? 'armor' : 'unknown',
        itemName: candidate
      };
    }
  }
  
  // Check for equip intent
  const isEquip = EQUIP_KEYWORDS.some(kw => t.includes(kw));
  const isUnequip = UNEQUIP_KEYWORDS.some(kw => t.includes(kw));
  
  if (!isEquip && !isUnequip) return null;
  
  // Determine item type
  const isWeapon = WEAPON_KEYWORDS.some(kw => t.includes(kw));
  const isArmor = ARMOR_KEYWORDS.some(kw => t.includes(kw));
  
  // Extract item name - look for patterns like "equip [the] X" or "put on [the] X"
  let itemName = null;
  
  // Try to extract the specific item being referenced
  for (const kw of [...EQUIP_KEYWORDS, ...UNEQUIP_KEYWORDS]) {
    if (t.includes(kw)) {
      const idx = t.indexOf(kw);
      const afterKeyword = t.slice(idx + kw.length).trim();
      // Remove leading "the", "my", "a", "an"
      const cleaned = afterKeyword.replace(/^(the|my|a|an)\s+/i, '').trim();
      if (cleaned.length > 0) {
        // Take the first meaningful phrase (up to end or next verb)
        const match = cleaned.match(/^([a-z\s\-']+?)(?:\s*(?:and|then|,|$))/i);
        if (match) {
          itemName = match[1].trim();
        } else {
          itemName = cleaned.split(/\s+/).slice(0, 4).join(' '); // Take first 4 words max
        }
        break;
      }
    }
  }
  
  return {
    intent: isUnequip ? 'unequip' : 'equip',
    itemType: isWeapon ? 'weapon' : isArmor ? 'armor' : 'unknown',
    itemName
  };
}

/**
 * Process an equipment command.
 * Checks inventory, crafted gear, and handles the equip/unequip.
 */
function processEquipCommand(state, equipIntent) {
  if (!equipIntent) return null;
  
  const { intent, itemType, itemName } = equipIntent;
  
  // Handle unequip
  if (intent === 'unequip') {
    if (itemType === 'weapon' || (itemType === 'unknown' && itemName)) {
      // Check if the item name matches current weapon
      const weapon = state.gear && state.gear.weapon;
      if (weapon && (!itemName || weapon.name.toLowerCase().includes(itemName.toLowerCase()))) {
        return unequipWeapon(state);
      }
    }
    if (itemType === 'armor' || (itemType === 'unknown' && itemName)) {
      const armor = state.gear && state.gear.armor;
      if (armor && (!itemName || armor.name.toLowerCase().includes(itemName.toLowerCase()))) {
        return unequipArmor(state);
      }
    }
    return { success: false, message: 'Nothing matching that description to unequip.' };
  }
  
  // Handle equip
  if (intent === 'equip') {
    // First check crafted gear inventory
    if (state.craftedGear && state.craftedGear.length > 0 && itemName) {
      const result = equipCraftedItem(state, itemName);
      if (result.success) return result;
    }
    
    // Check regular inventory for equippable items
    if (itemName && state.inventory && state.inventory.length > 0) {
      const invItem = findInventoryItem(state, itemName);
      if (invItem) {
        const invItemName = typeof invItem === 'string' ? invItem : invItem.name;
        const loweredItemName = invItemName.toLowerCase();
        
        // Determine if it's a weapon or armor based on name
        const isWeaponItem = WEAPON_KEYWORDS.some(kw => loweredItemName.includes(kw));
        const isArmorItem = ARMOR_KEYWORDS.some(kw => loweredItemName.includes(kw));
        
        const playerLevel = getPlayerLevel(state.totalXP || 0);
        // Determine quality tier (defaults to level-scaled tier for plain inventory strings)
        const baseTier = (typeof invItem === 'object' && invItem.tier !== undefined)
          ? invItem.tier
          : getTierForLevel(playerLevel);
        const targetSlot = (itemType === 'armor' || (itemType !== 'weapon' && isArmorItem)) ? 'armor' : 'weapon';
        const source = {
          name: invItemName,
          tier: baseTier,
          statMods: (typeof invItem === 'object' && invItem.statMods) ? invItem.statMods : null,
          isCrafted: !!(typeof invItem === 'object' && invItem.isCrafted),
          sellBonus: (typeof invItem === 'object' && invItem.sellBonus) ? invItem.sellBonus : 0,
          craftedBy: (typeof invItem === 'object' && invItem.craftedBy) ? invItem.craftedBy : null
        };

        if (!source.statMods) {
          source.statMods = buildProceduralStatMods(invItemName, targetSlot, source.tier, playerLevel);
        }

        if (!isWeaponItem && !isArmorItem && targetSlot === 'weapon') {
          source.tier = 0;
          source.weaponBonus = 0;
        }

        if (!isArmorItem && targetSlot === 'armor') {
          source.tier = 0;
          source.armorLevel = 0;
        }

        removeItem(state, invItemName);

        const result = targetSlot === 'armor'
          ? equipArmor(state, source)
          : equipWeapon(state, source);

        if (result.success) {
          return {
            success: true,
            item: result.item,
            slot: targetSlot,
            message: `Equipped from backpack: ${result.item.name} (${result.item.quality}).`
          };
        }
      }
    }
    
    // If we have a specific item name but couldn't find it
    if (itemName) {
      return { 
        success: false, 
        notFound: true,
        itemName,
        itemType,
        message: `Could not find "${itemName}" in your inventory or gear.`,
        hint: `[EQUIP FAILED — player tried to equip "${itemName}" but it's not in their inventory. The AI described gear they don't actually have. Narrate this naturally — perhaps they're searching for something they don't have, or clarify what gear they actually possess.]`
      };
    }
    
    return { success: false, message: 'Specify what you want to equip.' };
  }
  
  return null;
}


 function getWeaponDisplay(state) {
  const w = state.gear && state.gear.weapon;
  if (!w) return { equipped: false, label: 'None' };

  const playerLevel = getPlayerLevel(state.totalXP || 0);
  const canUse      = playerLevel >= w.levelReq;

  return {
    equipped:    true,
    name:        w.name,
    quality:     w.quality,
    tier:        w.tier,
    levelReq:    w.levelReq,
    weaponBonus: w.weaponBonus,
    statMods:    w.statMods  || null,
    isCrafted:   w.isCrafted || false,
    canUse,
    label:       `${w.name} (${w.quality})${canUse ? '' : ' [Level ' + w.levelReq + ' required]'}`,
    modDisplay:  formatStatMods(w.statMods)
  };
}

function getArmorDisplay(state) {
  const a = state.gear && state.gear.armor;
  if (!a) return { equipped: false, label: 'Unarmored' };

  const playerLevel = getPlayerLevel(state.totalXP || 0);
  const canUse      = playerLevel >= a.levelReq;

  return {
    equipped:    true,
    name:        a.name,
    quality:     a.quality,
    tier:        a.tier,
    levelReq:    a.levelReq,
    armorLevel:  a.armorLevel,
    statMods:    a.statMods  || null,
    isCrafted:   a.isCrafted || false,
    canUse,
    label:       `${a.name} (${a.quality})${canUse ? '' : ' [Level ' + a.levelReq + ' required]'}`,
    modDisplay:  formatStatMods(a.statMods)
  };
}

// Returns all gear tiers available to a given player level
function getAvailableGearTiers(playerLevel) {
  return GEAR_QUALITIES.filter(q => q.levelReq <= playerLevel);
}


// =============================================
// DEATH GEAR HANDLING
// =============================================
function saveGearAtDeath(state) {
  const hasGear = state.gear && (state.gear.weapon || state.gear.armor);
  if (!hasGear) return false;

  state.savedGear     = {
    weapon: state.gear.weapon,
    armor:  state.gear.armor
  };
  state.deathLocation = state.character ? state.character.region : null;
  state.gear          = { weapon: null, armor: null };

  return true;
}

function recoverGear(state) {
  if (!state.savedGear || !state.deathLocation) {
    return {
      success: false,
      message: 'No gear to recover — nothing has been left behind, or it was already retrieved.'
    };
  }

  state.gear          = { weapon: state.savedGear.weapon, armor: state.savedGear.armor };
  state.savedGear     = null;
  state.deathLocation = null;

  const wName = state.gear.weapon ? `${state.gear.weapon.name} (${state.gear.weapon.quality})` : 'none';
  const aName = state.gear.armor  ? `${state.gear.armor.name} (${state.gear.armor.quality})`   : 'none';

  return {
    success: true,
    weapon:  state.gear.weapon,
    armor:   state.gear.armor,
    message: `Gear recovered — weapon: ${wName} | armor: ${aName}.`
  };
}

function hasGearAtDeathSite(state) {
  return !!(state.savedGear && state.deathLocation);
}


// =============================================
// REPUTATION
// =============================================
function getReputation(state, regionKey) {
  if (!state.reputation) state.reputation = {};
  return state.reputation[regionKey] || 0;
}

function changeReputation(state, regionKey, amount) {
  if (!state.reputation) state.reputation = {};
  const current = state.reputation[regionKey] || 0;
  state.reputation[regionKey] = Math.max(-100, Math.min(100, current + amount));
}

function getCurrentReputation(state) {
  if (!state.character || !state.character.region) return 0;
  return getReputation(state, state.character.region);
}


// =============================================
// SHOP SYSTEM
// =============================================
const SHOP_OPEN_COST    = 10;   // copper to open a stall
const SHOP_CUSTOMER_CHANCE = 0.30;

const SHOP_CUSTOMERS = [
  'a tired traveler looking to buy basic supplies',
  'a local farmer who needs a tool repaired or replaced',
  'a merchant inspecting your wares with a critical eye',
  'a young person sent by their family to pick up an order',
  'a hooded figure who buys quietly and asks no questions',
  'an impatient guard wanting something quickly',
  'a wealthy-looking individual who haggles despite obvious means',
  'a drunk who thinks he paid more than he did',
  'an old woman who knows exactly what things should cost',
  'a child with a handful of coins and a very specific request',
  'a soldier on leave looking for something to bring home',
  'a herbalist seeking rare ingredients or tools',
  'a scribe hunting for specific writing supplies',
  'two friends arguing over what to buy'
];

function tryOpenShop(state) {
  if (state.shopOpen) {
    return { success: false, message: 'Your shop is already open.' };
  }

  if ((state.coin || 0) < SHOP_OPEN_COST) {
    return {
      success: false,
      message: `You need at least ${formatCoin(SHOP_OPEN_COST)} to open a shop stall.`
    };
  }

  spendCoin(state, SHOP_OPEN_COST);
  state.shopOpen = true;

  // Opening a shop counts as merchant profession progress
  state.actionProgress['prof_merchant'] = (state.actionProgress['prof_merchant'] || 0) + 3;

  return {
    success: true,
    message: `Shop opened. ${formatCoin(SHOP_OPEN_COST)} spent on stall fees.`
  };
}

function tryCloseShop(state) {
  if (!state.shopOpen) {
    return { success: false, message: 'You have no shop open.' };
  }
  state.shopOpen = false;
  return { success: true, message: 'Shop closed.' };
}

function checkShopCustomerEvent(state) {
  if (!state.shopOpen || state.inCombat) return null;
  if (Math.random() >= SHOP_CUSTOMER_CHANCE) return null;

  const customer = SHOP_CUSTOMERS[Math.floor(Math.random() * SHOP_CUSTOMERS.length)];

  // Customer visit counts as merchant affinity progress
  state.actionProgress['prof_merchant'] = (state.actionProgress['prof_merchant'] || 0) + 1;

  return {
    customer,
    hint: `[SHOP EVENT — ${customer} arrives at the stall. Play this interaction naturally. This is a merchant interaction — let the player negotiate, serve, or deal with them as they see fit.]`
  };
}


// =============================================
// INTIMACY SYSTEM
// Checks whether an intimate scene is narratively available.
// Returns { available, reason, nsfwFull }
// =============================================
function checkIntimacyAvailable(state, npcKey) {
  // Player must have opted in
  if (!state.nsfwEnabled) {
    return {
      available: false,
      reason:    'nsfw_disabled',
      fadeToBlack: true   // Scene can still happen, just fades to black
    };
  }

  // Must have sufficient charisma
  if ((state.stats && state.stats.cha || 0) < 6) {
    return {
      available: false,
      reason:    'low_charisma',
      hint:      '[The advance falls flat. Low charisma — the NPC is politely uninterested. Narrate the gentle rebuff naturally.]'
    };
  }

  // Must have built rapport with this NPC
  const rapport = state.npcRelationships && npcKey
    ? (state.npcRelationships[npcKey] ? state.npcRelationships[npcKey].rapport || 0 : 0)
    : 0;

  if (rapport < 20) {
    return {
      available: false,
      reason:    'low_rapport',
      hint:      '[Not enough rapport built with this person. The advance is too soon — they are warm but not interested yet. Narrate the deflection naturally without embarrassing the player.]'
    };
  }

  // Available — full scene if nsfw enabled, fade to black otherwise
  return {
    available:   true,
    reason:      'available',
    nsfwFull:    state.nsfwEnabled,
    rapport,
    hint: state.nsfwEnabled
      ? '[INTIMATE SCENE — earned through rapport and charisma. Write naturally. This is one beat in a larger story — not the whole story. When the scene reaches a natural conclusion, return to normal narrative. Do not escalate indefinitely. Follow the player\'s lead.]'
      : '[INTIMATE SCENE — fade to black. Imply warmth and connection without explicit content. Return to normal narrative after.]'
  };
}


// =============================================
// COIN TRANSACTION PROCESSOR
// Called from event processor after each action.
// Consumes pending coin changes and applies them.
// =============================================
function processPendingCoinEvents(state) {
  const events = [];

  if (state.pendingCoinGain && state.pendingCoinGain > 0) {
    addCoin(state, state.pendingCoinGain);
    events.push({
      type:    'coinGain',
      amount:  state.pendingCoinGain,
      display: formatCoin(state.pendingCoinGain),
      total:   formatCoin(state.coin)
    });
    state.pendingCoinGain = 0;
  }

  if (state.pendingCoinSpend && state.pendingCoinSpend > 0) {
    const success = spendCoin(state, state.pendingCoinSpend);
    events.push({
      type:    'coinSpend',
      amount:  state.pendingCoinSpend,
      display: formatCoin(state.pendingCoinSpend),
      success,
      total:   formatCoin(state.coin),
      hint:    success
        ? null
        : '[INSUFFICIENT FUNDS — the player cannot afford this. The transaction fails. Narrate accordingly — embarrassment, negotiation, or just walking away.]'
    });
    state.pendingCoinSpend = 0;
  }

  return events;
}


// =============================================
// UI DATA BUILDER
// Returns clean economy data for left panel display.
// =============================================
function buildEconomyPanelData(state) {
  const rep      = getCurrentReputation(state);
  const region   = state.character ? REGIONS[state.character.region] : null;

  return {
    // Coin
    coin:         state.coin || 0,
    coinDisplay:  formatCoin(state.coin || 0),

    // Gear
    weapon:       getWeaponDisplay(state),
    armor:        getArmorDisplay(state),

    // Inventory
    inventory:    [...(state.inventory || [])],
    inventoryDisplay: getInventoryDisplay(state),

    // Crafted gear (equippable from inventory)
    craftedGear: (state.craftedGear || []).map(g => ({
      id:          g.id,
      name:        g.name,
      quality:     g.quality,
      weaponBonus: g.weaponBonus,
      armorLevel:  g.armorLevel,
      statMods:    g.statMods,
      sellBonus:   g.sellBonus,
      modDisplay:  formatStatMods(g.statMods),
      isArmor:     g.armorLevel > 0 && g.weaponBonus === 0
    })),

    // Shop
    shopOpen:     state.shopOpen || false,

    // Death gear
    hasDeadGear:      hasGearAtDeathSite(state),
    deathLocation:    state.deathLocation,
    deathLocationLabel: state.deathLocation && REGIONS[state.deathLocation]
      ? REGIONS[state.deathLocation].label
      : null,

    // Reputation
    reputation:      rep,
    reputationLabel: getReputationLabel(rep),
    region:          region ? region.label : null,

    // Companions
    companions: getCompanionsDisplay(state)
  };
}


module.exports = {
  // Coin
  addCoin,
  spendCoin,
  formatCoin,
  parseCoinFromText,
  detectCoinIntent,

  // Inventory
  addItem,
  removeItem,
  hasItem,
  getInventoryDisplay,
  findInventoryItem,
  buildBackpackSummary,

  // Gear
  equipWeapon,
  equipArmor,
  unequipWeapon,
  unequipArmor,
  equipCraftedItem,
  sellCraftedItem,
  getCraftedGearInventory,
  formatStatMods,
  getWeaponDisplay,
  getArmorDisplay,
  getAvailableGearTiers,

  // Equipment detection
  detectEquipIntent,
  processEquipCommand,

  // Companions
  addCompanion,
  removeCompanion,
  getCompanion,
  changeCompanionLoyalty,
  detectCompanionIntent,
  getCompanionsDisplay,
  getLoyaltyLabel,

  // Death gear
  saveGearAtDeath,
  recoverGear,
  hasGearAtDeathSite,

  // Reputation
  getReputation,
  getReputationLabel,
  changeReputation,
  getCurrentReputation,

  // Shop
  tryOpenShop,
  tryCloseShop,
  checkShopCustomerEvent,

  // Intimacy
  checkIntimacyAvailable,

  // Event processing
  processPendingCoinEvents,

  // UI
  buildEconomyPanelData
};