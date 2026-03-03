'use strict';

function formatStatMods(statMods) {
  if (!statMods || Object.keys(statMods).length === 0) return '';
  return Object.entries(statMods)
    .map(([s, v]) => `+${v} ${s.toUpperCase()}`)
    .join(' / ');
}

function createCraftedGearHandlers({ addCoin, formatCoin, recalculateResources, addItem }) {
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

    const oldGear = state.gear[slot];
    if (oldGear && oldGear.statMods) {
      for (const [stat, val] of Object.entries(oldGear.statMods)) {
        state.stats[stat] = (state.stats[stat] || 5) - val;
      }
      recalculateResources(state);
    }

    if (oldGear) {
      addItem(state, oldGear);
    }

    state.gear[slot] = item;

    if (item.statMods) {
      for (const [stat, val] of Object.entries(item.statMods)) {
        state.stats[stat] = (state.stats[stat] || 5) + val;
      }
      recalculateResources(state);
    }

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

  return {
    getCraftedGearInventory,
    equipCraftedItem,
    sellCraftedItem
  };
}

module.exports = {
  formatStatMods,
  createCraftedGearHandlers
};
