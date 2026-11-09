'use strict';

// =============================================================
// EMBER AND ASH — MERCHANTS
// Buying level-appropriate gear, potions, hazard wards and basic
// materials in settlements; drinking potions. Free Compact standing
// moves prices. Merchants buy for far less than they sell, so
// nothing can be flipped for profit.
// No AI calls. No database calls. Pure game logic.
// =============================================================

const { REGIONS, GEAR_QUALITIES } = require('./constants');
const { getPlayerLevel } = require('./character');
const { formatCoin, spendCoin, addItem, removeItem, findInventoryItem } = require('./economy');
const { getPriceModifier, isShunnedBy } = require('./factions');
const { getConnectedRegionKeys } = require('./travel');

function getTierForLevel(level) {
  let best = 0;
  for (const q of GEAR_QUALITIES) if (level >= q.levelReq) best = q.tier;
  return best;
}

function hasMerchant(state) {
  const r = state.character && REGIONS[state.character.region];
  return !!(r && (r.settlement || r.cityPresent || r.hasBountyBoard));
}

const BASIC_MATERIALS = ['iron ore', 'timber', 'hide', 'herbs'];

function getShopStock(state) {
  const regionKey = state.character.region;
  const region  = REGIONS[regionKey] || {};
  const tier    = getTierForLevel(getPlayerLevel(state.totalXP || 0));
  const quality = GEAR_QUALITIES[tier];
  // Free Compact standing sets the base; the era and whoever holds this
  // region adjust it (friends of the local power pay less, enemies more).
  const ch = require('./chronicle');
  const W = ch.worldOf(state);
  let mod = getPriceModifier(state) * (W ? ch.eraEffects(W).priceMult || 1 : 1);
  const holder = W ? ch.dominionOf(W, regionKey) : null;
  if (holder && state.factions && typeof state.factions[holder] === 'number') {
    if (state.factions[holder] >= 50) mod *= 0.9; else if (state.factions[holder] <= -20) mod *= 1.25;
  }
  if (W) mod *= require('./politics').warPriceMult(W, regionKey);   // war drives prices up
  mod = Math.round(mod * 100) / 100;
  const p = (x) => Math.max(1, Math.round(x * mod));
  const gearPrice = 150 * (tier + 1) * (tier + 1);
  const rt = region.tier || 1;
  const stock = [
    { key: 'weapon', name: `${quality.label.toLowerCase()} steel sword`,    slot: 'weapon', tier, price: p(gearPrice), note: `+${quality.weaponBonus} damage`, match: /sword|blade|weapon/ },
    { key: 'bow',    name: `${quality.label.toLowerCase()} longbow`,        slot: 'weapon', tier, price: p(gearPrice), note: `+${quality.weaponBonus} damage, ranged (DEX)`, match: /bow/ },
    { key: 'staff',  name: `${quality.label.toLowerCase()} oak staff`,      slot: 'weapon', tier, price: p(gearPrice), note: `+${quality.weaponBonus} damage, spell focus`, match: /staff|wand|focus/ },
    { key: 'dagger', name: `${quality.label.toLowerCase()} dagger`,         slot: 'weapon', tier, price: p(gearPrice * 0.9), note: `+${quality.weaponBonus} damage, finesse (DEX)`, match: /dagger|knife/ },
    { key: 'armor',  name: `${quality.label.toLowerCase()} leather armor`,  slot: 'armor',  tier, price: p(gearPrice * 0.9), note: `${quality.armorLevel} armor`, match: /armou?r|leather|mail|vest|tunic/ },
    { key: 'potion', name: 'healing potion', price: p(30 * rt), note: 'restores 40% HP', match: /healing|health|potion/ },
    { key: 'mana',   name: 'mana potion',    price: p(40 * rt), note: 'restores 40% mana', match: /mana/ }
  ];
  // Wards for this region's hazard and the roads ahead.
  const wards = new Set();
  for (const k of [regionKey, ...getConnectedRegionKeys(regionKey)]) {
    const h = REGIONS[k] && REGIONS[k].hazard;
    if (h && h.ward) wards.add(h.ward);
  }
  for (const w of wards) stock.push({ key: 'ward', name: w, price: p(60 * rt), note: 'protects against a regional hazard', match: new RegExp(w.split(/[\s-]/).pop()) });
  for (const m of BASIC_MATERIALS) stock.push({ key: 'material', name: m, price: p(12 * rt), note: 'crafting material', match: new RegExp(`^(?:\\d+\\s+)?(?:some\\s+)?${m.split(' ')[0]}`) });
  return stock;
}

function buildShopText(state) {
  if (!hasMerchant(state)) return 'There are no merchants out here. Find a settlement ("explore" lists what is here).';
  const r = REGIONS[state.character.region];
  const lines = [`MERCHANTS OF ${(r.settlement ? r.settlement.name : r.label).toUpperCase()}`, `Your coin: ${formatCoin(state.coin || 0)}`];
  const mod = getShopStock(state).length ? Math.round((getShopStock(state)[0].price / (150 * Math.pow(getTierForLevel(getPlayerLevel(state.totalXP || 0)) + 1, 2))) * 100) / 100 : 1;
  if (mod !== 1) lines.push(`(Prices ×${mod}: your standing, the era, and who holds this region)`);
  lines.push('');
  for (const item of getShopStock(state)) lines.push(`  ${item.name} — ${formatCoin(item.price)} (${item.note})`);
  lines.push('', 'Type "buy <item>", e.g. "buy 2 healing potions", "buy longbow", "buy fur-lined cloak". "sell <item>" to sell.');
  return lines.join('\n');
}

function buyItem(state, request) {
  const t = String(request || '').toLowerCase().trim();
  if (!hasMerchant(state)) return { success: false, notStocked: true, message: '' };
  const stock = getShopStock(state);
  // Most specific match first (wards and mana before generic potion).
  const ordered = [...stock.filter(i => i.key === 'ward'), ...stock.filter(i => i.key === 'mana'), ...stock.filter(i => !['ward', 'mana'].includes(i.key))];
  const item = ordered.find(i => i.match.test(t.replace(/^(?:a|an|the|some)\s+/, '').replace(/^\d+\s+/, '')));
  // Not something merchants stock ("buy an ale for the bard") — a story action.
  if (!item) return { success: false, notStocked: true, message: '' };
  if (state.inCombat) return { success: false, message: 'No merchant will deal with you mid-fight.' };
  if (isShunnedBy(state, 'compact')) return { success: false, message: 'The merchants of the Free Compact refuse to trade with you.' };

  const stackable = ['potion', 'mana', 'material'].includes(item.key);
  const qty   = stackable ? Math.max(1, Math.min(10, parseInt((t.match(/\b(\d+)\b/) || [])[1], 10) || 1)) : 1;
  const total = item.price * qty;
  if (!spendCoin(state, total)) {
    return { success: false, message: `You can't afford ${qty > 1 ? `${qty} × ` : ''}${item.name} (${formatCoin(total)}). You have ${formatCoin(state.coin || 0)}.` };
  }

  for (let i = 0; i < qty; i++) {
    if (item.key === 'potion') addItem(state, { name: 'healing potion', type: 'potion', heal: 0.4, value: Math.round(item.price * 0.3) });
    else if (item.key === 'mana') addItem(state, { name: 'mana potion', type: 'potion', mana: 0.4, value: Math.round(item.price * 0.3) });
    else if (item.key === 'material') addItem(state, { name: item.name, type: 'material', value: Math.round(item.price * 0.3) });
    else if (item.key === 'ward') addItem(state, { name: item.name, type: 'ward', value: Math.round(item.price * 0.3) });
    else addItem(state, { name: item.name, tier: item.tier, type: item.slot, value: Math.round(item.price * 0.25) });
  }
  const plural = qty > 1 ? `${qty} × ` : '';
  const tip = item.key === 'potion' ? ' Type "drink potion" to use one.'
    : item.key === 'mana' ? ' Type "drink mana potion" to use one.'
    : item.key === 'ward' ? ' Carry it to be protected.'
    : item.key === 'material' ? ''
    : ` Type "equip ${item.name}" to use it.`;
  return { success: true, message: `Bought ${plural}${item.name} for ${formatCoin(total)}.${tip}` };
}

// kind: 'healing' | 'mana' | 'meal'
function drinkPotion(state, kind = 'healing') {
  const name = kind === 'mana' ? 'mana potion' : kind === 'meal' ? 'hearty meal' : 'healing potion';
  const potion = findInventoryItem(state, name);
  if (!potion) return { success: false, message: kind === 'meal' ? 'You have no meals. Cooks and hunters can make them.' : `You have no ${name}s. Merchants sell them ("shop").` };
  if (kind === 'mana') {
    if (state.mana >= state.maxMana) return { success: false, message: 'Your mana is already full.' };
    const before = state.mana;
    state.mana = Math.min(state.maxMana, state.mana + Math.ceil(state.maxMana * 0.4));
    removeItem(state, name);
    return { success: true, message: `You drink the mana potion. Mana +${state.mana - before} (${state.mana}/${state.maxMana}).` };
  }
  if (state.hp >= state.maxHp) return { success: false, message: 'You are already at full health.' };
  const heal = Math.ceil(state.maxHp * ((potion && potion.heal) || (kind === 'meal' ? 0.3 : 0.4)));
  const before = state.hp;
  state.hp = Math.min(state.maxHp, state.hp + heal);
  removeItem(state, name);
  return { success: true, message: `You ${kind === 'meal' ? 'eat the' : 'drink the'} ${name}. HP +${state.hp - before} (${state.hp}/${state.maxHp}).` };
}

module.exports = {
  hasMerchant,
  getShopStock,
  buildShopText,
  buyItem,
  drinkPotion
};
