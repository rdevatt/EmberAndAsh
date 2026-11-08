'use strict';

// =============================================================
// REGION MONSTER PACK
// Every region in REGIONS lists flavour monsters ("Moor Wraiths",
// "Bog Hounds") and rare monsters ("Barrow Knight"). Most of the
// world's regions had no matching ENEMIES entries, so nothing could
// spawn there. This module turns those lists into real enemy
// templates, scaled to each region's level range, so:
//   - every region has fights,
//   - spawned enemies match what the narrative advertises,
//   - hunt/clear bounty targets are actually killable.
// =============================================================

// Stat archetypes reused for generated monsters (index chosen per name).
const ARCHETYPES = [
  { mods:{ str:0, dex:2, vit:0 }, hpBase:22, xpMod:1.00, behavior:'pack',        desc:'Circles and probes, waiting for an opening.' },
  { mods:{ str:1, dex:3, vit:0 }, hpBase:26, xpMod:1.02, behavior:'ambush',      desc:'Patient and sudden, striking from concealment.' },
  { mods:{ str:2, dex:1, vit:1 }, hpBase:32, xpMod:1.05, behavior:'aggressive',  desc:'Presses hard once blood is drawn.' },
  { mods:{ str:1, dex:3, vit:1 }, hpBase:34, xpMod:1.06, behavior:'predator',    desc:'Tracks quietly and commits only when the kill feels certain.' },
  { mods:{ str:4, dex:-1,vit:3 }, hpBase:48, xpMod:1.10, behavior:'aggressive',  desc:'Overwhelms by force, shrugging off lighter blows.' },
  { mods:{ str:0, dex:2, vit:0 }, hpBase:30, xpMod:1.08, behavior:'tactical',    desc:'Fights with cunning rather than strength.' },
  { mods:{ str:3, dex:0, vit:4 }, hpBase:55, xpMod:1.12, behavior:'territorial', desc:'Holds its ground and punishes intruders.' },
  { mods:{ str:1, dex:-1,vit:2 }, hpBase:40, xpMod:1.05, behavior:'mindless',    desc:'Feels no fear and no pain. It simply keeps coming.' }
];

const RARE_ARCHETYPE = { mods:{ str:5, dex:2, vit:5 }, hpBase:80, xpMod:1.60, behavior:'tactical', desc:'A named threat. Locals speak of it in lowered voices.' };

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// "Moor Wraiths" -> "Moor Wraith", "Corrupt Watchmen" -> "Corrupt Watchman"
function singularLabel(name) {
  const words = String(name).trim().split(/\s+/);
  const last  = words.pop() || '';
  let single  = last;
  if (/men$/i.test(last))                    single = last.replace(/men$/i, 'man');
  else if (/ves$/i.test(last))               single = last.replace(/ves$/i, 'f');
  else if (/ies$/i.test(last))               single = last.replace(/ies$/i, 'y');
  else if (/(ch|sh|x|ss)es$/i.test(last))    single = last.replace(/es$/i, '');
  else if (/[^s]s$/i.test(last))             single = last.slice(0, -1);
  return [...words, single].join(' ');
}

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function createRegionMonsterPack(REGIONS, existingEnemies = {}) {
  const generated = {};

  for (const [regionKey, region] of Object.entries(REGIONS)) {
    const range = region.levelRange || region.monsterLevel;
    if (!Array.isArray(range)) continue;
    const [mn, mx] = range;
    const tier     = region.tier || 1;
    const tierBump = tier - 1;

    (region.monsters || []).forEach(name => {
      const label = singularLabel(name);
      const key   = `${regionKey}__${slug(label)}`;
      if (existingEnemies[key] || generated[key]) return;
      const arch  = ARCHETYPES[hashString(label) % ARCHETYPES.length];
      generated[key] = {
        label,
        levelRange: [mn, mx],
        regions:    [regionKey],
        mods: {
          str: arch.mods.str + tierBump,
          dex: arch.mods.dex,
          vit: arch.mods.vit + tierBump
        },
        hpBase:   arch.hpBase + (tier - 1) * 12,
        xpMod:    Math.round((arch.xpMod + (tier - 1) * 0.03) * 100) / 100,
        behavior: arch.behavior,
        desc:     `${arch.desc} One of the ${String(name).toLowerCase()} of ${region.label}.`
      };
    });

    (region.rareMonsters || []).forEach(name => {
      const label = String(name).replace(/\s*\(.*\)\s*$/, '').trim();
      const key   = `${regionKey}__rare_${slug(label)}`;
      if (existingEnemies[key] || generated[key]) return;
      generated[key] = {
        label,
        levelRange: [Math.max(mn, mx - 2), mx + 2],
        regions:    [regionKey],
        mods: {
          str: RARE_ARCHETYPE.mods.str + tierBump,
          dex: RARE_ARCHETYPE.mods.dex,
          vit: RARE_ARCHETYPE.mods.vit + tierBump
        },
        hpBase:   RARE_ARCHETYPE.hpBase + (tier - 1) * 10,
        xpMod:    RARE_ARCHETYPE.xpMod,
        behavior: RARE_ARCHETYPE.behavior,
        desc:     `${RARE_ARCHETYPE.desc} Known to haunt ${region.label}.`,
        isRare:   true
      };
    });
  }

  return generated;
}

module.exports = {
  createRegionMonsterPack,
  singularLabel
};
