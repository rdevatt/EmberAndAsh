'use strict';

// =============================================================
// EMBER AND ASH — GEAR DURABILITY, REPAIR AND REFORGING
// Weapons wear when they land blows, armour when it takes them.
// Worn gear (≤25%) gives three-quarters of its bonus; broken gear
// (0%) gives none until repaired. Merchants repair for coin;
// blacksmiths can repair with ore anywhere and, from profession
// level 3, reforge an item one quality tier higher.
// No AI calls. No database calls. Pure game logic.
// =============================================================

const { GEAR_QUALITIES } = require('./constants');
const { getPlayerLevel, getProfessionLevel, buildGearItem, recalculateResources } = require('./character');
const { formatCoin, spendCoin, findInventoryItem } = require('./economy');
const { countMaterial, consumeMaterial } = require('./world');
const { REGIONS } = require('./constants');

const MAX_DURABILITY = 100;
const ORE_TIER_CAP = { 'iron ore': 3, 'silver ore': 5, 'mithril ore': 7, 'star-iron': 9 };

function durabilityOf(item) {
  if (!item) return 0;
  return typeof item.durability === 'number' ? Math.max(0, Math.min(MAX_DURABILITY, item.durability)) : MAX_DURABILITY;
}

// Multiplier applied to an item's weapon bonus / armour level.
function durabilityFactor(item) {
  const d = durabilityOf(item);
  if (d <= 0) return 0;
  if (d <= 25) return 0.75;
  return 1;
}

function conditionLabel(item) {
  const d = durabilityOf(item);
  if (d <= 0) return 'BROKEN';
  if (d <= 25) return `worn ${d}%`;
  return `${d}%`;
}

// Called once per combat round. Returns warning lines (if any).
function wearGear(state, { struck, wasHit }) {
  const lines = [];
  const wear = (slot, chance) => {
    const item = state.gear && state.gear[slot];
    if (!item || Math.random() >= chance) return;
    const before = durabilityOf(item);
    item.durability = Math.max(0, before - 1);
    if (before > 25 && item.durability <= 25) lines.push(`⚠ Your ${item.name} is badly worn. "repair gear" at a merchant.`);
    if (before > 0 && item.durability === 0) lines.push(`✕ Your ${item.name} breaks! It gives no benefit until repaired.`);
  };
  if (struck) wear('weapon', 0.35);
  if (wasHit) wear('armor', 0.5);
  return lines;
}

function repairCostFor(item) {
  const missing = MAX_DURABILITY - durabilityOf(item);
  return Math.ceil(missing * ((item.tier || 0) + 1) * 1.5);
}

function hasSettlement(state) {
  const r = state.character && REGIONS[state.character.region];
  return !!(r && r.settlement);
}

function bestOre(state) {
  let best = null;
  for (const ore of Object.keys(ORE_TIER_CAP)) if (countMaterial(state, ore) > 0 && (!best || ORE_TIER_CAP[ore] > ORE_TIER_CAP[best])) best = ore;
  return best;
}

/**
 * "repair gear" — merchant for coin in a settlement, or a blacksmith's own
 * hands with ore (1 ore per 25 points) anywhere.
 */
function repair(state, which = 'all') {
  if (state.inCombat) return { success: false, message: 'Not in the middle of a fight.' };
  const slots = which === 'weapon' ? ['weapon'] : which === 'armor' ? ['armor'] : ['weapon', 'armor'];
  const damaged = slots.map(s => state.gear && state.gear[s]).filter(i => i && durabilityOf(i) < MAX_DURABILITY);
  if (!damaged.length) return { success: false, message: 'Your gear is in good repair.' };

  if (state.profession === 'blacksmith') {
    const ore = bestOre(state);
    const need = damaged.reduce((n, i) => n + Math.ceil((MAX_DURABILITY - durabilityOf(i)) / 25), 0);
    if (ore && countMaterial(state, ore) >= need) {
      consumeMaterial(state, ore, need);
      for (const i of damaged) i.durability = MAX_DURABILITY;
      state.profXP = (state.profXP || 0) + 4 * need;
      return { success: true, message: `You repair ${damaged.map(i => i.name).join(' and ')} yourself, using ${need} ${ore}.` };
    }
  }
  if (!hasSettlement(state)) return { success: false, message: 'There is no one to repair gear out here. Find a settlement (blacksmiths can repair with ore anywhere).' };
  const cost = damaged.reduce((n, i) => n + repairCostFor(i), 0);
  if (!spendCoin(state, cost)) return { success: false, message: `Repairs cost ${formatCoin(cost)}. You have ${formatCoin(state.coin || 0)}.` };
  for (const i of damaged) i.durability = MAX_DURABILITY;
  return { success: true, message: `A smith repairs ${damaged.map(i => i.name).join(' and ')} for ${formatCoin(cost)}.` };
}

function levelTier(level) {
  let t = 0; for (const q of GEAR_QUALITIES) if (level >= q.levelReq) t = q.tier; return t;
}

/**
 * "reforge <item>" — blacksmiths of profession level 3+ raise an equipped
 * or carried weapon/armour one quality tier, keeping its name and
 * enchantment. Costs 3 ore and coin; capped by level, skill and metal.
 */
function reforge(state, text) {
  if (state.inCombat) return { success: false, message: 'Not in the middle of a fight.' };
  if (state.profession !== 'blacksmith') return { success: false, message: 'Only a blacksmith can reforge gear.' };
  const profLevel = getProfessionLevel(state.profXP || 0);
  if (profLevel < 3) return { success: false, message: `Reforging needs a Skilled Smith (profession level 3). You are level ${profLevel}.` };
  const t = String(text || '').toLowerCase().trim();
  let slot = null, item = null;
  for (const s of ['weapon', 'armor']) {
    const g = state.gear && state.gear[s];
    if (g && (!t || g.name.toLowerCase().includes(t) || t.includes(s))) { slot = s; item = g; break; }
  }
  if (!item) {
    const inv = t ? findInventoryItem(state, t) : null;
    if (inv && typeof inv === 'object' && typeof inv.tier === 'number') item = inv;
  }
  if (!item) return { success: false, message: 'Reforge what? Name an equipped or carried weapon or armour.' };
  const ore = bestOre(state);
  if (!ore || countMaterial(state, ore) < 3) return { success: false, message: 'Reforging takes 3 ore of the metal you want to work.' };
  const cap = Math.min(levelTier(getPlayerLevel(state.totalXP || 0)), ORE_TIER_CAP[ore], [1, 2, 4, 6, 8, 9][profLevel]);
  if ((item.tier || 0) >= cap) return { success: false, message: `${item.name} is already as good as your level, skill and ${ore} allow (tier ${cap}).` };
  const coin = 100 * ((item.tier || 0) + 1);
  if (!spendCoin(state, coin)) return { success: false, message: `Reforging costs ${formatCoin(coin)} in fuel and flux. You have ${formatCoin(state.coin || 0)}.` };
  consumeMaterial(state, ore, 3);
  const isArmor = slot === 'armor' || (item.armorLevel || 0) > 0;
  const rebuilt = buildGearItem({ name: item.name, tier: (item.tier || 0) + 1, statMods: item.statMods, isCrafted: true, craftedBy: item.craftedBy, sellBonus: item.sellBonus }, isArmor);
  if (slot) {
    state.gear[slot] = { ...rebuilt, durability: MAX_DURABILITY };
    recalculateResources(state);
  } else {
    Object.assign(item, { tier: rebuilt.tier, durability: MAX_DURABILITY });
  }
  state.profXP = (state.profXP || 0) + 20 + rebuilt.tier * 5;
  return { success: true, message: `You reforge ${item.name} in ${ore}: now ${rebuilt.quality} (tier ${rebuilt.tier}). Cost: 3 ${ore}, ${formatCoin(coin)}.` };
}

module.exports = { MAX_DURABILITY, durabilityOf, durabilityFactor, conditionLabel, wearGear, repair, repairCostFor, reforge };
