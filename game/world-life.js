'use strict';

// =============================================================
// WORLD LIFE
// The yearly life of the world beyond its wars: who sits on each seat of
// power and who comes after them (heirs, regencies, disputed claims);
// how many people live in each place and whether it is growing or dying;
// what things cost there and why; faiths and schools of magic that rise,
// spread and are put down; disasters and the long work of rebuilding;
// the institutions people found, which grow, change hands and fail;
// rivalries between legends; decrees of former heroes who now rule; and
// what occupation looks like on the ground.
//
// Deterministic for a given world and year (hash-seeded), so a replay of
// the same history gives the same world. Every turning point is written
// to the chronicle and so to the permanent canon.
// No AI calls. No database calls. Pure game logic.
// =============================================================

const chronicle = require('./chronicle');
const { REGIONS } = require('./constants');

const DAY = 1, YEAR = 360;
function hashInt(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function pick(list, seed) { return list[hashInt(seed) % list.length]; }
const FN = () => chronicle.FACTION_NAMES;
const yearOf = (world) => chronicle.dateOf(chronicle.nowHour(world)).year;
const ageAt = (world, born) => Math.floor((chronicle.nowDay(world) - born) / YEAR);
const label = (k) => (REGIONS[k] ? REGIONS[k].label : k);

// ---------------------------------------------
// Seats of power and their succession
// ---------------------------------------------
const SEATS = {
  wardens: { title: 'High Warden', seat: 'the High Warden\'s chair', rule: 'appointed' },
  compact: { title: 'Speaker', seat: 'Speakership of the Free Towns', rule: 'elected', term: 8 },
  remnant: { title: 'Sun-Monarch', seat: 'Sun Throne', rule: 'hereditary', house: 'Aurel' },
  choir:   { title: 'First Cantor', seat: 'First Cantorship', rule: 'chosen' }
};
const FIRST = ['Aldric', 'Bera', 'Caius', 'Delphine', 'Edrin', 'Fiora', 'Galen', 'Hesper', 'Ilian', 'Jora', 'Kestrel', 'Liane', 'Marek', 'Nerys', 'Oswin', 'Perrin', 'Rosalind', 'Stellan', 'Thea', 'Ulric', 'Vesna', 'Wystan', 'Ysolde', 'Zarek'];
const SURN  = ['Ashby', 'Blackmere', 'Coldwater', 'Dunmore', 'Emberly', 'Fallow', 'Greaves', 'Harrow', 'Ironside', 'Kettle', 'Lark', 'Morrow', 'Northcote', 'Pell', 'Quarry', 'Redcliff', 'Stone', 'Thorne', 'Vane', 'Wick'];
const TRAITS = ['ambitious', 'dutiful', 'merciful', 'ruthless', 'cautious', 'cruel', 'unforgiving', 'pious'];

function personName(f, seed) {
  const first = pick(FIRST, seed + 'f');
  return SEATS[f].house ? `${first} ${SEATS[f].house}` : `${first} ${pick(SURN, seed + 's')}`;
}
function newPerson(world, f, seed, ageYears) {
  return { name: personName(f, seed), born: chronicle.nowDay(world) - ageYears * YEAR, trait: pick(TRAITS, seed + 't') };
}

function ensure(world) {
  if (!world.life || typeof world.life !== 'object') world.life = {};
  const L = world.life;
  if (!L.dynasties) {
    L.dynasties = {};
    for (const f of Object.keys(SEATS)) {
      const ruler = newPerson(world, f, `${world.id}${f}ruler0`, 38 + hashInt(world.id + f) % 20);
      if (f === 'remnant') ruler.name = 'Aurelian Aurel';            // the cousin of Seraphine's story
      L.dynasties[f] = { ruler, heir: null, regent: null, dispute: null, since: chronicle.nowDay(world), line: [ruler.name] };
    }
  }
  if (!L.economy) L.economy = {};
  if (!L.movements) L.movements = [];
  if (!L.disasters) L.disasters = [];
  if (!L.rivalries) L.rivalries = [];
  if (!L.decrees) L.decrees = [];
  return L;
}

function rulerOf(world, f) {
  const d = ensure(world).dynasties[f];
  return d ? { ...d.ruler, title: SEATS[f].title, regent: d.regent, dispute: d.dispute, age: ageAt(world, d.ruler.born) } : null;
}

function succeed(world, f, d, heir, how, out) {
  const s = SEATS[f];
  const old = d.ruler;
  d.ruler = heir; d.heir = null; d.since = chronicle.nowDay(world);
  d.line.push(heir.name); if (d.line.length > 60) d.line = d.line.slice(-60);
  world.factionLeaders = { ...(world.factionLeaders || {}), [f]: heir.name };
  const age = ageAt(world, heir.born);
  let text = `${how}. ${old.name} is succeeded by ${heir.name}, aged ${age}.`;
  if (s.rule === 'hereditary' && age < 16) {
    d.regent = newPerson(world, f, `${world.id}${f}${yearOf(world)}regent`, 45);
    d.regent.name = `${pick(FIRST, world.id + f + yearOf(world) + 'rg')} ${pick(SURN, world.id + f + yearOf(world) + 'rgs')}`;
    text += ` ${heir.name} is a child; ${d.regent.name} rules as regent until they come of age.`;
  }
  out.push(chronicle.addEvent(world, { type: 'succession', importance: 4, title: `The ${s.seat} passes to ${heir.name}`, text, region: null }, `succ:${f}:${d.line.length}`));
  require('./canon').person(world, heir.name, { titles: [`${s.title} of ${FN()[f]}`] });
}

function dynastyYear(world, out) {
  const L = ensure(world);
  const y = yearOf(world);
  for (const [f, d] of Object.entries(L.dynasties)) {
    const s = SEATS[f];
    // A ruler set by the story (Seraphine takes the Sun Throne) is honoured.
    const named = (world.factionLeaders || {})[f];
    if (named && named !== d.ruler.name && !d.line.includes(named)) {
      d.ruler = { name: named, born: chronicle.nowDay(world) - 30 * YEAR, trait: 'ambitious' };
      d.line.push(named); d.heir = null; d.regent = null; d.dispute = null; d.since = chronicle.nowDay(world);
    }
    const age = ageAt(world, d.ruler.born);
    // Heirs: a child for a royal house; a chosen successor elsewhere.
    if (!d.heir && age >= 24 && hashInt(`${world.id}${f}${y}heir`) % 3 === 0) {
      if (s.rule === 'hereditary') {
        d.heir = { name: `${pick(FIRST, world.id + f + y + 'child')} ${s.house}`, born: chronicle.nowDay(world), trait: pick(TRAITS, world.id + f + y + 'ct') };
        out.push(chronicle.addEvent(world, { type: 'birth', importance: 3, title: `${d.heir.name} is born to ${d.ruler.name}, heir to the ${s.seat}` }, `heir:${f}:${d.heir.name}:${y}`));
      } else d.heir = newPerson(world, f, `${world.id}${f}${y}succ`, 30 + hashInt(world.id + f + y) % 15);
    }
    // Regency ends when the heir comes of age.
    if (d.regent && ageAt(world, d.ruler.born) >= 16) {
      out.push(chronicle.addEvent(world, { type: 'succession', importance: 3, title: `${d.ruler.name} comes of age and takes the ${s.seat} from the regent ${d.regent.name}` }, `regency-end:${f}:${d.ruler.name}`));
      d.regent = null;
    }
    // A disputed claim: it weakens the power until it is settled.
    if (d.dispute) {
      world.factionPower[f] = Math.max(5, (world.factionPower[f] || 50) - 3);
      const years = Math.floor((chronicle.nowDay(world) - d.dispute.since) / YEAR);
      if (years >= 1 && hashInt(`${world.id}${f}${y}disp`) % 3 === 0) {
        const own = Object.keys(world.dominion || {}).filter(k => world.dominion[k] === f && k !== 'shattered_throne');
        if (own.length > 2 && hashInt(`${world.id}${f}${y}secede`) % 2 === 0) {
          const k = pick(own, `${world.id}${f}${y}sk`);
          const e = chronicle.setDominion(world, k, 'lawless', `${label(k)} declares for ${d.dispute.claimant.name} and refuses ${d.ruler.name}.`);
          if (e) out.push(e);
        }
      }
      if (years >= 2 && hashInt(`${world.id}${f}${y}end`) % 2 === 0) {
        const claimantWins = hashInt(`${world.id}${f}${y}win`) % 3 === 0;
        const c = d.dispute.claimant; d.dispute = null;
        if (claimantWins) succeed(world, f, d, c, `${c.name}'s claim prevails after ${years} years of strife`, out);
        else out.push(chronicle.addEvent(world, { type: 'succession', importance: 3, title: `${c.name}'s claim to the ${s.seat} fails; ${d.ruler.name} holds it` }, `disp-end:${f}:${c.name}`));
      }
    }
    // Death, or the end of a term.
    const span = 62 + hashInt(`${f}${d.ruler.name}span`) % 24;
    const dies = age >= span || (age >= 40 && hashInt(`${world.id}${f}${y}death`) % 45 === 0);
    const termEnds = s.term && (chronicle.nowDay(world) - d.since) >= s.term * YEAR;
    if (!dies && !termEnds) continue;
    if (dies) {
      require('./canon').person(world, d.ruler.name, { titles: [`${s.title} of ${FN()[f]}`] });
      out.push(chronicle.addEvent(world, { type: 'death', importance: 4, title: `${d.ruler.name} dies at ${age}`, text: `The ${s.title} of ${FN()[f]} is dead.` }, `ruler-death:${f}:${d.ruler.name}`));
    }
    const heir = d.heir || (s.rule === 'hereditary'
      ? { name: `${pick(FIRST, world.id + f + y + 'cousin')} ${s.house}`, born: chronicle.nowDay(world) - (18 + hashInt(world.id + f + y) % 30) * YEAR, trait: pick(TRAITS, world.id + f + y + 'kt') }
      : newPerson(world, f, `${world.id}${f}${y}elect`, 40 + hashInt(world.id + f + y + 'a') % 20));
    const how = dies ? `${d.ruler.name} is dead` : `${d.ruler.name}'s term ends; the Free Towns vote`;
    succeed(world, f, d, heir, how, out);
    // Without a clear heir, or with a child on the throne, someone contests it.
    const contest = (s.rule === 'hereditary' || s.rule === 'chosen') && hashInt(`${world.id}${f}${y}contest`) % (d.regent ? 2 : 4) === 0;
    if (contest) {
      const claimant = newPerson(world, f, `${world.id}${f}${y}claim`, 30);
      d.dispute = { claimant, since: chronicle.nowDay(world) };
      out.push(chronicle.addEvent(world, { type: 'succession', importance: 4, title: `${claimant.name} disputes ${heir.name}'s right to the ${s.seat}`, text: `${FN()[f]} divide behind two claimants.` }, `disp:${f}:${claimant.name}`));
    }
  }
}

// ---------------------------------------------
// People and prosperity
// ---------------------------------------------
function econ(world, k) {
  const L = ensure(world);
  if (!L.economy[k]) {
    const r = REGIONS[k];
    const pop = r && r.settlement ? 150 + hashInt(world.id + k) % 3400 : 20 + hashInt(world.id + k) % 160;
    // What the land and trade here can feed: some places are meant to stay small.
    L.economy[k] = { pop, cap: Math.round(pop * (1.5 + (hashInt(k + 'cap') % 46) / 10)) };
  }
  if (!L.economy[k].cap) L.economy[k].cap = L.economy[k].pop * 4;
  return L.economy[k];
}
function sizeOf(pop) { return pop < 150 ? 'hamlet' : pop < 1000 ? 'village' : pop < 5000 ? 'town' : 'city'; }

function nativeOf(k) { const n = (REGIONS[k] && REGIONS[k].npcs) || []; return (n[0] && n[0].faction) || null; }
function occupiedBy(world, k) {
  const holder = chronicle.dominionOf(world, k);
  const native = nativeOf(k);
  return holder && native && holder !== native && holder !== 'lawless' ? holder : null;
}

function economyYear(world, out) {
  const L = ensure(world);
  for (const k of Object.keys(REGIONS)) {
    if (!REGIONS[k].settlement) continue;
    const e = econ(world, k);
    const before = sizeOf(e.pop);
    const st = (world.settlements[k] || {}).status;
    let g = { thriving: 0.03, rebuilding: 0.02, struggling: -0.03, ruined: -0.12 }[st] ?? 0.01;
    if (occupiedBy(world, k)) g -= 0.01;
    if ((world.organizations || []).some(o => o.seat === k && o.status !== 'closed')) g += 0.01;
    if (L.movements.some(m => m.regions.includes(k) && m.strength >= 50)) g += 0.005;
    // Growth slows as the land fills (logistic); people come back to a
    // place that is no longer ruined, and a ruined one empties.
    if (g > 0) g *= Math.max(0, 1 - e.pop / e.cap);
    if (st !== 'ruined' && e.pop < e.cap * 0.15) g = Math.max(g, 0.15);
    e.pop = Math.max(10, Math.min(e.cap, Math.round(e.pop * (1 + g))));
    const after = sizeOf(e.pop);
    if (after !== before) {
      const grew = ['hamlet', 'village', 'town', 'city'].indexOf(after) > ['hamlet', 'village', 'town', 'city'].indexOf(before);
      out.push(chronicle.addEvent(world, { type: 'settlement', importance: 3, title: grew ? `${label(k)} grows into a ${after}` : `${label(k)} dwindles to a ${after}`, region: k }, `size:${k}:${after}:${yearOf(world)}`));
    }
  }
}

// What things cost here compared with ordinary times — and why.
function priceIndex(world, k, state = null) {
  if (!world || !REGIONS[k]) return { mult: 1, reasons: [] };
  const reasons = [];
  let m = 1;
  const st = (world.settlements[k] || {}).status;
  const sm = { ruined: 1.5, struggling: 1.2, rebuilding: 1.1, thriving: 0.95 }[st];
  if (sm) { m *= sm; reasons.push(st === 'thriving' ? 'plenty in the markets' : `${st} — goods are scarce`); }
  const occ = occupiedBy(world, k);
  if (occ) {
    const friend = state && state.factions && (state.factions[occ] || 0) >= 25;
    if (!friend) { m *= 1.1; reasons.push(`a levy for ${FN()[occ]}`); }
  }
  const holder = chronicle.dominionOf(world, k);
  for (const d of ensure(world).decrees) {
    if (d.until < chronicle.nowDay(world) || d.faction !== holder || !d.price) continue;
    m *= d.price; reasons.push(`${d.by}'s decree: ${d.text}`);
  }
  if (ensure(world).disasters.some(d => d.region === k && d.progress < 100)) { m *= 1.1; reasons.push('the disaster has emptied the stores'); }
  return { mult: Math.round(m * 100) / 100, reasons };
}

// ---------------------------------------------
// Faiths and schools of magic
// ---------------------------------------------
const MOVEMENTS = [
  { name: 'the Cinder Saints', kind: 'faith', likes: ['wardens'], hates: ['choir'], creed: 'the Ember is holy and must be tended' },
  { name: 'the Quiet Ash', kind: 'faith', likes: ['choir'], hates: ['wardens'], creed: 'the Ash is a mercy, and death a door' },
  { name: 'the Lantern Faith', kind: 'faith', likes: ['compact', 'wardens'], hates: [], creed: 'every hearth is a temple' },
  { name: 'the Drowned Hymn', kind: 'faith', likes: [], hates: ['remnant', 'wardens'], creed: 'the old gods sleep under the water' },
  { name: 'the Open Grimoire', kind: 'magic', likes: ['compact'], hates: ['remnant'], creed: 'magic belongs to everyone' },
  { name: 'the Starwrights', kind: 'magic', likes: ['remnant'], hates: [], creed: 'the stars can be read and written' },
  { name: 'the Hollow Circle', kind: 'magic', likes: ['choir'], hates: ['wardens', 'compact'], creed: 'the dead have more to teach than the living' }
];

function movementsYear(world, out) {
  const L = ensure(world);
  const y = yearOf(world);
  const active = L.movements.filter(m => m.strength > 0);
  if (active.length < 3 && hashInt(`${world.id}${y}move`) % 12 === 0) {
    const free = MOVEMENTS.filter(t => !L.movements.some(m => m.name === t.name && m.strength > 0));
    if (free.length) {
      const t = pick(free, `${world.id}${y}mt`);
      const homes = Object.keys(REGIONS).filter(k => REGIONS[k].settlement);
      const origin = pick(homes, `${world.id}${y}mo`);
      L.movements.push({ name: t.name, kind: t.kind, creed: t.creed, origin, regions: [origin], strength: 15, founded: y });
      out.push(chronicle.addEvent(world, { type: 'movement', importance: 3, title: `${cap(t.name)} arise in ${label(origin)}`, text: `They teach that ${t.creed}.`, region: origin }, `move:${t.name}:${y}`));
    }
  }
  for (const m of L.movements) {
    if (m.strength <= 0) continue;
    const t = MOVEMENTS.find(x => x.name === m.name) || { likes: [], hates: [] };
    // The powers that hate it put it down where they rule.
    const persecuted = m.regions.filter(k => t.hates.includes(chronicle.dominionOf(world, k)));
    if (persecuted.length && hashInt(`${world.id}${m.name}${y}p`) % 3 === 0) {
      const k = pick(persecuted, `${world.id}${m.name}${y}pk`);
      m.regions = m.regions.filter(x => x !== k);
      m.strength -= 15;
      out.push(chronicle.addEvent(world, { type: 'movement', importance: 3, title: `${cap(FN()[chronicle.dominionOf(world, k)])} put down ${m.name} in ${label(k)}`, region: k }, `persec:${m.name}:${k}:${y}`));
    }
    // Movements grow, then age: after their first generations most lose their fire.
    const age = y - m.founded;
    const tiring = age > 40 + hashInt(m.name + m.founded) % 40 ? 9 : 0;
    m.strength = Math.min(100, m.strength + 4 + hashInt(`${world.id}${m.name}${y}g`) % 8 - persecuted.length * 3 - tiring);
    if (tiring && m.regions.length > 1 && hashInt(`${world.id}${m.name}${y}shrink`) % 2 === 0) m.regions.pop();
    if (m.strength >= 30 && m.regions.length < 8 && m.regions.length && hashInt(`${world.id}${m.name}${y}s`) % 2 === 0) {
      const next = [...new Set(m.regions.flatMap(k => REGIONS[k].adjacent || []))].filter(k => !m.regions.includes(k) && REGIONS[k] && !t.hates.includes(chronicle.dominionOf(world, k)));
      if (next.length) {
        const k = pick(next, `${world.id}${m.name}${y}n`);
        m.regions.push(k);
        out.push(chronicle.addEvent(world, { type: 'movement', importance: 2, title: `${cap(m.name)} spread to ${label(k)}`, region: k }, `spread:${m.name}:${k}`));
      }
    }
    for (const f of t.likes) if (m.strength >= 60) world.factionPower[f] = Math.min(95, (world.factionPower[f] || 50) + 1);
    if (m.strength <= 0 || !m.regions.length) {
      m.strength = 0;
      out.push(chronicle.addEvent(world, { type: 'movement', importance: 3, title: `${cap(m.name)} fade from the world`, text: `They lasted ${y - m.founded} years.` }, `fade:${m.name}:${m.founded}`));
    }
  }
  if (L.movements.length > 30) L.movements = L.movements.filter(m => m.strength > 0).concat(L.movements.filter(m => m.strength <= 0).slice(-10));
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ---------------------------------------------
// Disasters and the work of rebuilding
// ---------------------------------------------
const DISASTERS = [
  { kind: 'flood', title: 'The Great Flood', text: 'The rivers burst their banks.' },
  { kind: 'fire', title: 'The Burning', text: 'Fire takes half the roofs in a night.' },
  { kind: 'plague', title: 'The Grey Cough', text: 'A sickness empties the streets.' },
  { kind: 'quake', title: 'The Shaking', text: 'The ground opens; walls come down.' },
  { kind: 'famine', title: 'The Hungry Year', text: 'The harvest fails, and then the next.' }
];

function strike(world, k, t, out) {
  const L = ensure(world);
  const y = yearOf(world);
  const s = world.settlements[k] || { status: 'thriving' };
  s.status = s.status === 'ruined' || s.status === 'struggling' ? 'ruined' : 'struggling'; s.since = chronicle.nowDay(world);
  world.settlements[k] = s;
  const e = econ(world, k);
  const lost = Math.round(e.pop * (0.1 + (hashInt(world.id + k + y) % 20) / 100));
  e.pop = Math.max(10, e.pop - lost);
  const d = { id: `dz_${k}_${y}`, kind: t.kind, title: `${t.title} of ${label(k)}`, region: k, year: y, progress: 0, helpers: {} };
  L.disasters.push(d);
  out.push(chronicle.addEvent(world, { type: 'disaster', importance: 3, title: `${d.title} (${y})`, text: `${t.text} Some ${lost} people are lost or flee.`, region: k }, `disaster:${d.id}`));
  return d;
}

function disastersYear(world, out) {
  const L = ensure(world);
  const y = yearOf(world);
  const open = L.disasters.filter(d => d.progress < 100);
  if (open.length < 2 && hashInt(`${world.id}${y}dis`) % 7 === 0) {
    const homes = Object.keys(REGIONS).filter(k => REGIONS[k].settlement && !open.some(d => d.region === k));
    if (homes.length) strike(world, pick(homes, `${world.id}${y}dk`), pick(DISASTERS, `${world.id}${y}dt`), out);
  }
  for (const d of open) {
    // The slow work of rebuilding: faster in peace and under a decree to fund it.
    const occ = occupiedBy(world, d.region);
    const funded = L.decrees.some(x => x.fund && x.until >= chronicle.nowDay(world) && x.faction === chronicle.dominionOf(world, d.region));
    d.progress = Math.min(100, d.progress + 18 + hashInt(`${d.id}${y}`) % 12 - (occ ? 8 : 0) + (funded ? 25 : 0));
    if (d.progress >= 100) finish(world, d, out);
  }
  if (L.disasters.length > 40) L.disasters = L.disasters.filter(d => d.progress < 100).concat(L.disasters.filter(d => d.progress >= 100).slice(-20));
}

function finish(world, d, out) {
  d.progress = 100;
  const s = world.settlements[d.region];
  if (s && s.status !== 'thriving') { s.status = 'rebuilding'; s.since = chronicle.nowDay(world); }
  const names = Object.entries(d.helpers).sort((a, b) => b[1] - a[1]).map(([n]) => n).slice(0, 3);
  out.push(chronicle.addEvent(world, { type: 'disaster', importance: names.length ? 4 : 3, title: `${label(d.region)} is rebuilt after ${d.title.replace(/ of .*$/, '').replace(/^The /, 'the ')}`, text: names.length ? `Remembered for the rebuilding: ${names.join(', ')}.` : '', region: d.region }, `rebuilt:${d.id}`));
}

// The player lends their hands (or their purse) to the rebuilding.
function helpRebuild(state, text = '') {
  const world = chronicle.worldOf(state);
  if (!world) return { success: false, message: 'There is no world here to rebuild.' };
  const k = state.character.region;
  const d = ensure(world).disasters.find(x => x.region === k && x.progress < 100);
  if (!d) return { success: false, message: `Nothing in ${label(k)} needs rebuilding right now.` };
  if (state.inCombat) return { success: false, message: 'Not in the middle of a fight.' };
  const ch = require('./character');
  const level = ch.getPlayerLevel(state.totalXP || 0);
  const m = String(text).match(/(?:donate|give|pay)\s+(\d[\d,]*)/i);
  let gain, cost = 0, hours = 8;
  if (m) {
    cost = Math.min(parseInt(m[1].replace(/,/g, ''), 10), state.coin || 0);
    if (cost < 50) return { success: false, message: 'You need at least 50 copper to make a difference.' };
    state.coin -= cost;
    gain = Math.min(40, Math.max(1, Math.round(cost / (60 * ((REGIONS[k].tier || 1) + 1)))));
    hours = 1;
  } else gain = Math.min(12, 3 + Math.floor(level / 15));
  const name = state.character.name;
  const first = !d.helpers[name];
  d.helpers[name] = (d.helpers[name] || 0) + gain;
  d.progress = Math.min(100, d.progress + gain);
  const lines = [m ? `You give ${cost} copper to the rebuilding of ${label(k)}.` : `You spend the day hauling stone and timber in ${label(k)}.`, `The rebuilding is ${d.progress}% done.`];
  // A peaceful career: honest work is rewarded, but not endlessly.
  d.xpGiven = d.xpGiven || {};
  if ((d.xpGiven[name] || 0) < 12) {
    d.xpGiven[name] = (d.xpGiven[name] || 0) + 1;
    const lu = ch.grantXP ? ch.grantXP(state, 40 + level * 6) : null;
    lines.push(`+${40 + level * 6} XP`);
    if (lu && lu.leveledUp) lines.push(`You reach level ${lu.newLevel}.`);
  }
  if (first) {
    require('./morality').shift(state, 2, `helped rebuild ${label(k)}`);
    const native = nativeOf(k);
    if (native) require('./factions').changeStanding(state, { [native]: 3 }, 'the rebuilding');
  }
  const out = [];
  if (d.progress >= 100) { finish(world, d, out); lines.push(`${label(k)} stands again. Your name is spoken with the rebuilders'.`); }
  return { success: true, hours, message: lines.join('\n') };
}

// ---------------------------------------------
// Institutions
// ---------------------------------------------
const RANKS = [[0, 'a hall'], [60, 'a school'], [300, 'a college'], [1500, 'a great institution']];
function rankOf(members) { let r = RANKS[0][1]; for (const [n, l] of RANKS) if (members >= n) r = l; return r; }

function institutionsYear(world, out) {
  const y = yearOf(world);
  for (const o of world.organizations || []) {
    if (o.status === 'closed') continue;
    if (!o.master) o.master = o.founder;
    if (!o.rank) o.rank = rankOf(o.members || 0);
    const st = (world.settlements[o.seat] || {}).status;
    const g = { thriving: 0.12, rebuilding: 0.04, struggling: -0.06, ruined: -0.2 }[st] ?? 0.07;
    o.members = Math.max(0, Math.round((o.members || 0) * (1 + g) + (g > 0 ? 2 : 0)));
    const rank = rankOf(o.members);
    if (rank !== o.rank) {
      const up = RANKS.findIndex(r => r[1] === rank) > RANKS.findIndex(r => r[1] === o.rank);
      o.rank = rank;
      out.push(chronicle.addEvent(world, { type: 'founding', importance: up ? 3 : 2, title: `${cap(o.name)} ${up ? 'grows into' : 'shrinks to'} ${rank}`, text: `${o.members} members, in ${label(o.seat)}.`, region: o.seat }, `rank:${o.name}:${rank}:${y}`));
    }
    // The founder's death does not end it: a new master takes the chair.
    const founderFig = (world.figures || []).find(f => f.characterId === o.founderId);
    const masterGone = o.master === o.founder ? (founderFig && founderFig.status === 'deceased') : (o.masterSince !== undefined && y - o.masterSince >= 25 + hashInt(o.master) % 15);
    if (masterGone) {
      const next = `${pick(FIRST, o.name + y)} ${pick(SURN, o.name + y + 's')}`;
      out.push(chronicle.addEvent(world, { type: 'succession', importance: 3, title: `${next} becomes master of ${o.name} after ${o.master}`, region: o.seat }, `master:${o.name}:${next}`));
      o.master = next; o.masterSince = y;
    }
    // A notable graduate, now and then.
    if (o.members >= 60 && hashInt(`${o.name}${y}grad`) % 10 === 0) {
      const grad = `${pick(FIRST, o.name + y + 'g')} ${pick(SURN, o.name + y + 'gs')}`;
      require('./canon').person(world, grad, { role: `graduate of ${o.name}`, region: o.seat, titles: [`of ${o.name}`] });
      out.push(chronicle.addEvent(world, { type: 'founding', importance: 2, title: `${grad}, trained at ${o.name}, makes a name in the world`, region: o.seat }, `grad:${o.name}:${grad}`));
    }
    if (o.members < 5) {
      o.status = 'closed';
      out.push(chronicle.addEvent(world, { type: 'founding', importance: 3, title: `${cap(o.name)} closes its doors`, region: o.seat }, `closed:${o.name}`));
    }
  }
}

// ---------------------------------------------
// Legends: rivalries, and the decrees of former heroes who rule
// ---------------------------------------------
function legendsYear(world, activeId, out) {
  const L = ensure(world);
  const y = yearOf(world);
  const alive = (world.figures || []).filter(f => f.status !== 'deceased' && f.characterId !== activeId);
  if (alive.length >= 2 && hashInt(`${world.id}${y}riv`) % 6 === 0) {
    const a = pick(alive, `${world.id}${y}ra`), b = pick(alive.filter(f => f !== a), `${world.id}${y}rb`);
    if (b && !L.rivalries.some(r => [r.a, r.b].includes(a.name) && [r.a, r.b].includes(b.name))) {
      L.rivalries.push({ a: a.name, b: b.name, since: y, score: 0, open: true });
      out.push(chronicle.addEvent(world, { type: 'rivalry', importance: 3, title: `A rivalry grows between ${a.name} and ${b.name}`, actor: { id: a.characterId, name: a.name } }, `riv:${a.name}:${b.name}`));
    }
  }
  for (const r of L.rivalries.filter(x => x.open)) {
    const fa = (world.figures || []).find(f => f.name === r.a), fb = (world.figures || []).find(f => f.name === r.b);
    if (!fa || !fb || fa.status === 'deceased' || fb.status === 'deceased') {
      r.open = false;
      const dead = !fa || fa.status === 'deceased' ? r.a : r.b, living = dead === r.a ? r.b : r.a;
      out.push(chronicle.addEvent(world, { type: 'rivalry', importance: 3, title: `The rivalry of ${r.a} and ${r.b} ends with ${dead}'s death`, text: `${living} outlives it.` }, `riv-end:${r.a}:${r.b}`));
      continue;
    }
    if (hashInt(`${r.a}${r.b}${y}`) % 3 !== 0) continue;
    const la = (fa.snapshot && fa.snapshot.level) || 1, lb = (fb.snapshot && fb.snapshot.level) || 1;
    const aWins = la + hashInt(`${r.a}${y}`) % 60 >= lb + hashInt(`${r.b}${y}`) % 60;
    const [w, l] = aWins ? [fa, fb] : [fb, fa];
    r.score += aWins ? 1 : -1;
    const how = pick(['outwits', 'shames before the court', 'beats in open duel', 'outbids for the loyalty of the towns', 'turns the people against'], `${r.a}${r.b}${y}how`);
    out.push(chronicle.addEvent(world, { type: 'rivalry', importance: 2, title: `${w.name} ${how} ${l.name}`, actor: { id: w.characterId, name: w.name } }, `riv:${r.a}:${r.b}:${y}`));
    w.achievements = w.achievements || [];
    if (!w.achievements.includes(`bested ${l.name}`)) w.achievements.push(`bested ${l.name}`);
  }
  // A former hero who rules makes law.
  const ruler = world.realm && world.realm.rulerId && (world.figures || []).find(f => f.characterId === world.realm.rulerId && f.status !== 'deceased');
  if (ruler && ruler.characterId !== activeId && hashInt(`${ruler.characterId}${y}decree`) % 3 === 0) {
    const faction = require('./politics').ENDING_FACTION[world.ending];
    const t = ruler.personality || [];
    const kinds = [
      { text: 'the tolls are lowered', price: 0.9, ok: t.includes('merciful') || t.includes('dutiful') || !t.length },
      { text: 'a war levy is raised', price: 1.15, ok: t.includes('ambitious') || t.includes('ruthless') || t.includes('cruel') },
      { text: 'the crown funds the rebuilding', fund: true, ok: L.disasters.some(d => d.progress < 100) },
      { text: 'new roads are paved', price: 0.95, ok: true }
    ].filter(k => k.ok);
    const k = pick(kinds, `${ruler.characterId}${y}dk`);
    L.decrees.push({ by: ruler.name, faction, text: k.text, price: k.price || null, fund: !!k.fund, from: chronicle.nowDay(world), until: chronicle.nowDay(world) + 5 * YEAR });
    out.push(chronicle.addEvent(world, { type: 'governance', importance: 3, title: `${ruler.name} decrees that ${k.text}`, text: `Across ${FN()[faction]}'s lands, for five years.`, actor: { id: ruler.characterId, name: ruler.name } }, `decree:${ruler.characterId}:${y}`));
    L.decrees = L.decrees.filter(d => d.until >= chronicle.nowDay(world)).slice(-12);
  }
}

// ---------------------------------------------
// The yearly turn
// ---------------------------------------------
function yearly(world, state = null) {
  const out = [];
  ensure(world);
  dynastyYear(world, out);
  economyYear(world, out);
  movementsYear(world, out);
  disastersYear(world, out);
  institutionsYear(world, out);
  legendsYear(world, state && state.characterId, out);
  return out.filter(Boolean);
}

// ---------------------------------------------
// What the player sees and the narrator is told
// ---------------------------------------------
const PATROLS = {
  choir: 'Grey-robed Choir wardens watch the roads and question strangers about their faith.',
  wardens: 'Warden patrols in ember-red cloaks check papers at the gate.',
  remnant: 'Remnant legionaries in gilded helms stand at every crossing; the imperial tax-men are never far behind.',
  compact: 'Compact militia keep the market roads — politely, and for a fee.'
};
function occupationNote(world, k) {
  const occ = occupiedBy(world, k);
  return occ ? `${label(k)} is held by ${FN()[occ]}, not its own people. ${PATROLS[occ] || ''}`.trim() : null;
}

function regionFacts(world, k, state = null) {
  if (!world || !REGIONS[k]) return [];
  const L = ensure(world);
  const facts = [];
  if (REGIONS[k].settlement) {
    const e = econ(world, k);
    const st = (world.settlements[k] || {}).status;
    facts.push(`a ${sizeOf(e.pop)} of about ${e.pop.toLocaleString('en-GB')}${st ? `, ${st}` : ''}`);
  }
  const occ = occupationNote(world, k);
  if (occ) facts.push(occ);
  const holder = chronicle.dominionOf(world, k);
  if (holder && L.dynasties[holder]) {
    const d = L.dynasties[holder];
    facts.push(`ruled from afar by ${SEATS[holder].title} ${d.ruler.name}${d.regent ? ` (a child; ${d.regent.name} is regent)` : ''}${d.dispute ? `, whose right ${d.dispute.claimant.name} disputes` : ''}`);
  }
  for (const m of L.movements.filter(x => x.strength > 0 && x.regions.includes(k))) facts.push(`${m.name} (${m.kind}: ${m.creed}) ${m.strength >= 60 ? 'are strong here' : 'have followers here'}`);
  for (const d of L.disasters.filter(x => x.region === k && x.progress < 100)) facts.push(`${d.title} (${d.year}) — rebuilding ${d.progress}% done`);
  for (const o of (world.organizations || []).filter(x => x.seat === k && x.status !== 'closed')) facts.push(`${o.name}, ${o.rank || 'a hall'} of ${o.members} under ${o.master || o.founder}, stands here`);
  const p = priceIndex(world, k, state);
  if (p.mult !== 1) facts.push(`prices ${p.mult > 1 ? 'up' : 'down'} ${Math.abs(Math.round((p.mult - 1) * 100))}% (${p.reasons.join('; ')})`);
  return facts;
}

function sceneLine(state) {
  const world = chronicle.worldOf(state);
  const k = state.character && state.character.region;
  const facts = regionFacts(world, k, state);
  return facts.length ? `[${label(k)} today: ${facts.join('; ')}. Let it show in the scene only as it is relevant; do not contradict it.]` : '';
}

function newsText(state) {
  const world = chronicle.worldOf(state);
  const k = state.character.region;
  const L = ensure(world);
  const lines = [`${label(k).toUpperCase()} — HOW THINGS STAND`, '─'.repeat(30)];
  for (const f of regionFacts(world, k, state)) lines.push(`• ${cap(f).replace(/\.$/, '')}.`);
  lines.push('', 'THE SEATS OF POWER');
  for (const [f, d] of Object.entries(L.dynasties)) lines.push(`• ${cap(FN()[f])}: ${SEATS[f].title} ${d.ruler.name}, ${ageAt(world, d.ruler.born)}${d.regent ? ` — regent ${d.regent.name}` : ''}${d.dispute ? ` — disputed by ${d.dispute.claimant.name}` : ''}${d.heir ? ` · heir: ${d.heir.name}` : ''}`);
  const rivals = L.rivalries.filter(r => r.open);
  if (rivals.length) { lines.push('', 'RIVALRIES'); for (const r of rivals) lines.push(`• ${r.a} and ${r.b}, since ${r.since}`); }
  const recent = ((world.canon && world.canon.ledger) || []).filter(r => r.r === k).slice(-5);
  if (recent.length) { lines.push('', 'LATELY, HERE'); for (const r of recent) lines.push(`• ${r.y}: ${r.s}`); }
  if (L.disasters.some(d => d.region === k && d.progress < 100)) lines.push('', '"help rebuild" to lend a hand, or "donate 500 to rebuild".');
  return lines.join('\n');
}

// Board postings the world's state calls for.
function boardQuests(state) {
  const world = chronicle.worldOf(state);
  const k = state.character && state.character.region;
  if (!world || !REGIONS[k]) return [];
  const out = [];
  const occ = occupiedBy(world, k);
  const native = nativeOf(k);
  if (occ) out.push({ type: 'patrol', label: `Resistance: watch the ${FN()[occ]} garrison`, desc: `A ${FN()[native] || 'local'} sympathiser wants the garrison's movements watched. Spend time in ${label(k)} without being caught.`, giver: 'a sympathiser', factionReward: { [native]: 6, [occ]: -6 } });
  const d = ensure(world).disasters.find(x => x.region === k && x.progress < 100);
  if (d) out.push({ type: 'patrol', label: `Rebuild after ${d.title}`, desc: `The town needs hands. Work in ${label(k)} for a while (or "help rebuild").`, giver: 'the reeve', factionReward: native ? { [native]: 4 } : null, rebuild: d.id });
  return out;
}

module.exports = { SEATS, MOVEMENTS, DISASTERS, ensure, yearly, rulerOf, econ, sizeOf, priceIndex, occupiedBy, occupationNote, regionFacts, sceneLine, newsText, helpRebuild, boardQuests, strike, rankOf };
