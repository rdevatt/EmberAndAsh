'use strict';

const {
  LOOT_TABLES,
  FAMILY_MATCHERS
} = require('./loot/tables');

function resolveCorpseLoot(enemyLabel) {
  const label = String(enemyLabel || 'enemy');
  const familyEntry = FAMILY_MATCHERS.find(entry => entry.match.test(label));
  const family = familyEntry ? familyEntry.family : 'default';
  const table = LOOT_TABLES[family] || LOOT_TABLES.default;

  const variant = table.variants.find(v => v.match.test(label));
  const selected = variant ? variant.loot : table.default;

  return {
    family,
    items: [...(selected.items || [])],
    coinReward: Math.max(0, Math.floor(selected.coin || 0))
  };
}

module.exports = {
  LOOT_TABLES,
  resolveCorpseLoot
};
