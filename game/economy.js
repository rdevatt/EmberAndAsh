'use strict';

// =============================================================
// EMBER AND ASH — ECONOMY
// Coin transactions, inventory management, gear handling,
// shop logic, reputation, and death gear recovery.
// No AI calls. No database calls. Pure game logic.
// =============================================================

const {
  GEAR_QUALITIES,
  REGIONS
} = require('./constants');

const {
  getPlayerLevel,
  getReputationLabel,
  buildGearItem
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
  state.inventory.push(item);
}

function removeItem(state, itemName) {
  if (!state.inventory) return false;
  const idx = state.inventory.findIndex(i =>
    i.toLowerCase().includes(itemName.toLowerCase())
  );
  if (idx === -1) return false;
  state.inventory.splice(idx, 1);
  return true;
}

function hasItem(state, itemName) {
  if (!state.inventory) return false;
  return state.inventory.some(i =>
    i.toLowerCase().includes(itemName.toLowerCase())
  );
}

function getInventoryDisplay(state) {
  if (!state.inventory || state.inventory.length === 0) return 'Nothing.';
  return state.inventory.join(', ');
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
    canUse,
    label:       `${w.name} (${w.quality})${canUse ? '' : ' [Level ' + w.levelReq + ' required]'}`
  };
}

function getArmorDisplay(state) {
  const a = state.gear && state.gear.armor;
  if (!a) return { equipped: false, label: 'None' };

  const playerLevel = getPlayerLevel(state.totalXP || 0);
  const canUse      = playerLevel >= a.levelReq;

  return {
    equipped:    true,
    name:        a.name,
    quality:     a.quality,
    tier:        a.tier,
    levelReq:    a.levelReq,
    armorLevel:  a.armorLevel,
    canUse,
    label:       `${a.name} (${a.quality})${canUse ? '' : ' [Level ' + a.levelReq + ' required]'}`
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
    region:          region ? region.label : null
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

  // Gear
  equipWeapon,
  equipArmor,
  getWeaponDisplay,
  getArmorDisplay,
  getAvailableGearTiers,

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