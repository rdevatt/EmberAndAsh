'use strict';

// =============================================================
// EMBER AND ASH — CONSTANTS
// Pure read-only game data. No logic. No state. No side effects.
// =============================================================


// =============================================
// BACKGROUNDS
// =============================================
const BACKGROUNDS = {
  farmboy:               { label:'Farmboy',                  genderReq:'male',   minAge:null, maxAge:22,  desc:'Raised tilling fields and tending livestock from childhood.',           mods:{str:2,  dex:0,  vit:1,  int:-1, wis:0,  cha:-1} },
  farmgirl:              { label:'Farmgirl',                 genderReq:'female', minAge:null, maxAge:22,  desc:'Raised in fields and hearth, resilient and hardworking.',              mods:{str:1,  dex:1,  vit:1,  int:-1, wis:1,  cha:-1} },
  streetrat:             { label:'Street Rat',               genderReq:null,     minAge:null, maxAge:22,  desc:'Survival on city streets taught you to be fast and cunning.',          mods:{str:-1, dex:3,  vit:-1, int:0,  wis:1,  cha:-1} },
  stablehand:            { label:'Stablehand',               genderReq:null,     minAge:null, maxAge:22,  desc:'You cared for horses and learned the quiet ways of animals.',          mods:{str:1,  dex:1,  vit:1,  int:-1, wis:1,  cha:-2} },
  apprentice:            { label:'Apprentice',               genderReq:null,     minAge:null, maxAge:22,  desc:'Bound to a tradesman, you learned skill and patience.',                mods:{str:-1, dex:2,  vit:-1, int:2,  wis:1,  cha:-1} },
  blacksmithsapprentice: { label:"Blacksmith's Apprentice",  genderReq:null,     minAge:null, maxAge:22,  desc:'Hammering iron since youth has built strength beyond your years.',     mods:{str:3,  dex:-1, vit:1,  int:-1, wis:-1, cha:0}  },
  fisherchild:           { label:"Fisher's Child",           genderReq:null,     minAge:null, maxAge:22,  desc:'Raised by the water, patient and attuned to natural rhythms.',         mods:{str:0,  dex:1,  vit:1,  int:-1, wis:2,  cha:-1} },
  shepherdchild:         { label:"Shepherd's Child",         genderReq:null,     minAge:null, maxAge:22,  desc:'Long days in the hills watching flocks made you calm and perceptive.', mods:{str:0,  dex:0,  vit:1,  int:-1, wis:3,  cha:-2} },
  innkeeperchild:        { label:"Innkeeper's Child",        genderReq:null,     minAge:null, maxAge:22,  desc:'Growing up serving travelers gave you a silver tongue and quick wits.', mods:{str:-1, dex:0,  vit:-1, int:1,  wis:0,  cha:3}  },
  woodcutterchild:       { label:"Woodcutter's Child",       genderReq:null,     minAge:null, maxAge:22,  desc:'The forest was your home. Labor was your daily bread.',                mods:{str:2,  dex:0,  vit:2,  int:-2, wis:0,  cha:-1} },
  herbalistchild:        { label:"Herbalist's Child",        genderReq:null,     minAge:null, maxAge:22,  desc:'Taught to identify plants and their uses from an early age.',          mods:{str:-1, dex:1,  vit:0,  int:2,  wis:2,  cha:-2} },
  millerchild:           { label:"Miller's Child",           genderReq:null,     minAge:null, maxAge:22,  desc:'Growing up at the mill, you know the rhythms of grain and season.',    mods:{str:1,  dex:0,  vit:1,  int:1,  wis:1,  cha:-2} },
  beggarchild:           { label:"Beggar's Child",           genderReq:null,     minAge:null, maxAge:22,  desc:'You learned to read people and take every opportunity you could.',     mods:{str:-1, dex:2,  vit:-1, int:0,  wis:1,  cha:1}  },
  sailorchild:           { label:"Sailor's Child",           genderReq:null,     minAge:null, maxAge:22,  desc:'Life near ships and the sea made you hardy and nimble.',               mods:{str:1,  dex:2,  vit:1,  int:-1, wis:0,  cha:-1} },
  guardchild:            { label:"Guard's Child",            genderReq:null,     minAge:null, maxAge:22,  desc:"Raised in a soldier's shadow, discipline is in your blood.",           mods:{str:1,  dex:1,  vit:1,  int:-1, wis:1,  cha:-1} },
  scribeapprentice:      { label:"Scribe's Apprentice",      genderReq:null,     minAge:null, maxAge:22,  desc:'Your youth was spent copying texts and learning letters.',              mods:{str:-2, dex:1,  vit:-1, int:3,  wis:1,  cha:0}  },
  farmer:                { label:'Farmer',                   genderReq:null,     minAge:23,   maxAge:null, desc:'Years of tilling soil built your body but narrowed your world.',      mods:{str:2,  dex:-1, vit:3,  int:-1, wis:1,  cha:-2} },
  streetthug:            { label:'Street Thug',              genderReq:null,     minAge:23,   maxAge:null, desc:'Violence and intimidation were your daily tools of survival.',        mods:{str:4,  dex:1,  vit:2,  int:-2, wis:-2, cha:-2} },
  soldier:               { label:'Soldier',                  genderReq:null,     minAge:23,   maxAge:null, desc:'Drilled in combat and discipline, you know war from the inside.',     mods:{str:3,  dex:2,  vit:2,  int:-2, wis:-2, cha:-1} },
  mercenary:             { label:'Mercenary',                genderReq:null,     minAge:23,   maxAge:null, desc:'Fighting for coin sharpened your edge and hardened your heart.',      mods:{str:2,  dex:2,  vit:2,  int:-1, wis:-2, cha:-2} },
  fisherman:             { label:'Fisherman',                genderReq:null,     minAge:23,   maxAge:null, desc:'Years at sea gave you endurance, patience, and calloused hands.',     mods:{str:1,  dex:2,  vit:2,  int:-1, wis:2,  cha:-4} },
  shepherd:              { label:'Shepherd',                 genderReq:null,     minAge:23,   maxAge:null, desc:'Long solitary watches over your flock made you wise and patient.',    mods:{str:0,  dex:0,  vit:2,  int:-1, wis:4,  cha:-3} },
  innkeeper:             { label:'Innkeeper',                genderReq:null,     minAge:23,   maxAge:null, desc:'Running a busy inn sharpened your tongue and your mind.',             mods:{str:-1, dex:0,  vit:-1, int:2,  wis:1,  cha:3}  },
  blacksmith:            { label:'Blacksmith',               genderReq:null,     minAge:23,   maxAge:null, desc:'Iron and flame have forged you as surely as the metal you work.',     mods:{str:4,  dex:0,  vit:2,  int:-2, wis:-1, cha:-2} },
  woodcutter:            { label:'Woodcutter',               genderReq:null,     minAge:23,   maxAge:null, desc:'Years of felling trees built iron in your arms and silence in your mind.', mods:{str:3, dex:-1, vit:3, int:-2, wis:0, cha:-2} },
  herbalist:             { label:'Herbalist',                genderReq:null,     minAge:23,   maxAge:null, desc:'Knowledge of plants, remedies, and nature is your greatest tool.',    mods:{str:-2, dex:1,  vit:0,  int:3,  wis:3,  cha:-3} },
  wanderer:              { label:'Wanderer',                 genderReq:null,     minAge:23,   maxAge:null, desc:"The road was your home. You've seen much and settled nowhere.",        mods:{str:0,  dex:2,  vit:2,  int:0,  wis:2,  cha:-4} },
  dockworker:            { label:'Dockworker',               genderReq:null,     minAge:23,   maxAge:null, desc:'Heavy lifting and rough company made you tough and plain-spoken.',    mods:{str:3,  dex:1,  vit:3,  int:-2, wis:-2, cha:-2} },
  tanner:                { label:'Tanner',                   genderReq:null,     minAge:23,   maxAge:null, desc:'The pungent work of curing hides belongs to those with strong stomachs.', mods:{str:1, dex:2, vit:2, int:0, wis:0, cha:-4} },
  miner:                 { label:'Miner',                    genderReq:null,     minAge:23,   maxAge:null, desc:'The dark and stone of the mines built you like a mountain.',           mods:{str:3,  dex:-1, vit:4,  int:-2, wis:-1, cha:-2} },
  carpenter:             { label:'Carpenter',                genderReq:null,     minAge:23,   maxAge:null, desc:'Skilled with wood and measure, you think carefully before you act.',  mods:{str:2,  dex:2,  vit:1,  int:1,  wis:0,  cha:-4} },
  sailor:                { label:'Sailor',                   genderReq:null,     minAge:23,   maxAge:null, desc:'Years at sea seasoned you with salt, hardship, and rough humor.',     mods:{str:1,  dex:3,  vit:2,  int:-1, wis:0,  cha:-3} },
  guard:                 { label:'Guard',                    genderReq:null,     minAge:23,   maxAge:null, desc:'Standing watch taught you alertness, obedience, and boredom.',        mods:{str:2,  dex:1,  vit:2,  int:-1, wis:0,  cha:-2} },
  scribe:                { label:'Scribe',                   genderReq:null,     minAge:23,   maxAge:null, desc:'Years of writing and drafting sharpened your mind and weakened your body.', mods:{str:-2, dex:1, vit:-1, int:4, wis:2, cha:-2} },
  journeyman:            { label:'Journeyman Craftsman',     genderReq:null,     minAge:23,   maxAge:null, desc:'A master of your trade but never settled, always drifting.',           mods:{str:0,  dex:3,  vit:0,  int:2,  wis:1,  cha:-4} },
  ratcatcher:            { label:'Rat Catcher',              genderReq:null,     minAge:23,   maxAge:null, desc:'A thankless profession that demands quick hands and sharp eyes.',      mods:{str:-1, dex:3,  vit:1,  int:-1, wis:2,  cha:-2} },
  peasant:               { label:'Peasant',                  genderReq:null,     minAge:null, maxAge:null, desc:'The lowest rung of society. You know toil and little else.',           mods:{str:1,  dex:0,  vit:1,  int:-1, wis:1,  cha:-1} },
  villager:              { label:'Villager',                 genderReq:null,     minAge:null, maxAge:null, desc:'Community life gave you social graces and modest horizons.',           mods:{str:0,  dex:0,  vit:0,  int:1,  wis:1,  cha:1}  },
  orphan:                { label:'Orphan',                   genderReq:null,     minAge:null, maxAge:null, desc:'Fending for yourself early forged resilience you never asked for.',   mods:{str:0,  dex:2,  vit:1,  int:0,  wis:1,  cha:-2} },
  nomad:                 { label:'Nomad',                    genderReq:null,     minAge:null, maxAge:null, desc:'Born to a wandering people, the road is your truest homeland.',        mods:{str:1,  dex:2,  vit:1,  int:-1, wis:1,  cha:-2} },
  exile:                 { label:'Exile',                    genderReq:null,     minAge:null, maxAge:null, desc:'Cast out from somewhere, you carry a secret and an old wound.',       mods:{str:0,  dex:1,  vit:1,  int:1,  wis:2,  cha:-3} },
  outcast:               { label:'Outcast',                  genderReq:null,     minAge:null, maxAge:null, desc:'Shunned by society for reasons that may or may not be fair.',         mods:{str:1,  dex:1,  vit:1,  int:0,  wis:1,  cha:-2} },
  hunter:                { label:'Hunter',                   genderReq:null,     minAge:null, maxAge:null, desc:'The wild is your domain. You track, trap, and kill with precision.',   mods:{str:1,  dex:3,  vit:1,  int:-1, wis:2,  cha:-4} },
  trapper:               { label:'Trapper',                  genderReq:null,     minAge:null, maxAge:null, desc:'Patience and cunning set your snares better than any blade.',          mods:{str:0,  dex:2,  vit:1,  int:1,  wis:2,  cha:-4} },
  // Magical / scholarly — these grant starting spells
  mageapprentice:        { label:"Mage's Apprentice",        genderReq:null,     minAge:null, maxAge:22,   desc:'Bound to an arcane scholar, you learned the theory and practice of basic spellwork.',            mods:{str:-2, dex:0,  vit:-1, int:3,  wis:2,  cha:-1}, isMagical:true, startingSpell:'mana_bolt'   },
  acolyte:               { label:'Temple Acolyte',           genderReq:null,     minAge:null, maxAge:null, desc:'Trained in a house of worship, you received basic channeling instruction alongside devotion.',    mods:{str:-1, dex:0,  vit:-1, int:1,  wis:3,  cha:0 }, isMagical:true, startingSpell:'divine_bolt' },
  hedge_witch:           { label:'Hedge Witch / Warlock',    genderReq:null,     minAge:null, maxAge:null, desc:'Self-taught in the old ways. Your magic is rough, folk-sourced, and undeniably real.',           mods:{str:-1, dex:1,  vit:0,  int:2,  wis:2,  cha:-2}, isMagical:true, startingSpell:'mana_bolt'   },
};


// =============================================
// REGIONS
// =============================================
const REGIONS = {
  thornwick:   { label:'Thornwick Valley',     desc:'A quiet farming valley hemmed by dark forest. Trouble is modest — but growing.',                          monsterLevel:[1,4],   cityPresent:false, monsters:['Timber Wolves','Road Bandits','Forest Goblins','Cave Rat Swarms','Goblin Shamans'],          rareMonsters:['Cave Troll','Dire Boar','Bandit Captain'],              flavor:'rolling farmland, muddy roads, and treelines that feel closer every year',                          beastOpening:"A road wolf the size of a pony crashes into the mud at your feet — brought down by someone else's arrow before it could reach you" },
  ironport:    { label:'Ironport City',        desc:'A sprawling harbor city of trade and crime. Wealth and rot in equal measure.',                             monsterLevel:[3,7],   cityPresent:true,  monsters:['City Thugs','Corrupt Watchmen','Dockside Cutthroats','Smugglers','Harbour Beasts'],          rareMonsters:['Crime Lord Enforcer','Sea Serpent','Assassin Guild Member'], flavor:'salt-stained cobblestones, crowded markets, and shadows that watch you back',                        beastOpening:"A bloated harbour beast — part eel, part nightmare — stops thrashing as the man beside you wrenches his blade free from its skull" },
  ashwood:     { label:'The Ashwood',          desc:'An ancient forest where old magic lingers and the wildlife has gone wrong.',                               monsterLevel:[4,8],   cityPresent:false, monsters:['Feral Druids','Twisted Stags','Ash Hounds','Corrupted Dryads','Wood Wraiths'],             rareMonsters:['Elder Treant','Fae Knight','Dire Wolf Pack'],            flavor:'silver bark trees, eerie silence, and light that bends at wrong angles',                            beastOpening:"A corrupted stag — its antlers fused into bone blades, its eyes black and burning — drops mid-charge at the hand of a stranger who doesn't stay to explain" },
  dustfall:    { label:'Dustfall Plains',      desc:'Endless windswept grassland crossed by war bands and desperate travelers.',                                monsterLevel:[2,5],   cityPresent:false, monsters:['Plains Orcs','Dust Bandits','Giant Scorpions','Hyena Packs','Orc Raiders'],                rareMonsters:['Orc Warchief','Plains Basilisk','Dust Elemental'],      flavor:'amber grass, open sky, and the wind carrying the smell of something dead',                         beastOpening:"An orc raider twice your size crumples face-first into the dust — the crossbow bolt through its eye placed by a hooded figure already disappearing into the grass" },
  blackstone:  { label:'Blackstone Mountains', desc:'Jagged peaks riddled with old mines and new monsters. Danger at every altitude.',                         monsterLevel:[5,10],  cityPresent:false, monsters:['Mountain Trolls','Stone Goblins','Wyvern Hatchlings','Cave Giants','Rock Golems'],          rareMonsters:['Wyvern','Frost Giant','Mountain Dragon Whelp'],         flavor:'black granite walls, howling wind, and the screaming of things in the deep dark',                  beastOpening:"A wyvern hatchling the size of a horse plunges from the cliff face dead — the warrior who brought it down is already climbing back toward the peak" },
  sunkenfen:   { label:'The Sunken Fens',      desc:'A vast swampland haunted by the restless dead and the cults who worship them.',                           monsterLevel:[4,9],   cityPresent:false, monsters:['Bog Zombies','Fen Witches','Swamp Serpents','Cultist Acolytes','Marsh Ghouls'],           rareMonsters:['Lich Cultist','Bog Giant','Ancient Crocodilian'],        flavor:'black water, hanging moss, and a smell like old graves after rain',                                 beastOpening:"A bog horror — half-man, half-rot, completely wrong — finally stops moving in the black water as a runic blade dissolves through its chest at the hand of a robed stranger" },
  veldrath:    { label:'The Veldrath Desert',  desc:'A scorched wasteland of ruined cities and ancient things that should not still breathe.',                  monsterLevel:[7,13],  cityPresent:false, monsters:['Sand Wraiths','Desert Scorpion Lords','Mummy Guardians','Djinn Fragments','Sand Worms'], rareMonsters:['Elder Mummy','Bound Djinn','Sand Dragon'],               flavor:'red dunes, crumbling stone empires, and a sun that wants you dead',                                 beastOpening:"A sand wraith — ancient, screaming, trailing centuries of hate — dissolves mid-lunge into blowing grit, unraveled by a ward carved in the air by a figure you barely glimpse" },
  frozennorth: { label:'The Frozen North',     desc:'A killing land of endless winter. The cold alone has ended many stories here.',                           monsterLevel:[6,12],  cityPresent:false, monsters:['Frost Wolves','Ice Wraiths','Frozen Trolls','Northern Raiders','Snow Leopards'],          rareMonsters:['Frost Giant','Ice Drake','Glacial Elemental'],          flavor:'white silence, breath turning to fog, and trees that crack like bones in the cold',                beastOpening:"A frost wolf larger than a horse collapses into the snow beside you, ice-blue blood spreading wide — killed by a spear thrown from somewhere behind you by a face you won't see again" }
};


// =============================================
// ENEMIES
// =============================================
const ENEMIES = {
  giantRat:        { label:'Giant Rat',         levelRange:[1,3],   regions:['thornwick','ironport','sunkenfen'],              mods:{str:-3,dex:2, vit:-2}, hpBase:8,   xpMod:0.9, behavior:'pack',       desc:'Fast and vicious in numbers. Fragile alone.' },
  goblin:          { label:'Goblin',             levelRange:[1,5],   regions:['thornwick','ashwood','blackstone','dustfall'],   mods:{str:-2,dex:3, vit:-2}, hpBase:12,  xpMod:1.0, behavior:'pack',       desc:'Small and cunning. Weak alone, dangerous in groups.' },
  imp:             { label:'Imp',                levelRange:[1,4],   regions:['ashwood','sunkenfen','veldrath'],                mods:{str:-3,dex:4, vit:-3}, hpBase:8,   xpMod:1.0, behavior:'cowardly',   desc:'Tiny, winged, irritating. Fast and hard to hit.' },
  banditThug:      { label:'Bandit Thug',        levelRange:[2,7],   regions:['thornwick','dustfall','ironport'],               mods:{str:1, dex:0, vit:0},  hpBase:20,  xpMod:1.0, behavior:'aggressive', desc:'A desperate human with crude weapons and nothing to lose.' },
  forestWolf:      { label:'Forest Wolf',        levelRange:[2,6],   regions:['thornwick','ashwood'],                          mods:{str:0, dex:2, vit:1},  hpBase:22,  xpMod:1.0, behavior:'pack',       desc:'A large wolf. Circling, testing, then lunging.' },
  orcWarrior:      { label:'Orc Warrior',        levelRange:[5,15],  regions:['dustfall','blackstone','thornwick'],             mods:{str:3, dex:-1,vit:2},  hpBase:40,  xpMod:1.1, behavior:'aggressive', desc:'Battle-hardened. Slow to learn, fast to kill.' },
  darkElfScout:    { label:'Dark Elf Scout',     levelRange:[6,14],  regions:['ashwood','sunkenfen'],                          mods:{str:0, dex:4, vit:-1}, hpBase:30,  xpMod:1.1, behavior:'ambush',     desc:'Swift and precise. Strikes from shadow, vanishes just as fast.' },
  skeletonWarrior: { label:'Skeleton Warrior',   levelRange:[4,12],  regions:['sunkenfen','veldrath'],                         mods:{str:1, dex:-1,vit:0},  hpBase:28,  xpMod:1.0, behavior:'mindless',   desc:'Animated bone. No fear. No pain. No retreat.' },
  bogZombie:       { label:'Bog Zombie',         levelRange:[3,10],  regions:['sunkenfen'],                                    mods:{str:2, dex:-2,vit:3},  hpBase:38,  xpMod:1.0, behavior:'mindless',   desc:'Slow and relentless. Hard to put down permanently.' },
  corruptedDryad:  { label:'Corrupted Dryad',    levelRange:[6,15],  regions:['ashwood'],                                      mods:{str:1, dex:2, vit:1},  hpBase:35,  xpMod:1.1, behavior:'territorial',desc:'A nature spirit twisted by dark magic. Unpredictable and fast.' },
  caveTroll:       { label:'Cave Troll',         levelRange:[10,20], regions:['blackstone','thornwick','ashwood'],             mods:{str:5, dex:-3,vit:4},  hpBase:70,  xpMod:1.2, behavior:'aggressive', desc:'Massive. Regenerates slowly. One hit can break bones.' },
  banditCaptain:   { label:'Bandit Captain',     levelRange:[8,18],  regions:['thornwick','dustfall','ironport'],               mods:{str:2, dex:2, vit:1},  hpBase:55,  xpMod:1.2, behavior:'tactical',   desc:'Experienced. Uses positioning, feints, and dirty tricks.' },
  wyvernHatchling: { label:'Wyvern Hatchling',   levelRange:[12,20], regions:['blackstone'],                                   mods:{str:4, dex:2, vit:2},  hpBase:65,  xpMod:1.3, behavior:'aggressive', desc:'Not fully grown but venomous and fast. Its tail is the real threat.' },
  stoneGolem:      { label:'Stone Golem',        levelRange:[12,25], regions:['blackstone','veldrath'],                        mods:{str:6, dex:-4,vit:6},  hpBase:90,  xpMod:1.3, behavior:'territorial',desc:'Living rock. Hits like a falling wall. Almost no weak points.' },
  ogre:            { label:'Ogre',               levelRange:[18,35], regions:['blackstone','dustfall','ashwood'],              mods:{str:8, dex:-4,vit:6},  hpBase:120, xpMod:1.3, behavior:'aggressive', desc:'Brute force incarnate. One clean hit can end a fight permanently.' },
  lichCultist:     { label:'Lich Cultist',       levelRange:[20,35], regions:['sunkenfen','veldrath'],                         mods:{str:0, dex:2, vit:-1}, hpBase:60,  xpMod:1.4, behavior:'tactical',   desc:'A mage who sold their soul. Powerful magic, fragile body.' },
  vampireSpawn:    { label:'Vampire Spawn',      levelRange:[22,40], regions:['sunkenfen','ashwood','ironport'],               mods:{str:4, dex:5, vit:2},  hpBase:100, xpMod:1.4, behavior:'predator',   desc:'Fast, bloodthirsty. Heals from the damage it deals.' },
  frostGiant:      { label:'Frost Giant',        levelRange:[25,45], regions:['frozennorth','blackstone'],                    mods:{str:10,dex:-2,vit:8},  hpBase:180, xpMod:1.5, behavior:'aggressive', desc:'A towering wall of ice and fury. Devastating sweeping attacks.' },
  demonKnight:     { label:'Demon Knight',       levelRange:[40,60], regions:['veldrath','sunkenfen'],                         mods:{str:8, dex:3, vit:6},  hpBase:200, xpMod:1.6, behavior:'tactical',   desc:'A warrior bound to dark forces. Resistant to normal weapons.' },
  elderTreeant:    { label:'Elder Treant',       levelRange:[35,55], regions:['ashwood'],                                      mods:{str:9, dex:-5,vit:10}, hpBase:250, xpMod:1.5, behavior:'territorial',desc:'Ancient walking tree. Enormous endurance. Weak to fire.' },
  iceWraith:       { label:'Ice Wraith',         levelRange:[30,50], regions:['frozennorth'],                                  mods:{str:3, dex:7, vit:1},  hpBase:90,  xpMod:1.5, behavior:'predator',   desc:'Barely corporeal. Draining to fight. Hard to land a solid hit.' },
  sandDrake:       { label:'Sand Drake',         levelRange:[45,65], regions:['veldrath'],                                     mods:{str:7, dex:4, vit:7},  hpBase:220, xpMod:1.7, behavior:'predator',   desc:'A desert predator. Spits acid. Bursts from the sand without warning.' },
  elderLich:       { label:'Elder Lich',         levelRange:[65,85], regions:['sunkenfen','veldrath'],                         mods:{str:2, dex:4, vit:5},  hpBase:320, xpMod:2.0, behavior:'tactical',   desc:'An ancient undead spellcaster. Commands armies of the dead.' },
  wyvern:          { label:'Wyvern',             levelRange:[60,80], regions:['blackstone'],                                   mods:{str:10,dex:5, vit:8},  hpBase:380, xpMod:1.9, behavior:'predator',   desc:'Fully grown. Venomous, armored, intelligent enough to be cruel.' },
  ancientDragon:   { label:'Ancient Dragon',     levelRange:[85,100],regions:['blackstone','veldrath','frozennorth'],          mods:{str:15,dex:3, vit:15}, hpBase:700, xpMod:3.0, behavior:'apex',       desc:'A creature of legend. Few who see one live to describe it.' },
  archlich:        { label:'Archlich',           levelRange:[90,100],regions:['veldrath','sunkenfen'],                         mods:{str:3, dex:6, vit:8},  hpBase:600, xpMod:2.5, behavior:'tactical',   desc:'The pinnacle of undead mastery. Reality warps in its presence.' }
};


// =============================================
// BODY PARTS
// =============================================
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


// =============================================
// GEAR QUALITY TIERS
// =============================================
const GEAR_QUALITIES = [
  { tier:0, label:'Crude',       levelReq:1,  weaponBonus:1,  armorLevel:0  },
  { tier:1, label:'Common',      levelReq:1,  weaponBonus:3,  armorLevel:1  },
  { tier:2, label:'Simple',      levelReq:5,  weaponBonus:5,  armorLevel:2  },
  { tier:3, label:'Decent',      levelReq:10, weaponBonus:8,  armorLevel:3  },
  { tier:4, label:'Quality',     levelReq:20, weaponBonus:12, armorLevel:5  },
  { tier:5, label:'Fine',        levelReq:35, weaponBonus:17, armorLevel:7  },
  { tier:6, label:'Superior',    levelReq:50, weaponBonus:23, armorLevel:10 },
  { tier:7, label:'Exceptional', levelReq:65, weaponBonus:30, armorLevel:13 },
  { tier:8, label:'Masterwork',  levelReq:80, weaponBonus:38, armorLevel:17 },
  { tier:9, label:'Legendary',   levelReq:95, weaponBonus:48, armorLevel:22 }
];


// =============================================
// STARTING GEAR BY BACKGROUND
// =============================================
const STARTING_GEAR = {
  farmboy:               { weapon:{ name:'worn pitchfork',            tier:0 }, armor:null },
  farmgirl:              { weapon:{ name:'wood-handled sickle',        tier:0 }, armor:null },
  streetrat:             { weapon:{ name:'chipped street knife',       tier:0 }, armor:null },
  stablehand:            { weapon:{ name:'heavy wooden mallet',        tier:0 }, armor:null },
  apprentice:            { weapon:{ name:'worn work knife',            tier:0 }, armor:null },
  blacksmithsapprentice: { weapon:{ name:'heavy iron hammer',          tier:1 }, armor:null },
  fisherchild:           { weapon:{ name:'gutting knife',              tier:0 }, armor:null },
  shepherdchild:         { weapon:{ name:'gnarled wooden staff',       tier:0 }, armor:null },
  innkeeperchild:        { weapon:{ name:'kitchen knife',              tier:0 }, armor:null },
  woodcutterchild:       { weapon:{ name:'small hand axe',             tier:0 }, armor:null },
  herbalistchild:        { weapon:{ name:'herb-cutting knife',         tier:0 }, armor:null },
  millerchild:           { weapon:{ name:'worn grain shovel',          tier:0 }, armor:null },
  beggarchild:           { weapon:{ name:'broken bottle shard',        tier:0 }, armor:null },
  sailorchild:           { weapon:{ name:'belaying pin',               tier:0 }, armor:null },
  guardchild:            { weapon:{ name:'wooden practice sword',      tier:0 }, armor:{ name:'padded training vest',   tier:0 } },
  scribeapprentice:      { weapon:{ name:'letter opener knife',        tier:0 }, armor:null },
  farmer:                { weapon:{ name:'worn pitchfork',             tier:1 }, armor:null },
  streetthug:            { weapon:{ name:'heavy wooden club',          tier:1 }, armor:null },
  soldier:               { weapon:{ name:'simple iron sword',          tier:1 }, armor:{ name:'battered leather armor', tier:1 } },
  mercenary:             { weapon:{ name:'worn short sword',           tier:1 }, armor:{ name:'patched leather armor',  tier:0 } },
  fisherman:             { weapon:{ name:'broad gutting knife',        tier:1 }, armor:null },
  shepherd:              { weapon:{ name:'iron-shod staff',            tier:1 }, armor:null },
  innkeeper:             { weapon:{ name:'heavy bottle',               tier:0 }, armor:null },
  blacksmith:            { weapon:{ name:'heavy iron hammer',          tier:2 }, armor:null },
  woodcutter:            { weapon:{ name:'worn felling axe',           tier:1 }, armor:null },
  herbalist:             { weapon:{ name:'long herb knife',            tier:1 }, armor:null },
  wanderer:              { weapon:{ name:'road-worn walking staff',    tier:1 }, armor:null },
  dockworker:            { weapon:{ name:'heavy dock hook',            tier:1 }, armor:null },
  tanner:                { weapon:{ name:'tanning knife',              tier:1 }, armor:null },
  miner:                 { weapon:{ name:'worn mining pickaxe',        tier:1 }, armor:null },
  carpenter:             { weapon:{ name:'wood-splitting hatchet',     tier:1 }, armor:null },
  sailor:                { weapon:{ name:"sailor's cutlass",           tier:1 }, armor:null },
  guard:                 { weapon:{ name:'copper short sword',         tier:1 }, armor:{ name:'worn leather armor',     tier:1 } },
  scribe:                { weapon:{ name:'long letter knife',          tier:0 }, armor:null },
  journeyman:            { weapon:{ name:"craftsman's hammer",         tier:1 }, armor:null },
  ratcatcher:            { weapon:{ name:"ratcatcher's club",          tier:0 }, armor:null },
  peasant:               { weapon:{ name:'wooden farm tool',           tier:0 }, armor:null },
  villager:              { weapon:{ name:'simple kitchen knife',       tier:0 }, armor:null },
  orphan:                { weapon:{ name:'chipped pocket knife',       tier:0 }, armor:null },
  nomad:                 { weapon:{ name:"nomad's hunting spear",      tier:1 }, armor:null },
  exile:                 { weapon:{ name:"traveler's knife",           tier:0 }, armor:null },
  outcast:               { weapon:{ name:'crude sharpened stick',      tier:0 }, armor:null },
  hunter:                { weapon:{ name:'skinning knife',             tier:1 }, armor:null, ranged:{ name:'simple hunting bow', tier:1 } },
  trapper:               { weapon:{ name:"trapper's long knife",       tier:1 }, armor:null },
  // Magical backgrounds — no martial weapon, spell instead of bow
  mageapprentice:        { weapon:{ name:'gnarled focus staff',        tier:0 }, armor:null },
  acolyte:               { weapon:{ name:'simple wooden mace',         tier:0 }, armor:null },
  hedge_witch:           { weapon:{ name:'knotted walking staff',       tier:0 }, armor:null },
};
// NOTE: ALL characters receive the universal clothing set at creation regardless of background:
// - Basic linen shirt (armorLevel 1)
// - Plain trousers (armorLevel 1)
// - Worn leather shoes (armorLevel 1)
// - Simple belt knife (damage 1–2, 1 attack) — overridden by background weapon if better
// This is assembled in getStartingGear(). STARTING_GEAR entries add ON TOP of this base.


// =============================================
// COMBAT CLASSES
// =============================================
const CLASSES = {
  fighter:   { label:'Fighter',   desc:'A disciplined warrior honed by hard experience.',             affinities:['attack','charge','strike','block','parry','stance','guard','sword','shield','weapon','tactical','feint','combat','draw blade','fighting'],                        requirement:15, statPerLevel:{str:1,vit:1},   freePointsPerLevel:1, unlockMessage:"Through battle after battle your fighting instincts have crystallized into something more. You have earned the path of the Fighter." },
  barbarian: { label:'Barbarian', desc:'A warrior who channels primal fury into devastating power.',  affinities:['rage','fury','smash','crush','rampage','roar','berserk','savage','howl','brutal','frenzy','primal','wild swing'],                                               requirement:15, statPerLevel:{str:2,vit:1},   freePointsPerLevel:1, unlockMessage:"A fire has grown in your blood — not discipline, but something older and louder. You have earned the path of the Barbarian." },
  rogue:     { label:'Rogue',     desc:'A master of shadows and striking from unseen angles.',        affinities:['sneak','hide','shadow','stealth','backstab','poison','pickpocket','lockpick','deceive','disguise','slip','silent','dagger','ambush'],                            requirement:15, statPerLevel:{dex:2},         freePointsPerLevel:1, unlockMessage:"Darkness has become your ally. You move through the world unseen and strike before you are known. You have earned the path of the Rogue." },
  ranger:    { label:'Ranger',    desc:'A hunter and tracker at home in the wild or in combat.',      affinities:['aim','shoot','arrow','bow','track','hunt','scout','nature','survival','wilderness','trap','animal','forest','stalk','trail'],                                  requirement:15, statPerLevel:{dex:1,wis:1},   freePointsPerLevel:1, unlockMessage:"The wild has taught you its language. The hunt has sharpened your senses. You have earned the path of the Ranger." },
  monk:      { label:'Monk',      desc:'A warrior who uses body, breath, and focus as weapons.',      affinities:['punch','kick','unarmed','kata','meditate','breathe','palm strike','discipline','focus','chi','inner strength','open hand','center'],                           requirement:15, statPerLevel:{dex:1,wis:1},   freePointsPerLevel:1, unlockMessage:"Your body has become a weapon honed through pain and patience. You have earned the path of the Monk." },
  paladin:   { label:'Paladin',   desc:'A holy warrior who fights with divine conviction.',           affinities:['pray','divine','holy','righteous','protect','defend','oath','justice','bless','honor','sacred','vow','shield the weak'],                                       requirement:15, statPerLevel:{str:1,cha:1},   freePointsPerLevel:1, unlockMessage:"Your deeds have drawn the attention of something greater than yourself. You have earned the path of the Paladin." },
  cleric:    { label:'Cleric',    desc:'A servant of divine power who heals and smites.',             affinities:['heal','pray','bless','divine','worship','ceremony','temple','faith','light','cure','ward','restoration','lay hands','channel'],                                requirement:15, statPerLevel:{wis:1,cha:1},   freePointsPerLevel:1, unlockMessage:"Your faith has been answered. Power flows through your prayers. You have earned the path of the Cleric." },
  druid:     { label:'Druid',     desc:'A guardian of nature who draws on wild forces.',              affinities:['nature','wild','plant','earth','shapeshift','grove','moon','growth','beast form','spirit','feral','commune','speak to animals','root'],                        requirement:15, statPerLevel:{wis:1,vit:1},   freePointsPerLevel:1, unlockMessage:"The line between yourself and the living world has blurred. You have earned the path of the Druid." },
  wizard:    { label:'Wizard',    desc:'A scholar of arcane forces who bends reality through study.', affinities:['study','spell','arcane','magic','tome','scroll','incantation','formula','rune','sigil','ritual','cast','invoke','research','enchant'],                         requirement:15, statPerLevel:{int:2},         freePointsPerLevel:1, unlockMessage:"The patterns beneath reality have become legible to you. You have earned the path of the Wizard." },
  sorcerer:  { label:'Sorcerer',  desc:'A wielder of innate magical power surging from within.',      affinities:['surge','blood magic','raw power','unleash','overflow','wild magic','born with','instinct magic','magic erupts'],                                              requirement:12, statPerLevel:{int:1,cha:1},   freePointsPerLevel:1, unlockMessage:"It comes from inside — not learned but born. The power was always yours. You have earned the path of the Sorcerer." },
  warlock:   { label:'Warlock',   desc:'A seeker of forbidden power through dark pacts.',             affinities:['dark pact','consume','drain','forbidden','eldritch','patron','void','dark bargain','soul pact','dark power','make a deal'],                                    requirement:12, statPerLevel:{int:1,cha:1},   freePointsPerLevel:1, unlockMessage:"Something answered your hunger — something old and hungry itself. A bargain was struck. You have earned the path of the Warlock." },
  bard:      { label:'Bard',      desc:'A performer whose charm and stories reshape the world.',      affinities:['sing','song','perform','music','story','charm','persuade','inspire','instrument','tale','poem','ballad','entertain','captivate'],                              requirement:12, statPerLevel:{cha:2},         freePointsPerLevel:1, unlockMessage:"People listen when you speak. The world tilts slightly when you want it to. You have earned the path of the Bard." }
};


// =============================================
// PROFESSIONS
// =============================================
const PROF_LEVEL_XP = [0, 0, 50, 150, 300, 500];

const PROFESSIONS = {
  blacksmith: { label:'Blacksmith', desc:'You forge weapons, armor, and tools from raw metal.',             affinities:['forge','smith','craft weapon','craft armor','hammer','anvil','metal','iron','steel','temper','sharpen blade','work the metal','smelt','ore'], requirement:10, primaryStats:['str'],       levels:[ {label:'Apprentice Smith',    desc:'Basic iron tools and rough weapons.',              statBonus:{str:1}},      {label:'Journeyman Smith',    desc:'Your blades hold an edge. Your armor fits true.', statBonus:{str:1,vit:1}}, {label:'Skilled Smith',       desc:'You work steel with precision.',                  statBonus:{str:1}},      {label:'Master Smith',        desc:'Nobles commission your work.',                    statBonus:{str:2}},      {label:'Legendary Smith',     desc:'Given rare materials you can craft weapons of power.',statBonus:{str:2,vit:1}} ] },
  alchemist:  { label:'Alchemist',  desc:'You brew potions, transmute substances, unlock chemical secrets.',affinities:['brew','potion','alchemy','mix','compound','extract','distil','reagent','ingredient','herbalism','transmute','concoction'],                requirement:10, primaryStats:['int'],       levels:[ {label:'Novice Alchemist',    desc:'Simple healing drafts and basic reagents.',       statBonus:{int:1}},      {label:'Apprentice Alchemist',desc:'Your potions are reliable.',                     statBonus:{int:1,wis:1}}, {label:'Skilled Alchemist',   desc:'Potions of real effect. Basic poisons.',          statBonus:{int:1}},      {label:'Master Alchemist',    desc:'Your brews can turn the tide of battles.',        statBonus:{int:2}},      {label:'Grand Alchemist',     desc:'Transformation itself has become legible to you.',statBonus:{int:2,wis:1}} ] },
  scout:      { label:'Scout',      desc:'You read terrain, track quarry, and move unseen.',               affinities:['scout','track','trail','footprint','survey','patrol','map','observe','watch','reconnoiter','follow tracks','read the land'],             requirement:10, primaryStats:['dex','wis'], levels:[ {label:'Lookout',             desc:'Watch without being watched.',                   statBonus:{dex:1}},      {label:'Pathfinder',          desc:'Track men or beasts across most terrain.',        statBonus:{dex:1,wis:1}}, {label:'Ranger Scout',        desc:'Move through hostile territory like smoke.',      statBonus:{dex:1}},      {label:'Master Scout',        desc:'No terrain bars you.',                            statBonus:{dex:1,wis:1}}, {label:'Ghost Walker',        desc:'You pass through the world as though never there.',statBonus:{dex:2}} ] },
  merchant:   { label:'Merchant',   desc:'You buy low and sell high, reading people and markets alike.',   affinities:['sell','buy','trade','barter','haggle','market','coin','price','deal','negotiate','goods','commerce','profit','open shop','run shop','shopkeeper','stall','wares'], requirement:10, primaryStats:['cha','int'], levels:[ {label:'Peddler',             desc:'You know how to make a sale.',                   statBonus:{cha:1}},      {label:'Trader',              desc:'Your reputation opens doors.',                    statBonus:{cha:1,int:1}}, {label:'Merchant',            desc:'Supply, demand, and the art of the deal.',        statBonus:{cha:1}},      {label:'Prosperous Merchant', desc:'Your name carries weight in trading circles.',    statBonus:{cha:2}},      {label:'Trade Lord',          desc:'Whole economies shift around your decisions.',    statBonus:{cha:2,int:1}} ] },
  cook:       { label:'Cook',       desc:'You prepare food that heals, sustains, and inspires.',           affinities:['cook','prepare food','recipe','meal','roast','boil','bake','spice','stew','feast','provision','ration'],                                 requirement:10, primaryStats:['vit','wis'], levels:[ {label:'Camp Cook',           desc:'Field rations edible.',                          statBonus:{vit:1}},      {label:'Village Cook',        desc:'Your meals sustain and comfort.',                 statBonus:{vit:1,wis:1}}, {label:'Skilled Chef',        desc:'Restore morale beyond a normal meal.',            statBonus:{vit:1}},      {label:'Master Chef',         desc:'Nobles pay handsomely.',                          statBonus:{vit:2}},      {label:'Legendary Chef',      desc:'Your meals carry mild restorative quality.',      statBonus:{vit:2,wis:1}} ] },
  hunter:     { label:'Hunter',     desc:'You track, stalk, and harvest game for food and profit.',        affinities:['hunt animal','stalk','snare','game','pelt','field dress','quarry','set a trap','lay a trap','harvest','bring down'],                    requirement:10, primaryStats:['dex','wis'], levels:[ {label:'Novice Hunter',       desc:'Small game reliably.',                           statBonus:{dex:1}},      {label:'Hunter',              desc:'Deer, boar, and common prey fall to you.',        statBonus:{dex:1,wis:1}}, {label:'Skilled Hunter',      desc:'Track and take dangerous game.',                  statBonus:{dex:1}},      {label:'Master Hunter',       desc:'Monster contracts. Few prey outlast your patience.',statBonus:{dex:2}},   {label:'Legendary Hunter',    desc:'The most dangerous things fear something in return.',statBonus:{dex:2,wis:1}} ] },
  scholar:    { label:'Scholar',    desc:'You accumulate knowledge through study and relentless inquiry.', affinities:['study','read','research','learn','decipher','translate','examine','analyze','investigate','library','scroll','text','historical','lore'],  requirement:10, primaryStats:['int','wis'], levels:[ {label:'Student',             desc:'Read quickly and retain what you learn.',        statBonus:{int:1}},      {label:'Scholar',             desc:'History, lore, and science are your domains.',    statBonus:{int:1,wis:1}}, {label:'Learned Scholar',     desc:'Others seek your expertise.',                     statBonus:{int:1}},      {label:'Master Scholar',      desc:'Your works are copied and distributed.',          statBonus:{int:2}},      {label:'Sage',                desc:'You have forgotten more than most will ever know.',statBonus:{int:2,wis:1}} ] },
  woodsman:   { label:'Woodsman',   desc:'You fell trees, work lumber, and know the deep forest ways.',   affinities:['chop','fell','lumber','timber','log','cut wood','woodcutting','gather wood','split wood','forest work','fell a tree'],                    requirement:10, primaryStats:['str','vit'], levels:[ {label:'Woodcutter',          desc:'Small trees and branches reliably.',             statBonus:{str:1}},      {label:'Lumberjack',          desc:'Large trees fall before your axe.',               statBonus:{str:1,vit:1}}, {label:'Forest Crafter',      desc:'You work rare woods and know the forest paths.',  statBonus:{str:1}},      {label:'Master Woodsman',     desc:'Ancient trees yield to your skill.',              statBonus:{str:2}},      {label:'Forest Sovereign',    desc:"The forest itself seems to answer your calls.",   statBonus:{str:2,vit:1}} ] }
};


// =============================================
// PROFESSION TASK SCALING
// =============================================
const PROFESSION_TASKS = {
  woodsman:   [ {keywords:['branches','fallen wood','kindling','twigs','dead wood','sticks'],level:1}, {keywords:['sapling','young tree','small tree','bush','shrub'],level:5}, {keywords:['pine','birch','aspen','poplar','willow'],level:15}, {keywords:['elm','maple','walnut','cherry','beech'],level:25}, {keywords:['oak','ash tree','great oak','old oak','thick oak'],level:40}, {keywords:['ancient oak','old growth','grandfather tree'],level:55}, {keywords:['ironwood','heartwood','blackwood','ancient tree','massive trunk'],level:70}, {keywords:['redwood','sequoia','world tree','elder tree'],level:90} ],
  blacksmith: [ {keywords:['nail','hook','rivet','pin','ring','iron clasp'],level:1}, {keywords:['knife','dagger','arrowhead','horseshoe','buckle'],level:10}, {keywords:['short sword','hatchet','mace head','spear tip','helmet'],level:25}, {keywords:['longsword','battle axe','chainmail','great helm'],level:40}, {keywords:['plate armor','greatsword','war hammer','full plate'],level:60}, {keywords:['masterwork','fine steel','rune-etched','quality alloy'],level:80}, {keywords:['legendary blade','mythril','dragon steel','primordial metal'],level:95} ],
  alchemist:  [ {keywords:['simple salve','basic tincture','weak brew','minor potion'],level:1}, {keywords:['healing potion','antidote','energy tonic','purifying draft'],level:10}, {keywords:['strength draught','speed potion','night vision brew','fortitude tonic'],level:25}, {keywords:['invisibility potion','mana elixir','paralytic compound'],level:45}, {keywords:['transmutation','master elixir','legendary brew'],level:65}, {keywords:['immortality','philosopher','dragon blood compound','soul elixir'],level:85} ],
  hunter:     [ {keywords:['mouse','rat','rabbit','bird','squirrel','small game'],level:1}, {keywords:['deer','fox','badger','turkey','medium game'],level:10}, {keywords:['wild boar','wolf','mountain goat','elk'],level:20}, {keywords:['bear','cave bear','dire wolf','great eagle'],level:35}, {keywords:['dire boar','giant wolf','great bear','horned elk'],level:50}, {keywords:['wyvern','drake','manticore','chimera'],level:70}, {keywords:['dragon','ancient beast','elder dragon'],level:90} ],
  scholar:    [ {keywords:['simple text','basic record','common ledger'],level:1}, {keywords:['history scroll','lore record','old text','map','codex'],level:10}, {keywords:['ancient text','forbidden tome','magical theory'],level:25}, {keywords:['lost language','dead tongue','cipher','runic script'],level:45}, {keywords:['elder script','pre-collapse record','true name'],level:65}, {keywords:['divine text','godscript','world-truth'],level:85} ],
  merchant:   [ {keywords:['bread','rope','candle','cloth','basic goods'],level:1}, {keywords:['tools','leather','wine','grain','salt'],level:10}, {keywords:['weapons','armor','spices','rare cloth','exotic goods'],level:25}, {keywords:['magical items','rare artifact','gem trade'],level:45}, {keywords:['legendary item','ancient relic','royal commission'],level:70} ],
  cook:       [ {keywords:['broth','porridge','bread','simple stew','field ration'],level:1}, {keywords:['roast','stew','pie','cured meat','proper meal'],level:10}, {keywords:['feast','banquet dish','rare ingredient','exotic spice'],level:25}, {keywords:['royal feast','legendary dish','monster part recipe'],level:50}, {keywords:['divine recipe','enchanted meal','restorative feast'],level:80} ],
  scout:      [ {keywords:['village path','familiar road','nearby trail'],level:1}, {keywords:['forest track','mountain pass','cave entrance'],level:15}, {keywords:['enemy territory','monster lair','hidden path'],level:30}, {keywords:['deep wilderness','ancient ruin','cursed land'],level:50}, {keywords:['legendary location','dragon territory'],level:75} ]
};


// =============================================
// SCENE CONTEXTS
// Governs what narrative tone is available
// =============================================
const SCENE_CONTEXTS = {
  neutral:   { label:'Neutral',   desc:'Normal exploration and interaction.' },
  combat:    { label:'Combat',    desc:'Active fight. Tension high.' },
  social:    { label:'Social',    desc:'Conversation or negotiation in progress.' },
  tense:     { label:'Tense',     desc:'Standoff, suspense, or danger without fighting.' },
  intimate:  { label:'Intimate',  desc:'Private moment between characters. Earned, not triggered.' },
  rest:      { label:'Resting',   desc:'Player is recovering. Low danger.' },
  travel:    { label:'Traveling', desc:'Moving between locations.' }
};


// =============================================
// INTIMACY CONDITIONS
// All must be true for intimate scene to be available
// =============================================
const INTIMACY_CONDITIONS = {
  minReputation:    20,   // Must have built rapport with location/NPC
  minCha:           6,    // Minimum charisma to successfully flirt
  appropriateNPC:   ['bartender','innkeeper','merchant','traveler','bard','noble','guard_off_duty'],
  inappropriateNPC: ['guard_on_duty','enemy','quest_giver_first_meeting','child'],
  nsfwEnabled:      true  // Player-level toggle — false = intimate scenes fade to black or skip
};


// =============================================
// XP THRESHOLDS
// =============================================
const MAX_LEVEL = 100;

const CLASS_LEVEL_XP = [
  0,0,200,450,750,1100,1500,1950,2450,3000,3600,
  4300,5100,6000,7000,8100,9300,10600,12000,13500,15200
];


// =============================================
// BUILD MODIFIERS
// Detected from physical description keywords.
// Stat mods applied on top of base + background + age.
// "Average" = zero mods — the neutral baseline.
// With base stat of 10, an average person starts at 10s.
// =============================================
const BUILD_MODS = {
  frail:    { label:'Frail',    desc:'Noticeably underdeveloped. Perhaps illness, perhaps deprivation.', str:-3, dex:1,  vit:-2 },
  scrawny:  { label:'Scrawny',  desc:'Thin but not broken. Fast on your feet.',                         str:-2, dex:1,  vit:-1 },
  lean:     { label:'Lean',     desc:'Wiry and efficient. No wasted mass.',                             str:-1, dex:2,  vit:0  },
  slender:  { label:'Slender',  desc:'Slim and graceful. More agile than strong.',                      str:-1, dex:1,  vit:-1 },
  average:  { label:'Average',  desc:'Neither notably strong nor weak. The common measure of things.',  str:0,  dex:0,  vit:0  },
  athletic: { label:'Athletic', desc:'Fit, toned, conditioned. Every stat pulled slightly forward.',    str:1,  dex:1,  vit:0  },
  stocky:   { label:'Stocky',   desc:'Compact and hard to move. Solid rather than tall.',               str:1,  dex:-1, vit:2  },
  broad:    { label:'Broad',    desc:'Wide-framed, heavy across the shoulders.',                        str:2,  dex:-1, vit:2  },
  heavyset: { label:'Heavyset', desc:'More weight than muscle, but weight has its uses.',               str:1,  dex:-2, vit:2  },
  muscular: { label:'Muscular', desc:'Developed through serious training or labor. Visibly strong.',    str:3,  dex:-1, vit:1  },
  massive:  { label:'Massive',  desc:'Exceptional in size. Rare, striking, and hard to ignore.',        str:4,  dex:-2, vit:2  },
};

// Keyword → BUILD_MODS key mapping
// Checked against the player's free-form description.
const BUILD_KEYWORDS = {
  // frail tier
  frail: 'frail', feeble: 'frail', sickly: 'frail',
  // scrawny tier
  scrawny: 'scrawny',
  // lean tier
  lean: 'lean', wiry: 'lean', lithe: 'lean', thin: 'lean', lanky: 'lean',
  // slender tier
  slender: 'slender', slim: 'slender',
  // average tier (explicit; also default if nothing detected)
  average: 'average', medium: 'average', normal: 'average', ordinary: 'average',
  // athletic tier
  athletic: 'athletic', fit: 'athletic', toned: 'athletic', defined: 'athletic',
  // stocky tier
  stocky: 'stocky', compact: 'stocky', squat: 'stocky',
  // broad tier
  broad: 'broad', 'broad-shouldered': 'broad',
  // heavyset tier
  heavyset: 'heavyset', overweight: 'heavyset', fat: 'heavyset', plump: 'heavyset', round: 'heavyset',
  // muscular tier
  muscular: 'muscular', built: 'muscular', ripped: 'muscular', brawny: 'muscular', powerful: 'muscular',
  // massive tier
  massive: 'massive', huge: 'massive', enormous: 'massive', hulking: 'massive',
};


// =============================================
// AGE BANDS
// Applied as flat stat adjustments after base + background.
// Peak physical = ages 18–33.  
// Youth: less strength, more agility, less seasoned.
// Experience/Elder: body degrades, mind sharpens.
// =============================================
const AGE_BANDS = [
  { min:10, max:17, label:'Youth',       mods:{ str:-1, dex:2,  vit:0,  int:-1, wis:-1, cha:0  } },
  { min:18, max:33, label:'Prime',       mods:{ str:0,  dex:0,  vit:0,  int:0,  wis:0,  cha:0  } },
  { min:34, max:50, label:'Experienced', mods:{ str:-1, dex:-1, vit:0,  int:1,  wis:1,  cha:0  } },
  { min:51, max:65, label:'Veteran',     mods:{ str:-2, dex:-1, vit:-1, int:2,  wis:2,  cha:0  } },
  { min:66, max:90, label:'Elder',       mods:{ str:-3, dex:-2, vit:-2, int:2,  wis:3,  cha:1  } },
];


// =============================================
// NSFW TRIGGER KEYWORDS
// Any of these in a player's character description
// automatically enables NSFW content for the session.
// Intentionally includes euphemisms and physique descriptors
// that signal explicit intent.
// =============================================
const NSFW_KEYWORDS = [
  // Direct anatomy
  'cock', 'penis', 'dick', 'shaft', 'manhood', 'phallus', 'member', 'erection',
  'pussy', 'vagina', 'vulva', 'clit', 'clitoris', 'labia',
  'breast', 'nipple', 'tit', 'boob', 'bosom',
  'ass', 'buttock', 'groin', 'crotch', 'bulge',
  // Nudity descriptors
  'nude', 'naked', 'topless', 'bare chest', 'exposed',
  // Size/explicit physique descriptors
  'endowed', 'hung', 'voluptuous', 'busty',
  // Common phrasing ("16 inch", "12 inch" etc for body parts)
  'inch manhood', 'inch cock', 'inch dick', 'inch penis',
];


// =============================================
// BACKGROUND KEYWORD DETECTION
// Used when a player describes their background in free text
// rather than selecting from the list.
// Ordered by specificity — check longer phrases first.
// =============================================
const BACKGROUND_KEYWORDS = {
  // Magic / religious — check these first (high specificity)
  mageapprentice: ['mage apprentice', 'wizard apprentice', 'arcane apprentice', 'magic apprentice', 'apprentice to a mage', 'apprentice to a wizard', 'studied magic', 'trained in magic', 'arcane school', 'magic academy'],
  acolyte:        ['acolyte', 'temple acolyte', 'monastery', 'holy order', 'priestly training', 'devoted to a god', 'served in a temple', 'church', 'divine service', 'clergy', 'devoted follower'],
  hedge_witch:    ['hedge witch', 'wise woman', 'wise man', 'cunning folk', 'folk magic', 'old ways', 'druid', 'village witch', 'self-taught magic', 'born with magic'],

  // Military — high-frequency words, check before generic
  soldier:    ['soldier', 'army', 'military', 'infantry', 'enlisted', 'conscript', 'fought in a war', 'served in the military', 'war veteran', 'front lines', 'campaign', 'battalion', 'regiment'],
  mercenary:  ['mercenary', 'sell-sword', 'sellsword', 'hired sword', 'hired blade', 'fighting for coin', 'contract fighter', 'freelance soldier'],
  guard:      ['city guard', 'town guard', 'gate guard', 'watchman', 'city watch', 'town watch', 'gate duty'],

  // Criminal / street
  streetrat:  ['street rat', 'grew up on the streets', 'city slums', 'orphan on the street', 'pickpocket', 'stole to survive', 'gutter', 'slums', 'begging'],
  streetthug: ['street thug', 'gang member', 'criminal enforcer', 'underground fighter', 'pit fighter', 'underground brawler'],

  // Rural trades
  hunter:     ['hunter', 'hunted', 'hunted game', 'hunted for a living', 'used to hunt', 'i hunt', 'i hunted', 'go hunting', 'forester', 'woodsman', 'tracking', 'trapping', 'bow hunting', 'hunting game', 'forest hunter', 'game in the', 'tracked game', 'track animals'],
  trapper:    ['trapper', 'fur trapper', 'pelts', 'trap lines', 'snares', 'fur trade'],
  shepherd:   ['shepherd', 'shepherding', 'herded sheep', 'goatherd', 'watched flocks', 'pasture'],
  fisherman:  ['fisherman', 'fishing', 'sea fishing', 'nets', 'caught fish', 'fishing village'],
  farmer:     ['farmer', 'tilled fields', 'grew crops', 'farmhand', 'agriculture', 'harvest'],
  woodcutter: ['woodcutter', 'lumberjack', 'felled trees', 'logging', 'lumber trade', 'axes and trees'],
  herbalist:  ['herbalist', 'herb gathering', 'healer herbs', 'apothecary', 'plant medicine', 'remedies'],

  // Crafts & trades
  blacksmith: ['blacksmith', 'forge', 'smithing', 'worked iron', 'worked steel', 'metalworking', 'anvil'],
  carpenter:  ['carpenter', 'woodworking', 'joiner', 'cabinetmaker', 'built things from wood'],
  miner:      ['miner', 'mining', 'worked the mines', 'ore mining', 'underground mining', 'quarry'],
  sailor:     ['sailor', 'seafarer', 'sailed the seas', 'maritime', 'ship crew', 'seaman'],
  innkeeper:  ['innkeeper', 'ran an inn', 'tavern keeper', 'bartender', 'inn work', 'served travelers'],
  merchant:   ['merchant', 'trader', 'trade goods', 'bought and sold', 'commerce', 'market stall', 'travelling merchant'],

  // Scholarly
  scribe:     ['scribe', 'scholar', 'wrote for a living', 'copied texts', 'court records', 'drafting documents'],
  wanderer:   ['wanderer', 'wandering', 'nomad', 'drifter', 'traveler', 'no fixed home', 'the road', 'exile'],
};


// =============================================
// STARTING ENVIRONMENTS
// The four archetype starting zones for character creation.
// These replace region selection at creation; specific named
// regions (Thornwick, Ironport, etc.) are discovered through play.
// =============================================
const STARTING_ENVIRONMENTS = {
  deep_forest: {
    label:          'Deep Forest',
    desc:           'Dense woodland far from settlements. Wildlife rules here. Few travelers, no cities, and many teeth in the dark.',
    flavor:         'towering canopy blocking the sky, mossy stone, birdsong that stops without warning',
    monsterLevel:   [1, 3],
    population:     'Sparse — hermits, lone hunters, a woodcutter or two',
    populationCount:'Dozens at most across many miles',
    beastChance:    0.78,        // most encounters will be animals and monsters, not people
    humanChance:    0.22,
    npcLevelRange:  [1, 8],      // most forest folk are low-level
    highLevelNPCChance: 0.06,   // occasional — old hermit with secrets, a ranger who's been here decades
    ambushChance:   0.55,        // hard to see threats coming under the canopy
    startingCoin:   80,          // modest — forest folk don't carry much
    monsters:       ['Forest Wolves', 'Giant Rats', 'Goblins', 'Wild Boars', 'Cave Bears', 'Corrupted Stags'],
    rareMonsters:   ['Cave Troll', 'Forest Troll', 'Dire Wolf', 'Feral Druid'],
    openingFlavor:  'The forest presses close on all sides. You can hear water somewhere, and something else — something that stopped moving when you did.',
    mapsToRegions:  ['thornwick', 'ashwood'],
  },
  open_plains: {
    label:          'Open Plains',
    desc:           'Vast grasslands and rolling hills. You can see for miles — threats rarely catch you by surprise, but you are equally visible.',
    flavor:         'long grass, wide sky, distant treelines, a trade road worn by a thousand carts',
    monsterLevel:   [1, 3],
    population:     'Light — scattered farms, a village every few miles along the roads',
    populationCount:'Thousands, spread thin across hundreds of miles',
    beastChance:    0.40,        // open ground — a mix of beasts and human threats
    humanChance:    0.60,
    npcLevelRange:  [1, 15],
    highLevelNPCChance: 0.14,   // merchants, traveling fighters, caravan guards
    ambushChance:   0.15,        // low — you see trouble coming on the plains
    startingCoin:   120,
    monsters:       ['Bandit Thugs', 'Road Wolves', 'Goblin Raiders', 'Plains Scorpions', 'Harpy Scouts'],
    rareMonsters:   ['Bandit Captain', 'Warg Rider', 'Giant Eagle'],
    openingFlavor:  'The road stretches ahead and behind. The wind carries dust and the smell of distant rain. A crow follows you from three fence posts back.',
    mapsToRegions:  ['thornwick', 'dustfall'],
  },
  small_village: {
    label:          'Small Village',
    desc:           'A settlement of a few hundred souls. Community, gossip, and modest safety — but the wilderness comes close to the fences at night.',
    flavor:         'muddy main road, thatched rooftops, a market square, a smithy, an inn that knows everyone\'s business',
    monsterLevel:   [1, 3],
    population:     'Village — several hundred inhabitants',
    populationCount:'300–800 people',
    beastChance:    0.28,        // beasts mostly at the edges, outside the village
    humanChance:    0.72,
    npcLevelRange:  [1, 20],     // from farmers to the occasional seasoned fighter
    highLevelNPCChance: 0.22,   // village elder, retired soldiers, visiting adventurers
    ambushChance:   0.22,
    startingCoin:   150,         // more access to trade
    monsters:       ['Goblin Scavengers', 'Road Bandits', 'Giant Rats', 'Feral Dogs', 'Corrupted Wildlife'],
    rareMonsters:   ['Veteran Bandit', 'Orc Raider', 'Troll from the Hills'],
    openingFlavor:  'The village smells like bread, woodsmoke, and manure. A pair of children sprint past. Someone watches from a second-floor window. The inn sign creaks in the wind.',
    mapsToRegions:  ['thornwick', 'dustfall'],
  },
  bustling_city: {
    label:          'Bustling City',
    desc:           'A metropolis of millions. Streets packed with commerce, crime, and intrigue. Wild beasts are rare. Dangerous people are not.',
    flavor:         'crowded stone streets, guild hall towers, market hawkers, sewer grates, a hundred languages in a single block',
    monsterLevel:   [1, 3],
    population:     'City — millions of inhabitants across districts',
    populationCount:'Millions — a world unto itself',
    beastChance:    0.05,        // nearly no wild beasts — sewer rats, the odd escaped animal
    humanChance:    0.95,
    npcLevelRange:  [1, 60],     // wild range — a street child or a guild master
    highLevelNPCChance: 0.55,   // over half the NPCs you find have seen more than you have
    ambushChance:   0.32,        // alleyways, guild enforcers, thieves working the crowd
    startingCoin:   200,         // more coin circulates
    monsters:       ['City Thugs', 'Corrupt Watchmen', 'Cutthroats', 'Thieves Guild Agents', 'Sewer Creatures', 'Dockside Smugglers'],
    rareMonsters:   ['Crime Lord Enforcer', 'Guild Assassin', 'City Champion'],
    openingFlavor:  'The city does not notice your arrival. A thousand people move past you in every direction. Someone\'s shoulder clips yours without apology. This is where things happen — or where things are done to you.',
    mapsToRegions:  ['ironport'],
  },
};


// =============================================
// MAGICAL BACKGROUNDS
// Characters with these backgrounds start with a spell.
// Merged into BACKGROUNDS export for full compatibility.
// =============================================
const MAGICAL_BACKGROUNDS = {
  mageapprentice: {
    label:        "Mage's Apprentice",
    genderReq:    null,
    minAge:       null,
    maxAge:       22,
    desc:         'Bound to an arcane scholar, you learned the theory and first practice of spellwork.',
    mods:         { str:-2, dex:0, vit:-1, int:3, wis:2, cha:-1 },
    startingSpell:'mana_bolt',
    isMagical:    true,
  },
  acolyte: {
    label:        'Temple Acolyte',
    genderReq:    null,
    minAge:       null,
    maxAge:       null,
    desc:         'Trained in a house of worship, you received basic channeling instruction alongside your devotion.',
    mods:         { str:-1, dex:0, vit:-1, int:1, wis:3, cha:0 },
    startingSpell:'divine_bolt',
    isMagical:    true,
  },
  hedge_witch: {
    label:        'Hedge Witch / Hedge Warlock',
    genderReq:    null,
    minAge:       null,
    maxAge:       null,
    desc:         'Self-taught or folk-trained in the old ways. Your magic is rough and unrefined but undeniably real.',
    mods:         { str:-1, dex:1, vit:0, int:2, wis:2, cha:-2 },
    startingSpell:'mana_bolt',
    isMagical:    true,
  },
};


// =============================================
// STARTING SPELLS
// Granted at creation to magical backgrounds.
// freeForm: false = learned, full effectiveness.
// =============================================
const STARTING_SPELLS = {
  mana_bolt: {
    id:                'mana_bolt',
    label:             'Mana Bolt',
    desc:              'A raw surge of arcane force flung at a target. Crude and unsophisticated, but it works.',
    manaCost:          8,
    damage:            { min:4, max:10 },
    range:             25,   // metres
    type:              'arcane',
    freeForm:          false, // formally learned — full effectiveness
    learnedEfficiency: 1.0,
  },
  divine_bolt: {
    id:                'divine_bolt',
    label:             'Divine Bolt',
    desc:              'Channeled holy energy released in a focused strike. Particularly effective against undead and corrupted creatures.',
    manaCost:          8,
    damage:            { min:4, max:10 },
    bonusVsUndead:     5,
    range:             25,
    type:              'holy',
    freeForm:          false,
    learnedEfficiency: 1.0,
  },
};


// =============================================
// FREEFORM SKILL SYSTEM (Primal Hunter Principle)
// Skills invented or improvised by the player — rather than
// formally unlocked through class/profession progression —
// are functional but operate at reduced effectiveness.
//
// The player can attempt anything. Formally learned skills
// are simply more effective at equivalent levels.
//
// FREEFORM_BASE:    starting effectiveness for improvised skills
// FREEFORM_CAP:     maximum effectiveness a freeform skill can reach
// FREEFORM_GROWTH:  effectiveness gained per level invested in the skill
// =============================================
const FREEFORM_SKILL_CONFIG = {
  FREEFORM_BASE:   0.55,  // freeform starts at 55% of a learned equivalent
  FREEFORM_CAP:    0.80,  // can grow to 80% max through practice
  FREEFORM_GROWTH: 0.01,  // +1% per level of use (takes 25 uses to cap out)
  LEARNED_SCALE:   1.00,  // formally learned skills = 100% baseline
};


module.exports = {
  BACKGROUNDS,
  MAGICAL_BACKGROUNDS,
  REGIONS,
  STARTING_ENVIRONMENTS,
  ENEMIES,
  BODY_PARTS,
  GEAR_QUALITIES,
  STARTING_GEAR,
  CLASSES,
  PROFESSIONS,
  PROF_LEVEL_XP,
  PROFESSION_TASKS,
  SCENE_CONTEXTS,
  INTIMACY_CONDITIONS,
  MAX_LEVEL,
  CLASS_LEVEL_XP,
  // New character creation systems
  BUILD_MODS,
  BUILD_KEYWORDS,
  AGE_BANDS,
  NSFW_KEYWORDS,
  BACKGROUND_KEYWORDS,
  STARTING_SPELLS,
  FREEFORM_SKILL_CONFIG,
};