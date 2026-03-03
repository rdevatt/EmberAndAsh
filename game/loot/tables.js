'use strict';

const LOOT_TABLES = {
  bandits: {
    default: { items: ['knife', 'belt', 'worn leather tunic'], coin: 120 },
    variants: [
      { match: /captain/i, loot: { items: ['sword', 'belt', 'worn leather tunic'], coin: 300 } },
      { match: /raider|cutthroat|thug/i, loot: { items: ['short blade', 'coin pouch', 'patched jerkin'], coin: 180 } }
    ]
  },
  guards: {
    default: { items: ['shortsword', 'guard tabard', 'belt'], coin: 150 },
    variants: [
      { match: /captain|sergeant/i, loot: { items: ['longsword', 'reinforced tabard', 'duty belt'], coin: 260 } }
    ]
  },
  cultists: {
    default: { items: ['ritual dagger', 'dark robes', 'charm pouch'], coin: 140 },
    variants: [
      { match: /adept|priest|seer/i, loot: { items: ['ritual blade', 'inscribed robes', 'occult focus'], coin: 240 } }
    ]
  },
  beasts: {
    default: { items: ['beast hide', 'fang', 'raw meat'], coin: 0 },
    variants: [
      { match: /wolf/i, loot: { items: ['wolf pelt', 'wolf fang'], coin: 0 } },
      { match: /boar/i, loot: { items: ['boar hide', 'boar tusk'], coin: 0 } },
      { match: /bear/i, loot: { items: ['thick bear hide', 'bear claw'], coin: 0 } }
    ]
  },
  undead: {
    default: { items: ['bone fragment', 'tattered wrappings'], coin: 0 },
    variants: [
      { match: /knight|champion/i, loot: { items: ['rusted blade', 'ancient insignia', 'bone shard'], coin: 40 } }
    ]
  },
  default: {
    default: { items: ['worn sidearm', 'coin pouch'], coin: 80 },
    variants: []
  }
};

const FAMILY_MATCHERS = [
  { family: 'bandits', match: /bandit|raider|cutthroat|thug|brigand|highwayman/i },
  { family: 'guards', match: /guard|watchman|soldier|militia|marshal|warden/i },
  { family: 'cultists', match: /cultist|acolyte|zealot|heretic|occult/i },
  { family: 'beasts', match: /wolf|boar|bear|hound|beast|rat|spider|fang|serpent/i },
  { family: 'undead', match: /undead|skeleton|ghoul|wraith|zombie|revenant/i }
];

module.exports = {
  LOOT_TABLES,
  FAMILY_MATCHERS
};
