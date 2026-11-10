'use strict';

// =============================================================
// EMBER AND ASH — THE LIVING WORLD (CHRONICLE)
//
// A world is a persistent record shared by every character who lives in
// it: its calendar, its history, the legends of past heroes, who rules,
// how the factions stand, the state of its settlements, the people who
// age and die and are succeeded, and the crises that arise over time.
//
// Characters reference a world by id (state.worldId). The live world is
// attached to the state as a non-enumerable property (state.__world), so
// saving a character never duplicates or overwrites world data; the
// server persists worlds separately.
//
// Pure game logic. No AI calls, no database calls.
// =============================================================

const crypto = require('crypto');
const { REGIONS } = require('./constants');
const { getPlayerLevel } = require('./character');

// ---------------------------------------------
// Calendar — hours since the world began. 360-day years.
// ---------------------------------------------
const HOURS_PER_DAY = 24;
const DAYS_PER_YEAR = 360;
const START_YEAR    = 1012;   // Year 1012 of the Ember Reckoning
const MONTHS = ['Thaw', 'Seedfall', 'Greening', 'Bloom', 'Highsun', 'Embertide', 'Harvest', 'Leafdrop', 'Ashfall', 'Frostmoot', 'Deepwinter', 'Longnight'];
const SEASONS = ['spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter', 'winter', 'winter'];

// How long things take (hours). Commands, menus and conversations take no time.
const TIME_COST = {
  action:      1,      // a narrated action
  fight:       1,      // a whole fight (counted once, when it ends)
  talk:        0,
  explore:     4,
  gather:      3,
  craftGear:   8,
  craftItem:   2,
  shortRest:   1,
  longRest:    8,      // then rounded to the next morning
  travelSame:  48,     // two days on the road to a neighbouring region
  travelUp:    72,     // three days into harder country
  boss:        2
};

function worldOf(state) { return state && state.__world ? state.__world : null; }

function attachWorld(state, world) {
  Object.defineProperty(state, '__world', { value: world, enumerable: false, writable: true, configurable: true });
  return state;
}

function nowHour(world) { return (world && world.calendar && world.calendar.hour) || 0; }
function nowDay(world)  { return Math.floor(nowHour(world) / HOURS_PER_DAY); }

function dateOf(hour) {
  const day   = Math.floor(hour / HOURS_PER_DAY);
  const year  = START_YEAR + Math.floor(day / DAYS_PER_YEAR);
  const doy   = day % DAYS_PER_YEAR;
  const month = Math.floor(doy / 30);
  const h     = hour % HOURS_PER_DAY;
  return {
    year, month, monthName: MONTHS[month], dayOfMonth: (doy % 30) + 1, season: SEASONS[month], hour: h,
    timeOfDay: h < 5 ? 'night' : h < 8 ? 'dawn' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 20 ? 'dusk' : 'night'
  };
}

function formatDate(hour) {
  const d = dateOf(hour);
  return `${d.dayOfMonth} ${d.monthName}, ${d.year} E.R. (${d.season}, ${d.timeOfDay})`;
}

// ---------------------------------------------
// World creation & migration
// ---------------------------------------------
const WORLD_VERSION = 1;

function newId(prefix) { return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`; }

function createWorld({ name } = {}) {
  const id = newId('w');
  return {
    id,
    version: WORLD_VERSION,
    name: name || 'The Ember Reckoning',
    createdAt: new Date().toISOString(),
    calendar: { hour: 8 },              // morning of 1 Thaw, 1012
    era: { name: 'The Guttering Age', since: 0, ending: null },
    ending: null,                        // 'rekindle' | 'imperium' | 'ascend' | 'shatter'
    realm: null,                         // who rules
    factionPower: { wardens: 45, compact: 55, remnant: 35, choir: 40 },
    history: [],
    historyKeys: {},                     // dedupe for one-time events
    figures: [],                         // legendary characters (past and present heroes)
    npcs: {},                            // npcId -> { born, died, successor }
    settlements: {},                     // regionKey -> { status, since }
    crises: [],
    relics: [],                          // heirlooms of dead heroes, claimable once per world
    organizations: [],
    nextEvolutionDay: 30,
    characters: []                       // { id, name, createdDay }
  };
}

// Brings an older world record up to date without losing anything.
function migrateWorld(world) {
  if (!world || typeof world !== 'object') return createWorld();
  const fresh = createWorld();
  for (const [k, v] of Object.entries(fresh)) if (world[k] === undefined) world[k] = v;
  if (!world.calendar || typeof world.calendar.hour !== 'number' || !Number.isFinite(world.calendar.hour)) world.calendar = { hour: 8 };
  for (const k of ['history', 'figures', 'crises', 'relics', 'organizations', 'characters']) if (!Array.isArray(world[k])) world[k] = [];
  for (const k of ['historyKeys', 'npcs', 'settlements', 'factionPower']) if (!world[k] || typeof world[k] !== 'object') world[k] = {};
  world.version = WORLD_VERSION;
  return world;
}

// Every character gets a stable id and a birth day in its world.
function ensureCharacterIdentity(state, world) {
  if (!state.characterId) state.characterId = newId('c');
  if (!state.character || !state.character.region) return;
  const c = state.character;
  if (typeof c.bornDay !== 'number') {
    const age = Number(c.age) || 20;
    c.startAge = age;
    c.bornDay = nowDay(world) - age * DAYS_PER_YEAR;
  }
  if (!world.characters.some(x => x.id === state.characterId)) {
    world.characters.push({ id: state.characterId, name: c.name || 'Unnamed', createdDay: nowDay(world) });
  }
}

// Called whenever a character is loaded into a world. Migrates old saves:
// a pre-living-world save gets a world built from its own campaign state.
function bindCharacter(state, world) {
  migrateWorld(world);
  attachWorld(state, world);
  state.worldId = world.id;
  ensureCharacterIdentity(state, world);
  const c = state.campaign;
  if (c && c.ending && !world.ending) applyEnding(world, state, c.ending, { migrated: true });
  syncAge(state, world);
  return world;
}

// ---------------------------------------------
// History
// ---------------------------------------------
// key: optional dedupe key — an event with a key is recorded only once.
function addEvent(world, evt, key = null) {
  if (!world) return null;
  if (key) {
    if (world.historyKeys[key]) return null;
    world.historyKeys[key] = true;
  }
  const entry = {
    id: world.history.length + 1,
    hour: nowHour(world),
    date: formatDate(nowHour(world)),
    type: evt.type || 'event',
    title: evt.title,
    text: evt.text || '',
    actor: evt.actor || null,
    region: evt.region || null,
    importance: evt.importance || 1
  };
  world.history.push(entry);
  // The display log is capped; the permanent canon keeps what matters forever.
  try { require('./canon').ingest(world, entry); } catch (e) { /* canon is best-effort, never blocks play */ }
  if (world.history.length > 2000) world.history.splice(0, world.history.length - 2000);
  return entry;
}

function actorOf(state) {
  return state && state.character ? { id: state.characterId, name: state.character.name || 'An unnamed wanderer' } : null;
}

function buildChronicleText(world, { limit = 40, filter = null } = {}) {
  if (!world) return 'There is no chronicle yet.';
  const lines = [`THE CHRONICLE OF ${String(world.name).toUpperCase()}`, `Now: ${formatDate(nowHour(world))} — ${world.era.name}`];
  if (world.realm) lines.push(`Ruled by: ${world.realm.title}${world.realm.since !== undefined ? ` (since ${dateOf(world.realm.since * 24).year})` : ''}`);
  const legends = world.figures.filter(f => f.status !== 'forgotten');
  if (legends.length) {
    lines.push('', 'LEGENDS');
    for (const f of legends) lines.push(`  ${f.name}, ${f.title} — ${figureStatus(f, world)}`);
  }
  let events = world.history;
  if (filter) events = events.filter(e => e.type === filter || (e.actor && e.actor.name && e.actor.name.toLowerCase().includes(filter)));
  lines.push('', 'HISTORY (most recent last)');
  for (const e of events.slice(-limit)) lines.push(`  ${e.date.split(' (')[0]} — ${e.title}${e.text ? `: ${e.text}` : ''}`);
  if (!events.length) lines.push('  Nothing of note has happened yet.');
  return lines.join('\n');
}

// ---------------------------------------------
// Aging & longevity
// ---------------------------------------------
function ageOf(state, world) {
  const c = state.character;
  if (!c || typeof c.bornDay !== 'number') return Number(c && c.age) || 20;
  return Math.max(0, Math.floor((nowDay(world) - c.bornDay) / DAYS_PER_YEAR));
}

function longevity(state) {
  if (!state.longevity || typeof state.longevity !== 'object') state.longevity = { bonusYears: 0, slowFactor: 1, immortal: false, sources: [] };
  return state.longevity;
}

// Natural lifespan: 70 + VIT/2, plus longevity bonuses.
function lifespan(state) {
  const L = longevity(state);
  if (L.immortal) return Infinity;
  const vit = (state.stats && state.stats.vit) || 10;
  // Elves, dwarves and halflings outlive humans; orcs burn brighter.
  const species = (state.appearance && state.appearance.species) || 'human';
  const kin = { elf: 3, dwarf: 1.8, halfling: 1.3, orc: 0.9 }[species] || 1;
  return Math.round((70 + vit / 2 + L.bonusYears) * kin * L.slowFactor);
}

// Physiological age: slowed aging makes the body younger than the calendar.
function bodyAge(state, world) {
  const L = longevity(state);
  const age = ageOf(state, world);
  if (L.immortal) return Math.min(age, L.frozenAt || age);
  if (L.slowFactor > 1) {
    const at = L.slowSince || age;
    return Math.round(at + (age - at) / L.slowFactor);
  }
  return age;
}

function syncAge(state, world) {
  if (!state.character || !world) return;
  state.character.age = ageOf(state, world);
  state.character.bodyAge = bodyAge(state, world);
}

// Stat modifiers by body age. Youth grows, maturity brings wisdom, old age
// trades strength for knowledge. Gentle early, real late.
function ageModifiers(state) {
  const a = state.character && typeof state.character.bodyAge === 'number' ? state.character.bodyAge : (Number(state.character && state.character.age) || 25);
  if (a < 14) return { str: -2, vit: -1, dex: 1 };
  if (a < 18) return { str: -1 };
  if (a <= 35) return {};
  if (a <= 50) return { wis: 1, cha: 1 };
  if (a <= 65) return { wis: 2, int: 1, cha: 1, str: -1, dex: -1 };
  if (a <= 80) return { wis: 3, int: 2, cha: 1, str: -3, dex: -3, vit: -2 };
  return { wis: 4, int: 2, cha: 1, str: -5, dex: -5, vit: -4 };
}

function ageBand(a) {
  if (a < 14) return 'child';
  if (a < 18) return 'youth';
  if (a < 30) return 'young adult';
  if (a < 45) return 'in their prime';
  if (a < 60) return 'middle-aged';
  if (a < 75) return 'old';
  return 'venerable';
}

// Ways to outlive a mortal span. Each has real requirements.
const LONGEVITY_PATHS = {
  elixir: {
    label: 'Elixir of Long Years',
    desc: 'An alchemist of the highest rank can distil years into a draught (+25 years, once).',
    check: (s) => s.profession === 'alchemist' && (s.professionLevel || 0) >= 5,
    cost: { 'moonpetal': 3, 'sunstone': 2, 'star-iron': 1 },
    apply: (L) => { L.bonusYears += 25; }
  },
  emberGrace: {
    label: "Emberkeeper's Grace",
    desc: 'The Wardens can tie a hero\'s life to the rekindled Ember (aging slowed threefold). Requires the Long Fire ending and Exalted Warden standing.',
    check: (s, w) => w && w.ending === 'rekindle' && s.factions && s.factions.wardens >= 80,
    apply: (L, s, w) => { L.slowFactor = 3; L.slowSince = ageOf(s, w); }
  },
  emberHeart: {
    label: 'Heart of the Ember',
    desc: 'You swallowed the world\'s first fire. You do not age.',
    check: (s) => s.campaign && s.campaign.flags && s.campaign.flags.emberTaken,
    apply: (L, s, w) => { L.immortal = true; L.frozenAt = bodyAge(s, w); }
  },
  phylactery: {
    label: 'Rite of the Phylactery',
    desc: 'With Morwen\'s stolen years in you and great power (level 150+), you can bind your life to a vessel and become undying.',
    check: (s) => s.campaign && s.campaign.flags && s.campaign.flags.tookPhylactery && getPlayerLevel(s.totalXP || 0) >= 150,
    apply: (L, s, w) => { L.immortal = true; L.frozenAt = bodyAge(s, w); L.undead = true; }
  },
  throne: {
    label: 'Throne-bound',
    desc: 'Whoever sits the Shattered Throne does not age while the Ash obeys them.',
    check: (s, w) => w && w.ending === 'ascend' && w.realm && w.realm.rulerId === s.characterId,
    apply: (L, s, w) => { L.immortal = true; L.frozenAt = bodyAge(s, w); }
  },
  riftShard: {
    label: 'Shard of Unmaking',
    desc: 'A sliver of the deep rift (depth 50+) slows the body\'s clock (aging halved).',
    check: (s) => s.campaign && (s.campaign.riftDepth || 0) >= 50,
    apply: (L, s, w) => { L.slowFactor = Math.max(L.slowFactor, 2); L.slowSince = L.slowSince || ageOf(s, w); }
  }
};

function longevityOptions(state, world) {
  const L = longevity(state);
  return Object.entries(LONGEVITY_PATHS).map(([id, p]) => ({ id, label: p.label, desc: p.desc, available: !L.sources.includes(id) && !!p.check(state, world), taken: L.sources.includes(id) }));
}

function pursueLongevity(state, world, id, helpers) {
  const p = LONGEVITY_PATHS[id];
  if (!p) return { success: false, message: 'There is no such path to long life.' };
  const L = longevity(state);
  if (L.sources.includes(id)) return { success: false, message: `You have already walked the path of ${p.label}.` };
  if (!p.check(state, world)) return { success: false, message: `${p.label}: ${p.desc} You do not meet its requirements.` };
  if (p.cost) {
    const short = Object.entries(p.cost).filter(([m, q]) => helpers.countMaterial(state, m) < q);
    if (short.length) return { success: false, message: `${p.label} needs ${Object.entries(p.cost).map(([m, q]) => `${q} ${m}`).join(', ')}.` };
    for (const [m, q] of Object.entries(p.cost)) helpers.consumeMaterial(state, m, q);
  }
  p.apply(L, state, world);
  L.sources.push(id);
  syncAge(state, world);
  addEvent(world, { type: 'longevity', title: `${state.character.name} takes the path of ${p.label}`, text: p.desc, actor: actorOf(state) }, `longevity:${state.characterId}:${id}`);
  return { success: true, message: `${p.label}. ${p.desc}${L.immortal ? ' You will not grow older.' : ` Your natural span is now about ${lifespan(state)} years.`}` };
}

// ---------------------------------------------
// NPC aging & succession
// ---------------------------------------------
function hashInt(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

const HEIR_NAMES = ['Ada', 'Bram', 'Corin', 'Dessa', 'Eluned', 'Fenn', 'Garet', 'Hild', 'Ivo', 'Jessamy', 'Kael', 'Lio', 'Mabyn', 'Nils', 'Orla', 'Piet', 'Quill', 'Rhea', 'Soren', 'Tilde', 'Ulla', 'Vane', 'Wynn', 'Yara'];

// Each named NPC has a deterministic age; the first time we see them we
// record a birth day. They die of old age and are succeeded by an heir
// who takes up the same role.
function npcRecord(world, npc) {
  if (!world.npcs[npc.id]) {
    const age = 22 + (hashInt(npc.id) % 45);           // 22–66 at the world's start
    world.npcs[npc.id] = { born: -age * DAYS_PER_YEAR, generation: 1, name: npc.name };
  }
  return world.npcs[npc.id];
}

// The person who currently holds this NPC's role (original or an heir).
function currentHolder(world, npc) {
  if (!world) return { ...npc };
  const rec = npcRecord(world, npc);
  if (rec.generation === 1) return { ...npc, age: Math.floor((nowDay(world) - rec.born) / DAYS_PER_YEAR) };
  return {
    ...npc,
    id: npc.id,
    name: rec.name,
    age: Math.floor((nowDay(world) - rec.born) / DAYS_PER_YEAR),
    greet: `${rec.name} took on the work after ${rec.predecessor} ${rec.predecessorRetired ? 'retired' : 'died'}. ${npc.greet}`,
    heirOf: rec.predecessor
  };
}

function ageNpcs(world) {
  const out = [];
  for (const [regionKey, r] of Object.entries(REGIONS)) {
    for (const npc of r.npcs || []) {
      const rec = npcRecord(world, npc);
      const age = Math.floor((nowDay(world) - rec.born) / DAYS_PER_YEAR);
      const span = 68 + (hashInt(npc.id + rec.generation) % 25);
      if (age >= span) {
        const heir = `${HEIR_NAMES[hashInt(npc.id + rec.generation) % HEIR_NAMES.length]} ${rec.name.split(' ').slice(-1)[0]}`;
        require('./canon').person(world, rec.name, { role: npc.role, region: regionKey, born: dateOf(rec.born * HOURS_PER_DAY).year });
        const entry = addEvent(world, { type: 'death', title: `${rec.name} dies at ${age}`, text: `${rec.name}, ${npc.role} of ${r.label}, is buried. ${heir} takes up the work.`, region: regionKey });
        if (entry) out.push(entry);
        world.npcs[npc.id] = { born: nowDay(world) - (20 + (hashInt(heir) % 15)) * DAYS_PER_YEAR, generation: rec.generation + 1, name: heir, predecessor: rec.name };
      }
    }
  }
  return out;
}

// ---------------------------------------------
// Endings → eras, realms, world effects
// ---------------------------------------------
const ERAS = {
  rekindle: { name: 'The Age of the Long Fire', realm: 'the Warden Concord', ruler: 'High Warden Ashby and the Concord of Wardens',
              power: { wardens: 85, compact: 65, remnant: 35, choir: 10 }, effects: { hazardMult: 0.5, priceMult: 1.0, ambushMult: 0.8 },
              heroTitle: 'Keeper of the Ember', heroRole: 'patron', seat: 'the_crucible',
              threat: 'Ashen remnants of the Choir lurk in the inner ring, and the Wardens grow complacent.' },
  imperium: { name: 'The Sunrise Imperium', realm: 'the Veldrathi Imperium', ruler: 'Empress Seraphine Aurel',
              power: { wardens: 40, compact: 35, remnant: 95, choir: 15 }, effects: { hazardMult: 0.8, priceMult: 1.1, ambushMult: 0.6 },
              heroTitle: 'Bearer of the Sun-Key', heroRole: 'ruler', seat: 'old_veldrath',
              threat: 'The free towns chafe under imperial law; rebellion simmers along the old border.' },
  ascend:   { name: 'The Reign of the New Sovereign', realm: 'the Ashen Dominion', ruler: null,
              power: { wardens: 15, compact: 30, remnant: 25, choir: 90 }, effects: { hazardMult: 1.2, priceMult: 1.15, ambushMult: 1.2 },
              heroTitle: 'the New Sovereign', heroRole: 'ruler', seat: 'shattered_throne',
              threat: 'Warden insurgents fight a hidden war, and the Ash obeys only one will.' },
  shatter:  { name: 'The Ordinary Age', realm: 'the Free Compact', ruler: 'the Council of Free Towns',
              power: { wardens: 25, compact: 90, remnant: 20, choir: 20 }, effects: { hazardMult: 0.7, priceMult: 0.9, ambushMult: 1.0, manaCostMult: 1.25 },
              heroTitle: 'Breaker of the Throne', heroRole: 'mentor', seat: null,
              threat: 'Old magic is fading. Relic-hunters and cults scramble for what remains.' }
};

function applyEnding(world, state, ending, { migrated = false } = {}) {
  const era = ERAS[ending];
  if (!era || world.ending) return null;
  world.ending = ending;
  world.era = { name: era.name, since: nowDay(world), ending };
  world.factionPower = { ...era.power };
  applyEraDominion(world, ending);
  const hero = state.character ? state.character.name : 'the hero';
  const flags = (state.campaign && state.campaign.flags) || {};
  const heroRules = ending === 'ascend' || (ending === 'imperium' && flags.ownKey);
  world.realm = {
    name: era.realm,
    title: heroRules ? `${hero}, ${ending === 'ascend' ? 'the New Sovereign' : 'Sun-Emperor of Veldrath'}` : era.ruler,
    rulerId: heroRules ? state.characterId : null,
    rulerName: heroRules ? hero : era.ruler,
    since: nowDay(world),
    seat: era.seat
  };
  try { require('./canon').ensure(world).reigns.push({ realm: world.realm.name, ruler: world.realm.rulerName, from: dateOf(nowHour(world)).year, how: `the fall of the Hollow Sovereign (${era.name})` }); } catch (e) { /* best-effort */ }
  addEvent(world, { type: 'ending', importance: 5, title: `The Hollow Sovereign falls — ${era.name} begins`, text: `${hero} stood before the Shattered Throne. ${era.realm[0].toUpperCase() + era.realm.slice(1)} now holds sway. ${era.threat}`, actor: actorOf(state) }, `ending:${world.id}`);
  if (state.characterId) {
    const fig = recordFigure(world, state, { title: heroRules ? world.realm.title.split(', ').slice(1).join(', ') : era.heroTitle, role: heroRules ? 'ruler' : era.heroRole, seat: era.seat || (state.campaign && state.campaign.startRegion) });
    // The hero's cause: the power their ending raised up.
    fig.faction = { rekindle: 'wardens', imperium: 'remnant', ascend: 'choir', shatter: 'compact' }[ending];
  }
  if (migrated) addEvent(world, { type: 'note', title: 'The chronicle was compiled from older records' }, `migrated:${world.id}`);
  return era;
}

function eraEffects(world) {
  return (world && world.ending && ERAS[world.ending]) ? ERAS[world.ending].effects : { hazardMult: 1, priceMult: 1, ambushMult: 1 };
}

// ---------------------------------------------
// Legendary figures (past player characters)
// ---------------------------------------------
function personalityOf(state) {
  const traits = [];
  const f = (state.campaign && state.campaign.flags) || {};
  if (f.shardReturned || f.ulricBurned || f.soulsFreed) traits.push('dutiful');
  if (f.shardKept || f.ownKey || f.emberTaken) traits.push('ambitious');
  if (f.tookPhylactery || f.soulsBound) traits.push('ruthless');
  if (f.cantorSpared) traits.push('merciful');
  if (f.cantorExecuted) traits.push('unforgiving');
  const s = state.stats || {};
  const top = Object.entries(s).sort((a, b) => b[1] - a[1])[0];
  if ((state.corruption || 0) >= 40) traits.unshift('cruel');
  if ((state.infamy || 0) >= 40) traits.unshift('infamous');
  if (top) traits.push({ str: 'formidable', dex: 'quick-witted', vit: 'unbreakable', int: 'brilliant', wis: 'far-seeing', cha: 'magnetic' }[top[0]]);
  return [...new Set(traits.filter(Boolean))].slice(0, 4);
}

function snapshotOf(state) {
  const c = state.character || {};
  return {
    name: c.name, gender: c.gender, background: c.background, description: c.description,
    height: c.height, build: c.build, appearance: state.appearance || null,
    class: state.combatClass, profession: state.profession,
    level: getPlayerLevel(state.totalXP || 0),
    weapon: state.gear && state.gear.weapon ? state.gear.weapon.name : null,
    armor: state.gear && state.gear.armor ? state.gear.armor.name : null,
    companions: (state.companions || []).map(x => x.name),
    choices: state.campaign ? { ...state.campaign.choices } : {},
    riftDepth: state.campaign ? state.campaign.riftDepth || 0 : 0,
    homeRegion: (state.campaign && state.campaign.startRegion) || c.region || null,
    bornDay: c.bornDay, longevity: state.longevity || null
  };
}

function recordFigure(world, state, { title, role, seat, status } = {}) {
  let fig = world.figures.find(f => f.characterId === state.characterId);
  const snap = snapshotOf(state);
  if (!fig) {
    fig = { characterId: state.characterId, name: snap.name, title: title || 'Hero of the Age', role: role || 'legend', seat: seat || null, status: status || 'active', personality: personalityOf(state), achievements: [], since: nowDay(world) };
    world.figures.push(fig);
  }
  if (title) fig.title = title;
  if (role) fig.role = role;
  if (seat !== undefined && seat !== null) fig.seat = seat;
  if (status) fig.status = status;
  fig.snapshot = snap;
  fig.personality = personalityOf(state);
  fig.updatedDay = nowDay(world);
  try { require('./canon').person(world, fig.name, { titles: fig.title, role: fig.role, region: fig.seat || undefined, legend: true, characterId: fig.characterId }); } catch (e) { /* best-effort */ }
  return fig;
}

function addAchievement(world, state, text, key) {
  if (!world || !state.characterId) return;
  const fig = world.figures.find(f => f.characterId === state.characterId);
  if (fig && !fig.achievements.includes(text)) fig.achievements.push(text);
  addEvent(world, { type: 'deed', title: `${state.character.name}: ${text}`, actor: actorOf(state) }, key);
}

function figureAge(f, world) {
  const born = f.snapshot && typeof f.snapshot.bornDay === 'number' ? f.snapshot.bornDay : null;
  if (born === null) return null;
  return Math.floor((nowDay(world) - born) / DAYS_PER_YEAR);
}

function figureStatus(f, world) {
  const age = figureAge(f, world);
  if (f.status === 'deceased') return `died ${f.deathYear ? `in ${f.deathYear}` : 'long ago'}${f.tomb ? `, buried in ${REGIONS[f.tomb] ? REGIONS[f.tomb].label : f.tomb}` : ''}`;
  const where = f.seat && REGIONS[f.seat] ? ` at ${REGIONS[f.seat].label}` : '';
  return `${f.status === 'immortal' ? 'undying' : 'living'}${age !== null ? `, ${age} years old` : ''}${where}`;
}

// Legends who are not immortal grow old and die; their heirloom weapon is
// laid in their tomb, to be claimed once by a worthy successor.
function ageFigures(world, activeCharacterId) {
  const out = [];
  for (const f of world.figures) {
    if (f.status === 'deceased' || f.characterId === activeCharacterId) continue;
    const L = f.snapshot && f.snapshot.longevity;
    if (L && L.immortal) { f.status = 'immortal'; continue; }
    const age = figureAge(f, world);
    if (age === null) continue;
    const span = 70 + ((L && L.bonusYears) || 0) + (hashInt(f.characterId) % 15);
    if (age >= span * ((L && L.slowFactor) || 1)) {
      f.status = 'deceased';
      f.deathYear = dateOf(nowHour(world)).year;
      f.tomb = f.seat || 'oakhaven';
      out.push(addEvent(world, { type: 'death', importance: 4, title: `${f.name}, ${f.title}, dies at ${age}`, text: `The world mourns — or celebrates. ${f.name} is laid to rest in ${REGIONS[f.tomb] ? REGIONS[f.tomb].label : f.tomb}.` }, `death:${f.characterId}`));
      if (f.snapshot && f.snapshot.weapon && !world.relics.some(r => r.figureId === f.characterId)) {
        world.relics.push({ id: `relic_${f.characterId}`, figureId: f.characterId, name: `${f.name}'s ${f.snapshot.weapon.replace(/^(?:\w+ ){0,2}/, '') || 'blade'}`.replace(/'s \s*$/, "'s blade"), region: f.tomb, claimedBy: null });
      }
      if (world.realm && world.realm.rulerId === f.characterId) {
        out.push(addEvent(world, { type: 'succession', importance: 4, title: `The ${world.realm.name} passes to a regency council`, text: `With ${f.name} dead, ${world.realm.name}'s great houses rule in their name.` }));
        world.realm = { ...world.realm, rulerId: null, rulerName: 'a regency council', title: `the regency council of ${world.realm.name}` };
      }
    }
  }
  return out.filter(Boolean);
}

// ---------------------------------------------
// Dominion: who holds each region
// ---------------------------------------------
const FACTION_NAMES = { wardens: 'the Ember Wardens', compact: 'the Free Compact', remnant: 'the Veldrathi Remnant', choir: 'the Ashen Choir', lawless: 'no one' };

function ensureDominion(world) {
  if (!world.dominion || typeof world.dominion !== 'object') world.dominion = {};
  for (const [k, r] of Object.entries(REGIONS)) {
    if (world.dominion[k]) continue;
    const npcFaction = r.npcs && r.npcs[0] ? r.npcs[0].faction : null;
    world.dominion[k] = k === 'shattered_throne' ? 'lawless' : (npcFaction === 'choir' ? 'choir' : npcFaction || 'compact');
  }
  return world.dominion;
}

function dominionOf(world, regionKey) {
  if (!world) return null;
  return ensureDominion(world)[regionKey] || 'compact';
}

const DOMINION_CAP = 20;
function setDominion(world, regionKey, faction, why) {
  const d = ensureDominion(world);
  if (d[regionKey] === faction) return null;
  const from = d[regionKey];
  // No power grows past twenty regions, by any route (conquest, revolt,
  // a crisis takeover): land it cannot hold falls into lawlessness instead.
  if (faction !== 'lawless' && Object.values(d).filter(h => h === faction).length >= DOMINION_CAP) {
    if (from === 'lawless') return null;
    faction = 'lawless';
  }
  d[regionKey] = faction;
  const title = faction === 'lawless' ? `${REGIONS[regionKey].label} falls into lawlessness` : `${FACTION_NAMES[faction] || faction} take${faction === 'lawless' ? '' : 's'} control of ${REGIONS[regionKey].label}`;
  return addEvent(world, { type: 'dominion', importance: 3, title, text: `${from === 'lawless' ? 'The lawless years end.' : `${FACTION_NAMES[from] || from} lose their hold.`} ${why || ''}`.trim(), region: regionKey });
}

// An era redraws the map: the victors hold the inner ring.
function applyEraDominion(world, ending) {
  ensureDominion(world);
  const winner = { rekindle: 'wardens', imperium: 'remnant', ascend: 'choir', shatter: 'compact' }[ending];
  if (!winner) return;
  for (const [k, r] of Object.entries(REGIONS)) {
    if (k === 'shattered_throne') { world.dominion[k] = ending === 'ascend' ? 'choir' : ending === 'shatter' ? 'lawless' : winner; continue; }
    if (ending === 'shatter' ? r.tier >= 1 : r.tier >= (ending === 'imperium' ? 4 : 6)) {
      if (ending === 'imperium' && !/veldrath|bone|pale|sunken|void/.test(k) && r.tier < 6) continue;
      world.dominion[k] = winner;
    }
  }
}

// Each year the strongest power pushes into a neighbouring region it does not hold.
function shiftBorders(world) {
  ensureDominion(world);
  const power = world.factionPower || {};
  const strongest = Object.entries(power).sort((a, b) => b[1] - a[1])[0];
  if (!strongest || strongest[1] < 70) return null;
  const [faction] = strongest;
  // An empire this large can't hold more.
  if (Object.values(world.dominion).filter(h => h === faction).length >= 20) return null;
  const frontier = [];
  for (const [k, holder] of Object.entries(world.dominion)) {
    if (holder !== faction) continue;
    for (const n of REGIONS[k].adjacent || []) if (world.dominion[n] !== faction && (power[world.dominion[n]] || 0) < strongest[1] - 15) frontier.push(n);
  }
  if (!frontier.length) return null;
  const target = frontier[hashInt(world.id + nowDay(world)) % frontier.length];
  return setDominion(world, target, faction, 'Their strength has outgrown their borders.');
}

// ---------------------------------------------
// Legends act on their own (once a year)
// ---------------------------------------------
function legendsAct(world, activeCharacterId) {
  const out = [];
  ensureDominion(world);
  for (const f of world.figures) {
    if (f.characterId === activeCharacterId || f.status === 'deceased') continue;
    const traits = f.personality || [];
    const roll = hashInt(f.characterId + nowDay(world)) % 6;
    if (roll > 2) continue;                                     // legends do not act every year
    const faction = world.realm && world.realm.rulerId === f.characterId
      ? ({ ascend: 'choir', imperium: 'remnant', rekindle: 'wardens', shatter: 'compact' }[world.ending] || 'compact') : null;
    const held = faction ? Object.values(world.dominion).filter(h => h === faction).length : 0;
    if (f.role === 'ruler' && faction && held < 20 && (traits.includes('ambitious') || traits.includes('ruthless') || roll === 0)) {
      const seatNeighbours = Object.keys(world.dominion).filter(k => world.dominion[k] === faction).flatMap(k => REGIONS[k].adjacent || []).filter(n => world.dominion[n] !== faction);
      if (seatNeighbours.length) {
        const target = seatNeighbours[hashInt(f.characterId + 'annex' + nowDay(world)) % seatNeighbours.length];
        const e = setDominion(world, target, faction, `${f.name}, ${f.title}, extends their rule.`);
        if (e) { e.actor = { id: f.characterId, name: f.name }; out.push(e); if (!f.achievements.includes(`annexed ${REGIONS[target].label}`)) f.achievements.push(`annexed ${REGIONS[target].label}`); }
        continue;
      }
    }
    const crisis = (world.crises || []).find(c => c.status === 'active');
    if ((f.role === 'patron' || traits.includes('dutiful')) && crisis) {
      crisis.status = 'resolved'; crisis.resolvedBy = f.characterId;
      out.push(addEvent(world, { type: 'crisis', importance: 3, title: `${crisis.title} is ended by ${f.name}`, text: `The old hero ${f.name} rode out one last time.`, actor: { id: f.characterId, name: f.name }, region: crisis.region }, `crisis:${crisis.id}`));
      f.achievements.push(`ended the ${crisis.title}`);
      continue;
    }
    if (f.role === 'mentor' && !(world.organizations || []).some(o => o.founderId === f.characterId)) {
      const seat = f.seat || (f.snapshot && f.snapshot.homeRegion) || 'oakhaven';
      world.organizations.push({ name: `the School of ${f.name}`, founderId: f.characterId, founder: f.name, seat, foundedDay: nowDay(world), members: 30 });
      out.push(addEvent(world, { type: 'founding', importance: 3, title: `${f.name} founds the School of ${f.name}`, text: `Students come to ${REGIONS[seat] ? REGIONS[seat].label : seat} to learn what the old hero knows.`, actor: { id: f.characterId, name: f.name }, region: seat }, `found:${f.characterId}`));
      continue;
    }
    if (!f.monument && f.snapshot && f.snapshot.homeRegion) {
      f.monument = f.snapshot.homeRegion;
      out.push(addEvent(world, { type: 'monument', importance: 2, title: `A monument to ${f.name} is raised in ${REGIONS[f.monument].label}`, actor: { id: f.characterId, name: f.name }, region: f.monument }, `monument:${f.characterId}`));
    }
  }
  return out.filter(Boolean);
}

// ---------------------------------------------
// World evolution & crises
// ---------------------------------------------
const CRISIS_TYPES = [
  { kind: 'incursion', title: 'Ash Incursion', text: 'A rift tears open and things of ash pour out.', enemy: 'Ashborn Ravager' },
  { kind: 'warband',   title: 'Warband on the March', text: 'A warband gathers and burns the outlying farms.', enemy: 'Warband Champion' },
  { kind: 'blight',    title: 'The Grey Blight', text: 'Crops wither and the dead stir in the fields.', enemy: 'Blight Revenant' },
  { kind: 'beast',     title: 'The Old Beast Wakes', text: 'Something vast has woken beneath the hills.', enemy: 'Elder Behemoth' },
  { kind: 'uprising',  title: 'Uprising', text: 'Rebels seize the roads and demand change.', enemy: 'Rebel Warlord' }
];

function chooseCrisisRegion(world, levelHint) {
  const keys = Object.keys(REGIONS).filter(k => k !== 'shattered_throne' && REGIONS[k].settlement);
  // Crises strike near where people live; their danger matches the region.
  const pool = keys.filter(k => REGIONS[k].levelRange[0] <= levelHint + 5);
  const list = pool.length ? pool : keys;
  return list[hashInt(world.id + nowDay(world)) % list.length];
}

function spawnCrisis(world, levelHint = 10) {
  const t = CRISIS_TYPES[hashInt(world.id + 'c' + nowDay(world)) % CRISIS_TYPES.length];
  const region = chooseCrisisRegion(world, levelHint);
  const r = REGIONS[region];
  const level = Math.min(r.levelRange[1] + 4, Math.max(r.levelRange[0] + 3, Math.floor((r.levelRange[0] + r.levelRange[1]) / 2) + 3));
  const crisis = { id: `cr_${nowDay(world)}_${world.crises.length}`, kind: t.kind, title: `${t.title} in ${r.label}`, text: t.text, enemy: t.enemy, region, level, startDay: nowDay(world), deadlineDay: nowDay(world) + 60, status: 'active' };
  world.crises.push(crisis);
  addEvent(world, { type: 'crisis', importance: 3, title: crisis.title, text: `${t.text} (${r.label} needs a champion within two months.)`, region });
  return crisis;
}

function failCrisis(world, crisis) {
  crisis.status = 'failed';
  const r = REGIONS[crisis.region];
  const s = world.settlements[crisis.region] || { status: 'thriving' };
  // Each failure costs one step; a strong holder's garrison keeps a
  // struggling town from falling into ruin; and a place already in ruins
  // keeps the time it has spent rebuilding.
  const holderPower = (world.factionPower || {})[dominionOf(world, crisis.region)] || 0;
  const was = s.status;
  if (was === 'thriving' || was === 'rebuilding') s.status = 'struggling';
  else if (was === 'struggling') s.status = holderPower >= 60 ? 'struggling' : 'ruined';
  else s.status = 'ruined';
  if (s.status !== was || !s.since) s.since = nowDay(world);
  world.settlements[crisis.region] = s;
  const owner = (r.npcs && r.npcs[0] && r.npcs[0].faction) || 'compact';
  world.factionPower[owner] = Math.max(0, (world.factionPower[owner] || 50) - 5);
  if (s.status === 'ruined') setDominion(world, crisis.region, crisis.kind === 'uprising' ? 'compact' : crisis.kind === 'incursion' ? 'choir' : 'lawless', 'Order collapsed when no champion came.');
  return addEvent(world, { type: 'crisis', importance: 3, title: `${crisis.title} is not stopped`, text: `${r.settlement ? r.settlement.name : r.label} is ${s.status}. No champion came.`, region: crisis.region });
}

function resolveCrisis(world, crisis, state) {
  crisis.status = 'resolved';
  crisis.resolvedBy = state.characterId;
  const s = world.settlements[crisis.region];
  if (s && s.status !== 'thriving') { s.status = s.status === 'ruined' ? 'rebuilding' : 'thriving'; s.since = nowDay(world); }
  return addEvent(world, { type: 'crisis', importance: 3, title: `${crisis.title} is ended by ${state.character.name}`, text: `${state.character.name} defeated the ${crisis.enemy}.`, actor: actorOf(state), region: crisis.region }, `crisis:${crisis.id}`);
}

// Settlements slowly recover; ruined places are rebuilt in time.
function evolveSettlements(world) {
  for (const [k, s] of Object.entries(world.settlements)) {
    const years = (nowDay(world) - (s.since || 0)) / DAYS_PER_YEAR;
    if (s.status === 'ruined' && years >= 3) { s.status = 'rebuilding'; s.since = nowDay(world); addEvent(world, { type: 'settlement', title: `Rebuilding begins in ${REGIONS[k].label}`, region: k }); }
    else if ((s.status === 'rebuilding' || s.status === 'struggling') && years >= 2) { s.status = 'thriving'; s.since = nowDay(world); addEvent(world, { type: 'settlement', title: `${REGIONS[k].label} thrives again`, region: k }); }
  }
}

// Runs whenever time passes. Processes each elapsed month in order.
function evolve(world, state) {
  const out = [];
  const levelHint = state ? getPlayerLevel(state.totalXP || 0) : 10;
  let guard = 0;
  while (nowDay(world) >= world.nextEvolutionDay && guard++ < 1200) {
    world.nextEvolutionDay += 30;
    for (const c of world.crises.filter(x => x.status === 'active')) if (nowDay(world) > c.deadlineDay) out.push(failCrisis(world, c));
    // A new crisis every few months while the world has fewer than two open.
    const open = world.crises.filter(x => x.status === 'active').length;
    if (open < 2 && hashInt(world.id + world.nextEvolutionDay) % 4 === 0) out.push(spawnCrisis(world, levelHint));
    if ((world.nextEvolutionDay / 30) % 12 === 0) {
      out.push(...require('./npc-life').retire(world));
      out.push(...ageNpcs(world));
      out.push(...ageFigures(world, state && state.characterId));
      evolveSettlements(world);
      out.push(...legendsAct(world, state && state.characterId));
      out.push(...require('./politics').yearlyTurn(world));
      out.push(...require('./world-life').yearly(world, state));
      const shift = shiftBorders(world);
      if (shift) out.push(shift);
    }
  }
  return out.filter(Boolean);
}

/**
 * Advances world time. Returns { hours, messages, events } — messages are
 * player-facing notices (birthdays, deaths, crises). Never moves time
 * backwards; zero or invalid hours do nothing.
 */
function advanceTime(state, hours, reason = '') {
  const world = worldOf(state);
  const h = Math.floor(Number(hours) || 0);
  if (!world || h <= 0) return { hours: 0, messages: [], events: [] };
  const beforeAge = ageOf(state, world);
  const target = nowHour(world) + h;
  // Step the clock month by month so events that happen during a long
  // stretch are dated (and decided) when they happen, not all at the end.
  const events = [];
  while (world.nextEvolutionDay * HOURS_PER_DAY <= target) {
    world.calendar.hour = Math.max(nowHour(world), world.nextEvolutionDay * HOURS_PER_DAY);
    events.push(...evolve(world, state));
  }
  world.calendar.hour = target;
  events.push(...evolve(world, state));
  syncAge(state, world);
  const messages = [];
  const afterAge = ageOf(state, world);
  if (afterAge > beforeAge && state.character) {
    messages.push(`You are now ${afterAge} (${ageBand(state.character.bodyAge)}).`);
    const left = lifespan(state) - bodyAge(state, world);
    if (Number.isFinite(left) && left <= 5 && left > 0) messages.push(`Your body is failing. You have perhaps ${left} years left. ("longevity" lists ways to extend your life.)`);
  }
  for (const e of events) if (e && e.importance >= 3) messages.push(`📜 ${e.title}${e.text ? ` — ${e.text}` : ''}`);
  return { hours: h, messages, events, reason };
}

// Ends a long rest at the next morning (7am).
function hoursUntilMorning(world, minimum = 8) {
  const d = dateOf(nowHour(world));
  let h = (24 - d.hour + 7) % 24;
  if (h < minimum) h += 24;
  return h;
}

// Has old age claimed the character?
function isPastLifespan(state, world) {
  return bodyAge(state, world) > lifespan(state);
}

module.exports = {
  HOURS_PER_DAY, DAYS_PER_YEAR, START_YEAR, TIME_COST, ERAS, LONGEVITY_PATHS, MONTHS,
  createWorld, migrateWorld, bindCharacter, attachWorld, worldOf, ensureCharacterIdentity,
  nowHour, nowDay, dateOf, formatDate,
  addEvent, actorOf, buildChronicleText,
  ageOf, bodyAge, lifespan, longevity, ageModifiers, ageBand, syncAge, isPastLifespan,
  longevityOptions, pursueLongevity,
  npcRecord, currentHolder, ageNpcs, HEIR_NAMES,
  applyEnding, eraEffects,
  recordFigure, addAchievement, figureAge, figureStatus, ageFigures, snapshotOf, personalityOf,
  spawnCrisis, resolveCrisis, failCrisis, evolve,
  advanceTime, hoursUntilMorning,
  FACTION_NAMES, ensureDominion, dominionOf, setDominion, shiftBorders, legendsAct
};
