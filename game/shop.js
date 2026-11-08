'use strict';

// =============================================================
// EMBER AND ASH — MERCHANTS
// Buying level-appropriate gear and healing potions in settled
// regions, and drinking potions. Gives coin a purpose.
// No AI calls. No database calls. Pure game logic.
// =============================================================

const { REGIONS, GEAR_QUALITIES } = require('./constants');
const { getPlayerLevel } = require('./character');
const { formatCoin, spendCoin, addItem, removeItem, findInventoryItem } = require('./economy');

function getTierForLevel(level) {
  let best = 0;
  for (const q of GEAR_QUALITIES) if (level >= q.levelReq) best = q.tier;
  return best;
}

function hasMerchant(state) {
  const r = state.character && REGIONS[state.character.region];
  return !!(r && (r.cityPresent || r.hasBountyBoard));
}

function getShopStock(state) {
  const region  = REGIONS[state.character.region] || {};
  const tier    = getTierForLevel(getPlayerLevel(state.totalXP || 0));
  const quality = GEAR_QUALITIES[tier];
  const gearPrice = 150 * (tier + 1) * (tier + 1);
  return [
    { key: 'weapon', name: `${quality.label.toLowerCase()} steel sword`,    slot: 'weapon', tier, price: gearPrice,
      note: `+${quality.weaponBonus} damage` },
    { key: 'armor',  name: `${quality.label.toLowerCase()} leather armor`,  slot: 'armor',  tier, price: Math.round(gearPrice * 0.9),
      note: `${quality.armorLevel} armor` },
    { key: 'potion', name: 'healing potion', price: 30 * (region.tier || 1), note: 'restores 40% HP' }
  ];
}

function buildShopText(state) {
  if (!hasMerchant(state)) return 'There are no merchants out here. Find a town or camp with a bounty board.';
  const lines = ['MERCHANT', `Your coin: ${formatCoin(state.coin || 0)}`, ''];
  for (const item of getShopStock(state)) {
    lines.push(`  ${item.name} — ${formatCoin(item.price)} (${item.note})`);
  }
  lines.push('', 'Type "buy <item>", e.g. "buy healing potion" or "buy sword".');
  return lines.join('\n');
}

function buyItem(state, request) {
  const t     = String(request || '').toLowerCase();
  if (!/potion|draught|elixir|armou?r|leather|mail|plate|vest|tunic|shield|helm|sword|blade|weapon|axe|mace|spear|dagger|knife|hammer/.test(t)) {
    return { success: false, notStocked: true, message: '' };
  }
  if (state.inCombat) return { success: false, message: 'No merchant will deal with you mid-fight.' };
  if (!hasMerchant(state)) return { success: false, message: 'There are no merchants out here.' };
  const stock = getShopStock(state);
  const qty   = Math.max(1, Math.min(10, parseInt((t.match(/\b(\d+)\b/) || [])[1], 10) || 1));
  const item  = /potion|draught|elixir/.test(t) ? stock.find(i => i.key === 'potion')
              : /armou?r|leather|mail|plate|vest|tunic|shield|helm/.test(t) ? stock.find(i => i.key === 'armor')
              : /sword|blade|weapon|axe|mace|spear|dagger|knife|hammer/.test(t) ? stock.find(i => i.key === 'weapon')
              : null;
  // Not something merchants stock ("buy an ale for the bard") — a story action.
  if (!item) return { success: false, notStocked: true, message: '' };

  const total = item.key === 'potion' ? item.price * qty : item.price;
  if (!spendCoin(state, total)) {
    return { success: false, message: `You can't afford ${item.name} (${formatCoin(total)}). You have ${formatCoin(state.coin || 0)}.` };
  }

  if (item.key === 'potion') {
    for (let i = 0; i < qty; i++) addItem(state, { name: 'healing potion', type: 'potion', heal: 0.4 });
    return { success: true, message: `Bought ${qty} healing potion${qty > 1 ? 's' : ''} for ${formatCoin(total)}. Type "drink potion" to use one.` };
  }
  addItem(state, { name: item.name, tier: item.tier });
  return { success: true, message: `Bought ${item.name} for ${formatCoin(total)}. Type "equip ${item.name}" to use it.` };
}

function drinkPotion(state) {
  const potion = findInventoryItem(state, 'potion');
  if (!potion) return { success: false, message: 'You have no potions. Merchants sell them ("shop").' };
  if (state.hp >= state.maxHp) return { success: false, message: 'You are already at full health.' };
  const name = typeof potion === 'string' ? potion : potion.name;
  const heal = Math.ceil(state.maxHp * ((potion && potion.heal) || 0.4));
  const before = state.hp;
  state.hp = Math.min(state.maxHp, state.hp + heal);
  removeItem(state, name);
  return { success: true, message: `You drink the ${name}. HP +${state.hp - before} (${state.hp}/${state.maxHp}).` };
}

module.exports = {
  hasMerchant,
  getShopStock,
  buildShopText,
  buyItem,
  drinkPotion
};
