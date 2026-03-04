'use strict';

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

const SCENE_CONTEXTS = {
  neutral:   { label:'Neutral',   desc:'Normal exploration and interaction.' },
  combat:    { label:'Combat',    desc:'Active fight. Tension high.' },
  social:    { label:'Social',    desc:'Conversation or negotiation in progress.' },
  tense:     { label:'Tense',     desc:'Standoff, suspense, or danger without fighting.' },
  intimate:  { label:'Intimate',  desc:'Private moment between characters. Earned, not triggered.' },
  rest:      { label:'Resting',   desc:'Player is recovering. Low danger.' },
  travel:    { label:'Traveling', desc:'Moving between locations.' }
};

const INTIMACY_CONDITIONS = {
  minReputation:    20,
  minCha:           6,
  appropriateNPC:   ['bartender','innkeeper','merchant','traveler','bard','noble','guard_off_duty'],
  inappropriateNPC: ['guard_on_duty','enemy','quest_giver_first_meeting','child'],
  nsfwEnabled:      true
};

const MAX_LEVEL = 100;

const CLASS_LEVEL_XP = [
  0,
  0,
  75,
  200,
  400,
  700
];

module.exports = {
  GEAR_QUALITIES,
  CLASSES,
  PROFESSIONS,
  PROF_LEVEL_XP,
  PROFESSION_TASKS,
  SCENE_CONTEXTS,
  INTIMACY_CONDITIONS,
  MAX_LEVEL,
  CLASS_LEVEL_XP,
};
