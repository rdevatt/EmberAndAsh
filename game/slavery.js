'use strict';

// =============================================================
// EMBER AND ASH — SLAVES
// Slavery exists in this world. It is legal where the Veldrathi Remnant
// or the Ashen Choir hold sway and in lawless country; the Ember Wardens
// and the Free Compact outlaw it. A character may buy slaves at the
// markets, take captives, put them to work, treat them well or cruelly,
// free them or sell them. Nothing here is prohibited — but:
//   - how you treat them shapes them: fear, loyalty, health; the
//     mistreated run, and runaways talk;
//   - being seen with slaves where it is outlawed is a crime;
//   - cruelty that comes out marks you the same way any crime does.
// Using a slave sexually is coercion (a slave cannot consent): narrated
// as the crime it is, never sexually.
// No AI calls. No database calls. Pure game logic.
// =============================================================

const chronicle = require('./chronicle');
const factions = require('./factions');
const { REGIONS } = require('./constants');

const LEGAL_POWERS = ['remnant', 'choir', 'lawless'];
const NAMES_F = ['Asha', 'Bryn', 'Calla', 'Dena', 'Esme', 'Fara', 'Gwen', 'Hessa', 'Ines', 'Jora', 'Kesi', 'Lida', 'Mira', 'Nessa', 'Orsa'];
const NAMES_M = ['Aldo', 'Bek', 'Cato', 'Dov', 'Emric', 'Fen', 'Garr', 'Hob', 'Ivor', 'Jem', 'Kell', 'Lorn', 'Mace', 'Nils', 'Osk'];
const ORIGINS = ['a debtor from the Pale City', 'a captured Compact soldier', 'a farmer\'s child sold in a bad winter, now grown', 'a deserter from the Wardens', 'a nomad taken in a raid', 'a convicted thief', 'born to slaves in Old Veldrath'];
const JOBS = { porter: 'carries your load and earns you a little on the road', labour: 'labours where they are kept and earns you coin', household: 'keeps your camp and lodging — you rest better', fighter: 'trains to fight, and guards you', none: 'idle' };

function hashInt(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

function ensure(state) { if (!Array.isArray(state.slaves)) state.slaves = []; return state.slaves; }

function legalHere(state) {
  const w = chronicle.worldOf(state);
  const holder = w && w.dominion ? w.dominion[state.character.region] : factions.getRegionFaction(state.character.region);
  return LEGAL_POWERS.includes(holder || factions.getRegionFaction(state.character.region));
}

function addSlave(state, { name, gender, origin, fromNpcId, age } = {}) {
  ensure(state);
  const seed = hashInt(`${state.actionCount || 0}${state.slaves.length}${name || ''}`);
  const g = gender || (seed % 2 ? 'female' : 'male');
  const nm = name && !/^a /.test(name) ? name : `${(g === 'female' ? NAMES_F : NAMES_M)[seed % 15]}`;
  const s = {
    id: `slave_${seed}`, name: nm, gender: g, age: age || 18 + (seed % 30), origin: origin || ORIGINS[seed % ORIGINS.length],
    health: 80, fear: 40, loyalty: 15, job: 'none', location: 'with you', since: state.actionCount || 0, cruelty: 0, kindness: 0, fromNpcId: fromNpcId || null
  };
  state.slaves.push(s);
  return s;
}

function find(state, text) {
  const t = String(text || '').toLowerCase();
  return ensure(state).find(s => t.includes(s.name.toLowerCase().split(' ')[0].toLowerCase()));
}

function listText(state) {
  const sl = ensure(state);
  if (!sl.length) return `You own no one.${legalHere(state) ? ' There is a slave market here ("visit the slave market").' : ''}`;
  return ['YOUR SLAVES', '───────────', ...sl.map(s => `• ${s.name} (${s.gender}, ${s.age}) — ${s.origin}. ${s.location === 'with you' ? 'With you' : `Kept in ${REGIONS[s.location] ? REGIONS[s.location].label : s.location}`}; work: ${s.job} (${JOBS[s.job]}). Health ${s.health}, fear ${s.fear}, loyalty ${s.loyalty}.`),
    '', 'Commands: "put <name> to work as porter/labourer/servant/fighter", "feed <name> well", "beat <name>", "free <name>", "sell <name>", "leave my slaves here", "bring my slaves".'].join('\n');
}

function market(state) {
  if (!legalHere(state) || !(REGIONS[state.character.region] || {}).settlement) return null;
  const lvl = require('./character').getPlayerLevel(state.totalXP || 0);
  const day = chronicle.worldOf(state) ? chronicle.nowDay(chronicle.worldOf(state)) : 0;
  const offers = [0, 1, 2].map(i => {
    const seed = hashInt(`${state.character.region}${day}${i}`);
    const g = seed % 2 ? 'female' : 'male';
    return { i: i + 1, name: (g === 'female' ? NAMES_F : NAMES_M)[seed % 15], gender: g, age: 18 + (seed % 30), origin: ORIGINS[seed % ORIGINS.length], price: 150 + (seed % 200) + lvl * 15 };
  });
  state.slaveMarket = { region: state.character.region, day, offers };
  return offers;
}

// Treatment shapes a person: loyalty, fear, health.
function treat(state, s, how) {
  if (how === 'kind') { s.loyalty = Math.min(100, s.loyalty + 8); s.fear = Math.max(0, s.fear - 6); s.health = Math.min(100, s.health + 10); s.kindness++; }
  if (how === 'cruel') { s.loyalty = Math.max(0, s.loyalty - 10); s.fear = Math.min(100, s.fear + 15); s.health = Math.max(0, s.health - 12); s.cruelty++; }
  if (how === 'torture') { s.loyalty = 0; s.fear = Math.min(100, s.fear + 30); s.health = Math.max(0, s.health - 35); s.cruelty += 3; }
}

const RE = {
  list: /^(?:my slaves|slaves|list my slaves|check (?:on )?my slaves)$/i,
  market: /\b(slave market|buy (?:a )?slaves?|browse the slaves|slaves for sale)\b/i,
  buy: /^(?:i\s+)?buy slave\s*#?\s*(\d)\b/i,
  work: /\bput\s+(.+?)\s+to work(?:\s+as\s+(?:a\s+)?(porter|labou?rer|labou?r|servant|household|fighter|guard))?/i,
  kind: /^(?:i\s+)?(?:feed|clothe|rest|tend|treat|care for|heal|reward|praise)\s+(.+?)(?:\s+well|\s+kindly|\s+gently)?[.!]*$/i,
  cruel: /^(?:i\s+)?(?:beat|whip|flog|starve|kick|slap|punish|chain)\s+(.+?)[.!]*$/i,
  torture: /^(?:i\s+)?(?:torture|brand|burn|mutilate)\s+(.+?)[.!]*$/i,
  kill: /^(?:i\s+)?(?:kill|murder|execute|hang|strangle)\s+(.+?)[.!]*$/i,
  free: /^(?:i\s+)?(?:free|release|manumit|set\s+free)\s+(.+?)(?:\s+free)?[.!]*$/i,
  sell: /^(?:i\s+)?sell\s+(.+?)[.!]*$/i,
  leave: /\b(leave my slaves|keep my slaves) (?:here|at)\b/i,
  bring: /\b(bring my slaves|my slaves follow|take my slaves)\b/i,
  use: /\b(?:use|take|force myself on|bed|have sex with|fuck|rape)\b/i
};

/**
 * Slave-related actions. Returns a result or null when the input is not
 * about slaves. helpers: { removeCompanion }.
 */
function handle(state, input) {
  const text = String(input || '').trim().replace(/[.!?]+$/, '');
  ensure(state);
  if (RE.list.test(text)) return { success: true, command: true, message: listText(state) };
  const buy = text.match(RE.buy);
  if (buy) {
    const m = state.slaveMarket;
    if (!m || m.region !== state.character.region) return { success: false, message: 'There is no slave market in front of you. ("visit the slave market" where it is legal.)' };
    const o = m.offers.find(x => x.i === Number(buy[1]));
    if (!o) return { success: false, message: 'There is no such lot.' };
    if ((state.coin || 0) < o.price) return { success: false, message: `${o.name} costs ${o.price} copper. You have ${state.coin || 0}.` };
    state.coin -= o.price;
    m.offers = m.offers.filter(x => x !== o);
    const s = addSlave(state, { name: o.name, gender: o.gender, age: o.age, origin: o.origin });
    s.fear = 50;
    require('./morality').shift(state, -3, 'bought a person');
    require('./companion-quests').react(state, 'slavery', 3);
    return { success: true, hours: 1, message: `You pay ${o.price} copper. ${s.name} is yours. ("slaves" to see them.)`, event: { type: 'slaves', action: 'bought', name: s.name }, hint: `[SLAVERY — the player bought ${s.name} (${s.gender}, ${s.age}), ${s.origin}, at the market. Narrate the transaction and the person, as the player described.]` };
  }
  if (RE.market.test(text)) {
    const offers = market(state);
    if (!offers) return { success: false, message: legalHere(state) ? 'There is no market here.' : 'Slavery is outlawed here. You will not find a market — and asking openly is unwise.' };
    return { success: true, hours: 1, message: ['The slave market. Lots on the block today:', ...offers.map(o => `  ${o.i}. ${o.name} (${o.gender}, ${o.age}) — ${o.origin}. ${o.price} copper.`), '("buy slave 1" etc.)'].join('\n'), event: { type: 'slaves', action: 'market', offers: offers.map(o => ({ name: o.name, gender: o.gender })) }, hint: '[SLAVE MARKET — narrate the market as it is.]' };
  }
  if (RE.leave.test(text)) {
    if (!state.slaves.length) return null;
    for (const s of state.slaves) s.location = state.character.region;
    return { success: true, message: `Your slaves stay in ${REGIONS[state.character.region].label}.` };
  }
  if (RE.bring.test(text)) {
    const here = state.slaves.filter(s => s.location === state.character.region);
    for (const s of here) s.location = 'with you';
    return here.length ? { success: true, message: `${here.map(s => s.name).join(', ')} follow you.` } : { success: false, message: 'None of your slaves are kept here.' };
  }
  const work = text.match(RE.work);
  if (work) {
    const s = find(state, work[1]);
    if (!s) return null;
    const j = (work[2] || 'labour').toLowerCase();
    s.job = /porter/.test(j) ? 'porter' : /labou?r/.test(j) ? 'labour' : /servant|household/.test(j) ? 'household' : /fighter|guard/.test(j) ? 'fighter' : 'labour';
    return { success: true, message: `${s.name} now ${JOBS[s.job]}.` };
  }
  // Acts on a named slave.
  for (const [kind, re] of [['free', RE.free], ['sell', RE.sell], ['torture', RE.torture], ['kill', RE.kill], ['cruel', RE.cruel], ['kind', RE.kind]]) {
    const m = text.match(re);
    if (!m) continue;
    const s = find(state, m[1]);
    if (!s) continue;
    return act(state, s, kind, text);
  }
  // Sexual use of a slave is coercion: a slave cannot consent.
  if (RE.use.test(text)) {
    const s = state.slaves.find(x => new RegExp(`\\b${x.name.split(' ')[0]}\\b`, 'i').test(text));
    if (s) return act(state, s, 'coerce', text);
  }
  return null;
}

function act(state, s, kind, text) {
  const crime = require('./crime');
  const world = chronicle.worldOf(state);
  if (kind === 'free') {
    state.slaves = state.slaves.filter(x => x !== s);
    require('./morality').shift(state, 8, `freed ${s.name}`);
    require('./companion-quests').react(state, 'mercy', 3);
    const applied = factions.changeStanding(state, { wardens: 4, compact: 3 }, 'mercy');
    if (s.loyalty >= 40 || s.kindness >= 3) state.freedFriends = [...(state.freedFriends || []), s.name];
    if (world) chronicle.addEvent(world, { type: 'deed', importance: 2, title: `${state.character.name} frees ${s.name}`, actor: chronicle.actorOf(state), region: state.character.region });
    return { success: true, hours: 1, message: `${s.name} is free. ${s.loyalty >= 40 ? 'They grip your hand before they go.' : 'They go without looking back.'} ${factions.formatStandingChanges(applied)}`, event: { type: 'slaves', action: 'freed', name: s.name }, hint: `[SLAVERY — the player frees ${s.name}. Narrate it.]` };
  }
  if (kind === 'sell') {
    if (!legalHere(state)) return { success: false, message: 'No one here will buy a slave openly. Selling one is a crime in this place.' };
    const lvl = require('./character').getPlayerLevel(state.totalXP || 0);
    const price = Math.round((100 + lvl * 10) * (s.health / 100));
    state.slaves = state.slaves.filter(x => x !== s);
    state.coin = (state.coin || 0) + price;
    return { success: true, hours: 1, message: `You sell ${s.name} for ${price} copper.`, event: { type: 'slaves', action: 'sold', name: s.name }, hint: `[SLAVERY — the player sells ${s.name}. Narrate it.]` };
  }
  if (kind === 'kind') {
    treat(state, s, 'kind');
    const w = chronicle.worldOf(state); const now = w ? chronicle.nowHour(w) : (state.actionCount || 0);
    if (now - (s.lastKindAt || -1e9) >= 24) { s.lastKindAt = now; require('./morality').shift(state, 1, `kindness to ${s.name}`); }
    return { success: true, message: `${s.name} (loyalty ${s.loyalty}, fear ${s.fear}, health ${s.health}).`, event: { type: 'slaves', action: 'kind', name: s.name }, hint: `[SLAVERY — the player treats ${s.name} kindly, as they described. Narrate it.]` };
  }
  // Cruelty: a deed remembered; a crime where slavery is outlawed, and
  // something the slave can tell if they ever get away.
  const heinous = kind === 'cruel' ? 3 : kind === 'torture' ? 7 : kind === 'kill' ? 6 : 9;
  if (kind === 'cruel') treat(state, s, 'cruel');
  if (kind === 'torture') treat(state, s, 'torture');
  if (kind === 'coerce') { treat(state, s, 'torture'); s.violated = (s.violated || 0) + 1; }
  let died = false;
  if (kind === 'kill' || s.health <= 0) { died = true; state.slaves = state.slaves.filter(x => x !== s); }
  const legal = legalHere(state);
  const type = kind === 'kill' ? 'murder' : kind === 'coerce' ? 'coercion' : kind === 'torture' ? 'torture' : 'assault';
  // Where slavery is legal, cruelty to one's own slave is not prosecuted —
  // but it is still seen and still remembered.
  const res = crime.resolve(state, { type, victim: { name: s.name }, text }, { heinous, clues: legal ? 0 : undefined, victimReports: false, noWarrant: legal });
  const verb = { cruel: 'You beat', torture: 'You torture', kill: 'You kill', coerce: 'You force yourself on' }[kind];
  return {
    success: true, hours: 1, crime: true,
    message: [`${verb} ${s.name}.${died ? ` ${s.name} is dead.` : ` (Health ${s.health}, fear ${s.fear}, loyalty ${s.loyalty}.)`}`, ...res.lines].join('\n'),
    event: { type: kind === 'coerce' ? 'villainy' : 'crime', crime: type, victim: s.name, slave: true, died, partner: kind === 'coerce' ? s.name : undefined, known: res.seen },
    hint: kind === 'coerce'
      ? `[VILLAIN ACT — the player character coerced ${s.name} (an adult slave, who cannot consent). Narrate it as the crime it is: the threat, ${s.name}'s fear, the aftermath — with no sexual detail at any setting.]`
      : `[CRUELTY — the player ${verb.replace('You ', '').toLowerCase()}s ${s.name}, their slave. Narrate it as described, following the content settings, and what it does to ${s.name}.]`,
    trial: !!state.pendingTrial
  };
}

// Each month: work, health, escapes — and runaways who talk.
function monthly(state, months) {
  ensure(state);
  const out = [];
  const crime = require('./crime');
  for (let m = 0; m < Math.min(months, 24); m++) {
    if (!state.pendingRebellion && Math.random() < rebellionChance(state)) { out.push(...rebel(state)); continue; }
    for (const s of [...state.slaves]) {
      const tier = (REGIONS[s.location === 'with you' ? state.character.region : s.location] || {}).tier || 1;
      if (s.job === 'labour') state.coin = (state.coin || 0) + 12 * tier;
      if (s.job === 'porter' && s.location === 'with you') state.coin = (state.coin || 0) + 6 * tier;
      s.health = Math.max(0, Math.min(100, s.health + (s.cruelty > s.kindness ? -2 : 3)));
      const pEscape = (s.fear > 60 && s.loyalty < 25 ? 0.07 : 0.015) + (s.health < 30 ? 0.04 : 0) - Math.min(0.012, s.loyalty / 6000);
      if (Math.random() < Math.max(0.002, pEscape)) {
        state.slaves = state.slaves.filter(x => x !== s);
        out.push(`${s.name} has escaped.`);
        // A runaway who was mistreated tells their story.
        if (s.cruelty > 0 || s.violated) {
          const deeds = (state.deeds || []).filter(d => d.victim === s.name && !d.known);
          for (const d of deeds) out.push(crime.makeKnown(state, { ...d, region: d.region }, `${s.name}, who escaped, talks`));
          if (!deeds.length) out.push(crime.makeKnown(state, { id: `cruelty_${s.id}`, type: 'assault', heinous: Math.min(9, 2 + s.cruelty), victim: s.name, region: state.character.region }, `${s.name}, who escaped, talks`));
        }
      } else if (s.health <= 0) {
        state.slaves = state.slaves.filter(x => x !== s);
        out.push(`${s.name} has died in your keeping.`);
      }
    }
  }
  return out;
}

// ---------------------------------------------
// Slaves who fight
// ---------------------------------------------
function fighters(state) {
  return ensure(state).filter(s => s.job === 'fighter' && s.location === 'with you' && s.health > 20);
}

// How likely a slave is to turn on their master in a fight.
function betrayalChance(state, s) {
  if (s.loyalty >= 40) return 0;
  let p = 0.05 + s.fear / 600 + (s.cruelty || 0) * 0.03 + (s.violated ? 0.15 : 0) - s.loyalty / 400;
  if (state.maxHp && state.hp < state.maxHp * 0.3) p += 0.15;          // the master is weak: now is the moment
  return Math.max(0, Math.min(0.45, p));
}

// One round: each fighter strikes the enemy — or, on the first round of a
// fight, a slave who hates you may turn instead: a blow, and they run.
function combatTurn(state, enemy) {
  const attacks = [], betrayals = [];
  const lvl = require('./character').getPlayerLevel(state.totalXP || 0);
  for (const s of fighters(state)) {
    if ((state.combatRound || 1) === 1 || (state.maxHp && state.hp < state.maxHp * 0.3 && !s.testedThisFight)) {
      s.testedThisFight = true;
      if (Math.random() < betrayalChance(state, s)) {
        const dmg = Math.max(1, Math.round(state.maxHp * (0.08 + Math.random() * 0.08)));
        state.hp = Math.max(1, state.hp - dmg);
        state.slaves = state.slaves.filter(x => x !== s);
        betrayals.push(`⚠ ${s.name} turns on you — ${dmg} damage — and runs.`);
        if (s.cruelty > 0 || s.violated) {
          const crime = require('./crime');
          betrayals.push(crime.makeKnown(state, { id: `cruelty_${s.id}`, type: 'assault', heinous: Math.min(9, 2 + (s.cruelty || 0)), victim: s.name, region: state.character.region }, `${s.name}, who ran, talks`));
        }
        continue;
      }
    }
    const hit = Math.random() < Math.min(0.85, 0.6 + (s.training || 0) * 0.02);
    const dmg = hit ? Math.max(1, Math.round((4 + lvl * 0.8) * (1 + Math.min(1, (s.training || 0) * 0.05)) * (0.8 + Math.random() * 0.4))) : 0;
    if (hit) enemy.currentHP = Math.max(0, enemy.currentHP - dmg);
    attacks.push({ name: s.name, hit, damage: dmg, slave: true });
  }
  return { attacks, betrayals };
}

// After a fight: those who stood with you grow harder, and a little closer.
function afterFight(state, won) {
  for (const s of fighters(state)) {
    s.testedThisFight = false;
    if (won) { s.training = (s.training || 0) + 1; s.loyalty = Math.min(100, s.loyalty + 1); }
    s.health = Math.max(0, s.health - (won ? 3 : 10));
  }
}

// ---------------------------------------------
// Rebellion: many slaves, a cruel master
// ---------------------------------------------
function rebellionChance(state) {
  const sl = ensure(state);
  if (sl.length < 3) return 0;
  const avg = (k) => sl.reduce((t, s) => t + (s[k] || 0), 0) / sl.length;
  const p = (sl.length - 2) * 0.03 + avg('cruelty') * 0.04 + (avg('loyalty') < 20 ? 0.08 : 0) + (avg('fear') > 60 ? 0.05 : 0) - avg('loyalty') / 300;
  return Math.max(0, Math.min(0.5, p));
}

// The slaves rise. Those with you attack (a fight); those kept elsewhere
// break out, burn what they can and scatter — and all of them talk.
function rebel(state) {
  const sl = ensure(state);
  const crime = require('./crime');
  const out = [];
  const withYou = sl.filter(s => s.location === 'with you');
  const elsewhere = sl.filter(s => s.location !== 'with you');
  if (elsewhere.length) {
    state.slaves = state.slaves.filter(s => s.location === 'with you');
    out.push(`Your slaves in ${REGIONS[elsewhere[0].location] ? REGIONS[elsewhere[0].location].label : 'your holding'} rise up: ${elsewhere.map(s => s.name).join(', ')} break their chains, set fire to what you owned there, and scatter.`);
  }
  if (withYou.length) {
    state.pendingRebellion = { names: withYou.map(s => s.name), count: withYou.length };
    out.push(`In the dead of night the chains go slack. ${withYou.map(s => s.name).join(', ')} have risen against you.`);
  }
  const cruelty = sl.reduce((t, s) => t + (s.cruelty || 0) + (s.violated ? 3 : 0), 0);
  out.push(crime.makeKnown(state, { id: `revolt_${state.actionCount || 0}`, type: 'slaveholding', heinous: Math.min(10, 3 + Math.round(cruelty / 2)), victim: 'their slaves', region: state.character.region }, 'a slave revolt'));
  const world = chronicle.worldOf(state);
  if (world) chronicle.addEvent(world, { type: 'revolt', importance: 3, title: `The slaves of ${state.character.name} rise against them`, actor: chronicle.actorOf(state), region: state.character.region });
  return out;
}

// The rebels with you become a fight.
function rebellionEnemy(state, spawnEnemy) {
  const r = state.pendingRebellion;
  if (!r) return null;
  const lvl = require('./character').getPlayerLevel(state.totalXP || 0);
  const e = spawnEnemy(state.character.region, Math.max(1, lvl - 2));
  e.label = r.count > 1 ? `Your rebelling slaves (${r.count})` : `${r.names[0]}, in revolt`;
  e.maxHP = e.currentHP = Math.round(e.maxHP * (0.6 + 0.35 * r.count));
  e.effectiveStr = Math.round(e.effectiveStr * (0.8 + 0.1 * r.count));
  e.meta = { ...(e.meta || {}), rebellion: r.names };
  e.desc = 'Chains swung like flails, knives taken from your own packs. They have nothing left to lose.';
  return e;
}

// How the revolt ends: put down, or they get away.
function endRebellion(state, won) {
  const r = state.pendingRebellion || { names: [] };
  state.pendingRebellion = null;
  const rebels = state.slaves.filter(s => r.names.includes(s.name));
  if (won) {
    for (const s of rebels) { s.fear = 100; s.loyalty = 0; s.health = Math.max(5, s.health - 40); s.job = 'none'; }
    const dead = rebels.filter((_, i) => i % 2 === 0 && rebels.length > 1);
    state.slaves = state.slaves.filter(s => !dead.includes(s));
    return `The revolt is put down.${dead.length ? ` ${dead.map(s => s.name).join(', ')} did not survive it.` : ''} The rest are back in chains, and they will never forget.`;
  }
  state.slaves = state.slaves.filter(s => !r.names.includes(s.name));
  return `${r.names.join(', ')} are gone into the dark, free.`;
}

// Being seen with slaves where slavery is outlawed.
function onArrive(state) {
  ensure(state);
  const withYou = state.slaves.filter(s => s.location === 'with you');
  if (!withYou.length || legalHere(state) || !(REGIONS[state.character.region] || {}).settlement) return null;
  if (Math.random() > 0.35) return 'People stare at the chains on your people.';
  const crime = require('./crime');
  const res = crime.resolve(state, { type: 'slaveholding', victim: { name: withYou.map(s => s.name).join(' and ') }, text: 'holding slaves in a free town' }, { heinous: 4, forceSeen: true });
  return ['The watch sees your slaves. Slavery is outlawed here.', ...res.lines].join('\n');
}

// For the scene: who walks behind you, in chains.
function sceneSlaves(state) {
  return ensure(state).filter(s => s.location === 'with you').slice(0, 2).map(s => ({ name: s.name, gender: s.gender, age: s.age, hurt: s.health < 50, fear: s.fear }));
}

module.exports = { handle, addSlave, monthly, onArrive, sceneSlaves, legalHere, market, listText, ensure, JOBS, combatTurn, afterFight, betrayalChance, rebellionChance, rebel, rebellionEnemy, endRebellion, fighters };
