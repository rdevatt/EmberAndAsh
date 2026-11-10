'use strict';

// =============================================================
// ADVENTURES
// Endless work that is not all killing, built from what is actually true
// in the world right now: an unsolved murder, a captive held on a road an
// occupier controls, a struggling town that needs goods, ruins nobody
// has charted, a bridge that was never built, a relic in the canon, a
// war front, a war that could end, a disputed throne, the player's own
// family, and old history no one living remembers rightly.
//
// Each adventure is a sequence of steps the engine checks — be there,
// say or do the thing, talk to the right person, pay, bring materials,
// put in the days of work, persuade (a real roll, limited tries), win the
// fight, make the choice — with a deadline, a failure that costs
// something, and consequences written into the world and its canon.
// No AI calls. No database calls. Pure game logic.
// =============================================================

const chronicle = require('./chronicle');
const { REGIONS } = require('./constants');

function hashInt(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function pick(list, seed) { return list[hashInt(seed) % list.length]; }
const label = (k) => (REGIONS[k] ? REGIONS[k].label : k);
const FIRST = ['Alda', 'Bryn', 'Cael', 'Dara', 'Eamon', 'Faye', 'Gil', 'Hana', 'Iver', 'Jem', 'Kit', 'Lena', 'Mott', 'Nell', 'Orrin', 'Pia', 'Rafe', 'Sela', 'Tam', 'Vik'];
const lvlOf = (state) => require('./character').getPlayerLevel(state.totalXP || 0);
const settlements = () => Object.keys(REGIONS).filter(k => REGIONS[k].settlement);
function near(here, depth = 2) {
  const seen = new Set([here]); let frontier = [here];
  for (let d = 0; d < depth; d++) { frontier = frontier.flatMap(k => (REGIONS[k] && REGIONS[k].adjacent) || []).filter(k => REGIONS[k] && !seen.has(k)); frontier.forEach(k => seen.add(k)); }
  return [...seen];
}
// Regions the player can face: within reach of their level.
function fitting(state, keys) {
  const lvl = lvlOf(state);
  const ok = keys.filter(k => REGIONS[k] && REGIONS[k].levelRange && REGIONS[k].levelRange[0] <= lvl + 4);
  return ok.length ? ok : keys.filter(k => REGIONS[k]);
}
const holderOf = (world, k) => { const n = (REGIONS[k].npcs || [])[0]; return n ? chronicle.currentHolder(world, n) : null; };
const re = (words) => new RegExp(`\\b(${words})\\b`, 'i');

// ---------------------------------------------
// The kinds of adventure, each built from world state (or null if the
// world gives it nothing to stand on).
// ---------------------------------------------
const KINDS = {
  investigation(state, world, seed) {
    const unsolved = (world.unsolved || []).filter(c => c.victim && REGIONS[c.region]);
    const murdered = ((world.canon && world.canon.ledger) || []).filter(r => r.t === 'death' && /found dead|murder/.test(r.s + (r.x || '')) && REGIONS[r.r]);
    let victim, region;
    if (unsolved.length) { const c = pick(unsolved, seed); victim = c.victim; region = c.region; }
    else if (murdered.length) { const r = pick(murdered, seed); victim = r.s.replace(/ (is found dead|dies at \d+).*$/, ''); region = r.r; }
    else return null;
    const suspects = [0, 1, 2].map(i => `${pick(FIRST, seed + 's' + i)} ${pick(['Marsh', 'Coyle', 'Hartley', 'Penn', 'Rook', 'Sallow'], seed + 'n' + i)}`);
    const guilty = hashInt(seed + 'g') % 3;
    const witness = holderOf(world, region);
    return {
      kind: 'investigation', title: `Who Killed ${victim}?`, region, days: 40,
      intro: `${victim}'s death in ${label(region)} was never answered. Someone wants it answered.`,
      steps: [
        { kind: 'go', region },
        { kind: 'act', region, re: re('examine|search|investigate|study'), also: re('scene|body|grave|house|room|where'), text: `Examine where it happened ("examine the scene")`, found: `Scuffed boards, a torn sleeve-button, and a smell of ${['lamp oil', 'tar', 'bitter almond'][guilty]}.` },
        witness ? { kind: 'talk', region, who: witness.name, text: `Talk to ${witness.name}, who knew the dead`, found: `${witness.name} names three who had reason: ${suspects.join(', ')}. One of them always smells of ${['lamp oil', 'tar', 'bitter almond'][guilty]}.` } : null,
        { kind: 'choice', region, text: 'Name the killer', prompt: `Who killed ${victim}?`, options: suspects.map((s, i) => ({ label: `Accuse ${s}`, effects: i === guilty
          ? { xp: 1, coin: 1, morality: 3, canon: `${'{player}'} names ${s} as the killer of ${victim}; justice is done in ${label(region)}`, standing: { [nativeOf(region)]: 6 } }
          : { xp: 0.4, morality: -8, canon: `${'{player}'} accuses ${s} of killing ${victim}; an innocent hangs in ${label(region)}, and the killer walks free`, standing: { [nativeOf(region)]: -6 } } })) }
      ].filter(Boolean),
      fail: { canon: `The killing of ${victim} in ${label(region)} goes unanswered` }
    };
  },

  rescue(state, world, seed) {
    const here = state.character.region;
    const pool = fitting(state, near(here, 2).filter(k => k !== here));
    if (!pool.length) return null;
    const region = pick(pool, seed);
    const captive = `${pick(FIRST, seed + 'c')} ${pick(['Weller', 'Dunn', 'Fairley', 'Asher'], seed + 'cs')}`;
    const occ = require('./world-life').occupiedBy(world, region);
    const captor = occ ? `${chronicle.FACTION_NAMES[occ].replace(/^the /, '')} Gaoler` : 'Bandit Chief';
    return {
      kind: 'rescue', title: `The Taking of ${captive}`, region, home: here, days: 20,
      intro: `${captive} of ${label(here)} was taken on the road to ${label(region)}${occ ? ` by ${chronicle.FACTION_NAMES[occ]}` : ' by bandits'}. Their family begs you.`,
      steps: [
        { kind: 'go', region },
        { kind: 'act', region, re: re('search|find|track|look for|follow'), also: re('captive|camp|hideout|prison|cell|trail|tracks|' + captive.split(' ')[0].toLowerCase()), text: `Find where ${captive} is held ("track the captors to their camp")`, found: `A camp in a dry gully, and a cage with ${captive} in it.` },
        { kind: 'fight', region, foe: captor, text: `Free ${captive}: defeat the ${captor}` },
        { kind: 'go', region: here, text: `Bring ${captive} home to ${label(here)}`, found: `${captive}'s family weeps at the gate.` }
      ],
      success: { canon: `${'{player}'} rescues ${captive} from ${occ ? chronicle.FACTION_NAMES[occ] : 'bandits'} in ${label(region)}`, morality: 4, standing: { [nativeOf(here)]: 5 } },
      fail: { canon: `${captive}, taken on the road to ${label(region)}, is never seen again`, death: captive, region }
    };
  },

  trade(state, world, seed) {
    // A cart hauled to somewhere else: never the town you are standing in.
    const struggling = settlements().filter(k => k !== state.character.region && ['struggling', 'ruined'].includes((world.settlements[k] || {}).status));
    if (!struggling.length) return null;
    const region = pick(fitting(state, struggling), seed);
    const cost = 60 * lvlOf(state) + 200;
    return {
      kind: 'trade', title: `Grain for ${label(region)}`, region, days: 30,
      intro: `${label(region)} is ${world.settlements[region].status}. A cart of grain and salt bought here and sold there would feed it — and pay.`,
      steps: [
        { kind: 'pay', amount: cost, re: re('buy|purchase|load'), also: re('grain|goods|cart|supplies|salt'), text: `Buy the goods (${cost} copper: "buy the grain")`, found: 'The cart is loaded.' },
        { kind: 'go', region, text: `Haul the cart to ${label(region)}` },
        { kind: 'act', region, re: re('sell|deliver|unload|hand out|distribute'), also: re('grain|goods|cart|supplies|salt'), text: 'Sell or hand out the goods ("deliver the grain")', found: 'The market fills for the first time in months.' }
      ],
      success: { coin: Math.round(cost * 1.8), canon: `${'{player}'} brings grain to ${label(region)} in its hard times`, settlement: { region, status: 'rebuilding' }, pop: { region, add: 0.05 } },
      fail: { canon: `No grain reaches ${label(region)}; more people leave`, pop: { region, add: -0.05 } }
    };
  },

  exploration(state, world, seed) {
    // Somewhere the player has never been, within reach.
    const home = state.character.region;
    const known = new Set([home, ...(state.knownRegions || []), ...(state.visitedRegions || [])]);
    const wild = fitting(state, near(home, 3).filter(k => !known.has(k) && k !== 'shattered_throne'));
    const pool = wild.length ? wild : fitting(state, near(home, 2).filter(k => k !== home && k !== 'shattered_throne'));
    if (!pool.length) return null;
    const region = pick(pool, seed);
    const sites = ['the old watchtower', 'the dry riverbed', 'the standing stones'];
    return {
      kind: 'exploration', title: `Charting ${label(region)}`, region, days: 45,
      intro: `No map of ${label(region)} is worth the vellum. Chart it, and the reeve of ${label(home)} will pay.`,
      steps: [
        { kind: 'go', region },
        ...sites.map(s => ({ kind: 'act', region, re: re('explore|chart|survey|map|climb|walk'), also: re(s.split(' ').pop()), text: `Chart ${s} ("survey ${s}")`, found: `You sketch ${s} and note the paths.`, hours: 6 })),
        { kind: 'go', region: home, text: `Bring the charts back to ${label(home)}` }
      ],
      success: { canon: `${'{player}'} charts ${label(region)}`, known: region },
      fail: null
    };
  },

  construction(state, world, seed) {
    const k = state.character.region;
    if (!REGIONS[k].settlement) return null;
    const what = pick(['bridge', 'well', 'wall', 'granary'], seed);
    const name = `the ${pick(['Grey', 'Stone', 'Kindred', 'New'], seed + 'n')} ${what[0].toUpperCase() + what.slice(1)}`;
    const mat = { bridge: 'wood', well: 'stone', wall: 'stone', granary: 'wood' }[what];
    return {
      kind: 'construction', title: `Raising ${name}`, region: k, days: 60,
      intro: `${label(k)} has wanted ${what === 'well' ? 'a deep well' : `a ${what}`} for a generation. Bring materials and put in the work.`,
      steps: [
        { kind: 'have', material: mat, amount: 6, re: re('bring|deliver|give|hand over|donate'), also: re(mat + '|materials|timber|stone'), text: `Bring 6 ${mat} ("deliver the ${mat}") — "gather" finds it`, found: 'The pile grows by the site.' },
        { kind: 'work', region: k, count: 4, re: re('work|build|raise|dig|lay|haul'), also: re(what + '|stones|beams|site|foundation'), text: `Work on ${name} (4 days: "work on the ${what}")`, found: 'Another day of it.', hours: 10 }
      ],
      success: { canon: `${'{player}'} raises ${name} in ${label(k)}`, foundation: { name, region: k }, cap: { region: k, mult: 1.1 }, standing: { [nativeOf(k)]: 5 } },
      fail: { canon: `${cap(name)} in ${label(k)} is left half-built` }
    };
  },

  research(state, world, seed) {
    const relics = (world.relics || []).filter(r => !r.claimedBy && REGIONS[r.region]);
    const arts = Object.values((world.canon && world.canon.artifacts) || {}).filter(a => a.region && REGIONS[a.region] && !(a.owners || []).length);
    const org = (world.organizations || []).find(o => o.status !== 'closed');
    const relicName = relics.length ? (relics[0].name || 'the relic') : arts.length ? arts[0].name : `the ${pick(['Ember Lens', 'Hollow Crown', 'Ashglass Key', 'Warden\'s Horn'], seed)}`;
    const region = relics.length ? relics[0].region : arts.length ? arts[0].region : pick(fitting(state, Object.keys(REGIONS)), seed + 'r');
    const studyAt = org ? org.seat : state.character.region;
    return {
      kind: 'research', title: `The Search for ${relicName}`, region, days: 60,
      intro: `Old records speak of ${relicName}. ${org ? `${org.name} will open its archive to you.` : 'The local records may hold the way.'}`,
      steps: [
        { kind: 'work', region: studyAt, count: 2, re: re('study|research|read|search'), also: re('archive|records|books|library|scrolls|ledgers|' + relicName.split(' ').pop().toLowerCase()), text: `Study the records in ${label(studyAt)} (2 days: "study the archive")`, found: 'A margin note gives a place and a warning.', hours: 12 },
        { kind: 'go', region },
        { kind: 'fight', region, foe: `Guardian of ${relicName.replace(/^the /i, '')}`, text: `Take ${relicName} from its guardian` },
        { kind: 'choice', region, text: `Decide what becomes of ${relicName}`, prompt: `${relicName} is in your hands. What becomes of it?`, options: [
          { label: org ? `Give it to ${org.name}` : 'Give it to the local shrine', effects: { canon: `${'{player}'} gives ${relicName} to ${org ? org.name : `the shrine of ${label(studyAt)}`}`, members: org ? { name: org.name, add: 40 } : null, morality: 3, xp: 1 } },
          { label: 'Keep it', effects: { item: relicName, canon: `${'{player}'} claims ${relicName}`, xp: 1, artifact: { name: relicName, holder: '{player}' } } },
          { label: 'Destroy it, so no one can', effects: { canon: `${'{player}'} destroys ${relicName}`, xp: 0.8, morality: 1 } }
        ] }
      ],
      fail: { canon: `The trail of ${relicName} goes cold again` }
    };
  },

  military(state, world, seed) {
    // A war with a real front: regions where the two sides touch.
    const wars = require('./politics').activeWars(world).map(w => ({ ...w, fronts: require('./politics').fronts(world, w.a, w.b).filter(k => REGIONS[k] && k !== 'shattered_throne') })).filter(w => w.fronts.length);
    if (!wars.length) return null;
    const w = pick(wars, seed);
    const fronts = w.fronts;
    const region = pick(fitting(state, fronts), seed + 'f');
    const holder = chronicle.dominionOf(world, region);
    const enemy = holder === w.a ? w.b : w.a;
    return {
      kind: 'military', title: `The Defence of ${label(region)}`, region, days: 25,
      intro: `${cap(chronicle.FACTION_NAMES[enemy])} are coming for ${label(region)}, held by ${chronicle.FACTION_NAMES[holder]}. The garrison needs one more blade.`,
      steps: [
        { kind: 'go', region },
        { kind: 'fight', region, foe: `${cap(chronicle.FACTION_NAMES[enemy].replace(/^the /, ''))} Vanguard`, text: 'Break the vanguard' },
        { kind: 'fight', region, foe: `${cap(chronicle.FACTION_NAMES[enemy].replace(/^the /, ''))} War-Captain`, text: 'Kill their captain', boss: true }
      ],
      success: { canon: `${'{player}'} holds ${label(region)} for ${chronicle.FACTION_NAMES[holder]} against ${chronicle.FACTION_NAMES[enemy]}`, standing: { [holder]: 10, [enemy]: -10 }, power: { [enemy]: -4 } },
      fail: { canon: `${label(region)} falls to ${chronicle.FACTION_NAMES[enemy]}`, dominion: { region, faction: enemy } }
    };
  },

  negotiation(state, world, seed) {
    const wars = require('./politics').activeWars(world).filter(w => w.a !== 'choir' && w.b !== 'choir');
    if (!wars.length) return null;
    const w = pick(wars, seed);
    const seat = settlements().find(k => chronicle.dominionOf(world, k) === w.a) || state.character.region;
    const envoy = `${pick(FIRST, seed + 'e')} ${pick(['Vance', 'Holloway', 'Brisk'], seed + 'es')}`;
    return {
      kind: 'negotiation', title: `A Peace Between ${cap(chronicle.FACTION_NAMES[w.a])} and ${chronicle.FACTION_NAMES[w.b]}`, region: seat, days: 30,
      intro: `${cap(chronicle.FACTION_NAMES[w.a])} and ${chronicle.FACTION_NAMES[w.b]} have bled each other for ${w.years} years. ${envoy}, an envoy, thinks someone outside both camps could broker a truce.`,
      steps: [
        { kind: 'go', region: seat },
        { kind: 'act', region: seat, re: re('meet|talk to|speak with|find'), also: re('envoy|' + envoy.split(' ')[0].toLowerCase()), text: `Meet the envoy ${envoy} ("meet the envoy")`, found: `${envoy} lays out terms both sides might stomach.` },
        { kind: 'persuade', region: seat, re: re('persuade|convince|argue|negotiate|plead|reason'), dc: 13, tries: 3, text: 'Persuade both councils to sign ("persuade the councils") — three chances', found: 'Pens scratch. Seals are pressed.' }
      ],
      success: { canon: `${'{player}'} brokers a truce between ${chronicle.FACTION_NAMES[w.a]} and ${chronicle.FACTION_NAMES[w.b]}`, relation: { a: w.a, b: w.b, state: 'truce' }, standing: { [w.a]: 6, [w.b]: 6 }, morality: 4 },
      fail: { canon: `The peace talks between ${chronicle.FACTION_NAMES[w.a]} and ${chronicle.FACTION_NAMES[w.b]} collapse`, standing: { [w.a]: -3, [w.b]: -3 } }
    };
  },

  intrigue(state, world, seed) {
    const L = require('./world-life').ensure(world);
    const f = Object.keys(L.dynasties).find(x => L.dynasties[x].dispute || L.dynasties[x].regent);
    if (!f) return null;
    const d = L.dynasties[f];
    const rival = d.dispute ? d.dispute.claimant.name : d.regent.name;
    const seat = settlements().find(k => chronicle.dominionOf(world, k) === f) || state.character.region;
    const seatName = require('./world-life').SEATS[f].seat;
    return {
      kind: 'intrigue', title: `Letters for the ${seatName}`, region: seat, days: 35,
      intro: `${d.dispute ? `${rival} disputes ${d.ruler.name}'s right to the ${seatName}` : `${rival} rules as regent for the child ${d.ruler.name}, and some say means to keep ruling`}. Letters that would settle it are hidden in ${label(seat)}.`,
      steps: [
        { kind: 'go', region: seat },
        { kind: 'act', region: seat, re: re('steal|find|search|take|read'), also: re('letters|papers|correspondence|desk|strongbox'), text: 'Find the letters ("search for the letters")', found: 'The letters are real, and damning to one side or the other — depending on who sees them.' },
        { kind: 'choice', region: seat, text: 'Decide who gets the letters', prompt: `Whom do the letters serve?`, options: [
          { label: `Give them to ${d.ruler.name}`, effects: { canon: `${'{player}'} delivers the letters that secure ${d.ruler.name} on the ${seatName}`, settleDispute: { faction: f, winner: 'ruler' }, standing: { [f]: 8 }, xp: 1 } },
          { label: `Give them to ${rival}`, effects: { canon: `${'{player}'} delivers the letters that raise ${rival} to the ${seatName}`, settleDispute: { faction: f, winner: 'rival' }, standing: { [f]: 4 }, morality: -3, xp: 1, coin: 1 } },
          { label: 'Burn them', effects: { canon: `${'{player}'} burns the letters of the ${seatName}; the quarrel goes on`, xp: 0.6 } }
        ] }
      ],
      fail: null
    };
  },

  personal(state, world, seed) {
    const parent = state.lineage && state.lineage.parentName;
    const p = parent && world.canon && world.canon.people[require('./canon').keyOf(parent)];
    const region = (p && p.region && REGIONS[p.region]) ? p.region : (state.campaign && state.campaign.startRegion) || state.character.region;
    const who = parent || 'your mother';
    return {
      kind: 'personal', title: parent ? `What ${parent} Left Behind` : 'The House You Were Born In', region, days: 90,
      intro: parent ? `${parent} left something in ${label(region)} — a letter, a debt, a name. You have put off finding it long enough.` : `You were born in ${label(region)}. You have never asked what happened to the house, or to ${who}.`,
      steps: [
        { kind: 'go', region },
        { kind: 'act', region, re: re('search|visit|look|find|open'), also: re('house|home|grave|letter|chest|room|cottage'), text: 'Search the old house ("search the old house")', found: `Under a loose stone: a letter in ${parent ? `${parent}'s` : 'a'} hand, and a small key.` },
        { kind: 'talk', region, who: (holderOf(world, region) || { name: 'the elder' }).name, text: `Ask ${(holderOf(world, region) || { name: 'the elder' }).name} what they remember`, found: `They remember more than you expected, and tell it gently.` }
      ],
      success: { canon: `${'{player}'} learns the truth of ${parent ? `${parent}'s` : 'their own'} past in ${label(region)}`, item: 'old brass key', morality: 1 },
      fail: null
    };
  },

  history(state, world, seed) {
    const year = chronicle.dateOf(chronicle.nowHour(world)).year;
    const old = ((world.canon && world.canon.ledger) || []).filter(r => r.i >= 4 && year - r.y >= 40 && r.r && REGIONS[r.r] && r.t !== 'summary');
    if (!old.length) return null;
    const e = pick(old, seed);
    const org = (world.organizations || []).find(o => o.status !== 'closed');
    return {
      kind: 'history', title: `The Truth of ${e.y}`, region: e.r, days: 60,
      intro: `In ${e.y}: "${e.s}". Everyone in ${label(e.r)} tells it differently. Find out what really happened.`,
      steps: [
        { kind: 'go', region: e.r },
        { kind: 'act', region: e.r, re: re('search|dig|examine|explore|investigate'), also: re('ruins|stones|site|field|grave|cellar|old'), text: 'Search the old site ("examine the ruins")', found: 'Old ash, a buckle, a name cut into a beam.' },
        { kind: 'talk', region: e.r, who: (holderOf(world, e.r) || { name: 'the eldest' }).name, text: `Ask ${(holderOf(world, e.r) || { name: 'the eldest' }).name} what their elders said`, found: 'The story they tell does not match the chronicle.' },
        org ? { kind: 'work', region: org.seat, count: 1, re: re('study|research|read|compare'), also: re('archive|records|chronicle|books'), text: `Compare the accounts in ${org.name}'s archive ("study the archive")`, found: 'The pieces fit.', hours: 12 } : null
      ].filter(Boolean),
      success: { canon: `${'{player}'} uncovers the truth of "${e.s}" (${e.y})`, xp: 1 },
      fail: null
    };
  }
};
function nativeOf(k) { const n = (REGIONS[k] && REGIONS[k].npcs) || []; return (n[0] && n[0].faction) || 'compact'; }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ---------------------------------------------
// Offers, progress, failure, consequences
// ---------------------------------------------
function current(state) { return state.adventure && !state.adventure.over ? state.adventure : null; }
function stepOf(a) { return a ? a.steps[a.step] || null : null; }
function describe(s, a) {
  if (!s) return '';
  if (s.text) return s.text;
  if (s.kind === 'go') return `Go to ${label(s.region)}`;
  return s.kind;
}

function offers(state, world, n = 3) {
  const base = `${state.characterId}:${state.adventuresDone || 0}:${chronicle.nowDay(world) >> 4}`;
  const order = Object.keys(KINDS).sort((a, b) => hashInt(base + a) - hashInt(base + b));
  const out = [];
  for (const k of order) {
    if (out.length >= n) break;
    const a = KINDS[k](state, world, `${base}:${k}`);
    if (a) out.push(finish(state, world, a, `${base}:${k}`));
  }
  return out;
}

function finish(state, world, a, seed) {
  const lvl = lvlOf(state);
  const deed = require('./endless').deedFactor(lvl);
  a.id = `adv_${hashInt(seed)}`;
  a.step = 0;
  a.level = Math.max(1, lvl);
  // In line with sagas: about a dozen fights' worth for a few steps of work.
  a.reward = { xp: Math.round(12 * Math.max(3, lvl) * (Math.max(3, a.steps.length) / 3) * deed), coin: 60 * Math.max(3, lvl) };
  // The first "go" is already done if you are there.
  if (a.steps[0] && a.steps[0].kind === 'go' && a.steps[0].region === state.character.region) a.steps.shift();
  return a;
}

function offerText(list) {
  if (!list.length) return 'Nobody here has work of that kind. Try a town, or the bounty board.';
  return ['WORK THE WORLD NEEDS', '────────────────────', ...list.map((a, i) => `${i + 1}. ${a.title} [${a.kind}] — ${a.intro}\n   ${a.steps.map(s => describe(s, a)).join(' → ')}\n   Within ${a.days} days. Reward: +${a.reward.xp} XP, ${a.reward.coin} copper.`), '', '"take adventure N" to accept one.'].join('\n');
}

function take(state, world, n) {
  if (current(state)) return { success: false, message: `You are already committed to "${state.adventure.title}". ("abandon adventure" to give it up.)` };
  const list = state.adventureOffers || [];
  const a = list[n - 1];
  if (!a) return { success: false, message: list.length ? `Choose 1–${list.length}.` : 'Ask for work first ("adventures").' };
  a.deadlineDay = chronicle.nowDay(world) + a.days;
  a.started = chronicle.nowDay(world);
  state.adventure = a; state.adventureOffers = null;
  return { success: true, message: `You take on "${a.title}".\n${a.intro}\n► ${describe(stepOf(a), a)}\n(Deadline: ${a.days} days.)` };
}

function statusText(state, world) {
  const a = current(state);
  if (!a) return 'You have no adventure under way. ("adventures" to look for one.)';
  const left = a.deadlineDay - chronicle.nowDay(world);
  return `${a.title} [${a.kind}]\n${a.steps.map((s, i) => `${i < a.step ? '✓' : i === a.step ? '►' : '·'} ${describe(s, a)}${s.kind === 'work' && i === a.step ? ` (${s.done || 0}/${s.count})` : ''}${s.kind === 'persuade' && i === a.step ? ` (${s.tries - (s.used || 0)} tries left)` : ''}`).join('\n')}\n${left} days left. Reward: +${a.reward.xp} XP, ${a.reward.coin} copper.`;
}

// Inputs that move the adventure. Returns { message, hours, spawn, done } or null.
function handle(state, world, input, helpers = {}) {
  const a = current(state);
  if (!a) return null;
  const s = stepOf(a);
  const t = String(input || '');
  const here = state.character.region;
  if (!s) return null;
  // Trying the next thing before getting there.
  if (s.kind === 'go' && here !== s.region) {
    const nx = a.steps[a.step + 1];
    if (nx && nx.re && nx.re.test(t) && (!nx.also || nx.also.test(t))) return { message: `That is in ${label(s.region)}. ${describe(s, a)} first.` };
    return null;
  }
  if (s.region && here !== s.region && s.kind !== 'go') {
    if (s.re && s.re.test(t) && (!s.also || s.also.test(t))) return { message: `That is in ${label(s.region)}.` };
    return null;
  }
  const matches = s.re && s.re.test(t) && (!s.also || s.also.test(t));
  if (s.kind === 'act' && matches) return advance(state, world, a, s.found, s.hours || 3, helpers);
  if (s.kind === 'talk' && /\b(talk|speak|ask|question)\b/i.test(t) && t.toLowerCase().includes(s.who.split(' ')[0].toLowerCase())) return advance(state, world, a, s.found, 1, helpers);
  if (s.kind === 'pay' && matches) {
    if ((state.coin || 0) < s.amount) return { message: `You need ${s.amount} copper for that.` };
    state.coin -= s.amount;
    return advance(state, world, a, s.found, 1, helpers);
  }
  if (s.kind === 'have' && matches) {
    const have = (state.materials || {})[s.material] || 0;
    if (have < s.amount) return { message: `You have ${have} ${s.material}; you need ${s.amount}.` };
    state.materials[s.material] = have - s.amount;
    return advance(state, world, a, s.found, 2, helpers);
  }
  if (s.kind === 'work' && matches) {
    s.done = (s.done || 0) + 1;
    if (s.done < s.count) return { message: `${s.found} (${s.done}/${s.count})`, hours: s.hours || 8 };
    return advance(state, world, a, s.found, s.hours || 8, helpers);
  }
  if (s.kind === 'persuade' && matches) {
    s.used = (s.used || 0) + 1;
    const cha = (state.stats && state.stats.cha) || 10;
    const roll = 1 + Math.floor(Math.random() * 20);
    const total = roll + Math.floor((cha - 10) / 2) + Math.floor(lvlOf(state) / 20);
    if (total >= s.dc) return advance(state, world, a, `${s.found} (roll ${roll}, total ${total} against ${s.dc})`, 6, helpers);
    if (s.used >= s.tries) return failAdventure(state, world, `They will not be moved (roll ${roll}, total ${total} against ${s.dc}). The talks are over.`);
    return { message: `They are not convinced (roll ${roll}, total ${total} against ${s.dc}). ${s.tries - s.used} ${s.tries - s.used === 1 ? 'try' : 'tries'} left.`, hours: 4 };
  }
  if (s.kind === 'fight' && !state.inCombat && /\b(attack|fight|confront|face|hunt|find|seek|charge|ambush|free|rescue|break|kill)\b/i.test(t)) {
    if (a.foeOut) return null;
    a.foeOut = true;
    return { spawn: buildFoe(state, a, s, helpers.spawnEnemy), message: `${s.foe} is here.` };
  }
  return null;
}

function buildFoe(state, a, s, spawnEnemy) {
  const r = REGIONS[state.character.region];
  const level = Math.max(r.levelRange ? r.levelRange[0] : 1, Math.min(lvlOf(state) + 1, (r.levelRange ? r.levelRange[1] : 99) + 3));
  const e = spawnEnemy(state.character.region, level);
  e.label = s.foe; e.level = level; e.isRare = true;
  if (s.boss) { e.isBoss = true; e.maxHP = e.currentHP = Math.round(e.maxHP * 1.8); } else e.maxHP = e.currentHP = Math.round(e.maxHP * 1.3);
  e.meta = { ...(e.meta || {}), adventure: a.id, adventureStep: a.step };
  return e;
}

// Arrival and fight results.
function onEvent(state, world, evt, helpers = {}) {
  const a = current(state);
  if (!a) return null;
  const s = stepOf(a);
  if (!s) return null;
  if (evt.type === 'arrived' && s.kind === 'go' && evt.region === s.region) return advance(state, world, a, s.found || `You reach ${label(s.region)}.`, 0, helpers);
  if (evt.type === 'kill' && evt.meta && evt.meta.adventure === a.id && evt.meta.adventureStep === a.step) { a.foeOut = false; return advance(state, world, a, `${s.foe} is beaten.`, 0, helpers); }
  if (evt.type === 'fightLost' && evt.meta && evt.meta.adventure === a.id) { a.foeOut = false; return { message: 'You are driven off — but the work is not over, if you can get back to it in time.' }; }
  return null;
}

function advance(state, world, a, lead, hours, helpers) {
  a.step++;
  const s = stepOf(a);
  if (!s) return complete(state, world, a, lead, hours, helpers);
  if (s.kind === 'go' && s.region === state.character.region) return advance(state, world, a, lead, hours, helpers);
  if (s.kind === 'choice') {
    state.pendingAdventureChoice = { id: a.id, step: a.step };
    return { message: `${lead}\n${s.prompt}\n${s.options.map((o, i) => `  ${i + 1}. ${o.label}`).join('\n')}\n("decide 1", "decide 2"…, or "adventure decide N")`, hours };
  }
  return { message: `${lead}\nNext — ${describe(s, a)}.`, hours };
}

function decide(state, world, n, helpers = {}) {
  const a = current(state);
  const p = state.pendingAdventureChoice;
  if (!a || !p || p.id !== a.id) return null;
  const s = a.steps[p.step];
  const o = s.options[n - 1];
  if (!o) return { success: false, message: `Choose ${s.options.map((_, i) => i + 1).join(', ')}.` };
  state.pendingAdventureChoice = null;
  a.step++;
  const r = complete(state, world, a, `You chose: ${o.label}.`, 1, helpers, o.effects);
  return { success: true, ...r };
}

function complete(state, world, a, lead, hours, helpers, choiceEffects = null) {
  const e = choiceEffects || a.success || {};
  const lines = [lead];
  const xpMult = e.xp !== undefined ? e.xp : 1;
  const coinMult = e.coin !== undefined && e.coin <= 2 ? e.coin : 1;
  const xp = Math.round(a.reward.xp * xpMult);
  const coin = Math.round(a.reward.coin * coinMult) + (e.coin > 2 ? e.coin : 0);
  let levelUp = null;
  if (xp) { levelUp = require('./character').grantXP(state, xp); lines.push(`+${xp} XP`); }
  if (coin && coinMult) { state.coin = (state.coin || 0) + coin; lines.push(`+${coin} copper`); }
  lines.push(...consequences(state, world, e, a));
  a.over = true; a.outcome = 'done';
  state.adventuresDone = (state.adventuresDone || 0) + 1;
  state.adventureLog = [...(state.adventureLog || []), { title: a.title, kind: a.kind, outcome: 'done', day: chronicle.nowDay(world) }].slice(-40);
  lines.push(`(${a.title} is over.)`);
  return { message: lines.filter(Boolean).join('\n'), hours, done: true, levelUp };
}

function failAdventure(state, world, why) {
  const a = current(state);
  if (!a) return null;
  a.over = true; a.outcome = 'failed';
  state.pendingAdventureChoice = null;
  const lines = [why, `"${a.title}" has failed.`, ...consequences(state, world, a.fail || {}, a)];
  state.adventureLog = [...(state.adventureLog || []), { title: a.title, kind: a.kind, outcome: 'failed', day: chronicle.nowDay(world) }].slice(-40);
  return { message: lines.filter(Boolean).join('\n'), failed: true, hours: 1 };
}

// Deadlines: checked every turn.
function checkDeadline(state, world) {
  const a = current(state);
  if (!a || !world || chronicle.nowDay(world) <= a.deadlineDay) return null;
  return failAdventure(state, world, `Time has run out on "${a.title}".`);
}

function abandon(state, world) {
  const a = current(state);
  if (!a) return { message: 'You have no adventure to abandon.' };
  return failAdventure(state, world, `You walk away from "${a.title}".`);
}

function consequences(state, world, e, a) {
  const out = [];
  const name = state.character.name;
  const fill = (t) => String(t).replace(/\{player\}/g, name);
  if (e.morality) require('./morality').shift(state, e.morality, a.title);
  if (e.standing) { const ch = require('./factions').changeStanding(state, e.standing, a.title); const txt = require('./factions').formatStandingChanges(ch); if (txt) out.push(txt); }
  if (e.item) { require('./economy').addItem(state, { name: e.item, type: 'keepsake', value: 0, note: a.title }); out.push(`You keep ${e.item}.`); }
  if (e.settlement) { const s = world.settlements[e.settlement.region] || {}; if (s.status !== 'thriving') world.settlements[e.settlement.region] = { ...s, status: e.settlement.status, since: chronicle.nowDay(world) }; }
  if (e.pop) { const ec = require('./world-life').econ(world, e.pop.region); ec.pop = Math.max(10, Math.min(ec.cap, Math.round(ec.pop * (1 + e.pop.add)))); }
  if (e.cap) { const ec = require('./world-life').econ(world, e.cap.region); ec.cap = Math.round(ec.cap * e.cap.mult); }
  if (e.known) { state.knownRegions = [...new Set([...(state.knownRegions || []), e.known])]; }
  if (e.power) for (const [f, d] of Object.entries(e.power)) world.factionPower[f] = Math.max(5, Math.min(100, (world.factionPower[f] || 50) + d));
  if (e.dominion) { const ev = chronicle.setDominion(world, e.dominion.region, e.dominion.faction, `No one held the line at ${label(e.dominion.region)}.`); if (ev) out.push(ev.title); }
  if (e.relation) { const ev = require('./politics').setRelation(world, e.relation.a, e.relation.b, e.relation.state, `${name} brokered it.`, chronicle.actorOf(state)); if (ev) out.push(ev.title); }
  if (e.members) { const o = (world.organizations || []).find(x => x.name === e.members.name); if (o) o.members += e.members.add; }
  if (e.foundation) require('./canon').ensure(world).foundations.push({ name: e.foundation.name, founder: name, region: e.foundation.region, y: chronicle.dateOf(chronicle.nowHour(world)).year, kind: 'work', status: 'standing' });
  if (e.artifact) {
    const c = require('./canon').ensure(world);
    const key = require('./canon').keyOf(e.artifact.name);
    const art = c.artifacts[key] || (c.artifacts[key] = { name: e.artifact.name, owners: [], region: state.character.region });
    art.owners.push({ owner: fill(e.artifact.holder), y: chronicle.dateOf(chronicle.nowHour(world)).year, how: a.title });
  }
  if (e.settleDispute) {
    const L = require('./world-life').ensure(world);
    const d = L.dynasties[e.settleDispute.faction];
    if (d && e.settleDispute.winner === 'rival' && (d.dispute || d.regent)) {
      const rival = d.dispute ? d.dispute.claimant : d.regent;
      d.dispute = null; d.regent = null;
      d.ruler = { ...rival }; d.line.push(rival.name); d.since = chronicle.nowDay(world);
      world.factionLeaders = { ...(world.factionLeaders || {}), [e.settleDispute.faction]: rival.name };
      chronicle.addEvent(world, { type: 'succession', importance: 4, title: `The ${require('./world-life').SEATS[e.settleDispute.faction].seat} passes to ${rival.name}`, text: `${name}'s letters decided it.`, actor: chronicle.actorOf(state) });
    } else if (d) { d.dispute = null; }
  }
  if (e.death) {
    require('./canon').person(world, e.death, { died: chronicle.dateOf(chronicle.nowHour(world)).year, cause: 'lost to captors', region: e.region });
  }
  if (e.canon) chronicle.addEvent(world, { type: 'adventure', importance: 4, title: fill(e.canon), region: a.region, actor: chronicle.actorOf(state) }, `adv:${a.id}`);
  return out;
}

module.exports = { KINDS, offers, offerText, take, statusText, handle, onEvent, decide, checkDeadline, abandon, current, stepOf };
