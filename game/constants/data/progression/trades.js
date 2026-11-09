'use strict';

// =============================================================
// The wider world of trades (27 beyond the first twelve). Each has the
// same shape as the originals: unlock affinities, five ranks, tasks for
// narrated work, and — in game/profession-perks.js — a combat edge of
// equal measured worth, a living and a skill of its own.
// =============================================================

function ranks(base, top, stats) {
  const [a, b] = stats;
  return [
    { label: `Apprentice ${base}`, desc: 'You know the basics of the trade.', statBonus: { [a]: 1 } },
    { label: `Journeyman ${base}`, desc: 'Your work is steady and sought after.', statBonus: { [a]: 1, [b || a]: 1 } },
    { label: base, desc: 'Your name is known in the trade.', statBonus: { [b || a]: 1 } },
    { label: `Master ${base}`, desc: 'Others learn by watching you.', statBonus: { [a]: 2 } },
    { label: top, desc: 'There are few your equal anywhere.', statBonus: { [a]: 2, [b || a]: 1 } }
  ];
}

function tasks(levels) { return levels.map(([kw, level]) => ({ keywords: kw, level })); }

// key: [label, desc, affinities, stats, top title, tasks]
const T = {
  carpenter:   ['Carpenter', 'You build frames, roofs, doors and furniture from cut timber.', ['carpentry', 'build a table', 'build a chair', 'furniture', 'joinery', 'saw the plank', 'plane the board', 'frame a roof', 'mortise', 'dovetail', 'build a cabinet'], ['str', 'dex'], 'Master Builder',
    [[['peg', 'shelf', 'stool'], 1], [['table', 'chair', 'door'], 10], [['cabinet', 'roof frame', 'bed frame'], 25], [['great hall', 'carved throne', 'bridge'], 45], [['cathedral beams', 'royal furniture'], 70]]],
  wainwright:  ['Wainwright', 'You build and mend carts, wagons and wheels.', ['wheel', 'wagon', 'cart', 'axle', 'spoke', 'wainwright', 'mend the cart', 'build a wagon', 'hub', 'felloe'], ['str', 'int'], 'Wheelwright of the Realm',
    [[['spoke', 'peg', 'handcart'], 1], [['wheel', 'cart', 'axle'], 10], [['wagon', 'coach wheel'], 25], [['war wagon', 'siege cart'], 45], [['royal coach', 'great siege engine'], 70]]],
  carver:      ['Carver', 'You whittle and carve wood and bone into charms, figures and fine work.', ['whittle', 'carve', 'carving', 'whittling', 'carve a figure', 'carve bone', 'knife work', 'engrave', 'chisel', 'totem'], ['dex', 'wis'], 'Master Carver',
    [[['toy', 'spoon', 'peg'], 1], [['figure', 'pipe', 'charm'], 10], [['mask', 'bone totem', 'relief'], 25], [['shrine idol', 'ward-carving'], 45], [['heart-oak idol', 'runic totem'], 70]]],
  bowyer:      ['Bowyer', 'You make bows and arrows, and know what makes them fly true.', ['bow', 'arrow', 'fletch', 'fletching', 'bowstring', 'stave', 'shaft', 'bowyer', 'make arrows', 'string a bow'], ['dex', 'str'], 'Master Bowyer',
    [[['arrow shaft', 'fletching'], 1], [['shortbow', 'quiver'], 10], [['longbow', 'broadhead'], 25], [['composite bow', 'war bow'], 45], [['yew greatbow', 'heartwood bow'], 70]]],
  armorer:     ['Armorer', 'You make and fit armour: mail, plate, helms and shields.', ['armor', 'armour', 'mail', 'plate', 'helm', 'shield', 'rivet the', 'fit the armour', 'gauntlet', 'greave', 'hauberk'], ['str', 'vit'], 'Master Armorer',
    [[['rivet', 'buckle'], 1], [['helm', 'shield'], 10], [['hauberk', 'breastplate'], 25], [['full plate', 'tower shield'], 45], [['masterwork plate', 'dragon-scale mail'], 70]]],
  weaponsmith: ['Weaponsmith', 'You forge blades, axes and spears that hold an edge.', ['forge a blade', 'weaponsmith', 'sword', 'blade', 'edge', 'quench', 'temper the blade', 'spearhead', 'axe head', 'hilt'], ['str', 'dex'], 'Master of Blades',
    [[['knife', 'arrowhead'], 1], [['short sword', 'axe head'], 10], [['longsword', 'spear'], 25], [['greatsword', 'pattern blade'], 45], [['legendary blade', 'rune-sword'], 70]]],
  jeweler:     ['Jeweler', 'You cut stones and work gold and silver into things people kill for.', ['jewel', 'gem', 'ring', 'necklace', 'cut the stone', 'goldsmith', 'silversmith', 'setting', 'polish the stone', 'jeweler'], ['dex', 'int'], 'Royal Jeweler',
    [[['copper ring', 'bead'], 1], [['silver ring', 'pendant'], 10], [['gold chain', 'cut gem'], 25], [['crown jewel', 'warded amulet'], 45], [['emberglass diadem', 'star-sapphire'], 70]]],
  mason:       ['Mason', 'You cut and lay stone: walls, wells, towers.', ['stone', 'mason', 'mortar', 'brick', 'lay stone', 'cut stone', 'build a wall', 'chisel the stone', 'masonry', 'quarry stone'], ['str', 'vit'], 'Master Mason',
    [[['step', 'kerb'], 1], [['wall', 'well'], 10], [['arch', 'tower'], 25], [['keep', 'vault'], 45], [['cathedral', 'citadel wall'], 70]]],
  potter:      ['Potter', 'You throw and fire pots, jars and vials.', ['clay', 'pot', 'pottery', 'kiln', 'wheel and clay', 'jar', 'vial', 'glaze', 'fire the kiln', 'throw a pot'], ['dex', 'wis'], 'Master Potter',
    [[['bowl', 'cup'], 1], [['jar', 'vial'], 10], [['glazed urn', 'amphora'], 25], [['alchemist glassware', 'fine porcelain'], 45], [['emberglaze', 'royal porcelain'], 70]]],
  leatherworker: ['Leatherworker', 'You tan hides and make boots, belts, saddles and leathers.', ['tan', 'tanning', 'leather', 'hide', 'saddle', 'boots', 'belt', 'stitch leather', 'cure the hide', 'scabbard'], ['dex', 'vit'], 'Master Tanner',
    [[['strap', 'pouch'], 1], [['belt', 'boots'], 10], [['saddle', 'leather jerkin'], 25], [['boiled leather armour', 'fine saddle'], 45], [['drakehide', 'shadow leather'], 70]]],
  weaver:      ['Weaver', 'You spin, dye and weave cloth.', ['weave', 'loom', 'spin', 'dye', 'yarn', 'wool', 'linen', 'cloth', 'spindle', 'tapestry'], ['dex', 'cha'], 'Master Weaver',
    [[['yarn', 'twine'], 1], [['linen', 'wool cloth'], 10], [['dyed cloth', 'blanket'], 25], [['tapestry', 'fine silk'], 45], [['royal tapestry', 'moonsilk'], 70]]],
  brewer:      ['Brewer', 'You brew ale, mead and stronger things.', ['brew ale', 'ale', 'beer', 'mead', 'wort', 'hops', 'malt', 'cask', 'ferment', 'distill', 'brewing'], ['vit', 'wis'], 'Master Brewer',
    [[['small beer', 'cider'], 1], [['ale', 'mead'], 10], [['stout', 'spirits'], 25], [['aged mead', 'fire-wine'], 45], [['emberbrew', 'dwarf-stout'], 70]]],
  baker:       ['Baker', 'You bake bread, pies and cakes before dawn.', ['bake', 'bread', 'dough', 'oven', 'knead', 'pie', 'pastry', 'loaf', 'flour', 'bakery'], ['vit', 'wis'], 'Master Baker',
    [[['flatbread', 'biscuit'], 1], [['loaf', 'pie'], 10], [['pastry', 'honeycake'], 25], [['feast bread', 'spiced cake'], 45], [['royal confection'], 70]]],
  butcher:     ['Butcher', 'You slaughter, cut and cure meat.', ['butcher', 'slaughter', 'carve the meat', 'cleaver', 'cure the meat', 'sausage', 'joint', 'carcass', 'flay the beast', 'smoke the meat'], ['str', 'vit'], 'Master Butcher',
    [[['rabbit', 'fowl'], 1], [['pig', 'goat'], 10], [['ox', 'boar'], 25], [['great beast', 'monster carcass'], 45], [['wyrm meat', 'titan carcass'], 70]]],
  farmer:      ['Farmer', 'You plough, sow, tend and harvest.', ['plough', 'plow', 'sow', 'harvest', 'field', 'crops', 'seed', 'tend the', 'scythe', 'reap', 'farm', 'milk the'], ['vit', 'str'], 'Lord of the Harvest',
    [[['weeds', 'garden'], 1], [['wheat', 'barley'], 10], [['orchard', 'herd'], 25], [['great estate'], 45], [['blight-proof grain'], 70]]],
  fisher:      ['Fisher', 'You net, hook and trap fish and eels.', ['fish', 'fishing', 'net', 'hook', 'bait', 'cast a line', 'eel', 'trap fish', 'rod and line', 'gut the fish'], ['dex', 'wis'], 'Master of the Waters',
    [[['minnow', 'perch'], 1], [['trout', 'eel'], 10], [['salmon', 'pike'], 25], [['sturgeon', 'deep fish'], 45], [['leviathan spawn'], 70]]],
  herbalist:   ['Herbalist', 'You know which plants heal, which harm and where they grow.', ['herb', 'herbs', 'forage', 'root', 'leaf', 'poultice', 'tincture', 'gather herbs', 'mushroom', 'salve', 'remedy'], ['wis', 'int'], 'Green Sage',
    [[['nettle', 'mint'], 1], [['yarrow', 'willow bark'], 10], [['nightshade', 'moonpetal'], 25], [['bloodroot', 'emberbloom'], 45], [['heartleaf', 'void lotus'], 70]]],
  tamer:       ['Tamer', 'You gentle, train and command beasts.', ['tame', 'train the', 'beast', 'hound', 'horse', 'break the horse', 'whistle', 'command the', 'calm the', 'handle the animal'], ['wis', 'cha'], 'Beastlord',
    [[['dog', 'goat'], 1], [['horse', 'hound'], 10], [['wolf', 'hawk'], 25], [['bear', 'warbeast'], 45], [['drake', 'gryphon'], 70]]],
  innkeeper:   ['Innkeeper', 'You keep a house: beds, board, ale and gossip.', ['innkeeper', 'serve', 'tavern', 'inn', 'pour', 'keep house', 'wait tables', 'rooms', 'guests', 'tend bar'], ['cha', 'vit'], 'Host of Renown',
    [[['sweep', 'mug'], 1], [['tables', 'rooms'], 10], [['feast night', 'full house'], 25], [['noble guests'], 45], [['royal visit'], 70]]],
  cartographer: ['Cartographer', 'You survey and draw the land.', ['map', 'chart', 'survey', 'draw the land', 'cartograph', 'measure the', 'compass', 'sketch the', 'landmark', 'coastline'], ['int', 'wis'], 'Royal Cartographer',
    [[['sketch', 'path'], 1], [['road map', 'valley'], 10], [['region chart', 'coastline'], 25], [['realm atlas'], 45], [['map of the void'], 70]]],
  sailor:      ['Sailor', 'You crew ships: rope, sail, oar and weather.', ['sail', 'ship', 'boat', 'rope', 'knot', 'rigging', 'oar', 'row', 'deck', 'helm', 'crew', 'tide'], ['dex', 'vit'], 'Master Mariner',
    [[['knot', 'oar'], 1], [['rigging', 'skiff'], 10], [['storm', 'cog'], 25], [['war galley'], 45], [['the far sea'], 70]]],
  gambler:     ['Gambler', 'You play cards and dice for coin, and read the people across the table.', ['gamble', 'dice', 'cards', 'bet', 'wager', 'cheat at', 'game of', 'bluff', 'stakes', 'odds'], ['cha', 'dex'], 'King of the Tables',
    [[['penny game'], 1], [['dice', 'cards'], 10], [['high table'], 25], [['noble game'], 45], [['the throne game'], 70]]],
  courtesan:   ['Courtesan', 'You sell company, charm and pleasure to those who can pay.', ['seduce', 'charm', 'courtesan', 'entertain', 'company', 'pleasure', 'client', 'dance for', 'flatter', 'companionship'], ['cha', 'dex'], 'Royal Favourite',
    [[['a drink with a stranger'], 1], [['a merchant'], 10], [['a lord'], 25], [['a great lady'], 45], [['a king'], 70]]],
  bounty_hunter: ['Bounty Hunter', 'You hunt people for the price on their heads.', ['bounty', 'hunt down', 'track the outlaw', 'wanted', 'manhunt', 'collect the bounty', 'warrant', 'outlaw', 'quarry'], ['dex', 'str'], 'The One They Send',
    [[['petty thief'], 1], [['bandit'], 10], [['murderer'], 25], [['warlord'], 45], [['legend'], 70]]],
  assassin:    ['Assassin', 'You kill for coin, and leave nothing behind.', ['assassinate', 'contract', 'kill for coin', 'poison the', 'garrote', 'mark for death', 'hit', 'silent kill', 'contract killing'], ['dex', 'int'], 'The Unseen Hand',
    [[['a drunk'], 1], [['a merchant'], 10], [['a guard captain'], 25], [['a lord'], 45], [['a ruler'], 70]]],
  smuggler:    ['Smuggler', 'You move what the law forbids past those who enforce it.', ['smuggle', 'contraband', 'hidden cargo', 'slip past the', 'false bottom', 'run goods', 'smuggling', 'black market'], ['dex', 'cha'], 'Shadow Merchant',
    [[['a pouch'], 1], [['a crate'], 10], [['a wagonload'], 25], [['a ship\'s hold'], 45], [['a kingdom\'s gold'], 70]]],
  gravedigger: ['Gravedigger', 'You bury the dead, and know what the dead do when they will not stay buried.', ['grave', 'bury', 'dig a grave', 'coffin', 'burial', 'corpse', 'graveyard', 'tomb', 'lay to rest', 'shroud'], ['str', 'wis'], 'Keeper of the Dead',
    [[['a pauper'], 1], [['a family plot'], 10], [['a crypt'], 25], [['a barrow'], 45], [['the restless dead'], 70]]]
};

const PROFESSIONS_EXTRA = {};
const TASKS_EXTRA = {};
for (const [key, [label, desc, affinities, stats, top, t]] of Object.entries(T)) {
  PROFESSIONS_EXTRA[key] = { label, desc, affinities, requirement: 10, primaryStats: stats, levels: ranks(label, top, stats) };
  TASKS_EXTRA[key] = tasks(t);
}

module.exports = { PROFESSIONS_EXTRA, TASKS_EXTRA };
