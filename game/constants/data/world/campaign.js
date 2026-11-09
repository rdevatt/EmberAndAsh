'use strict';

// =============================================================
// MAIN CAMPAIGN — "EMBER AND ASH"
//
// The world is a set of rings around the Shattered Throne. Before
// people existed, the Hollow Sovereign ruled from it; the makers who
// forged the world in the Crucible broke its throne, and the first
// Ember Wardens lit the Ember — the world's living fire — to keep the
// Sovereign asleep. Its power still bleeds from the Eternal Breach as
// Ash: the corruption in the Ashwood, the purple haze, the restless
// dead. The Ember is guttering. The Ashen Choir is feeding the
// Sovereign souls (the Hollowed Kingdom long ago, Ruinwatch now) so it
// will wake. The player begins at the outer rim and ends at the
// Throne.
//
// Step types
//   talk    { npc, region }                — "talk to <npc>" there
//   travel  { region }                     — arrive in region
//   explore { region, landmark }           — explore that landmark
//   boss    { region, boss }               — "confront <boss>" there; defeat it
//   choice  { prompt, options[] }          — "choose N"
// region 'start' = the region the player was in when the story began.
// =============================================================

// Story NPCs who are not tied to one region's NPC list.
const STORY_NPCS = {
  maren: { name: 'Maren Holt', role: 'Ember Warden scout', faction: 'wardens' }
};

// Boss templates. Level is fixed (not scaled to the player).
// mechanics:
//   special  — telegraphed heavy attack every N enemy turns (defend to blunt it)
//   phases   — triggered once at an HP fraction: enrage | summon | ward | heal
//   element  — damage type of its spells / specials (armour helps less)
const BOSSES = {
  varrick: {
    label: 'Varrick Thorne, the Ash-Fence', level: 8, hpMult: 2.6, mods: { str: 3, dex: 3, vit: 2 },
    behavior: 'tactical', desc: 'A bandit captain who sells Warden emberglass to the Ashen Choir. Quick, dirty, and very well paid.',
    special: { every: 3, name: 'Dirty Trick', telegraph: 'Varrick palms a fistful of grit and shifts his weight', mult: 1.8, status: 'weaken' },
    phases: [{ at: 0.5, effect: 'summon', text: 'Varrick whistles — two of his cutthroats rush in from the dark.', rounds: 3 }]
  },
  ulric: {
    label: 'Ulric, the Barrow King', level: 18, hpMult: 3.0, mods: { str: 5, dex: 0, vit: 5 },
    behavior: 'aggressive', desc: 'A king of the old moor, dragged from his barrow by Choir hymns. His oath to guard the dead has curdled into a hunger to join them.',
    special: { every: 3, name: 'Grave Cleave', telegraph: 'Ulric lifts his barrow-blade high, frost crawling up the steel', mult: 2.1, element: 'frost' },
    phases: [{ at: 0.4, effect: 'heal', text: 'Ulric drinks the cold from the barrow air. His wounds knit with frost.', amount: 0.2 }]
  },
  rubble_maw: {
    label: 'The Rubble-Maw', level: 28, hpMult: 3.2, mods: { str: 7, dex: -1, vit: 7 },
    behavior: 'territorial', desc: 'The thing that harvested Ruinwatch — a Choir-made beast of stone and stolen voices, still digging through the rubble for anyone it missed.',
    special: { every: 3, name: 'Collapse', telegraph: 'The Rubble-Maw rears up, dragging a wall of masonry over you', mult: 2.2 },
    phases: [{ at: 0.5, effect: 'ward', text: 'Stone plates grind shut over the Rubble-Maw\'s wounds.', amount: 0.15 }]
  },
  morwen: {
    label: 'Mother Morwen, Lich of the Fens', level: 38, hpMult: 3.0, mods: { str: 2, dex: 4, vit: 4 },
    behavior: 'tactical', caster: true, desc: 'The ferryman of the Choir, who walks the dead inward on bone barges. Her phylactery hangs at her throat.',
    special: { every: 3, name: 'Drowning Hymn', telegraph: 'Morwen begins to sing, and black water rises around your legs', mult: 2.0, element: 'shadow', status: 'poison' },
    phases: [
      { at: 0.6, effect: 'summon', text: 'The fen gives up its dead — drowned thralls claw their way onto the causeway.', rounds: 3 },
      { at: 0.3, effect: 'ward', text: 'Morwen wraps herself in a shroud of grave-mist.', amount: 0.15 }
    ]
  },
  sun_warden: {
    label: 'The Sun Monument\'s Warden', level: 48, hpMult: 3.3, mods: { str: 8, dex: 0, vit: 9 },
    behavior: 'territorial', desc: 'An imperial construct of bronze and sunstone, built to guard the Sun-Key until the empire returns.',
    special: { every: 3, name: 'Solar Lance', telegraph: 'The Warden\'s chest-plate opens on a core of white fire', mult: 2.3, element: 'fire', status: 'burn' },
    phases: [{ at: 0.5, effect: 'enrage', text: 'Its sunstone core blazes white. The construct moves faster, hotter.' }]
  },
  seneschal: {
    label: 'The Pale Seneschal', level: 58, hpMult: 3.4, mods: { str: 6, dex: 6, vit: 6 },
    behavior: 'tactical', caster: true, desc: 'The Cantor\'s steward in the white city — a thing of porcelain skin and borrowed souls, which wears a different face each time it speaks.',
    special: { every: 3, name: 'Soul Rend', telegraph: 'The Seneschal\'s faces all turn toward you at once and open their mouths', mult: 2.2, element: 'shadow', status: 'weaken' },
    phases: [
      { at: 0.6, effect: 'heal', text: 'It drinks a soul from the spire. A face screams and goes quiet.', amount: 0.15 },
      { at: 0.3, effect: 'enrage', text: 'The Seneschal sheds its porcelain and fights as raw, borrowed fury.' }
    ]
  },
  living_gate: {
    label: 'The Living Gate', level: 68, hpMult: 3.6, mods: { str: 9, dex: -2, vit: 11 },
    behavior: 'territorial', desc: 'The gate of the Crucible: a wall of fused bone and iron that breathes, and has eaten every army sent against it.',
    special: { every: 3, name: 'Devouring Maw', telegraph: 'The gate\'s bars peel open like ribs, and it inhales', mult: 2.4 },
    phases: [
      { at: 0.65, effect: 'ward', text: 'Iron grows over the gate\'s wounds like scar tissue.', amount: 0.15 },
      { at: 0.35, effect: 'summon', text: 'The gate vomits up the half-digested soldiers of a dozen sieges.', rounds: 3 }
    ]
  },
  kharzul: {
    label: 'Kharzul the Ember-Eater', level: 78, hpMult: 3.6, mods: { str: 10, dex: 4, vit: 10 },
    behavior: 'predator', desc: 'An ash-wyrm that has been gnawing at the Ember for a hundred years. Its scales are cinders; its breath is the Ash itself.',
    special: { every: 3, name: 'Ashen Breath', telegraph: 'Kharzul\'s throat glows violet as it draws a long breath', mult: 2.5, element: 'fire', status: 'burn' },
    phases: [
      { at: 0.4, effect: 'enrage', text: 'Kharzul tears free a mouthful of the Ember and swallows it. It burns brighter.' },
      { at: 0.3, effect: 'heal', text: 'The wyrm curls around the World-Forge and feeds.', amount: 0.15 }
    ]
  },
  cantor: {
    label: 'Severin, the Pale Cantor', level: 88, hpMult: 4.0, mods: { str: 8, dex: 8, vit: 9 },
    behavior: 'tactical', caster: true, desc: 'The High Cantor of the Ashen Choir, who emptied Ruinwatch and the Pale City. He sings in a voice made of ten thousand voices.',
    special: { every: 3, name: 'Hymn of Unmaking', telegraph: 'Severin\'s choir falls silent; he alone sings one rising note', mult: 2.6, element: 'shadow', status: 'weaken' },
    phases: [
      { at: 0.7, effect: 'summon', text: 'The cathedral\'s choir climbs down from the galleries to defend their Cantor.', rounds: 3 },
      { at: 0.4, effect: 'ward', text: 'Severin draws the hymn around himself like armour.', amount: 0.18 },
      { at: 0.2, effect: 'enrage', text: 'His voice cracks into something that is not human at all.' }
    ]
  },
  sovereign: {
    label: 'The Hollow Sovereign', level: 100, hpMult: 5.0, mods: { str: 13, dex: 6, vit: 14 },
    behavior: 'tactical', caster: true, final: true, desc: 'The first ruler, older than people, who wishes to unmake what the makers made. It is a crown with nothing beneath it, and it is waking.',
    special: { every: 3, name: 'Unmaking', telegraph: 'The Sovereign raises one hand, and the world around you begins to forget itself', mult: 2.8, element: 'void', status: 'weaken' },
    phases: [
      { at: 0.75, effect: 'ward', text: 'Shards of the broken Throne rise and orbit the Sovereign, turning blows aside.', amount: 0.2 },
      { at: 0.5, effect: 'summon', text: 'Echoes of everything the Sovereign ever unmade crawl from the cracks in the Throne.', rounds: 4 },
      { at: 0.25, effect: 'enrage', text: 'THE SOVEREIGN WAKES FULLY. The air itself screams.' }
    ]
  }
};

const CHAPTERS = [
  {
    id: 1, tier: 1, title: 'Smoke on the Road', minLevel: 1,
    intro: 'The stranger who saved your life on the road was an Ember Warden — and she is bleeding. Find her.',
    steps: [
      { type: 'talk', npc: 'maren', region: 'start', objective: 'Talk to Maren Holt, the Warden who saved you',
        text: 'Maren presses a hand to the arrow-wound in her side. "Bandits hit our caravan on the Dustfall road. They took the emberglass — shards of the Ember itself. A fence in Ironport is moving it. Find out who is buying."' },
      { type: 'talk', npc: 'vesna', region: 'ironport', objective: 'Ask Vesna Coil in Ironport who is buying black glass',
        text: 'Vesna counts coins and does not look up. "Varrick Thorne. Captain of the Dustfall bands. He sells to men in grey robes who sing while they haggle. He camps at the burned caravan."' },
      { type: 'boss', boss: 'varrick', region: 'dustfall', objective: 'Confront Varrick Thorne at Dustfall Plains (type "confront Varrick")' },
      { type: 'choice', objective: 'Decide what to do with the recovered emberglass',
        prompt: 'Varrick\'s strongbox holds a shard of emberglass, still warm. Maren needs it. Vesna would pay well. And it hums when you hold it.',
        options: [
          { label: 'Return the shard to Maren and the Wardens', factions: { wardens: 15 }, flags: { shardReturned: true },
            text: 'Maren closes her hand around the shard. "One spark back. The Ember needs every one." She marks you with a Warden\'s chalk-flame.' },
          { label: 'Sell it to Vesna Coil', factions: { compact: 12, wardens: -10 }, coin: 400, flags: { shardSold: true },
            text: 'Vesna pays without haggling, which tells you it was worth more. Maren\'s silence afterwards is worse than anything she could say.' },
          { label: 'Keep it', factions: { remnant: 5 }, item: { name: 'warm emberglass shard', type: 'trinket' }, flags: { shardKept: true },
            text: 'You pocket the shard. It is warm against your ribs, like a second heartbeat. Maren notices and says nothing.' }
        ] }
    ],
    reward: { xp: 350, coin: 150 },
    outro: 'Maren tells you the truth: the Ember — the fire that keeps something at the centre of the world asleep — is guttering, and someone is stealing its sparks. "Come find me in Oakhaven when you are stronger. The trouble is inward."'
  },
  {
    id: 2, tier: 2, title: 'Drums in the Fog', minLevel: 10,
    intro: 'The barrows of Greymere were sealed with Ember-fire. Someone has been putting the seals out.',
    steps: [
      { type: 'talk', npc: 'maren', region: 'oakhaven', objective: 'Meet Maren Holt at Oakhaven Crossing',
        text: '"The grey-robes have a name: the Ashen Choir. They sing to whatever sleeps at the centre, and on Greymere Moors the dead have started singing back. Old Wenna keeps the barrows. Start with her."' },
      { type: 'talk', npc: 'old_wenna', region: 'greymere', objective: 'Talk to Old Wenna, the barrow-keeper of Greymere',
        text: 'Wenna\'s hands shake. "The King\'s Barrow. They rolled the stone away and sang him awake. Ulric was a good king once. Put him back."' },
      { type: 'explore', landmark: 'kings_barrow', region: 'greymere', objective: 'Explore the King\'s Barrow' },
      { type: 'boss', boss: 'ulric', region: 'greymere', objective: 'Confront Ulric, the Barrow King (type "confront Ulric")' },
      { type: 'choice', objective: 'Decide Ulric\'s fate',
        prompt: 'Ulric kneels in the heather, his crown cracked. "My oath was to guard the dead. Let me guard the living instead — or burn me, and be sure."',
        options: [
          { label: 'Burn his bones with Ember-fire', factions: { wardens: 15 }, flags: { ulricBurned: true },
            text: 'Wenna lights the pyre with a Warden coal. Ulric goes into the fire without a sound. The drums on the moor stop.' },
          { label: 'Accept his oath and take his blade', factions: { remnant: 10, wardens: -8 }, flags: { ulricOath: true },
            gear: { name: 'Barrow-King\'s Oathblade', slot: 'weapon', tier: 4, statMods: { str: 2, vit: 1 } },
            text: 'Ulric presses his blade into your hands and sinks back into the earth. The steel is cold and it remembers being loyal.' }
        ] }
    ],
    reward: { xp: 750, coin: 400 },
    outro: 'Among Ulric\'s grave-goods is a Choir hymnal. Its last page is a map: a road inward, through the city of Ruinwatch, which fell in a single night.'
  },
  {
    id: 3, tier: 3, title: 'The City That Fell Overnight', minLevel: 20,
    intro: 'Forty thousand people vanished from Ruinwatch in one night. The Wardens hold what is left.',
    steps: [
      { type: 'talk', npc: 'calloway', region: 'ruinwatch', objective: 'Report to Warden-Commander Calloway in Ruinwatch',
        text: 'Calloway reads the hymnal and goes grey. "Harvested. Like the Hollowed Kingdom a thousand years ago. The souls were taken inward. And the thing that did it is still digging in the rubble."' },
      { type: 'explore', landmark: 'empty_market', region: 'ruinwatch', objective: 'Search the empty market of Ruinwatch' },
      { type: 'talk', npc: 'seraphine', region: 'ember_coast', objective: 'Seek Lady Seraphine Aurel on the Ember Coast',
        text: 'Seraphine shows you the burning towers. "Imperial conduits. They carried the Ember\'s heat outward to hold the Ash back. One more has gone dark. I can relight it — but Brother Cael wants it sealed."' },
      { type: 'choice', objective: 'Decide the fate of the failing Ember tower',
        prompt: 'Relit, the tower will push the Ash back from the coast — and give the Remnant a working piece of their empire. Sealed, it cannot be turned to anyone\'s use.',
        options: [
          { label: 'Help Seraphine relight the tower', factions: { remnant: 20, wardens: -5 }, flags: { towerRelit: true },
            text: 'The tower roars back to life. Seraphine laughs like a girl. "The empire is not dead. It was waiting."' },
          { label: 'Help Brother Cael seal it', factions: { wardens: 18, remnant: -10 }, flags: { towerSealed: true },
            text: 'Cael banks the fire with Warden ash. "Better a cold tower than a weapon." Seraphine does not forgive you quickly.' }
        ] },
      { type: 'boss', boss: 'rubble_maw', region: 'ruinwatch', objective: 'Hunt the Rubble-Maw in the ruins (type "confront the Rubble-Maw")' }
    ],
    reward: { xp: 1150, coin: 900 },
    outro: 'Inside the Rubble-Maw\'s gullet is a Choir ferry-token, stamped with a bone barge. The souls of Ruinwatch went into the Deep Fens.'
  },
  {
    id: 4, tier: 4, title: 'The Ferryman\'s Hymn', minLevel: 30,
    intro: 'The Choir walks the dead inward on bone barges. Someone in the Deep Fens is rowing.',
    steps: [
      { type: 'talk', npc: 'heron', region: 'sunkenfen_deep', objective: 'Find Heron the smuggler in the Deep Fens',
        text: 'Heron spits into the water. "Mother Morwen. The lich at the bone spire. She ferries the dead inward for the Choir, toward the white city. I\'ll pole you close. Not closer."' },
      { type: 'explore', landmark: 'lich_spire', region: 'sunkenfen_deep', objective: 'Reach the bone spire' },
      { type: 'boss', boss: 'morwen', region: 'sunkenfen_deep', objective: 'Confront Mother Morwen (type "confront Morwen")' },
      { type: 'choice', objective: 'Decide what to do with Morwen\'s phylactery',
        prompt: 'Morwen\'s phylactery pulses in your hand: a glass heart full of stolen years. Shattered, she is gone forever. Kept, its power is yours. The Remnant would pay a fortune to study it.',
        options: [
          { label: 'Shatter the phylactery', factions: { wardens: 15, compact: 5 }, flags: { phylacteryShattered: true },
            text: 'The glass bursts. A thousand drowned voices sigh at once and go still. The fen is quieter than it has been in centuries.' },
          { label: 'Claim its power', factions: { choir: 20, wardens: -15 }, flags: { tookPhylactery: true },
            spell: { id: 'grave_lance', label: 'Grave Lance', desc: 'A spear of drowned cold torn from Morwen\'s stolen years.', manaCost: 18, damage: { min: 14, max: 26 }, type: 'shadow', freeForm: false, learnedEfficiency: 1 },
            text: 'You crush the phylactery and breathe in what spills out. Cold settles in your chest and does not leave. You know a new word for death.' },
          { label: 'Give it to the Remnant', factions: { remnant: 20, wardens: -5 }, coin: 1500, flags: { phylacteryToRemnant: true },
            text: 'Magistrate Dast\'s agents take the phylactery in a lead box and pay in imperial gold. "For study," they say.' }
        ] }
    ],
    reward: { xp: 1550, coin: 1800 },
    outro: 'Morwen\'s barge-logs name her client: the Pale Cantor of the white city. The Remnant\'s scholars in Old Veldrath want to see you — they say the old empire knew what sleeps at the centre.'
  },
  {
    id: 5, tier: 5, title: 'The Sun-Key', minLevel: 40,
    intro: 'The empire of Veldrath was built to guard something. Its monuments still function.',
    steps: [
      { type: 'talk', npc: 'seraphine_court', region: 'old_veldrath', objective: 'Meet Lady Seraphine at Sunspire in Old Veldrath',
        text: 'Seraphine has traded scholar\'s robes for an heir\'s mantle. "The Wardens only keep the thing asleep. The Sun-Key could bind it — chain its power to the monuments. The Key is under the Sun Monument, and the monument does not want to give it up."' },
      { type: 'explore', landmark: 'imperial_archive', region: 'old_veldrath', objective: 'Search the imperial archive' },
      { type: 'boss', boss: 'sun_warden', region: 'old_veldrath', objective: 'Face the Sun Monument\'s Warden (type "confront the Warden")' },
      { type: 'choice', objective: 'Decide who holds the Sun-Key',
        prompt: 'The Sun-Key is a rod of sunstone as long as your arm, too hot to hold for long. Seraphine reaches for it. Maren, arrived on a Warden horse, shakes her head. It would also fit your hand.',
        options: [
          { label: 'Give it to Seraphine and the Remnant', factions: { remnant: 25, wardens: -10 }, flags: { remnantKey: true },
            text: '"You will not regret this," Seraphine says, and for a moment she sounds very much like an empress.' },
          { label: 'Give it to the Wardens', factions: { wardens: 20, remnant: -20 }, flags: { wardenKey: true },
            text: 'Maren wraps the Key in Warden grey. Seraphine walks away without a word. The Remnant will remember this.' },
          { label: 'Keep it yourself', factions: { remnant: -10, wardens: -5 }, flags: { ownKey: true }, item: { name: 'Sun-Key', type: 'key item' },
            text: 'You keep the Key. Both of them look at you differently now — as a power in your own right.' }
        ] }
    ],
    reward: { xp: 1950, coin: 3000 },
    outro: 'The archive names the sleeper: the Hollow Sovereign, the first ruler, who wishes to unmake the world. Its servants hold the Pale City. Everything inward leads there.'
  },
  {
    id: 6, tier: 6, title: 'The White City', minLevel: 50,
    intro: 'The Pale City died and kept moving. Its spires beat like a heart.',
    steps: [
      { type: 'talk', npc: 'brother_lucan', region: 'pale_city', objective: 'Find Brother Lucan in the Smugglers\' Undercroft of the Pale City',
        text: 'Lucan shakes as he speaks. "The spires are vessels. Every soul the Choir took is in them, waiting to be poured into the Throne. The Seneschal keeps the great spire. Kill it and the vessel opens."' },
      { type: 'explore', landmark: 'soul_vessel', region: 'pale_city', objective: 'Climb the soul-vessel spire' },
      { type: 'boss', boss: 'seneschal', region: 'pale_city', objective: 'Confront the Pale Seneschal (type "confront the Seneschal")' },
      { type: 'choice', objective: 'Decide the fate of the captured souls',
        prompt: 'The vessel cracks open. Thousands of souls — Ruinwatch\'s people among them — hang in the air like sparks. You could free them. Or you could pour them into your own weapon, and carry the strength of a city to the Throne.',
        options: [
          { label: 'Free the souls', factions: { wardens: 15, compact: 20, choir: -20 }, flags: { soulsFreed: true },
            text: 'The sparks rise and scatter outward, toward home. For one night the whole world dreams of Ruinwatch\'s streets.' },
          { label: 'Bind them into your weapon', factions: { choir: 15, wardens: -20, compact: -20 }, flags: { soulsBound: true }, weaponBonus: 6,
            text: 'The souls pour into your blade, screaming, and then they are silent. The weapon is heavier now. So are you.' }
        ] }
    ],
    reward: { xp: 2350, coin: 4800 },
    outro: 'With the Pale City broken, the Choir\'s last road is through the Eternal Breach and into the Crucible, where the Ember gutters. They mean to put it out.'
  },
  {
    id: 7, tier: 7, title: 'The Breach', minLevel: 60,
    intro: 'The wound in the world bleeds faster. Beyond it, the Crucible\'s gate is alive — and closed.',
    steps: [
      { type: 'talk', npc: 'watcher_mira', region: 'eternal_breach', objective: 'Speak with Watcher Mira at Breachwatch',
        text: '"The Breach is the Sovereign\'s power, leaking from its broken throne. The Choir is in the Crucible already, and the Gate has let them in. It will not let us."' },
      { type: 'talk', npc: 'siege_marshal', region: 'crucible_gate', objective: 'Join Siege-Marshal Orren at the Crucible Gate',
        text: 'Orren has besieged the Gate for ten years. "Every assault, it eats. But you have put down a Barrow King and a lich. Lead the next one."' },
      { type: 'boss', boss: 'living_gate', region: 'crucible_gate', objective: 'Break the Living Gate (type "confront the Gate")' },
      { type: 'fate', objective: 'Learn Maren\'s fate', fate: 'maren' }
    ],
    reward: { xp: 2750, coin: 7000 },
    outro: 'The Gate is broken. Beyond it is the Crucible — the forge where the world was made, and where the Ember burns down to its last coal.'
  },
  {
    id: 8, tier: 8, title: 'The Crucible', minLevel: 70,
    intro: 'At the heart of the world, something is eating the Ember.',
    steps: [
      { type: 'talk', npc: 'ember_keeper', region: 'the_crucible', objective: 'Find Ember-Keeper Solenne at the Anvil Camp',
        text: 'Solenne\'s eyes are full of reflected fire. "Kharzul. An ash-wyrm the Choir woke, gnawing on the Ember for a century. Kill it, and we may still save the coal."' },
      { type: 'explore', landmark: 'world_forge', region: 'the_crucible', objective: 'Descend to the World-Forge' },
      { type: 'boss', boss: 'kharzul', region: 'the_crucible', objective: 'Slay Kharzul the Ember-Eater (type "confront Kharzul")' },
      { type: 'choice', objective: 'Decide the fate of the Ember',
        prompt: 'The Ember is a coal the size of your heart, barely glowing. Solenne can rekindle it — with your help, and your strength. Or you could take its fire into yourself, and face the Sovereign as something more than mortal.',
        options: [
          { label: 'Rekindle the Ember', factions: { wardens: 25, compact: 10 }, flags: { emberRekindled: true },
            text: 'You and Solenne feed the coal with everything you have. It catches. Across the world, every Warden fire-bowl flares at once.' },
          { label: 'Take the Ember\'s fire into yourself', factions: { wardens: -30, choir: 10 }, flags: { emberTaken: true }, statBonus: { str: 3, int: 3, vit: 2 },
            spell: { id: 'emberfire', label: 'Emberfire', desc: 'The world\'s first fire, burning in your hands.', manaCost: 30, damage: { min: 40, max: 70 }, type: 'fire', freeForm: false, learnedEfficiency: 1 },
            text: 'The coal goes into your chest like a swallowed sun. Solenne screams. You have never felt so strong. Somewhere, the Ember\'s light goes out — and something on the Throne smiles.' }
        ] }
    ],
    reward: { xp: 3150, coin: 10000 },
    outro: 'Beyond the Crucible lie the Core Wastes, where the Choir makes its last stand. Their Cantor holds the only road to the Throne.'
  },
  {
    id: 9, tier: 9, title: 'The Last Light', minLevel: 80,
    intro: 'Everything the world\'s monsters feared has gathered in the Core Wastes. So has the Ashen Choir.',
    steps: [
      { type: 'talk', npc: 'last_warden', region: 'the_core_wastes', objective: 'Report to High Warden Ashby at Last Light',
        text: '"Severin, the Pale Cantor. He holds the Cathedral of Ash, and the Cathedral holds the only road to the Throne. Break him and the way opens."' },
      { type: 'explore', landmark: 'cantor_cathedral', region: 'the_core_wastes', objective: 'Storm the Cantor\'s cathedral' },
      { type: 'boss', boss: 'cantor', region: 'the_core_wastes', objective: 'Defeat Severin, the Pale Cantor (type "confront Severin")' },
      { type: 'choice', objective: 'Decide the Cantor\'s fate',
        prompt: 'Severin lies broken on the cathedral steps, his voice gone to a whisper. "Kill me and you walk in blind. Spare me, and I will tell you where the Sovereign is hollow."',
        options: [
          { label: 'Execute him', factions: { wardens: 10, compact: 10, choir: -30 }, flags: { cantorExecuted: true },
            text: 'You end the Pale Cantor. The cathedral\'s singing stops for the first time in a thousand years.' },
          { label: 'Spare him for the secret', factions: { wardens: -10, choir: 10 }, flags: { cantorSpared: true },
            text: 'Severin whispers: "It is hollow where the crown meets the void. Strike there when it wakes fully." Then he limps away into the ash.' }
        ] }
    ],
    reward: { xp: 3550, coin: 14000 },
    unlocks: ['shattered_throne'],
    outro: 'The road to the Shattered Throne is open. Every power in the world is waiting to see what you will do there.'
  },
  {
    id: 10, tier: 10, title: 'The Shattered Throne', minLevel: 90,
    intro: 'The broken seat of whatever ruled this world before people existed. It is not empty.',
    steps: [
      { type: 'travel', region: 'shattered_throne', objective: 'Walk the road to the Shattered Throne' },
      { type: 'explore', landmark: 'throne_steps', region: 'shattered_throne', objective: 'Climb the ten thousand steps' },
      { type: 'boss', boss: 'sovereign', region: 'shattered_throne', objective: 'Face the Hollow Sovereign (type "confront the Sovereign")' },
      { type: 'choice', objective: 'Decide the fate of the world', final: true,
        prompt: 'The Hollow Sovereign lies broken across its throne, still not dead — it cannot die, only be bound or ended. The world will become whatever you choose now.',
        options: [
          { id: 'rekindle', label: 'Bind it to sleep forever with the Ember', requires: { notFlag: 'emberTaken' }, factions: { wardens: 30 },
            text: 'You carry the Ember\'s light to the Throne and pour it into the cracks. The Sovereign sleeps — truly, finally. The Wardens will tend this fire forever, and the world will never know how close it came.' },
          { id: 'imperium', label: 'Chain it to the monuments with the Sun-Key', requires: { anyFlag: ['remnantKey', 'ownKey'] }, factions: { remnant: 30, wardens: -10 },
            text: 'The Sun-Key turns in the Throne like a key in a lock. Across Old Veldrath, the monuments wake and drink the Sovereign\'s power. An empire rises from the sand — powerful, ordered, and not entirely kind.' },
          { id: 'ascend', label: 'Take the Throne for yourself', requires: { anyFlag: ['emberTaken', 'tookPhylactery', 'soulsBound'] }, factions: { choir: 40, wardens: -50, compact: -20 },
            text: 'You sit. The Throne fits you as if it was always waiting. The Ash obeys you now. The world will be remade in your image — whatever that turns out to be.' },
          { id: 'shatter', label: 'Shatter the Throne and the Ember together', factions: { compact: 30, wardens: -10, remnant: -10 },
            text: 'You bring the Throne down, and the Ember with it. The Sovereign ends. So does the old magic: towers go cold, wards fail, the long fire goes out. The world is ordinary now, and free, and entirely its own.' }
        ] }
    ],
    reward: { xp: 4000, coin: 25000 },
    outro: 'The story of the Ember and the Ash is over. Yours is not.'
  }
];

const ENDINGS = {
  rekindle: { title: 'The Long Fire',     epilogue: 'The Ember burns at the heart of the world, and you are named the first Warden in a thousand years to see the Throne and return.' },
  imperium: { title: 'The Sun Rises',     epilogue: 'Veldrath is reborn. Its monuments hum with captured power, and its new empress remembers who put the Key in her hand.' },
  ascend:   { title: 'The New Sovereign', epilogue: 'The Ash answers to you. The outer towns whisper your name the way they once whispered the Sovereign\'s.' },
  shatter:  { title: 'The Ordinary World', epilogue: 'No fire, no throne, no sleeping god. Only people, and the long work of living in a world that belongs to them.' }
};

module.exports = { STORY_NPCS, BOSSES, CHAPTERS, ENDINGS };
