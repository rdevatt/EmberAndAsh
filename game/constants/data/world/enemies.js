'use strict';

const WORLD_TIERS = [
  { tier:1,  levelRange:[1,10],  label:'Outer Rim',            desc:'The starting lands. Modest danger, forgiving mistakes.' },
  { tier:2,  levelRange:[11,20], label:'Outer Ring',           desc:'Harder lands beyond the familiar. Old threats and new ones.' },
  { tier:3,  levelRange:[21,30], label:'Mid-Outer Ring',       desc:'The frontier. Settlements become sparse. Things get strange.' },
  { tier:4,  levelRange:[31,40], label:'Mid Ring',             desc:'Few travel here without purpose. Fewer return without scars.' },
  { tier:5,  levelRange:[41,50], label:'Mid-Inner Ring',       desc:'The known world ends here. Beyond this, only the desperate go.' },
  { tier:6,  levelRange:[51,60], label:'Inner Ring',           desc:'Ancient places. Broken kingdoms. Power untethered from reason.' },
  { tier:7,  levelRange:[61,70], label:'Inner Core Approach',  desc:'Reality frays at the edges here. Old wars never stopped.' },
  { tier:8,  levelRange:[71,80], label:'Core Ring',            desc:'Even the air is wrong here. You can feel the center pulling.' },
  { tier:9,  levelRange:[81,90], label:'The Core',             desc:'Legend made real. Few names survive to become history.' },
  { tier:10, levelRange:[91,100],label:'The Shattered Throne', desc:'The dead center. Where everything the world feared was born.' }
];

const ENEMIES = {
  giantRat:        { label:'Giant Rat',         levelRange:[1,3],   regions:['thornwick','ironport','sunkenfen'],              mods:{str:-3,dex:2, vit:-2}, hpBase:8,   xpMod:0.9, behavior:'pack',       desc:'Fast and vicious in numbers. Fragile alone.' },
  goblin:          { label:'Goblin',            levelRange:[1,5],   regions:['thornwick','ashwood','blackstone','dustfall'],   mods:{str:-2,dex:3, vit:-2}, hpBase:12,  xpMod:1.0, behavior:'pack',       desc:'Small and cunning. Weak alone, dangerous in groups.' },
  imp:             { label:'Imp',               levelRange:[1,4],   regions:['ashwood','sunkenfen','veldrath'],                mods:{str:-3,dex:4, vit:-3}, hpBase:8,   xpMod:1.0, behavior:'cowardly',   desc:'Tiny, winged, irritating. Fast and hard to hit.' },
  banditThug:      { label:'Bandit Thug',       levelRange:[2,7],   regions:['thornwick','dustfall','ironport'],               mods:{str:1, dex:0, vit:0},  hpBase:20,  xpMod:1.0, behavior:'aggressive', desc:'A desperate human with crude weapons and nothing to lose.' },
  forestWolf:      { label:'Forest Wolf',       levelRange:[2,6],   regions:['thornwick','ashwood'],                           mods:{str:0, dex:2, vit:1},  hpBase:22,  xpMod:1.0, behavior:'pack',       desc:'A large wolf. Circling, testing, then lunging.' },
  orcWarrior:      { label:'Orc Warrior',       levelRange:[5,15],  regions:['dustfall','blackstone','thornwick'],             mods:{str:3, dex:-1,vit:2},  hpBase:40,  xpMod:1.1, behavior:'aggressive', desc:'Battle-hardened. Slow to learn, fast to kill.' },
  darkElfScout:    { label:'Dark Elf Scout',    levelRange:[6,14],  regions:['ashwood','sunkenfen'],                           mods:{str:0, dex:4, vit:-1}, hpBase:30,  xpMod:1.1, behavior:'ambush',     desc:'Swift and precise. Strikes from shadow, vanishes just as fast.' },
  skeletonWarrior: { label:'Skeleton Warrior',  levelRange:[4,12],  regions:['sunkenfen','veldrath'],                          mods:{str:1, dex:-1,vit:0},  hpBase:28,  xpMod:1.0, behavior:'mindless',   desc:'Animated bone. No fear. No pain. No retreat.' },
  bogZombie:       { label:'Bog Zombie',        levelRange:[3,10],  regions:['sunkenfen'],                                     mods:{str:2, dex:-2,vit:3},  hpBase:38,  xpMod:1.0, behavior:'mindless',   desc:'Slow and relentless. Hard to put down permanently.' },
  corruptedDryad:  { label:'Corrupted Dryad',   levelRange:[6,15],  regions:['ashwood'],                                       mods:{str:1, dex:2, vit:1},  hpBase:35,  xpMod:1.1, behavior:'territorial',desc:'A nature spirit twisted by dark magic. Unpredictable and fast.' },
  caveTroll:       { label:'Cave Troll',        levelRange:[10,20], regions:['blackstone','thornwick','ashwood'],             mods:{str:5, dex:-3,vit:4},  hpBase:70,  xpMod:1.2, behavior:'aggressive', desc:'Massive. Regenerates slowly. One hit can break bones.' },
  banditCaptain:   { label:'Bandit Captain',    levelRange:[8,18],  regions:['thornwick','dustfall','ironport'],              mods:{str:2, dex:2, vit:1},  hpBase:55,  xpMod:1.2, behavior:'tactical',   desc:'Experienced. Uses positioning, feints, and dirty tricks.' },
  wyvernHatchling: { label:'Wyvern Hatchling',  levelRange:[12,20], regions:['blackstone'],                                    mods:{str:4, dex:2, vit:2},  hpBase:65,  xpMod:1.3, behavior:'aggressive', desc:'Not fully grown but venomous and fast. Its tail is the real threat.' },
  stoneGolem:      { label:'Stone Golem',       levelRange:[12,25], regions:['blackstone','veldrath'],                         mods:{str:6, dex:-4,vit:6},  hpBase:90,  xpMod:1.3, behavior:'territorial',desc:'Living rock. Hits like a falling wall. Almost no weak points.' },
  ogre:            { label:'Ogre',              levelRange:[18,35], regions:['blackstone','dustfall','ashwood'],              mods:{str:8, dex:-4,vit:6},  hpBase:120, xpMod:1.3, behavior:'aggressive', desc:'Brute force incarnate. One clean hit can end a fight permanently.' },
  lichCultist:     { label:'Lich Cultist',      levelRange:[20,35], regions:['sunkenfen','veldrath'],                          mods:{str:0, dex:2, vit:-1}, hpBase:60,  xpMod:1.4, behavior:'tactical',   desc:'A mage who sold their soul. Powerful magic, fragile body.' },
  vampireSpawn:    { label:'Vampire Spawn',     levelRange:[22,40], regions:['sunkenfen','ashwood','ironport'],               mods:{str:4, dex:5, vit:2},  hpBase:100, xpMod:1.4, behavior:'predator',   desc:'Fast, bloodthirsty. Heals from the damage it deals.' },
  frostGiant:      { label:'Frost Giant',       levelRange:[25,45], regions:['frozennorth','blackstone'],                     mods:{str:10,dex:-2,vit:8},  hpBase:180, xpMod:1.5, behavior:'aggressive', desc:'A towering wall of ice and fury. Devastating sweeping attacks.' },
  demonKnight:     { label:'Demon Knight',      levelRange:[40,60], regions:['veldrath','sunkenfen'],                          mods:{str:8, dex:3, vit:6},  hpBase:200, xpMod:1.6, behavior:'tactical',   desc:'A warrior bound to dark forces. Resistant to normal weapons.' },
  elderTreeant:    { label:'Elder Treant',      levelRange:[35,55], regions:['ashwood'],                                       mods:{str:9, dex:-5,vit:10}, hpBase:250, xpMod:1.5, behavior:'territorial',desc:'Ancient walking tree. Enormous endurance. Weak to fire.' },
  iceWraith:       { label:'Ice Wraith',        levelRange:[30,50], regions:['frozennorth'],                                   mods:{str:3, dex:7, vit:1},  hpBase:90,  xpMod:1.5, behavior:'predator',   desc:'Barely corporeal. Draining to fight. Hard to land a solid hit.' },
  sandDrake:       { label:'Sand Drake',        levelRange:[45,65], regions:['veldrath'],                                      mods:{str:7, dex:4, vit:7},  hpBase:220, xpMod:1.7, behavior:'predator',   desc:'A desert predator. Spits acid. Bursts from the sand without warning.' },
  elderLich:       { label:'Elder Lich',        levelRange:[65,85], regions:['sunkenfen','veldrath'],                          mods:{str:2, dex:4, vit:5},  hpBase:320, xpMod:2.0, behavior:'tactical',   desc:'An ancient undead spellcaster. Commands armies of the dead.' },
  wyvern:          { label:'Wyvern',            levelRange:[60,80], regions:['blackstone'],                                    mods:{str:10,dex:5, vit:8},  hpBase:380, xpMod:1.9, behavior:'predator',   desc:'Fully grown. Venomous, armored, intelligent enough to be cruel.' },
  ancientDragon:   { label:'Ancient Dragon',    levelRange:[85,100],regions:['blackstone','veldrath','frozennorth'],          mods:{str:15,dex:3, vit:15}, hpBase:700, xpMod:3.0, behavior:'apex',       desc:'A creature of legend. Few who see one live to describe it.' },
  archlich:        { label:'Archlich',          levelRange:[90,100],regions:['veldrath','sunkenfen'],                          mods:{str:3, dex:6, vit:8},  hpBase:600, xpMod:2.5, behavior:'tactical',   desc:'The pinnacle of undead mastery. Reality warps in its presence.' }
};

const REGIONAL_ENEMY_ARCHETYPES = [
  { key:'scavenger',   label:'Scavenger',      mods:{str:0,  dex:2, vit:0},  hpBase:22,  xpMod:1.00, behavior:'pack',        desc:'A ruthless opportunist that circles weak targets.' },
  { key:'ambusher',    label:'Ambusher',       mods:{str:1,  dex:3, vit:0},  hpBase:26,  xpMod:1.02, behavior:'ambush',      desc:'Patient and sudden, striking from concealment.' },
  { key:'marauder',    label:'Marauder',       mods:{str:2,  dex:1, vit:1},  hpBase:32,  xpMod:1.04, behavior:'aggressive',  desc:'A roaming fighter that presses hard once blood is drawn.' },
  { key:'stalker',     label:'Stalker',        mods:{str:1,  dex:3, vit:1},  hpBase:34,  xpMod:1.06, behavior:'predator',    desc:'Tracks quietly and commits only when the kill feels certain.' },
  { key:'raider',      label:'Raider',         mods:{str:2,  dex:2, vit:1},  hpBase:38,  xpMod:1.08, behavior:'tactical',    desc:'Hits supply lines, flanks, and exposed positions.' },
  { key:'hexer',       label:'Hexer',          mods:{str:0,  dex:2, vit:0},  hpBase:30,  xpMod:1.10, behavior:'tactical',    desc:'Uses curses and pressure rather than brute force.' },
  { key:'brute',       label:'Brute',          mods:{str:4,  dex:-1,vit:3},  hpBase:52,  xpMod:1.12, behavior:'aggressive',  desc:'Overwhelms by force, shrugging off lighter blows.' },
  { key:'skirmisher',  label:'Skirmisher',     mods:{str:2,  dex:4, vit:1},  hpBase:44,  xpMod:1.14, behavior:'pack',        desc:'Fast engagement fighter that probes for weak angles.' },
  { key:'reaver',      label:'Reaver',         mods:{str:4,  dex:2, vit:2},  hpBase:60,  xpMod:1.16, behavior:'aggressive',  desc:'A feared frontline killer accustomed to prolonged fights.' },
  { key:'sentinel',    label:'Sentinel',       mods:{str:3,  dex:0, vit:4},  hpBase:68,  xpMod:1.18, behavior:'territorial', desc:'A defensive anchor that punishes intruders.' },
  { key:'bloodmage',   label:'Blood Mage',     mods:{str:1,  dex:2, vit:0},  hpBase:54,  xpMod:1.20, behavior:'tactical',    desc:'Turns pain and sacrifice into destructive power.' },
  { key:'warbeast',    label:'Warbeast',       mods:{str:5,  dex:2, vit:3},  hpBase:84,  xpMod:1.23, behavior:'predator',    desc:'A bred or twisted predator trained for killing.' },
  { key:'bonecaller',  label:'Bone Caller',    mods:{str:1,  dex:1, vit:2},  hpBase:78,  xpMod:1.26, behavior:'mindless',    desc:'Animates remnants of the dead to create pressure.' },
  { key:'duskblade',   label:'Duskblade',      mods:{str:4,  dex:4, vit:2},  hpBase:92,  xpMod:1.30, behavior:'tactical',    desc:'A disciplined killer blending speed and steel.' },
  { key:'stormcaller', label:'Storm Caller',   mods:{str:2,  dex:4, vit:2},  hpBase:96,  xpMod:1.34, behavior:'territorial', desc:'Channels wild elemental force to dominate terrain.' },
  { key:'executioner', label:'Executioner',    mods:{str:6,  dex:2, vit:4},  hpBase:118, xpMod:1.40, behavior:'aggressive',  desc:'Built for finishing wounded foes with terrifying certainty.' },
  { key:'dreadknight', label:'Dread Knight',   mods:{str:6,  dex:3, vit:5},  hpBase:132, xpMod:1.48, behavior:'tactical',    desc:'An elite armored terror that controls pacing.' },
  { key:'nightreaper', label:'Night Reaper',   mods:{str:5,  dex:6, vit:3},  hpBase:126, xpMod:1.56, behavior:'predator',    desc:'A silent apex hunter that preys on panic.' },
  { key:'ruinTitan',   label:'Ruin Titan',     mods:{str:9,  dex:-2,vit:8},  hpBase:180, xpMod:1.75, behavior:'territorial', desc:'A catastrophic heavy threat that reshapes battles.' },
  { key:'apexHunter',  label:'Apex Hunter',    mods:{str:8,  dex:6, vit:6},  hpBase:170, xpMod:1.90, behavior:'apex',        desc:'The dominant killer in its ecosystem.' }
];

const REGIONAL_ENEMY_BANDS = {
  thornwick:   { label:'Thornwick',   levelRange:[1,25],   modBonus:{str:0, dex:0, vit:0}, hpBonus:0,  xpBonus:0.00, theme:'thickets, farms, and forgotten roads' },
  ironport:    { label:'Ironport',    levelRange:[3,35],   modBonus:{str:1, dex:1, vit:0}, hpBonus:8,  xpBonus:0.05, theme:'alleys, docks, and warehouse districts' },
  ashwood:     { label:'Ashwood',     levelRange:[6,45],   modBonus:{str:1, dex:2, vit:1}, hpBonus:14, xpBonus:0.08, theme:'dark timber and cursed glades' },
  dustfall:    { label:'Dustfall',    levelRange:[8,55],   modBonus:{str:2, dex:1, vit:2}, hpBonus:22, xpBonus:0.12, theme:'broken plains and wind-cut ravines' },
  sunkenfen:   { label:'Sunkenfen',   levelRange:[10,70],  modBonus:{str:1, dex:1, vit:3}, hpBonus:30, xpBonus:0.16, theme:'bogwater ruins and corpse-lights' },
  blackstone:  { label:'Blackstone',  levelRange:[12,80],  modBonus:{str:3, dex:0, vit:3}, hpBonus:40, xpBonus:0.20, theme:'mountain passes and shattered strongholds' },
  frozennorth: { label:'Frozen North',levelRange:[20,90],  modBonus:{str:3, dex:1, vit:4}, hpBonus:54, xpBonus:0.25, theme:'glacial storms and icebound ruins' },
  veldrath:    { label:'Veldrath',    levelRange:[25,100], modBonus:{str:4, dex:2, vit:4}, hpBonus:68, xpBonus:0.30, theme:'blasted deserts and eldritch fractures' }
};

function clampLevel(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundTwo(value) {
  return Math.round(value * 100) / 100;
}

function createRegionalEnemyPack() {
  const generated = {};

  for (const [regionKey, band] of Object.entries(REGIONAL_ENEMY_BANDS)) {
    const [rMin, rMax] = band.levelRange;
    const span = Math.max(1, rMax - rMin);

    REGIONAL_ENEMY_ARCHETYPES.forEach((archetype, index) => {
      const step = Math.floor((span * index) / REGIONAL_ENEMY_ARCHETYPES.length);
      const baseStart = clampLevel(rMin + step, rMin, rMax - 2);
      const width = Math.max(4, Math.floor(span / 5));
      const baseEnd = clampLevel(baseStart + width, baseStart + 2, rMax);
      const regionScaledHp = archetype.hpBase + band.hpBonus + Math.floor(index * 3.5);

      generated[`${regionKey}_${archetype.key}`] = {
        label: `${band.label} ${archetype.label}`,
        levelRange: [baseStart, baseEnd],
        regions: [regionKey],
        mods: {
          str: archetype.mods.str + band.modBonus.str,
          dex: archetype.mods.dex + band.modBonus.dex,
          vit: archetype.mods.vit + band.modBonus.vit
        },
        hpBase: regionScaledHp,
        xpMod: roundTwo(archetype.xpMod + band.xpBonus),
        behavior: archetype.behavior,
        desc: `${archetype.desc} Common in ${band.theme}.`
      };
    });
  }

  return generated;
}

Object.assign(ENEMIES, createRegionalEnemyPack());

const BODY_PARTS = {
  throat: { label:'throat', hitMod:-0.35, damageMod:3.0, critBonus:0.15 },
  head:   { label:'head',   hitMod:-0.20, damageMod:2.0, critBonus:0.10 },
  back:   { label:'back',   hitMod:-0.10, damageMod:1.5, critBonus:0.08 },
  knee:   { label:'knee',   hitMod:-0.15, damageMod:1.2, critBonus:0.05 },
  ribs:   { label:'ribs',   hitMod:-0.05, damageMod:1.1, critBonus:0.00 },
  torso:  { label:'torso',  hitMod: 0.10, damageMod:1.0, critBonus:0.00 },
  leg:    { label:'leg',    hitMod:-0.05, damageMod:0.8, critBonus:0.00 },
  arm:    { label:'arm',    hitMod: 0.00, damageMod:0.7, critBonus:0.00 }
};

module.exports = {
  WORLD_TIERS,
  ENEMIES,
  BODY_PARTS,
};
