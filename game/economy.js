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
} = require('./constants');

const {
  getPlayerLevel,
  getReputationLabel,
  buildGearItem,
  recalculateResources
} = require('./character');


// =============================================
// COIN SYSTEM
// Internal unit is copper.
// 10 copper = 1 silver. 100 copper = 1 gold.
// =============================================
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
  const g  = Math.floor(c / 100);
  const s  = Math.floor((c % 100) / 10);
  const cu = c % 10;
  const parts = [];
  if (g  > 0) parts.push(`${g} gold`);
  if (s  > 0) parts.push(`${s} silver`);
  if (cu > 0 || parts.length === 0) parts.push(`${cu} copper`);
  return parts.join(', ');
}

function parseCoinFromText(text) {
  const t = text.toLowerCase();
  let total = 0;
  const goldMatch   = t.match(/(\d+)\s*gold/);
  const silverMatch = t.match(/(\d+)\s*silver/);
  const copperMatch = t.match(/(\d+)\s*copper/);
  if (goldMatch)   total += parseInt(goldMatch[1])   * 100;
  if (silverMatch) total += parseInt(silverMatch[1]) * 10;
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


// =============================================
// GEAR MANAGEMENT
// =============================================
function equipWeapon(state, weaponSrc) {
  const item = buildGearItem(weaponSrc, false);
  if (!item) return { success: false, message: 'Invalid weapon.' };
  state.gear.weapon = item;
  return { success: true, item, message: `Equipped: ${item.name} (${item.quality})` };
}

function equipArmor(state, armorSrc) {
  const item = buildGearItem(armorSrc, true);
  if (!item) return { success: false, message: 'Invalid armor.' };
  state.gear.armor = item;
  return { success: true, item, message: `Equipped: ${item.name} (${item.quality})` };
}

function unequipWeapon(state) {
  if (!state.gear.weapon) {
    return { success: false, message: 'No weapon equipped.' };
  }
  const item = state.gear.weapon;
  state.gear.weapon = null;
  // Add to inventory
  addItem(state, item.name);
  return { success: true, item, message: `Unequipped: ${item.name}` };
}

function unequipArmor(state) {
  if (!state.gear.armor) {
    return { success: false, message: 'No armor equipped.' };
  }
  const item = state.gear.armor;
  state.gear.armor = null;
  // Add to inventory
  addItem(state, item.name);
  return { success: true, item, message: `Unequipped: ${item.name}` };
}


// =============================================
// EQUIPMENT DETECTION & PROCESSING
// Detects player intent to equip/unequip items
// =============================================
const EQUIP_KEYWORDS = [
  'equip', 'put on', 'wear', 'wield', 'arm myself', 'draw', 'ready',
  'don', 'strap on', 'take up', 'grab my', 'pick up my', 'use my'
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

/**
 * Detects if the player wants to equip or unequip something.
 * Returns { intent: 'equip'|'unequip'|null, itemType: 'weapon'|'armor'|'unknown', itemName: string|null }
 */
function detectEquipIntent(text) {
  const t = text.toLowerCase();
  
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
        
        // Determine if it's a weapon or armor based on name
        const isWeaponItem = WEAPON_KEYWORDS.some(kw => invItemName.toLowerCase().includes(kw));
        const isArmorItem = ARMOR_KEYWORDS.some(kw => invItemName.toLowerCase().includes(kw));
        
        // Determine quality tier (default to Common/tier 1 for inventory items)
        const tier = (typeof invItem === 'object' && invItem.tier !== undefined) ? invItem.tier : 1;
        
        if (isWeaponItem || itemType === 'weapon') {
          // Remove from inventory and equip
          removeItem(state, invItemName);
          const result = equipWeapon(state, { name: invItemName, tier });
          if (result.success) {
            return {
              success: true,
              item: result.item,
              slot: 'weapon',
              message: `Equipped from inventory: ${result.item.name} (${result.item.quality})`
            };
          }
        } else if (isArmorItem || itemType === 'armor') {
          removeItem(state, invItemName);
          const result = equipArmor(state, { name: invItemName, tier });
          if (result.success) {
            return {
              success: true,
              item: result.item,
              slot: 'armor',
              message: `Equipped from inventory: ${result.item.name} (${result.item.quality})`
            };
          }
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


// =============================================
// COMPANION SYSTEM
// Manages NPCs who travel with the player
// =============================================

/**
 * Add a companion to the player's party
 */
function addCompanion(state, companionData) {
  if (!state.companions) state.companions = [];
  
  // Check if already have this companion
  const existing = state.companions.find(c => 
    c.name.toLowerCase() === companionData.name.toLowerCase()
  );
  if (existing) {
    return { success: false, message: `${companionData.name} is already traveling with you.` };
  }
  
  // Max 3 companions
  if (state.companions.length >= 3) {
    return { 
      success: false, 
      message: 'You cannot travel with more than 3 companions.',
      hint: '[COMPANION LIMIT — player already has 3 companions. Someone would need to leave before a new companion can join.]'
    };
  }
  
  const companion = {
    id: `companion_${Date.now()}`,
    name: companionData.name,
    description: companionData.description || '',
    role: companionData.role || 'ally',      // ally, guide, hireling, etc.
    loyalty: companionData.loyalty || 50,    // 0-100
    joinedAt: Date.now(),
    metInRegion: state.character ? state.character.region : null
  };
  
  state.companions.push(companion);
  
  return { 
    success: true, 
    companion,
    message: `${companion.name} has joined your party.`
  };
}

/**
 * Remove a companion from the player's party
 */
function removeCompanion(state, nameOrId) {
  if (!state.companions || state.companions.length === 0) {
    return { success: false, message: 'You have no companions to dismiss.' };
  }
  
  const idx = state.companions.findIndex(c => 
    c.name.toLowerCase().includes(nameOrId.toLowerCase()) ||
    c.id === nameOrId
  );
  
  if (idx === -1) {
    return { success: false, message: `No companion matching "${nameOrId}" found.` };
  }
  
  const removed = state.companions.splice(idx, 1)[0];
  return { 
    success: true, 
    companion: removed,
    message: `${removed.name} has left your party.`
  };
}

/**
 * Get companion by name
 */
function getCompanion(state, name) {
  if (!state.companions) return null;
  return state.companions.find(c => 
    c.name.toLowerCase().includes(name.toLowerCase())
  );
}

/**
 * Update companion loyalty
 */
function changeCompanionLoyalty(state, nameOrId, amount) {
  const companion = state.companions && state.companions.find(c =>
    c.name.toLowerCase().includes(nameOrId.toLowerCase()) || c.id === nameOrId
  );
  
  if (!companion) return { success: false, message: 'Companion not found.' };
  
  companion.loyalty = Math.max(0, Math.min(100, (companion.loyalty || 50) + amount));
  
  // Very low loyalty might cause departure
  if (companion.loyalty <= 0) {
    removeCompanion(state, companion.id);
    return { 
      success: true, 
      departed: true,
      companion,
      message: `${companion.name} has abandoned you due to lack of trust.`
    };
  }
  
  return { success: true, companion, newLoyalty: companion.loyalty };
}

/**
 * Detect companion-related intent from player input
 */
const COMPANION_JOIN_KEYWORDS = [
  'join me', 'travel with', 'come with', 'follow me', 'accompany',
  'party up', 'team up', 'hire', 'recruit', 'bring along'
];

const COMPANION_LEAVE_KEYWORDS = [
  'leave', 'dismiss', 'part ways', 'let go', 'send away', 'fire',
  'goodbye', 'farewell', 'stay here', 'wait here'
];

function detectCompanionIntent(text, state) {
  const t = text.toLowerCase();
  
  // Check for join intent
  const isJoin = COMPANION_JOIN_KEYWORDS.some(kw => t.includes(kw));
  // Check for leave intent
  const isLeave = COMPANION_LEAVE_KEYWORDS.some(kw => t.includes(kw));
  
  if (!isJoin && !isLeave) return null;
  
  // Try to extract NPC name from the text
  let npcName = null;
  
  // Check if we have a current NPC being interacted with
  if (state.currentNPC) {
    npcName = state.currentNPC;
  }
  
  // Try to extract name from text patterns
  const namePatterns = [
    /(?:ask|tell|invite)\s+(\w+)\s+to/i,
    /(\w+)\s+(?:join|come|travel|accompany)/i,
    /(?:with|dismiss|goodbye)\s+(\w+)/i,
    /(?:let|send)\s+(\w+)\s+(?:go|away)/i
  ];
  
  for (const pattern of namePatterns) {
    const match = t.match(pattern);
    if (match && match[1]) {
      npcName = match[1];
      break;
    }
  }
  
  return {
    intent: isLeave ? 'leave' : 'join',
    npcName
  };
}

/**
 * Get companion display for UI
 */
function getCompanionsDisplay(state) {
  if (!state.companions || state.companions.length === 0) {
    return { hasCompanions: false, list: [], display: 'None.' };
  }
  
  return {
    hasCompanions: true,
    list: state.companions.map(c => ({
      name: c.name,
      role: c.role,
      loyalty: c.loyalty,
      loyaltyLabel: getLoyaltyLabel(c.loyalty)
    })),
    display: state.companions.map(c => c.name).join(', ')
  };
}

function getLoyaltyLabel(loyalty) {
  if (loyalty >= 90) return 'Devoted';
  if (loyalty >= 70) return 'Loyal';
  if (loyalty >= 50) return 'Friendly';
  if (loyalty >= 30) return 'Uncertain';
  if (loyalty >= 10) return 'Reluctant';
  return 'Disloyal';
}


// =============================================
// CRAFTED GEAR — EQUIP / SELL
// Crafted items live in state.craftedGear[] and have
// full gear stats + optional stat mods.
// =============================================
function getCraftedGearInventory(state) {
  return state.craftedGear || [];
}

function equipCraftedItem(state, nameFragment) {
  if (!state.craftedGear || state.craftedGear.length === 0) {
    return { success: false, message: 'No crafted gear in your inventory.' };
  }

  const frag = nameFragment.toLowerCase();
  const idx  = state.craftedGear.findIndex(g =>
    g.name && g.name.toLowerCase().includes(frag)
  );

  if (idx === -1) {
    return { success: false, message: `No crafted item matching "${nameFragment}" found.` };
  }

  const item     = state.craftedGear[idx];
  const isArmor  = item.armorLevel > 0 && item.weaponBonus === 0;
  const slot     = isArmor ? 'armor' : 'weapon';

  // Remove old gear stat mods if any
  const oldGear = state.gear[slot];
  if (oldGear && oldGear.statMods) {
    for (const [stat, val] of Object.entries(oldGear.statMods)) {
      state.stats[stat] = (state.stats[stat] || 5) - val;
    }
    recalculateResources(state);
  }

  // Equip new item
  state.gear[slot] = item;

  // Apply new stat mods
  if (item.statMods) {
    for (const [stat, val] of Object.entries(item.statMods)) {
      state.stats[stat] = (state.stats[stat] || 5) + val;
    }
    recalculateResources(state);
  }

  // Remove from crafted gear inventory
  state.craftedGear.splice(idx, 1);

  const modStr = item.statMods
    ? ' [' + Object.entries(item.statMods).map(([s,v]) => `+${v} ${s.toUpperCase()}`).join(', ') + ']'
    : '';

  return {
    success: true,
    item,
    slot,
    message: `Equipped crafted ${slot}: ${item.name} (${item.quality})${modStr}`
  };
}

function sellCraftedItem(state, nameFragment) {
  if (!state.craftedGear || state.craftedGear.length === 0) {
    return { success: false, message: 'No crafted gear to sell.' };
  }

  const frag = nameFragment.toLowerCase();
  const idx  = state.craftedGear.findIndex(g =>
    g.name && g.name.toLowerCase().includes(frag)
  );

  if (idx === -1) {
    return { success: false, message: `No crafted item matching "${nameFragment}" found.` };
  }

  const item      = state.craftedGear[idx];
  const baseValue = item.weaponBonus > 0 ? item.weaponBonus * 10 : item.armorLevel * 15;
  const total     = baseValue + (item.sellBonus || 0);

  addCoin(state, total);
  state.craftedGear.splice(idx, 1);

  return {
    success: true,
    amount:  total,
    display: formatCoin(total),
    message: `Sold "${item.name}" (${item.quality}) for ${formatCoin(total)}.`
  };
}

// =============================================
// Gear stat mod description helper for UI
// =============================================
function formatStatMods(statMods) {
  if (!statMods || Object.keys(statMods).length === 0) return '';
  return Object.entries(statMods)
    .map(([s, v]) => `+${v} ${s.toUpperCase()}`)
    .join(' / ');
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