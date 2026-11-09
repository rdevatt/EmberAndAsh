'use strict';

// =============================================================
// OFFLINE NARRATOR
// Atmospheric prose built only from engine facts, used whenever the AI
// is unavailable. It describes what the engine decided — the hit, the
// miss, the ability, the telegraphed blow, the road, the place — and
// never invents outcomes, items or rewards. Variety comes from the
// region, time of day, hazard, enemy and action, and it avoids
// repeating the line it used last time.
// =============================================================

const { REGIONS } = require('../constants');
const contentPrefs = require('../content-prefs');

// Preferences change the words, never the outcome.
function prefsOf(state) {
  try { return contentPrefs.effectivePrefs(state, 'offline'); } catch (e) { return contentPrefs.DEFAULTS; }
}

const TIMES = ['before dawn', 'at first light', 'in the grey morning', 'under a high sun', 'in the long afternoon', 'as the light turns amber', 'at dusk', 'after nightfall', 'in the dead of night'];

const HAZARD_AIR = {
  fog: ['Fog beads on your sleeves.', 'The fog muffles every sound but your own breathing.'],
  miasma: ['The air tastes of rot and wet iron.', 'Gas bubbles up from the black water and stings your eyes.'],
  cold: ['The cold bites through every seam of your clothes.', 'Your breath freezes on your lips.'],
  heat: ['Heat shimmers off the ground in waves.', 'Sweat dries on your skin before it can fall.'],
  blight: ['Purple ash drifts down like slow snow.', 'The haze on the horizon pulses, faintly, like something breathing.'],
  void: ['The edges of things do not quite line up.', 'For a heartbeat your shadow falls the wrong way.'],
  corruption: ['The bark around you glows faintly silver.', 'Fallen leaves that never rot crunch underfoot.']
};

function seeded(state, input, salt = 0) {
  let h = (state.actionCount || 0) * 31 + salt;
  for (const ch of String(input || '')) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return h >>> 0;
}

// Picks from a list, avoiding the line used last time for this key.
function pick(state, key, list, seed) {
  if (!list.length) return '';
  if (!state.offlineLast || typeof state.offlineLast !== 'object') state.offlineLast = {};
  let i = seed % list.length;
  if (list.length > 1 && state.offlineLast[key] === i) i = (i + 1) % list.length;
  state.offlineLast[key] = i;
  return list[i];
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function pronouns(name) {
  let g = 'unspecified';
  try {
    const ap = require('../appearance');
    const { REGIONS: R } = require('../constants');
    let id = null;
    for (const r of Object.values(R)) for (const n of r.npcs || []) if (n.name === name) id = n.id;
    g = ap.npcGender(id || name, name);
  } catch (e) { /* default */ }
  return g === 'female' ? { he: 'she', him: 'her', his: 'her' } : g === 'male' ? { he: 'he', him: 'him', his: 'his' } : { he: 'they', him: 'them', his: 'their' };
}

function weaponName(state) {
  const w = state.gear && state.gear.weapon;
  return w && w.name ? w.name.replace(/\s*\(.*\)$/, '') : 'your fists';
}

function timeOfDay(state) { return TIMES[Math.floor((state.actionCount || 0) / 4) % TIMES.length]; }

function ambient(state, seed) {
  const r = state.character && REGIONS[state.character.region];
  if (!r) return '';
  const parts = [];
  const air = r.hazard && HAZARD_AIR[r.hazard.key];
  if (air) parts.push(pick(state, 'air', air, seed));
  return parts.join(' ');
}

function combatProse(state, input, r, seed) {
  const e = state.currentEnemy || {};
  const foe = e.label ? `the ${e.label.replace(/^The /, '').split(',')[0]}` : 'your enemy';
  const lines = [];
  const enemyLines = (r.enemyLines || []).join(' ');
  if (r.usedItem) {
    lines.push(pick(state, 'item', [`You tear the stopper free with your teeth and drink while ${foe} circles.`, `You gulp the ${r.usedItem} down, bitter and warm, eyes never leaving ${foe}.`], seed));
  } else if (r.defended) {
    lines.push(pick(state, 'def', [`You set your feet and raise your guard, letting ${foe} come to you.`, `You give ground on purpose, weight back, ready to turn the blow aside.`, `You go still and watchful behind your guard.`], seed));
  } else if (r.abilityUsed) {
    lines.push(r.playerHit
      ? pick(state, 'abhit', [`${r.abilityUsed} — and it lands, exactly as you meant it to.`, `You commit to ${r.abilityUsed}, and ${foe} pays for it.`, `${r.abilityUsed}. The world narrows to that one movement, and it is perfect.`], seed)
      : pick(state, 'abuse', [`You call on ${r.abilityUsed}.`, `You reach for ${r.abilityUsed}, all your training behind it.`], seed));
  } else if (r.spellCast) {
    lines.push(r.playerHit
      ? pick(state, 'sphit', [`Power gathers in your hands and ${r.spellCast} tears into ${foe}.`, `The words come out right, and ${r.spellCast} strikes home.`], seed)
      : pick(state, 'spmiss', [`${r.spellCast} flares — and ${foe} is no longer where it was aimed.`, `The spell goes wide, scorching empty ground.`], seed));
  } else if (r.unarmed) {
    // No weapon in hand: the body is the weapon.
    const v = prefsOf(state).violence;
    lines.push(r.playerHit
      ? (r.playerCrit
        ? pick(state, 'ucrit', [`You put your whole weight behind a fist to ${foe}'s ${r.bodyPart}, and something gives.`, `Your knee comes up into the ${r.bodyPart} with everything you have.`], seed)
        : v === 'mature'
          ? pick(state, 'uhit2', [`Your knuckles split on ${foe}'s ${r.bodyPart}; blood, yours and its, smears your hand.`, `You drive an elbow into the ${r.bodyPart} and feel it crunch.`], seed)
          : pick(state, 'uhit', [`Your fist connects with ${foe}'s ${r.bodyPart}.`, `You get a kick in at the ${r.bodyPart}.`, `You slam a shoulder into ${foe} and it staggers.`, `An elbow to the ${r.bodyPart}, short and hard.`], seed))
      : pick(state, 'umiss', [`Your fist finds only air.`, `${cap(foe)} slips your swing.`, `You grab for it and come away with nothing.`], seed));
  } else if (r.playerHit) {
    const v = prefsOf(state).violence;
    if (v === 'off') {
      lines.push(r.playerCrit ? `A decisive blow to the ${r.bodyPart}.` : pick(state, 'hit0', [`Your strike lands.`, `The blow connects; ${foe} falters.`], seed));
    } else if (v === 'mature') {
      lines.push(r.playerCrit
        ? pick(state, 'crit2', [`Your ${weaponName(state)} splits ${foe}'s ${r.bodyPart} open; blood sheets out and something cracks wetly underneath.`, `You drive the ${weaponName(state)} in to the hilt at the ${r.bodyPart}. Hot blood spills over your hand.`], seed)
        : pick(state, 'hit2', [`Your ${weaponName(state)} tears into ${foe}'s ${r.bodyPart}; blood spatters the ground.`, `The edge bites deep into the ${r.bodyPart}, and ${foe} howls through red teeth.`, `You open a gash across its ${r.bodyPart} that pours dark blood.`], seed));
    } else {
      lines.push(r.playerCrit
        ? pick(state, 'crit', [`${cap(weaponName(state))} finds the gap you were looking for — a devastating blow to the ${r.bodyPart}.`, `Everything lines up: your ${weaponName(state)} bites deep into ${foe}'s ${r.bodyPart}.`], seed)
        : pick(state, 'hit', [`Your ${weaponName(state)} connects with ${foe}'s ${r.bodyPart}.`, `Steel meets flesh at the ${r.bodyPart}; ${foe} staggers.`, `You land a solid blow and feel it jar up your arm.`, `${cap(foe)} grunts as your strike catches its ${r.bodyPart}.`], seed));
    }
  } else {
    lines.push(pick(state, 'miss', [`${cap(foe)} twists away and your ${weaponName(state)} cuts only air.`, `You overreach; the blow goes wide.`, `${cap(foe)} slips your strike by a finger's width.`], seed));
  }

  if (/unleashes/.test(enemyLines)) {
    lines.push(r.defended
      ? pick(state, 'blunt', [`The blow you saw coming arrives — and breaks against your guard.`, `You were ready. It still hurts, but it does not break you.`], seed)
      : pick(state, 'special', [`The blow you saw coming arrives, and you were not braced for it.`, `It lands with everything behind it, and the world flashes white.`], seed));
  } else if (/⚠/.test(enemyLines) && /defend to blunt/.test(enemyLines)) {
    lines.push(pick(state, 'tele', [`${cap(foe)} draws back, gathering itself for something terrible.`, `You see it coming: ${foe} winding up for a killing blow.`], seed));
  } else if (/stunned and cannot act/.test(enemyLines)) {
    lines.push(`${cap(foe)} reels, dazed, unable to answer.`);
  } else if (r.enemyHit) {
    const v = prefsOf(state).violence;
    lines.push(v === 'mature'
      ? pick(state, 'ehit2', [`${cap(foe)} rakes you open across the ribs; blood runs warm down your side.`, `The counterblow splits your brow — blood in your eye, copper in your mouth.`], seed)
      : v === 'off' ? `${cap(foe)} lands a hit on you.`
      : pick(state, 'ehit', [`${cap(foe)} answers — a hit that knocks the breath out of you.`, `Pain flares as ${foe} catches you.`, `You take the counterblow on the shoulder and keep your feet.`], seed));
  } else if (state.currentEnemy) {
    lines.push(pick(state, 'emiss', [`${cap(foe)}'s return strike whistles past.`, `You slip the counterattack.`, `${cap(foe)} lunges and finds nothing.`], seed));
  }
  if (!state.currentEnemy || !state.inCombat) {
    const v = prefsOf(state).violence;
    lines.push(v === 'mature'
      ? pick(state, 'kill2', ['It dies ugly, in a spreading pool of its own blood.', 'It goes down choking, and then it is just meat on the ground.'], seed)
      : v === 'off' ? 'It is defeated.'
      : pick(state, 'kill', ['Then it is over, and the only sound is your own breathing.', 'It falls, and does not rise.', 'Silence rushes back in where the fight was.'], seed));
  }
  return lines.join(' ');
}

// Narrates the player's stated action back in the second person ("You walk
// to the bar, asking for a drink.") with their speech: quoted words exactly
// as written, described speech voiced as one short line, otherwise none.
// Commands ("map", "talk to Maren") are not actions to narrate.
function playerVoice(playerInput, h) {
  const input = String(playerInput || '').trim();
  if (!input || h.includes('[OPENING SCENE') || h.includes('CREATION')) return '';
  const agency = require('../agency');
  const line = agency.playerLine(input);
  const isAction = /^(?:i|i'm|i'll)\b/i.test(input) || /^["“]/.test(input);
  if (h.includes('[COMBAT NARRATIVE')) {
    // In a fight the prose already shows the blow; only the words are added.
    return line ? line.lines.map(q => `"${q}"`).join(' ') : '';
  }
  if (!isAction) return line && line.exact ? line.lines.map(q => `"${q}"`).join(' ') : '';
  const echo = agency.toSecondPerson(input);
  if (!line || line.exact) return echo;             // quoted words are already in the echo, verbatim
  return `${echo} "${line.lines[0]}"`;
}

function buildOfflineNarrative(state, playerInput, hint) {
  const region = state.character ? REGIONS[state.character.region] : null;
  const seed   = seeded(state, playerInput);
  const h      = String(hint || '');
  const lines  = [];
  const place  = region ? region.label : 'the wilds';

  if (h.includes('[OPENING SCENE')) {
    lines.push(region && region.beastOpening ? region.beastOpening + '.' : 'Something that should have killed you lies dead in the mud instead.');
    lines.push('Nearby, a woman in Warden grey — a flame-in-circle badge at her throat — slumps against a fence post, blood soaking her side. She was hunting the same beast, and it found her first.');
    lines.push(`Around you: ${region ? region.flavor : 'a world that does not care whether you live'}. (Type "talk to Maren".)`);
    return lines.join('\n\n');
  }

  const enemy = state.currentEnemy;
  const r     = state.pendingCombatResult;
  if (h.includes('BOSS —') && enemy) {
    lines.push(`${enemy.label} is here. ${enemy.desc}`);
    lines.push(pick(state, 'bossin', ['Everything you have done has led to this.', 'The air itself seems to hold its breath.', 'There is no more road behind you — only this.'], seed));
  } else if ((h.includes('ENEMY SPAWNED') || h.includes('AMBIENT ENCOUNTER') || h.includes('found you') || h.includes('ROAD ENCOUNTER') || h.includes('AMBUSH') || h.includes('LANDMARK —') || h.includes('QUEST SITE') || h.includes('RIFT')) && enemy) {
    lines.push(pick(state, 'enc', [`A ${enemy.label} closes in. ${enemy.desc}`, `Movement — and a ${enemy.label} is suddenly between you and the way forward. ${enemy.desc}`, `You hear it before you see it: a ${enemy.label}. ${enemy.desc}`], seed));
    const p = prefsOf(state);
    if (/thug|bandit|cutthroat|raider|marauder|smuggler|watchman|rebel|deserter|mercenary|insurgent|thief|captain/i.test(enemy.label) && p.language !== 'off') {
      lines.push(p.language === 'mature' ? pick(state, 'taunt2', ['"You picked the wrong fucking road," it snarls.', '"Hand it over, you sorry bastard."'], seed) : pick(state, 'taunt1', ['"You picked the wrong road," it snarls.', '"Hand it over, damn you."'], seed));
    }
    if (p.horror === 'mature' && /undead|skeleton|ghoul|wraith|lich|thrall|revenant|husk|shade|void|unmade|echo/i.test(enemy.label)) lines.push(pick(state, 'dread', ['Its face is wrong in a way your eyes keep trying to correct.', 'It smells of opened graves, and it is smiling.'], seed));
  } else if (h.includes('[COMBAT NARRATIVE') && r) {
    lines.push(combatProse(state, playerInput, r, seed));
  } else if (h.includes('SUCCESSFULLY FLEES')) {
    lines.push(pick(state, 'flee', ['You break away and run until the sounds of pursuit fade behind you.', 'You find a gap, take it, and do not look back.'], seed));
  } else if (h.includes('FLEE FAILED')) {
    lines.push('You turn to run and a blow catches you across the back. There is no escape — not yet.');
  } else if (h.includes('IMPOSSIBLE FIGHT')) {
    lines.push('Nothing you do touches it. Every instinct screams at you to run.');
  } else if (h.includes('BOSS DEFEATED')) {
    lines.push(pick(state, 'bossdown', ['It is done. For a long moment you simply stand there, shaking, alive.', 'The great enemy falls, and the world feels — briefly, impossibly — lighter.'], seed));
  } else if (h.includes('VILLAIN ACT')) {
    // Narrated as the crime it is: that it happened, the threat and the
    // victim's fear, the aftermath — never with sexual detail.
    const who = (h.match(/(?:coerce|coerced|attempted to coerce) ([^(.]+?) \(/) || [])[1] || 'them';
    const g = pronouns(who);
    lines.push(/attempted/.test(h)
      ? pick(state, 'villainF', [`${who} fights you — nails, teeth, a knee — tears free and runs, screaming for help.`, `${cap(g.he)} twists out of your grip and bolts for the door, and ${g.his} scream follows ${g.him} into the street.`], seed)
      : pick(state, 'villain', [`${who} begs, then stops begging. You take what was never offered. Afterwards ${g.he} will not look at you, and the room is very quiet.`, `${cap(g.he)} goes rigid and silent under your hands, eyes fixed on the wall. When it is over ${g.he} curls away from you, and something in ${g.him} does not come back.`], seed));
  } else if (h.includes('INTIMATE SCENE')) {
    const p = prefsOf(state);
    const who = (h.match(/INTIMATE SCENE — (.+?) (?:\(an adult\) )?and the player/) || [])[1] || 'they';
    const g = pronouns(who);
    const pose = (h.match(/now: (\w+)/) || [])[1] || 'lying';
    if (p.romance === 'off' || /Fade to black/.test(h)) {
      lines.push(pick(state, 'night1', ['The door closes. Later there is only lamplight, the slow sound of breathing, and morning.', 'A kiss, then another, and the candle gutters out. Morning finds you both still smiling.'], seed));
    } else if (p.sexual === 'mature' && /explicit sex/.test(h)) {
      const X = {
        kiss: [`${who} kisses you back, slow and then hungry, ${g.his} hands in your hair, ${g.his} body pressed hard against yours.`, `${cap(g.his)} mouth is hot on yours; ${g.he} bites your lip and laughs against it.`],
        embrace: [`${who} melts into your arms, warm skin against warm skin, ${g.his} heart pounding against yours.`, `${cap(g.he)} shivers under your hands as they move over ${g.his} bare back and lower.`],
        undress: [`Clothes fall away until there is nothing between you. In the candlelight ${who} is all bare skin and want, and ${g.he} does not look away.`, `${who} lets you look, then pulls you close, naked and unashamed.`],
        lying: [`${who} pulls you down onto the bed and you move together, bare and slick with sweat, ${g.his} hips rising to meet yours again and again until ${g.he} cries out and clings to you.`, `You make love slowly, then not slowly at all, the bed creaking, ${who} gasping your name into your shoulder.`],
        astride: [`You straddle ${who} and sink down onto ${g.him}; ${g.he} groans, gripping your hips as you ride ${g.him}, slow and then hard.`, `On top of ${g.him}, you set the rhythm, and ${who} arches under you, helpless and loud.`],
        behind: [`You take ${who} from behind, one hand on the small of ${g.his} back; ${g.he} pushes back against every thrust, moaning into the sheets.`, `${cap(g.he)} braces on the bed as you move behind ${g.him}, and ${g.his} breath breaks into cries.`],
        oral: [`You go down on ${who}, slow and deliberate, until ${g.his} fingers knot in the sheets and ${g.he} comes apart under your mouth.`, `${cap(g.his)} thighs tremble around you; ${g.he} pulls your hair and does not let go until ${g.he} is spent.`]
      };
      lines.push(pick(state, `x_${pose}`, X[pose] || X.lying, seed));
    } else {
      lines.push(pick(state, 'night2', [`Lamplight on bare shoulders; ${who}'s hands slow and certain; a warmth that asks nothing and gives everything. Morning comes gently.`, `Clothes on the floor, a whispered name, the long unhurried hours of the night with ${who}. You wake tangled together.`], seed));
    }
  } else if (h.includes('[ROMANCE')) {
    lines.push(pick(state, 'flirt', ['A held look, a half-smile, something unspoken passing between you.', 'They laugh, and lean closer than they need to.'], seed));
  } else if (h.includes('STORY DECISION')) {
    lines.push(pick(state, 'decide', ['You make your choice. There will be no unmaking it.', 'It is decided. Somewhere, the world shifts to account for it.'], seed));
  } else if (h.includes('STORY CONVERSATION') || h.includes('[NPC —')) {
    lines.push(pick(state, 'talk', [`You find a quiet corner of ${place} to talk.`, 'They look up as you approach.', 'The conversation is brief, and it matters.'], seed));
  } else if (h.includes('EXPLORATION —')) {
    lines.push(pick(state, 'explore', [`You pick your way in carefully, ${timeOfDay(state)}.`, 'You take your time, and the place gives up its secrets.'], seed));
  } else if (h.includes('GATHERING —')) {
    lines.push(pick(state, 'gather', ['You work the land for what it will give.', 'It is slow, patient work, and your hands ache by the end of it.', 'You fill your pack, one careful handful at a time.'], seed));
  } else if (h.includes('CRAFTED —')) {
    lines.push(pick(state, 'craft', ['The work takes hours. The result is worth it.', 'You lose yourself in the craft until it is finished.'], seed));
  } else if (h.includes('QUEST ACCEPTED') || h.includes('QUEST ACTIVE')) {
    lines.push(pick(state, 'qa', ['You tear the notice from the board and tuck it away. Work is work.', 'You memorise the notice and set out.'], seed));
  } else if (h.includes('QUEST COMPLETED')) {
    lines.push(pick(state, 'qc', ['The job is done. Coin changes hands, and for a moment the world feels a little less hostile.', 'Word of the finished work spreads quickly here.'], seed));
  } else if (h.includes('TRAVEL —') && region) {
    const s = region.settlement;
    lines.push(pick(state, 'road', ['The road unspools beneath your feet, mile after mile, until the land itself changes.', `You travel ${timeOfDay(state)}, and the miles pass in silence.`, 'Days blur into one another on the road.'], seed));
    lines.push(`${cap(region.flavor)}.${s ? ` Ahead lies ${s.name}.` : ''}`);
  } else if (h.includes('COMPANION JOINED')) {
    lines.push('You are no longer travelling alone.');
  } else if (h.includes('BOUNTY BOARD')) {
    lines.push('Weathered notices flap against the board, each one a promise of coin and trouble.');
  } else if (h.includes('PROFESSION TASK') || h.includes('NO PROFESSION')) {
    lines.push('The work takes time and sweat, but it gets done.');
  } else if (h.includes('SHOP EVENT')) {
    lines.push('A customer drifts up to your stall, eyeing your wares.');
  } else if (h.includes('DEATH')) {
    lines.push('Darkness. Then cold stone, and someone else\'s blanket, and the slow return of pain.');
  }

  if (lines.length === 0) {
    const flavor = region ? cap(region.flavor) : 'The world';
    lines.push(pick(state, 'idle', [
      `${cap(timeOfDay(state))}, ${place} is quiet. ${flavor} surround you.`,
      'The world carries on around you, indifferent and watchful.',
      'Wind moves through the area. Somewhere far off, something calls and is answered.',
      `You take in ${place}: ${region ? region.flavor : 'empty country'}.`,
      'Nothing stirs for the moment. The silence feels earned, and temporary.',
      region && region.settlement ? `Smoke rises from ${region.settlement.name}. Someone there is cooking, and the smell carries.` : 'No one else is in sight.'
    ], seed));
  }
  // The player's own action and words come first, exactly as given.
  const voice = playerVoice(playerInput, h);
  if (voice) lines.unshift(voice);
  // Horror off: no creeping dread in the scenery.
  const air = prefsOf(state).horror === 'off' ? '' : ambient(state, seed + 7);
  if (air && !(h.includes('[COMBAT NARRATIVE'))) lines.push(air);
  return lines.join(' ');
}

module.exports = { buildOfflineNarrative };
