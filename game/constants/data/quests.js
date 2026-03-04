'use strict';

const QUEST_TYPES = {
  HUNT:    'hunt',
  CLEAR:   'clear',
  PATROL:  'patrol',
  ESCORT:  'escort',
  RETRIEVE:'retrieve',
  SCOUT:   'scout',
  ADVANCE: 'advance'
};

const QUEST_REWARD_BASE = {
  coin: 80,
  xp:   15
};

const QUEST_DIFFICULTY = {
  easy:   { label:'Easy',   coinMult:0.8, xpMult:0.7, levelOffset:-3 },
  normal: { label:'Normal', coinMult:1.0, xpMult:1.0, levelOffset:0  },
  hard:   { label:'Hard',   coinMult:1.5, xpMult:1.4, levelOffset:3  },
  brutal: { label:'Brutal', coinMult:2.5, xpMult:2.0, levelOffset:6  }
};

const HUNT_TEMPLATES = [
  { tier:1, targets:['wolves','bandits','goblins'], counts:[3,5,8], givers:['Miller','Inn Keeper','Village Elder','Farmer','Merchant'] },
  { tier:1, targets:['rats','imps','wild dogs'],    counts:[5,8,12], givers:['Dockmaster','Innkeeper','Town Watch'] },
  { tier:2, targets:['wraiths','cultists','bog hounds'], counts:[3,5,8], givers:['Garrison Captain','Outpost Commander','Warden'] },
  { tier:2, targets:['corrupted animals','barrow dead'], counts:[3,4,6], givers:['Scholar','Priest','Hedge Witch'] },
  { tier:3, targets:['trolls','golems','shambling dead'], counts:[2,3,5], givers:['Expedition Leader','Mine Foreman','Witch Hunter'] },
  { tier:4, targets:['death cultists','void fragments','ancient horrors'], counts:[2,3,4], givers:['Archmage','War Council','Ancient Order'] },
];

const PATROL_TEMPLATES = [
  { tier:1, task:'guard the north road',     duration:'one night',      giver:'Town Watch Captain'   },
  { tier:1, task:'protect the market',       duration:'a day',          giver:'Merchant Guild'        },
  { tier:2, task:'secure the outpost',       duration:'three days',     giver:'Garrison Commander'   },
  { tier:2, task:'walk the perimeter',       duration:'one full round', giver:'Fort Warden'           },
  { tier:3, task:'hold the mine entrance',   duration:'a week',         giver:'Expedition Foreman'   },
  { tier:4, task:'guard the ritual site',    duration:'until complete', giver:'Ancient Order Keeper' },
];

const ESCORT_TEMPLATES = [
  { tier:1, npc:'injured soldier',      to:'ironport',            giver:'Local Healer'          },
  { tier:1, npc:'merchant\'s daughter', to:'dustfall',            giver:'Desperate Merchant'    },
  { tier:2, npc:'captured scholar',     to:'oakhaven',            giver:'Academy Envoy'         },
  { tier:2, npc:'wounded ranger',       to:'ashwood_shallow',     giver:'Ranger Guild'          },
  { tier:3, npc:'expedition survivor',  to:'blackstone_foothills',giver:'Mining Company'        },
  { tier:4, npc:'sealed relic carrier', to:null,                   giver:'Ancient Order'         },
];

const RETRIEVE_TEMPLATES = [
  { tier:1, item:'stolen ledger',        location:'bandit camp',         giver:'Desperate Merchant'    },
  { tier:1, item:'missing child\'s toy', location:'goblin warrens',      giver:'Grieving Parent'       },
  { tier:2, item:'garrison seal',        location:'barrow ruins',        giver:'Garrison Commander'    },
  { tier:2, item:'alchemist\'s notes',   location:'fog-swallowed tower', giver:'Guild Alchemist'       },
  { tier:3, item:'ancient map fragment', location:'old mine depths',     giver:'Expedition Scholar'    },
  { tier:4, item:'void-touched artifact',location:'rift site',           giver:'Arcane Council'        },
];

const SCOUT_TEMPLATES = [
  { tier:1, location:'the treeline north of the valley',  reward:'map and coin',         giver:'Cartographer\'s Guild' },
  { tier:2, location:'the ruins on the eastern shore',    reward:'expedition funding',   giver:'Scholar Circle'        },
  { tier:3, location:'the upper mine levels',             reward:'mining contract',      giver:'Trade Commission'      },
  { tier:4, location:'the outer fen structures',          reward:'arcane materials',     giver:'Ancient Order'         },
];

const ADVANCE_QUESTS = {
  1: [
    { label:'A Letter for the Commander',   dest:'greymere',        task:'Deliver a sealed letter to the Greymere Garrison Commander. The content is above your rank. The fee is not.',   reward:'triple coin + guaranteed entry to Greymere' },
    { label:'The Missing Scout',            dest:'ashwood_shallow', task:'A ranger went into the Ashwood Fringe a week ago and hasn\'t returned. Find what happened to them.',            reward:'triple coin + ranger guild contact' },
    { label:'Trade Route Survey',           dest:'saltenbay',       task:'The merchant guild needs someone to survey the coastal trade roads. Dangerous work. Good pay.',                  reward:'triple coin + merchant guild favor' },
  ],
  2: [
    { label:'The Foothills Report',         dest:'blackstone_foothills', task:'The mining company\'s survey team hasn\'t reported back. Find them or what happened to them.',             reward:'triple coin + mountain pass knowledge' },
    { label:'Fen Cult Activity',            dest:'sunkenfen_edge',       task:'Something is organizing the cult activity deeper in the fens. The witch hunters need a scout.',            reward:'triple coin + witch hunter contact' },
    { label:'Wreck Investigation',          dest:'ember_coast',          task:'Three ships went silent near the Ember Coast. Someone needs to find out why. It probably involves fire.',  reward:'triple coin + naval chart' },
  ],
  3: [
    { label:'The Deep Forest Survey',       dest:'ashwood_deep',    task:'Nothing comes back from the deep forest the same. The Arcane Council will pay well to know what\'s there.',     reward:'triple coin + arcane council favor' },
    { label:'Mountain Peak Reconnaissance', dest:'blackstone_peaks', task:'The garrison at High Camp needs to know the state of the upper fortresses. Get up there and come back.',       reward:'triple coin + mountain fortress key' },
    { label:'The Fen Altar',                dest:'sunkenfen_deep',  task:'The witch hunters found ruins they can\'t enter alone. Three experienced fighters needed. You qualify.',         reward:'triple coin + powerful amulet' },
  ],
  4: [
    { label:'The Northern Approach',        dest:'frozennorth_reaches', task:'Something in the north is sending things south. An expedition is forming. They need capable fighters.',     reward:'triple coin + frost-touched gear' },
    { label:'Void Survey Team',             dest:'void_fringe',         task:'Reality is breaking down east of the Scar Vale. The Arcane Council needs witnesses to file a report.',      reward:'triple coin + void-warded equipment' },
    { label:'Ashen Vale Expedition',        dest:'ashen_vale',          task:'The order wants a relic retrieved from a location that\'s been on fire for nine hundred years. Easy money.', reward:'triple coin + fire-resistant gear' },
  ],
  5: [
    { label:'Crucible Survey',              dest:'crucible_approach',   task:'The volcanic heart is destabilizing. A survey team needs protection while they take readings.',             reward:'triple coin + lava-resistant armor' },
    { label:'Kingdom Ghost Report',         dest:'hollowed_kingdom',    task:'The kingdom went silent two months ago. The council wants eyes on the inside. Survival is optional.',       reward:'triple coin + powerful relic' },
  ],
  6: [
    { label:'Gate Assault',                 dest:'crucible_gate',       task:'The expedition is trying to breach the Crucible Gate. They need one more fighter. You look capable enough.', reward:'triple coin + legendary gear token' },
    { label:'Void March Recon',             dest:'void_marches',        task:'The void is spreading faster. Someone needs to map the breach sites. The pay assumes you might not return.', reward:'triple coin + void-touched power' },
  ],
  7: [
    { label:'The Crucible Run',             dest:'the_crucible',        task:'The ancient forge is operational. An artificer needs protection while he retrieves something from inside.',  reward:'triple coin + ancient artifice item' },
  ],
  8: [
    { label:'Core Waste Expedition',        dest:'the_core_wastes',     task:'An ancient order believes something in the Core Wastes predates all the current threats. They want proof.',  reward:'triple coin + world-class gear' },
  ],
  9: [
    { label:'The Shattered Throne',         dest:'shattered_throne',    task:'The oldest evil. The seat of whatever broke this world. Some things must be faced. This is one of them.',   reward:'Everything and nothing. The end of one story.' },
  ]
};

module.exports = {
  QUEST_TYPES,
  QUEST_REWARD_BASE,
  QUEST_DIFFICULTY,
  HUNT_TEMPLATES,
  PATROL_TEMPLATES,
  ESCORT_TEMPLATES,
  RETRIEVE_TEMPLATES,
  SCOUT_TEMPLATES,
  ADVANCE_QUESTS,
};
