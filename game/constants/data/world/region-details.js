'use strict';

// =============================================================
// REGION DETAILS
// Gives every region in REGIONS a concrete identity on top of the
// existing label / desc / monster lists (which are left untouched):
//   settlement  — the place you rest, trade and revive (null = wild)
//   npcs        — named people you can "talk to"; faction ties
//   landmarks   — places to "explore", each a one-time discovery
//   hazard      — an environmental danger and the ward that stops it
//   resources   — what "gather" yields here (crafting materials)
//   reagent     — a rare material found only in this region's band
//
// Factions (see game/factions.js):
//   wardens  — the Ember Wardens, keepers of the world's fire
//   compact  — the Free Compact of the outer towns and Ironport
//   remnant  — the Veldrathi Remnant, heirs of the old empire
//   choir    — the Ashen Choir, who sing for the Throne to wake
// =============================================================

const HAZARDS = {
  fog:     { label: 'Grave-fog',      desc: 'A cold fog that hides the road and fills the lungs.',              damage: 0.04, ward: 'fog lantern' },
  miasma:  { label: 'Fen miasma',     desc: 'Rot-gas rises from the water and burns the throat.',               damage: 0.06, ward: 'fen-salt pouch' },
  cold:    { label: 'Killing cold',   desc: 'The cold here kills the unprepared within hours.',                 damage: 0.08, ward: 'fur-lined cloak' },
  heat:    { label: 'Cinder heat',    desc: 'The ground and air are hot enough to blister skin.',               damage: 0.08, ward: 'cinderproof salve' },
  blight:  { label: 'Ash-blight',     desc: 'Purple ash settles on everything and eats at living flesh.',        damage: 0.09, ward: 'blight mask' },
  void:    { label: 'Void-bleed',     desc: 'Reality slips. The body forgets, briefly, how to hold together.',   damage: 0.10, ward: 'void anchor' },
  corruption: { label: 'Wild corruption', desc: 'The trees drink warmth from anyone who lingers.',                damage: 0.05, ward: 'ember charm' }
};

const REGION_DETAILS = {
  // ---------------- TIER 1 ----------------
  thornwick: {
    settlement: { name: 'Thornwick village', kind: 'village', inn: 'the Crooked Plough' },
    npcs: [
      { id: 'hask', name: 'Old Hask', role: 'miller', faction: 'compact', greet: 'The wolves come out of the forest earlier every year. They are running from something, mark me.' },
      { id: 'brannoc', name: 'Brannoc', role: 'blacksmith', faction: 'compact', greet: 'Bring me ore and I can make you something that will not snap the first time it meets bone.' }
    ],
    landmarks: [
      { id: 'drowned_mill', name: 'the Drowned Mill', desc: 'An old mill half-sunk in the millpond. Something has been nesting in the wheelhouse.', guarded: true, reward: { xp: 30, coin: 20, item: 'miller\'s iron key' } },
      { id: 'standing_stone', name: 'the Black Standing Stone', desc: 'A stone carved with a flame inside a circle — a Warden mark, old and weathered.', reward: { xp: 20, lore: 'The flame-in-circle is the sign of the Ember Wardens. They watched this valley once.' } },
      { id: 'goblin_warren', name: 'the goblin warren under the ridge', desc: 'A warren dug into the ridge. The goblins have been hoarding odd black glass.', guarded: true, reward: { xp: 40, coin: 35, material: 'emberglass' } }
    ],
    hazard: null, resources: ['timber', 'herbs', 'hide'], reagent: null
  },
  dustfall: {
    settlement: { name: 'the Crossroads Waypost', kind: 'waypost', inn: 'the Waypost common room' },
    npcs: [
      { id: 'sarn', name: 'Sarn Dunmoor', role: 'caravan master', faction: 'compact', greet: 'The orc bands are moving south in numbers I have never seen. Like they are being pushed.' },
      { id: 'ilsa', name: 'Ilsa of the Grass', role: 'nomad scout', faction: 'compact', greet: 'The wind carries ash now. Fine grey ash, from the middle of the world.' }
    ],
    landmarks: [
      { id: 'scorpion_hollow', name: 'Scorpion Hollow', desc: 'A dry gully full of chitin husks and a few that are not empty.', guarded: true, reward: { xp: 30, coin: 25, material: 'hide' } },
      { id: 'burned_caravan', name: 'the burned caravan', desc: 'Six wagons burned in a ring. The bodies wear Warden flame-badges.', reward: { xp: 25, lore: 'Someone is hunting the Ember Wardens. The wagons were carrying black glass shards — all taken.' } }
    ],
    hazard: null, resources: ['hide', 'herbs'], reagent: null
  },
  ironport: {
    settlement: { name: 'Ironport City', kind: 'city', inn: 'the Salt Lantern' },
    npcs: [
      { id: 'crane', name: 'Harbourmaster Tobias Crane', role: 'harbourmaster', faction: 'compact', greet: 'Every ship from the inner sea comes in lighter than it left. Crews vanish. Cargo does not.' },
      { id: 'vesna', name: 'Vesna Coil', role: 'fence', faction: 'compact', greet: 'Black glass is the hot trade this season. Someone pays triple for it, and I do not ask who.' }
    ],
    landmarks: [
      { id: 'drowned_docks', name: 'the Drowned Docks', desc: 'The old dock district, flooded at high tide. Smugglers use it at low.', guarded: true, reward: { xp: 35, coin: 40, material: 'iron ore' } },
      { id: 'lantern_chapel', name: 'the Lantern Chapel', desc: 'A Warden chapel turned into a warehouse. The fire-bowl on the altar is still warm.', reward: { xp: 25, lore: 'The fire-bowl never goes out. The Wardens say each one is a spark of the Ember itself.' } }
    ],
    hazard: null, resources: ['iron ore', 'timber'], reagent: null
  },

  // ---------------- TIER 2 ----------------
  greymere: {
    settlement: { name: 'Greymere Outpost', kind: 'garrison', inn: 'the garrison mess' },
    npcs: [
      { id: 'halloran', name: 'Captain Halloran', role: 'garrison captain', faction: 'compact', greet: 'Half my men deserted. The other half hear drums in the fog at night.' },
      { id: 'old_wenna', name: 'Old Wenna', role: 'barrow-keeper', faction: 'wardens', greet: 'The barrows were sealed with Ember-fire. Someone has been putting the seals out.' }
    ],
    landmarks: [
      { id: 'kings_barrow', name: 'the King\'s Barrow', desc: 'The largest barrow on the moor. Its door-stone has been rolled aside.', guarded: true, reward: { xp: 60, coin: 50, material: 'bone' } },
      { id: 'drum_stones', name: 'the Drum Stones', desc: 'A ring of hollow stones that boom when the wind is right — or when struck.', reward: { xp: 40, lore: 'Chalked on the stones: a hymn to "the Throne that waits". The Ashen Choir has been here.' } }
    ],
    hazard: 'fog', resources: ['herbs', 'bone'], reagent: null
  },
  ashwood_shallow: {
    settlement: { name: 'the Hunter\'s Post', kind: 'camp', inn: 'the last safe fire' },
    npcs: [
      { id: 'tamsin', name: 'Tamsin Reed', role: 'huntress', faction: 'compact', greet: 'The leaves do not rot here. Nothing rots here. That is not a blessing.' },
      { id: 'elder_fen', name: 'Elder Fennick', role: 'hedge-druid', faction: 'wardens', greet: 'The forest is sick from the inside. Its heart is being fed ash.' }
    ],
    landmarks: [
      { id: 'silver_grove', name: 'the Silver Grove', desc: 'White-barked trees that hum faintly. A corrupted spring bubbles at the centre.', guarded: true, reward: { xp: 55, coin: 30, material: 'moonpetal' } },
      { id: 'hanging_shrine', name: 'the hanging shrine', desc: 'Wooden charms hang from every branch. Most are Warden flames, recently snapped.', reward: { xp: 40, lore: 'The Choir snaps Warden charms as they pass. They are moving inward, toward the Crucible.' } }
    ],
    hazard: 'corruption', resources: ['timber', 'herbs'], reagent: 'moonpetal'
  },
  oakhaven: {
    settlement: { name: 'Oakhaven', kind: 'town', inn: 'the Three Roads Inn' },
    npcs: [
      { id: 'marta', name: 'Marta Vell', role: 'innkeeper', faction: 'compact', greet: 'Three roads meet here, and lately all three bring bad news.' },
      { id: 'sexton', name: 'Sexton Abel', role: 'gravekeeper', faction: 'wardens', greet: 'The battle-graves are being opened. Not robbed. Opened from below.' }
    ],
    landmarks: [
      { id: 'old_battlefield', name: 'the old battlefield', desc: 'Scarred ground where the crops grow dark. Bones surface after every rain.', guarded: true, reward: { xp: 55, coin: 45, material: 'bone' } },
      { id: 'merchant_vault', name: 'the merchants\' vault', desc: 'A guild strongroom. Its ledgers record shipments of black glass going inward.', reward: { xp: 40, coin: 30, lore: 'Black glass — emberglass — is being bought up across the outer towns and carted toward the Fens.' } }
    ],
    hazard: null, resources: ['iron ore', 'herbs', 'timber'], reagent: null
  },
  saltenbay: {
    settlement: { name: 'Wreckers\' Rest', kind: 'village', inn: 'the Upturned Hull' },
    npcs: [
      { id: 'nell', name: 'Nell Tidewright', role: 'wrecker', faction: 'compact', greet: 'The tide pools glow at night now. Things climb out of them on two legs.' },
      { id: 'lighthouse_keeper', name: 'Keeper Osric', role: 'lighthouse keeper', faction: 'wardens', greet: 'My lamp is lit with an Ember-spark. The things from the water will not cross its light.' }
    ],
    landmarks: [
      { id: 'wreck_of_saint', name: 'the wreck of the Saint Aurel', desc: 'An imperial warship rotting on the rocks, centuries old and still dry inside.', guarded: true, reward: { xp: 60, coin: 70, material: 'silver ore' } },
      { id: 'glowing_pools', name: 'the glowing tide pools', desc: 'Pools lit from below by a sickly violet light.', reward: { xp: 40, lore: 'The violet glow is the same colour as the haze over the Blighted Reaches. The Ash is in the water too.' } }
    ],
    hazard: null, resources: ['timber', 'hide'], reagent: null
  },

  // ---------------- TIER 3 ----------------
  blackstone_foothills: {
    settlement: { name: 'Pickaxe Hollow', kind: 'mining camp', inn: 'the Pit-Head bunkhouse' },
    npcs: [
      { id: 'foreman_dagny', name: 'Foreman Dagny', role: 'mine foreman', faction: 'compact', greet: 'Shaft Nine went too deep. We heard singing down there, and then we heard nothing.' },
      { id: 'grisk', name: 'Grisk', role: 'kobold trader', faction: 'compact', greet: 'Grisk sells ore. Grisk does not go down Shaft Nine. Grisk is not stupid.' }
    ],
    landmarks: [
      { id: 'shaft_nine', name: 'Shaft Nine', desc: 'The deepest mine shaft. The walls are veined with black glass that is warm to the touch.', guarded: true, reward: { xp: 90, coin: 60, material: 'emberglass' } },
      { id: 'cairn_road', name: 'the Cairn Road', desc: 'A path lined with miners\' memorial cairns. Some have names carved this year.', reward: { xp: 60, material: 'iron ore' } }
    ],
    hazard: null, resources: ['iron ore', 'silver ore'], reagent: 'emberglass'
  },
  sunkenfen_edge: {
    settlement: { name: 'Stiltwater', kind: 'stilt village', inn: 'the Dry Plank' },
    npcs: [
      { id: 'mother_ysolde', name: 'Mother Ysolde', role: 'fen-witch', faction: 'compact', greet: 'The dead walk out of the deep fen in procession now. Singing. Always singing.' },
      { id: 'punter_jory', name: 'Jory the Punter', role: 'ferryman', faction: 'compact', greet: 'I pole people in. I pole fewer people out.' }
    ],
    landmarks: [
      { id: 'drowned_chapel', name: 'the drowned chapel', desc: 'A chapel sinking into the bog, its bell tolling with no rope.', guarded: true, reward: { xp: 85, coin: 55, material: 'bone' } },
      { id: 'procession_path', name: 'the procession path', desc: 'A causeway of bones laid flat, leading toward the Deep Fens.', reward: { xp: 60, lore: 'The dead are being walked inward. The Choir is gathering them for something at the centre of the world.' } }
    ],
    hazard: 'miasma', resources: ['herbs', 'bone'], reagent: null
  },
  ember_coast: {
    settlement: { name: 'Lighthollow', kind: 'Remnant enclave', inn: 'the Sunward Hall' },
    npcs: [
      { id: 'seraphine', name: 'Lady Seraphine Aurel', role: 'Remnant scholar-heir', faction: 'remnant', greet: 'These towers were Ember conduits. My ancestors built them to carry the world\'s fire. They are failing.' },
      { id: 'tower_warden', name: 'Brother Cael', role: 'tower-tender', faction: 'wardens', greet: 'Every tower that goes dark lets the Ash creep a mile further out.' }
    ],
    landmarks: [
      { id: 'burning_tower', name: 'the Burning Tower', desc: 'An imperial tower crowned with fire that needs no fuel.', guarded: true, reward: { xp: 90, coin: 70, material: 'sunstone' } },
      { id: 'sea_glass_shore', name: 'the sea-glass shore', desc: 'A beach of fused glass where the old empire fought something from the sea.', reward: { xp: 60, material: 'emberglass' } }
    ],
    hazard: 'heat', resources: ['silver ore', 'herbs'], reagent: 'sunstone'
  },
  bleached_flats: {
    settlement: { name: 'Salt-Camp', kind: 'salter camp', inn: 'the salters\' long tent' },
    npcs: [
      { id: 'salter_ruk', name: 'Ruk the Salter', role: 'salt-cutter', faction: 'compact', greet: 'The dead armies march on the flats at noon. You learn to stand still and let them pass.' }
    ],
    landmarks: [
      { id: 'standing_army', name: 'the standing army', desc: 'A legion of salt-crusted soldiers frozen mid-march. Some turn their heads.', guarded: true, reward: { xp: 85, coin: 65, material: 'bone' } },
      { id: 'salt_spire', name: 'the salt spire', desc: 'A natural spire with an imperial signal-fire at its top, long dead.', reward: { xp: 60, lore: 'The legions here died guarding the road inward. Their orders, carved in salt, say: "Let nothing reach the Throne."' } }
    ],
    hazard: 'heat', resources: ['hide', 'bone'], reagent: null
  },
  wyrmwood: {
    settlement: { name: 'Rootwatch', kind: 'tree-camp', inn: 'the hollow oak' },
    npcs: [
      { id: 'brisa', name: 'Warden Brisa Fell', role: 'Ember Warden', faction: 'wardens', greet: 'The forest is ancient enough to remember the Wardens. It still lets us pass — barely.' },
      { id: 'thrane', name: 'Thrane Oakhand', role: 'woodward', faction: 'compact', greet: 'Something under the roots turns over in its sleep. The whole forest lifts.' }
    ],
    landmarks: [
      { id: 'root_cathedral', name: 'the Root Cathedral', desc: 'A cavern of living roots vast enough to hold a city.', guarded: true, reward: { xp: 95, coin: 60, material: 'wyrm scale' } },
      { id: 'weather_tree', name: 'the Weather Tree', desc: 'A single tree under which it is always raining.', reward: { xp: 60, material: 'moonpetal' } }
    ],
    hazard: 'corruption', resources: ['timber', 'herbs', 'hide'], reagent: 'wyrm scale'
  },
  ruinwatch: {
    settlement: { name: 'the Ruinwatch garrison', kind: 'Warden garrison', inn: 'the garrison hall' },
    npcs: [
      { id: 'calloway', name: 'Warden-Commander Idris Calloway', role: 'Warden commander', faction: 'wardens', greet: 'Ruinwatch fell in one night. Forty thousand people. We are still counting what was taken.' },
      { id: 'pick', name: 'Pick', role: 'scavenger child', faction: 'compact', greet: 'I know every safe hole in the rubble. Mostly safe. Some safe.' }
    ],
    landmarks: [
      { id: 'fallen_cathedral', name: 'the fallen cathedral', desc: 'The great cathedral of Ruinwatch, collapsed inward as if something pulled it down from inside.', guarded: true, reward: { xp: 100, coin: 80, material: 'silver ore' } },
      { id: 'empty_market', name: 'the empty market', desc: 'Stalls still laid with rotting goods. Every person simply gone.', reward: { xp: 65, lore: 'Ruinwatch was not destroyed. It was harvested — its people taken in one night, like the Hollowed Kingdom long ago.' } }
    ],
    hazard: null, resources: ['iron ore', 'silver ore'], reagent: null
  },

  // ---------------- TIER 4 ----------------
  ashwood_deep: {
    settlement: { name: 'Warden\'s Hollow', kind: 'hidden Warden camp', inn: 'a fire-pit under the roots' },
    npcs: [
      { id: 'wildheart', name: 'Wildheart Sela', role: 'druid of the Deep', faction: 'wardens', greet: 'The trees here know your name. Do not answer when they call it.' }
    ],
    landmarks: [
      { id: 'heart_tree', name: 'the Heart-Tree', desc: 'The forest\'s heart, black and weeping ash where sap should run.', guarded: true, reward: { xp: 140, coin: 90, material: 'moonpetal' } },
      { id: 'name_grove', name: 'the Grove of Names', desc: 'Trees with faces in the bark. They whisper the names of the taken.', reward: { xp: 95, lore: 'The trees remember the people of Ruinwatch. Their souls passed through here, inward, toward the Pale City.' } }
    ],
    hazard: 'corruption', resources: ['timber', 'herbs'], reagent: 'moonpetal'
  },
  blackstone_peaks: {
    settlement: { name: 'Banner Keep', kind: 'mountain fortress', inn: 'the keep\'s cold hall' },
    npcs: [
      { id: 'castellan', name: 'Castellan Hroth', role: 'last castellan', faction: 'compact', greet: 'Our banners still fly because there is no one left to take them down.' }
    ],
    landmarks: [
      { id: 'wyvern_eyrie', name: 'the wyvern eyrie', desc: 'A cliff-face honeycombed with nests.', guarded: true, reward: { xp: 140, coin: 100, material: 'wyrm scale' } },
      { id: 'dwarf_forge', name: 'the dead dwarf-forge', desc: 'An ancient forge whose anvil is a block of black glass.', reward: { xp: 95, material: 'mithril ore' } }
    ],
    hazard: 'cold', resources: ['iron ore', 'mithril ore'], reagent: 'mithril ore'
  },
  coldsnap_pass: {
    settlement: { name: 'Pass-Fort Ennick', kind: 'pass fort', inn: 'the guardhouse' },
    npcs: [
      { id: 'sergeant_bree', name: 'Sergeant Bree', role: 'pass-warden', faction: 'compact', greet: 'Three armies held this pass. I am what is left of the third.' }
    ],
    landmarks: [
      { id: 'frozen_host', name: 'the frozen host', desc: 'An army frozen in the ice of the pass, eyes still open.', guarded: true, reward: { xp: 135, coin: 95, material: 'frost crystal' } },
      { id: 'avalanche_shrine', name: 'the avalanche shrine', desc: 'A shrine where travellers leave offerings to be let through.', reward: { xp: 90, coin: 40 } }
    ],
    hazard: 'cold', resources: ['iron ore', 'hide'], reagent: 'frost crystal'
  },
  sunkenfen_deep: {
    settlement: { name: 'the Last Stilts', kind: 'smugglers\' hide', inn: 'a dry loft' },
    npcs: [
      { id: 'heron', name: 'Heron', role: 'smuggler', faction: 'compact', greet: 'Choir boats go in full and come out empty. I count them. Nobody pays me to, I just count.' }
    ],
    landmarks: [
      { id: 'lich_spire', name: 'the bone spire', desc: 'A spire of fused skulls rising from black water.', guarded: true, reward: { xp: 145, coin: 100, material: 'bone' } },
      { id: 'choir_barges', name: 'the Choir barges', desc: 'Empty funeral barges tied up in rows.', reward: { xp: 95, lore: 'The barges carry the dead inward, toward the Pale City. The lich cult is only the ferryman.' } }
    ],
    hazard: 'miasma', resources: ['herbs', 'bone'], reagent: null
  },
  veldrath_border: {
    settlement: { name: 'Marchgate', kind: 'border town', inn: 'the Sun and Shackle' },
    npcs: [
      { id: 'magistrate', name: 'Magistrate Corvin Dast', role: 'Remnant magistrate', faction: 'remnant', greet: 'Veldrath ended here once. It begins again here, if we have our way.' }
    ],
    landmarks: [
      { id: 'imperial_milestone', name: 'the imperial milestone', desc: 'A milestone that still speaks the distance to the capital, in a dead tongue.', reward: { xp: 95, lore: 'The milestone counts down not to Old Veldrath but to "the Throne". The empire was built to guard it.' } },
      { id: 'border_bastion', name: 'the border bastion', desc: 'An imperial bastion overrun by things that wear old legion armour.', guarded: true, reward: { xp: 140, coin: 110, material: 'sunstone' } }
    ],
    hazard: 'heat', resources: ['silver ore', 'hide'], reagent: 'sunstone'
  },

  // ---------------- TIER 5 ----------------
  frozennorth_reaches: {
    settlement: { name: 'Hearthstead', kind: 'tundra hold', inn: 'the long hearth' },
    npcs: [
      { id: 'jarl_eydis', name: 'Jarl Eydis', role: 'hold chief', faction: 'compact', greet: 'Under the ice, things older than giants are waking. The Ember kept them asleep.' }
    ],
    landmarks: [
      { id: 'permafrost_tomb', name: 'the permafrost tomb', desc: 'A tomb cut into the ice, its occupant missing.', guarded: true, reward: { xp: 190, coin: 140, material: 'frost crystal' } },
      { id: 'aurora_stones', name: 'the aurora stones', desc: 'Stones that burn with cold green light at night.', reward: { xp: 130, material: 'frost crystal' } }
    ],
    hazard: 'cold', resources: ['hide', 'mithril ore'], reagent: 'frost crystal'
  },
  deepmark: {
    settlement: { name: 'Canopy Rest', kind: 'treetop camp', inn: 'a woven sleeping-loft' },
    npcs: [
      { id: 'lantern_ama', name: 'Ama of the Lanterns', role: 'canopy-dweller', faction: 'wardens', greet: 'We keep Ember-lanterns burning in the canopy. The things below hate the light.' }
    ],
    landmarks: [
      { id: 'canopy_court', name: 'the Canopy Court', desc: 'A court of the things that never come down.', guarded: true, reward: { xp: 195, coin: 130, material: 'ash-silk' } },
      { id: 'sunless_floor', name: 'the sunless floor', desc: 'The forest floor, where no light has fallen in a thousand years.', reward: { xp: 130, material: 'timber' } }
    ],
    hazard: 'corruption', resources: ['timber', 'herbs', 'ash-silk'], reagent: 'ash-silk'
  },
  scar_vale: {
    settlement: { name: 'Scarwatch', kind: 'Warden fort', inn: 'the fort barracks' },
    npcs: [
      { id: 'lieutenant_aske', name: 'Lieutenant Aske', role: 'Warden officer', faction: 'wardens', greet: 'The war that scarred this valley was the first war against the Throne. We lost. Barely.' }
    ],
    landmarks: [
      { id: 'great_scar', name: 'the Great Scar', desc: 'A chasm that runs the length of the vale, still smoking.', guarded: true, reward: { xp: 190, coin: 140, material: 'emberglass' } },
      { id: 'war_memorial', name: 'the war memorial', desc: 'A monument listing the first Wardens who lit the Ember.', reward: { xp: 130, lore: 'The first Wardens did not destroy the thing on the Throne. They could not. They lit the Ember to keep it sleeping.' } }
    ],
    hazard: 'blight', resources: ['iron ore', 'bone', 'mithril ore'], reagent: 'emberglass'
  },
  void_fringe: {
    settlement: { name: 'Anchorpoint', kind: 'research camp', inn: 'the anchored tents' },
    npcs: [
      { id: 'magister_ilo', name: 'Magister Ilo', role: 'void scholar', faction: 'remnant', greet: 'Keep a void anchor on you or you may find your hand three inches from your wrist.' }
    ],
    landmarks: [
      { id: 'folded_hill', name: 'the folded hill', desc: 'A hill that is also, somehow, its own underside.', guarded: true, reward: { xp: 195, coin: 140, material: 'void shard' } },
      { id: 'mirror_lake', name: 'the mirror lake', desc: 'A lake that reflects a sky with a different sun.', reward: { xp: 130, material: 'void shard' } }
    ],
    hazard: 'void', resources: ['silver ore', 'void shard'], reagent: 'void shard'
  },
  ashen_vale: {
    settlement: { name: 'Cinderhold', kind: 'ash-farm', inn: 'the cinder-house' },
    npcs: [
      { id: 'ashwife', name: 'the Ash-Wife', role: 'ash-farmer', faction: 'compact', greet: 'The ash is warm because it is still burning, deep down. Something old fell here.' }
    ],
    landmarks: [
      { id: 'fallen_star', name: 'the fallen star', desc: 'A crater with a glowing core that has not cooled in an age.', guarded: true, reward: { xp: 195, coin: 140, material: 'sunstone' } },
      { id: 'ash_fields', name: 'the ash fields', desc: 'Grey fields where crops grow in warm ash.', reward: { xp: 130, material: 'herbs' } }
    ],
    hazard: 'heat', resources: ['herbs', 'sunstone'], reagent: 'sunstone'
  },
  old_veldrath: {
    settlement: { name: 'Sunspire', kind: 'Remnant capital', inn: 'the Hall of Sunward Kings' },
    npcs: [
      { id: 'seraphine_court', name: 'Lady Seraphine Aurel', role: 'Remnant heir', faction: 'remnant', greet: 'The monuments still function. With the Sun-Key, they could bind the Throne instead of merely sleeping it.' },
      { id: 'archivist', name: 'Archivist Pell', role: 'imperial archivist', faction: 'remnant', greet: 'The empire did not fall. It went to sleep beside the thing it was guarding.' }
    ],
    landmarks: [
      { id: 'sun_monument', name: 'the Sun Monument', desc: 'A colossal sundial whose shadow points inward no matter where the sun is.', guarded: true, reward: { xp: 200, coin: 160, material: 'sunstone' } },
      { id: 'imperial_archive', name: 'the imperial archive', desc: 'A buried library, dry and intact.', reward: { xp: 140, lore: 'The archive names the thing on the Throne: the Hollow Sovereign, the first ruler, who made the world in the Crucible and wishes to unmake it.' } }
    ],
    hazard: 'heat', resources: ['silver ore', 'sunstone'], reagent: 'sunstone'
  },
  pale_city_approach: {
    settlement: { name: 'the Pilgrims\' Camp', kind: 'refugee camp', inn: 'a patched tent' },
    npcs: [
      { id: 'pilgrim_ora', name: 'Ora', role: 'refugee elder', faction: 'compact', greet: 'We came to find our dead. They are in the white city. They are walking.' }
    ],
    landmarks: [
      { id: 'pale_road', name: 'the Pale Road', desc: 'A white road lined with the kneeling dead, all facing the city.', guarded: true, reward: { xp: 195, coin: 140, material: 'bone' } },
      { id: 'spire_view', name: 'the spire-view ridge', desc: 'A ridge from which the Pale City\'s spires can be counted.', reward: { xp: 130, lore: 'The spires pulse in time — like a heart. The Pale City is a vessel, filling with souls.' } }
    ],
    hazard: 'blight', resources: ['bone', 'herbs'], reagent: null
  },

  // ---------------- TIER 6 ----------------
  blighted_reaches: {
    settlement: { name: 'Last Hearth', kind: 'Warden outpost', inn: 'the sealed bunker' },
    npcs: [
      { id: 'warden_tove', name: 'Warden Tove', role: 'outpost keeper', faction: 'wardens', greet: 'The haze is the Ash breathing out. Keep your mask on.' }
    ],
    landmarks: [
      { id: 'haze_heart', name: 'the haze-heart', desc: 'A pit from which the purple haze pours like smoke from a chimney.', guarded: true, reward: { xp: 260, coin: 200, material: 'void shard' } },
      { id: 'blight_garden', name: 'the blight garden', desc: 'Flowers made of ash, perfectly preserved.', reward: { xp: 180, material: 'ash-silk' } }
    ],
    hazard: 'blight', resources: ['bone', 'ash-silk', 'mithril ore'], reagent: 'ash-silk'
  },
  crucible_approach: {
    settlement: { name: 'Slagtown', kind: 'forge camp', inn: 'the slag-house' },
    npcs: [
      { id: 'forgemaster_ulla', name: 'Forgemaster Ulla', role: 'forge-mistress', faction: 'compact', greet: 'Rock that never cools makes the best forging heat in the world. Mind your boots.' }
    ],
    landmarks: [
      { id: 'magma_stair', name: 'the magma stair', desc: 'Steps carved into living rock, glowing between the cracks.', guarded: true, reward: { xp: 260, coin: 200, material: 'emberglass' } },
      { id: 'cooling_pool', name: 'the cooling pool', desc: 'A pool where the ancients quenched what they forged.', reward: { xp: 180, material: 'mithril ore' } }
    ],
    hazard: 'heat', resources: ['mithril ore', 'emberglass'], reagent: 'emberglass'
  },
  hollowed_kingdom: {
    settlement: { name: 'the Steward\'s House', kind: 'abandoned manor', inn: 'a furnished bedchamber' },
    npcs: [
      { id: 'steward', name: 'The Last Steward', role: 'ghostly steward', faction: 'wardens', greet: 'The tables are set for a feast no one came back for. Please, sit. Someone should eat.' }
    ],
    landmarks: [
      { id: 'throne_room', name: 'the empty throne room', desc: 'A royal hall, every candle lit, every seat empty.', guarded: true, reward: { xp: 260, coin: 220, material: 'silver ore' } },
      { id: 'nursery', name: 'the royal nursery', desc: 'A nursery where the cradles still rock.', reward: { xp: 180, lore: 'The kingdom was emptied by the first Pale Cantor, a thousand years ago. Every soul fed to the Throne bought it another century of waking.' } }
    ],
    hazard: null, resources: ['silver ore', 'timber'], reagent: null
  },
  sunken_citadel: {
    settlement: { name: 'the Tidewall', kind: 'citadel ruin', inn: 'a dry gallery' },
    npcs: [
      { id: 'drowned_knight', name: 'Sir Aldric the Drowned', role: 'undead knight', faction: 'remnant', greet: 'I swore to hold this citadel until relieved. Are you my relief?' }
    ],
    landmarks: [
      { id: 'glowing_cistern', name: 'the glowing cistern', desc: 'A flooded cistern lit from below by drowned Ember-lamps.', guarded: true, reward: { xp: 265, coin: 210, material: 'void shard' } },
      { id: 'moving_walls', name: 'the moving walls', desc: 'Walls that shift when you are not looking at them.', reward: { xp: 180, material: 'mithril ore' } }
    ],
    hazard: 'miasma', resources: ['mithril ore', 'void shard'], reagent: 'void shard'
  },
  pale_city: {
    settlement: { name: 'the Smugglers\' Undercroft', kind: 'hidden den', inn: 'the undercroft' },
    npcs: [
      { id: 'brother_lucan', name: 'Brother Lucan', role: 'Choir defector', faction: 'choir', greet: 'I sang in the Choir for twenty years. Then I heard what we were singing to.' }
    ],
    landmarks: [
      { id: 'soul_vessel', name: 'the soul-vessel spire', desc: 'A spire of white stone, thrumming with the trapped voices of thousands.', guarded: true, reward: { xp: 270, coin: 230, material: 'void shard' } },
      { id: 'white_market', name: 'the white market', desc: 'A market where the dead buy and sell nothing, forever.', reward: { xp: 180, coin: 100 } }
    ],
    hazard: 'blight', resources: ['bone', 'silver ore'], reagent: null
  },
  bone_desert: {
    settlement: { name: 'the Oasis of Teeth', kind: 'nomad oasis', inn: 'a bone-ribbed tent' },
    npcs: [
      { id: 'bone_reader', name: 'Kesh the Bone-Reader', role: 'nomad seer', faction: 'compact', greet: 'Nothing dies here. It changes. I read what it is changing into.' }
    ],
    landmarks: [
      { id: 'bone_colossus', name: 'the sleeping colossus', desc: 'A skeleton the size of a hill, half-buried in sand.', guarded: true, reward: { xp: 265, coin: 210, material: 'bone' } },
      { id: 'glass_dunes', name: 'the glass dunes', desc: 'Dunes fused to glass by some ancient heat.', reward: { xp: 180, material: 'emberglass' } }
    ],
    hazard: 'heat', resources: ['bone', 'hide', 'emberglass'], reagent: 'emberglass'
  },

  // ---------------- TIER 7 ----------------
  crucible_gate: {
    settlement: { name: 'Gate-Camp', kind: 'siege camp', inn: 'a siege-shelter' },
    npcs: [
      { id: 'siege_marshal', name: 'Siege-Marshal Orren', role: 'siege commander', faction: 'wardens', greet: 'The gate is alive. We have been besieging a living thing for a decade.' }
    ],
    landmarks: [
      { id: 'living_gate', name: 'the living gate', desc: 'A gate of fused bone and iron that breathes.', guarded: true, reward: { xp: 330, coin: 260, material: 'emberglass' } },
      { id: 'siege_lines', name: 'the old siege lines', desc: 'Trenches dug by Wardens across a thousand years.', reward: { xp: 230, material: 'mithril ore' } }
    ],
    hazard: 'heat', resources: ['mithril ore', 'emberglass'], reagent: 'star-iron'
  },
  shattered_march: {
    settlement: { name: 'the Truce Ground', kind: 'neutral camp', inn: 'the truce-fire' },
    npcs: [
      { id: 'ghost_general', name: 'General Vaska', role: 'undying general', faction: 'remnant', greet: 'We have fought for nine hundred years. I no longer remember which side I chose.' }
    ],
    landmarks: [
      { id: 'endless_line', name: 'the endless battle-line', desc: 'A line of combatants locked in a war without end.', guarded: true, reward: { xp: 330, coin: 260, material: 'star-iron' } },
      { id: 'war_banner', name: 'the first banner', desc: 'The banner of the first army to march against the Throne.', reward: { xp: 230, lore: 'The banner shows the Ember and the Sun together. Wardens and empire once fought as one.' } }
    ],
    hazard: 'blight', resources: ['iron ore', 'mithril ore', 'bone'], reagent: 'star-iron'
  },
  void_marches: {
    settlement: { name: 'the Stillpoint', kind: 'anchored refuge', inn: 'a nailed-down room' },
    npcs: [
      { id: 'anchor_monk', name: 'Anchor-Monk Teo', role: 'void monk', faction: 'wardens', greet: 'Here, you must decide to exist every morning. Some forget.' }
    ],
    landmarks: [
      { id: 'tear_in_sky', name: 'the tear in the sky', desc: 'A rip in the sky that looks down on a dark, waiting throne.', guarded: true, reward: { xp: 335, coin: 270, material: 'void shard' } },
      { id: 'unfinished_road', name: 'the unfinished road', desc: 'A road that ends in nothing.', reward: { xp: 230, material: 'void shard' } }
    ],
    hazard: 'void', resources: ['void shard', 'silver ore'], reagent: 'void shard'
  },
  eternal_breach: {
    settlement: { name: 'Breachwatch', kind: 'Warden watchtower', inn: 'the watch-room' },
    npcs: [
      { id: 'watcher_mira', name: 'Watcher Mira', role: 'breach-watcher', faction: 'wardens', greet: 'Ten thousand years it has bled. Lately it bleeds faster.' }
    ],
    landmarks: [
      { id: 'breach_lip', name: 'the lip of the breach', desc: 'The edge of a wound in the world, pouring raw power.', guarded: true, reward: { xp: 340, coin: 280, material: 'star-iron' } },
      { id: 'power_falls', name: 'the power-falls', desc: 'Light falling upward like a waterfall.', reward: { xp: 230, material: 'void shard' } }
    ],
    hazard: 'void', resources: ['void shard', 'star-iron'], reagent: 'star-iron'
  },

  // ---------------- TIER 8–10 ----------------
  the_crucible: {
    settlement: { name: 'the Anvil Camp', kind: 'Warden forward camp', inn: 'the anvil-fire' },
    npcs: [
      { id: 'ember_keeper', name: 'Ember-Keeper Solenne', role: 'keeper of the Ember', faction: 'wardens', greet: 'The Ember is down to a coal. If it goes out, the Sovereign wakes fully.' }
    ],
    landmarks: [
      { id: 'world_forge', name: 'the World-Forge', desc: 'The forge where the world was made. Its fire is the Ember — barely alight.', guarded: true, reward: { xp: 420, coin: 340, material: 'star-iron' } },
      { id: 'maker_hall', name: 'the hall of makers', desc: 'Statues of beings who were here before people.', reward: { xp: 300, lore: 'The makers forged the world and the Sovereign ruled it. When people were made, the Sovereign tried to unmake them. The makers broke its throne and died doing it.' } }
    ],
    hazard: 'heat', resources: ['star-iron', 'emberglass', 'mithril ore'], reagent: 'star-iron'
  },
  the_core_wastes: {
    settlement: { name: 'Last Light', kind: 'final Warden bastion', inn: 'the bastion hall' },
    npcs: [
      { id: 'last_warden', name: 'High Warden Ashby', role: 'High Warden', faction: 'wardens', greet: 'Everything the world\'s monsters feared is here. So are we.' }
    ],
    landmarks: [
      { id: 'cantor_cathedral', name: 'the Cantor\'s cathedral', desc: 'A cathedral of ash where the Choir sings without pause.', guarded: true, reward: { xp: 520, coin: 420, material: 'star-iron' } },
      { id: 'dead_air', name: 'the dead air', desc: 'A plain where even sound has given up.', reward: { xp: 360, material: 'void shard' } }
    ],
    hazard: 'void', resources: ['star-iron', 'void shard'], reagent: 'star-iron'
  },
  shattered_throne: {
    settlement: null,
    npcs: [],
    landmarks: [
      { id: 'throne_steps', name: 'the throne steps', desc: 'Ten thousand steps of black glass, each one warm.', guarded: true, reward: { xp: 620, coin: 500, material: 'star-iron' } }
    ],
    hazard: 'void', resources: ['star-iron'], reagent: 'star-iron'
  }
};

// Material tiers: the tier at which each material first appears.
// Used by crafting to cap and boost quality.
const MATERIALS = {
  'timber':      { tier: 1, kind: 'wood' },
  'hide':        { tier: 1, kind: 'hide' },
  'herbs':       { tier: 1, kind: 'herb' },
  'iron ore':    { tier: 1, kind: 'ore' },
  'bone':        { tier: 2, kind: 'bone' },
  'silver ore':  { tier: 2, kind: 'ore' },
  'moonpetal':   { tier: 2, kind: 'herb', rare: true },
  'emberglass':  { tier: 3, kind: 'reagent', rare: true },
  'sunstone':    { tier: 3, kind: 'reagent', rare: true },
  'wyrm scale':  { tier: 3, kind: 'hide', rare: true },
  'mithril ore': { tier: 4, kind: 'ore' },
  'frost crystal': { tier: 4, kind: 'reagent', rare: true },
  'ash-silk':    { tier: 5, kind: 'cloth', rare: true },
  'void shard':  { tier: 5, kind: 'reagent', rare: true },
  'star-iron':   { tier: 7, kind: 'ore', rare: true }
};

// Merges details into REGIONS (in place) and builds a symmetric road
// graph: region data lists some roads in only one direction, which made
// parts of the world one-way or unreachable.
function applyRegionDetails(REGIONS) {
  const adj = {};
  for (const key of Object.keys(REGIONS)) adj[key] = new Set();
  for (const [key, r] of Object.entries(REGIONS)) {
    const c = r.connections || {};
    for (const other of [...(c.same || []), ...(c.prev || []), ...(c.next || [])]) {
      if (!REGIONS[other] || other === key) continue;
      adj[key].add(other);
      adj[other].add(key);
    }
  }
  for (const [key, r] of Object.entries(REGIONS)) {
    const d = REGION_DETAILS[key] || {};
    r.adjacent   = [...adj[key]];
    r.settlement = d.settlement || null;
    r.npcs       = d.npcs || [];
    r.landmarks  = d.landmarks || [];
    r.hazard     = d.hazard ? { key: d.hazard, ...HAZARDS[d.hazard] } : null;
    r.resources  = d.resources || [];
    r.reagent    = d.reagent || null;
    if (r.settlement) {
      r.hasBountyBoard = true;
      if (!r.boardLabel) r.boardLabel = `the notice board at ${r.settlement.name}`;
    }
  }
  return REGIONS;
}

module.exports = { REGION_DETAILS, HAZARDS, MATERIALS, applyRegionDetails };
