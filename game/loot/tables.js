'use strict';

const LOOT_TABLES = {
  bandits: {
    default: { items: ['knife', 'belt', 'worn leather tunic', 'travel cloak'], coin: 120 },
    variants: [
      { match: /captain|warlord/i, loot: { items: ['sword', 'studded brigandine', 'signet ring', 'weighted coin pouch'], coin: 360 } },
      { match: /raider|cutthroat|thug|marauder|reaver/i, loot: { items: ['short blade', 'patchwork cuirass', 'coin pouch', 'leather gloves'], coin: 210 } },
      { match: /ambusher|skirmisher|stalker/i, loot: { items: ['throwing knife', 'camouflage wrap', 'hardened boots'], coin: 190 } }
    ]
  },
  guards: {
    default: { items: ['shortsword', 'guard tabard', 'belt', 'guard whistle'], coin: 150 },
    variants: [
      { match: /captain|sergeant|marshal/i, loot: { items: ['longsword', 'reinforced tabard', 'duty belt', 'steel gorget'], coin: 280 } },
      { match: /sentinel|warden/i, loot: { items: ['tower shield', 'chain shirt', 'iron-bound boots'], coin: 230 } }
    ]
  },
  cultists: {
    default: { items: ['ritual dagger', 'dark robes', 'charm pouch', 'obsidian beads'], coin: 140 },
    variants: [
      { match: /adept|priest|seer|hexer|blood mage|bone caller/i, loot: { items: ['ritual blade', 'inscribed robes', 'occult focus', 'etched charm'], coin: 260 } },
      { match: /dread knight|night reaper|storm caller/i, loot: { items: ['void-touched weapon shard', 'warded mantle', 'forbidden sigil'], coin: 340 } }
    ]
  },
  beasts: {
    default: { items: ['beast hide', 'fang', 'raw meat', 'sinew cord'], coin: 0 },
    variants: [
      { match: /wolf/i, loot: { items: ['wolf pelt', 'wolf fang'], coin: 0 } },
      { match: /boar/i, loot: { items: ['boar hide', 'boar tusk'], coin: 0 } },
      { match: /bear/i, loot: { items: ['thick bear hide', 'bear claw'], coin: 0 } },
      { match: /warbeast|apex hunter/i, loot: { items: ['reinforced hide', 'predator fang', 'beast tendon bundle'], coin: 20 } },
      { match: /drake|wyvern|dragon/i, loot: { items: ['scaled hide', 'venom sac', 'drake fang'], coin: 45 } }
    ]
  },
  undead: {
    default: { items: ['bone fragment', 'tattered wrappings', 'grave dust'], coin: 0 },
    variants: [
      { match: /knight|champion|dread knight/i, loot: { items: ['rusted blade', 'ancient insignia', 'bone shard', 'grave iron buckle'], coin: 60 } },
      { match: /lich|archlich|bone caller/i, loot: { items: ['phylactery fragment', 'soul ember vial', 'dustbound robes'], coin: 120 } },
      { match: /zombie|ghoul|wraith|reaper/i, loot: { items: ['grave cloth', 'cold ectoplasm', 'necrotic ichor'], coin: 15 } }
    ]
  },
  elementals: {
    default: { items: ['elemental shard', 'charged residue', 'fractured core'], coin: 30 },
    variants: [
      { match: /storm|frost|ice/i, loot: { items: ['frost crystal', 'static filament', 'rime-coated shard'], coin: 55 } },
      { match: /sand|ash|ember/i, loot: { items: ['glassified sand', 'ember pearl', 'sulfur clump'], coin: 55 } }
    ]
  },
  constructs: {
    default: { items: ['cracked stone plate', 'metal rivet bundle', 'arcane core sliver'], coin: 45 },
    variants: [
      { match: /golem|sentinel/i, loot: { items: ['runed stone slab', 'stabilized core', 'iron anchor plate'], coin: 70 } },
      { match: /ruin titan/i, loot: { items: ['titanic core fragment', 'ancient alloy frame', 'warded masonry chunk'], coin: 140 } }
    ]
  },
  giants: {
    default: { items: ['massive bone shard', 'heavy fur strip', 'giant-forged buckle'], coin: 90 },
    variants: [
      { match: /frost giant/i, loot: { items: ['frost giant bone', 'ice-rimed mail scrap', 'glacial charm'], coin: 130 } },
      { match: /titan/i, loot: { items: ['titan marrow', 'colossal chain link', 'primordial token'], coin: 170 } }
    ]
  },
  dragonkin: {
    default: { items: ['scaled hide', 'drake fang', 'venom sac'], coin: 80 },
    variants: [
      { match: /ancient dragon/i, loot: { items: ['ancient scale', 'draconic heartstring', 'dragonbone splinter'], coin: 260 } },
      { match: /wyvern/i, loot: { items: ['wyvern scale', 'tail spike', 'venom bladder'], coin: 150 } }
    ]
  },
  raiders: {
    default: { items: ['field blade', 'stitched jerkin', 'coin purse', 'travel rations'], coin: 165 },
    variants: [
      { match: /executioner|duskblade/i, loot: { items: ['honed greatblade', 'reinforced coat', 'steel vambraces'], coin: 240 } },
      { match: /scavenger|ambusher/i, loot: { items: ['bone knife', 'patched cloak', 'snare wire bundle'], coin: 140 } }
    ]
  },
  default: {
    default: { items: ['worn sidearm', 'coin pouch', 'scavenged trinket'], coin: 80 },
    variants: []
  }
};

const FAMILY_MATCHERS = [
  { family: 'bandits', match: /bandit|raider|cutthroat|thug|brigand|highwayman/i },
  { family: 'guards', match: /guard|watchman|soldier|militia|marshal|warden/i },
  { family: 'cultists', match: /cultist|acolyte|zealot|heretic|occult|hexer|blood mage|bone caller|dread knight|night reaper|storm caller/i },
  { family: 'dragonkin', match: /dragon|drake|wyvern/i },
  { family: 'giants', match: /giant|titan/i },
  { family: 'constructs', match: /golem|construct|sentinel|automaton|guardian/i },
  { family: 'elementals', match: /elemental|storm|frost|ice|sand|ash|ember/i },
  { family: 'raiders', match: /scavenger|ambusher|marauder|skirmisher|reaver|executioner|duskblade/i },
  { family: 'beasts', match: /wolf|boar|bear|hound|beast|rat|spider|fang|serpent|warbeast|apex hunter|stalker/i },
  { family: 'undead', match: /undead|skeleton|ghoul|wraith|zombie|revenant|lich|archlich|reaper/i }
];

module.exports = {
  LOOT_TABLES,
  FAMILY_MATCHERS
};
