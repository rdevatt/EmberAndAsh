'use strict';

// =============================================================
// EMBER AND ASH — CRIME, WITNESSES, INVESTIGATION AND JUSTICE
// Nothing is prohibited. A character may steal, beat, torture, kidnap,
// burn and murder; every act is narrated, and every act is remembered by
// the character. What the WORLD does about it depends on what it can know:
//   - witnesses (time of day, a crowd, companions, a surviving victim),
//   - clues (a body, blood, a method that leaves traces, a fire),
//   - concealment (stealth, disguise, a hidden body, an "accident").
// A crime no one saw that leaves no clue costs nothing — but it stays in
// the character's memory. A crime with clues becomes an unsolved case the
// law investigates month by month; a witnessed one is reported at once.
// Once accused, other unsolved cases nearby — including ones committed by
// others — may be laid at your door. At trial the evidence is weighed
// against your standing: a celebrated hero with no known crimes walks free
// far more often than a known cutthroat. Sentences grow with how heinous
// the crimes were: fines, prison (years that age you), exile, execution.
// No AI calls. No database calls. Pure game logic.
// =============================================================

const chronicle = require('./chronicle');
const factions = require('./factions');
const { REGIONS } = require('./constants');

const TYPES = {
  theft:    { label: 'theft', heinous: 2, verb: /\b(steal|steals|stole|pickpocket|pick (?:his|her|their) pocket|rob|robs|robbed|lift (?:his|her|their) purse|cut (?:his|her|their) purse|swipe|pilfer)\b/i },
  assault:  { label: 'assault', heinous: 3, verb: /\b(beat|beats|beat up|punch|punches|assault|assaults|rough up|kick|kicks|break (?:his|her|their) (?:nose|arm|leg|jaw)|slap|slaps|knock (?:him|her|them) (?:down|out))\b/i },
  arson:    { label: 'arson', heinous: 6, verb: /\b(burn down|burns down|set fire to|sets fire to|set alight|torch|torches)\b/i },
  kidnap:   { label: 'kidnapping', heinous: 6, verb: /\b(kidnap|kidnaps|abduct|abducts|enslave|enslaves|take (?:him|her|them) captive|chain (?:him|her|them) up|carry (?:him|her|them) off)\b/i },
  murder:   { label: 'murder', heinous: 7, verb: /\b(kill|kills|murder|murders|slay|slays|stab|stabs|run (?:him|her|them) through|cut (?:him|her|them) down|shoot (?:him|her|them) dead|bludgeon|bludgeons|strangle|strangles|smother|smothers|poison|poisons|drown|drowns|cut (?:his|her|their) throat|slit (?:his|her|their) throat|behead|beheads|execute|executes)\b/i },
  coercion: { label: 'a vile crime', heinous: 9, verb: /(?!)/ },
  slaveholding: { label: 'keeping slaves', heinous: 4, verb: /(?!)/ },
  torture:  { label: 'torture', heinous: 8, verb: /\b(torture|tortures|flay|flays|mutilate|mutilates|brand (?:him|her|them)|burn (?:him|her|them) with|pull (?:his|her|their) (?:teeth|nails))\b/i }
};
const ORDER = ['torture', 'murder', 'kidnap', 'arson', 'assault', 'theft'];

const GENERIC = /\b(?:a|an|the|some|that|this)\s+((?:old |young |drunken? |rich |poor |sleeping |lone )?(?:passerby|stranger|traveller|traveler|merchant|trader|guard|villager|farmer|beggar|drunk|priest|priestess|woman|man|boy|girl|child|peasant|fisherman|fisherwoman|sailor|whore|prostitute|courtesan|noble|nobleman|noblewoman|lord|lady|pilgrim|monk|nun|soldier|watchman|barkeep|bartender|innkeeper|shopkeeper|smith|cook|maid|servant|widow|miller|herder|shepherd|hunter|minstrel|bard|scholar|clerk|tax collector))\b/i;
const BUILDING = /\b(?:the\s+)?(inn|tavern|mill|barn|house|home|shop|stall|temple|church|shrine|warehouse|granary|stable|town|village|docks|forge|market|hall|library)\b/i;
const CHILD = /\b(boy|girl|child|kid|urchin|orphan)\b/i;
const ARMED = /\b(guard|soldier|watchman|captain|warden|sergeant|commander|knight|marshal|castellan|lieutenant)\b/i;

const STEALTH = /\b(quietly|silently|in secret|secretly|when no one is looking|unseen|unnoticed|in the dark|from the shadows|from behind|masked|disguised|in disguise|hooded|wearing a mask|alone with)\b/i;
const ACCIDENT = /\b(make it look like an accident|like an accident|as if (?:he|she|they) fell|staged)\b/i;
const QUIET_METHOD = /\b(poison|poisons|strangle|strangles|smother|smothers|drown|drowns)\b/i;
const CONCEAL = /^(?:i\s+)?(?:hide|bury|dump|sink|burn|dispose of|get rid of|drag away|clean up|wash away|scrub away)\s+(?:the |his |her |their )?(body|bodies|corpse|blood|evidence|remains|bloodstains)\b/i;

function ensure(state) {
  if (!Array.isArray(state.deeds)) state.deeds = [];          // the character's own memory
  if (!Array.isArray(state.secrets)) state.secrets = [];      // their crimes the world has not solved
  if (!state.warrants || typeof state.warrants !== 'object') state.warrants = {};
  if (typeof state.infamy !== 'number') state.infamy = 0;
  if (typeof state.corruption !== 'number') state.corruption = 0;
  return state;
}

function worldUnsolved(world) {
  if (!Array.isArray(world.unsolved)) world.unsolved = [];
  return world.unsolved;
}

function hashInt(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// Who is the crime against?
function findVictim(state, text) {
  const romance = require('./romance');
  const t = String(text || '');
  const named = romance.findPartner(state, t.replace(/^(?:i\s+)?\S+\s+/i, ''));
  if (named) {
    const isChild = (named.npc && require('./content-prefs').isMinorNpc(named.npc)) || false;
    return { ...named, kind: named.companion ? 'companion' : 'npc', child: isChild, armed: ARMED.test(named.role || '') };
  }
  for (const s of state.slaves || []) {
    if (new RegExp(`\\b${s.name.split(' ')[0]}\\b`, 'i').test(t)) return { id: s.id, name: s.name, kind: 'slave', slave: s, child: false, armed: false };
  }
  const g = t.match(GENERIC);
  if (g) return { id: `anon_${g[1].replace(/\s+/g, '_')}`, name: `a ${g[1].toLowerCase()}`, kind: 'stranger', child: CHILD.test(g[1]), armed: ARMED.test(g[1]) };
  return null;
}

// Does this input describe a crime? Returns { type, victim, building, text } or null.
function detect(state, input) {
  const text = String(input || '').trim();
  if (!/^i\b/i.test(text) || state.inCombat) return null;
  for (const type of ORDER) {
    if (!TYPES[type].verb.test(text)) continue;
    if (type === 'arson') {
      const b = text.match(BUILDING);
      if (b) return { type, building: b[1].toLowerCase(), victim: null, text };
      continue;
    }
    const victim = findVictim(state, text);
    if (victim) return { type, victim, text };
  }
  return null;
}

function isConceal(input) { return CONCEAL.test(String(input || '').trim()); }

function timeOfDay(state) {
  const w = chronicle.worldOf(state);
  return w ? chronicle.dateOf(chronicle.nowHour(w)).timeOfDay : 'afternoon';
}

// Probability someone outside the party sees it.
function witnessChance(state, crime) {
  const r = REGIONS[state.character.region] || {};
  const tod = timeOfDay(state);
  const dark = tod === 'night' || tod === 'dusk' || tod === 'dawn';
  let p = r.settlement ? (dark ? 0.25 : 0.6) : (dark ? 0.05 : 0.15);
  if (STEALTH.test(crime.text)) p *= 0.45;
  if (QUIET_METHOD.test(crime.text)) p *= 0.7;
  if (['rogue', 'ranger', 'monk'].includes(state.combatClass)) p *= 0.75;
  if (['scout', 'thief'].includes(state.profession)) p *= 0.7 - 0.04 * Math.min(5, state.professionLevel || 1);
  if (crime.type === 'arson') p = Math.max(p, 0.3);           // fires draw a crowd
  return Math.max(0.01, Math.min(0.95, p));
}

// How much a crime leaves behind for an investigator (0–100).
function clueLevel(state, crime) {
  const r = REGIONS[state.character.region] || {};
  let c = { theft: 20, assault: 35, arson: 30, kidnap: 45, murder: 60, torture: 65 }[crime.type] || 40;
  if (QUIET_METHOD.test(crime.text)) c -= 20;
  if (ACCIDENT.test(crime.text)) c -= 35;
  if (STEALTH.test(crime.text)) c -= 15;
  if (/\b(hide|bury|dump|sink|burn|dispose of|get rid of) (?:the |his |her |their )?(body|corpse)\b/i.test(crime.text)) c -= 40;
  if (!r.settlement) c -= 15;
  const tod = timeOfDay(state);
  if (tod === 'night') c -= 5;
  return Math.max(0, Math.min(100, Math.round(c)));
}

// Can the act itself be carried out? Armed victims fight back; a theft can be noticed.
function succeeds(state, crime) {
  const lvl = require('./character').getPlayerLevel(state.totalXP || 0);
  const st = state.stats || {};
  if (crime.type === 'theft') return Math.random() < Math.min(0.95, 0.5 + ((st.dex || 10) - 10) / 40 + (state.combatClass === 'rogue' ? 0.15 : 0) + (state.profession === 'thief' ? 0.05 * (state.professionLevel || 1) : 0));
  if (crime.type === 'arson') return true;
  const base = crime.victim && crime.victim.armed ? 0.55 : 0.9;
  return Math.random() < Math.min(0.98, base + Math.min(0.3, lvl / 100));
}

// Public knowledge of a crime: infamy, standing, reputation, history.
function makeKnown(state, crime, how = 'reported') {
  ensure(state);
  const H = crime.heinous || 3;
  const owner = factions.getRegionFaction(crime.region);
  const changes = { wardens: -H * 3, compact: -H * 2 };
  changes[owner] = (changes[owner] || 0) - H * 3;
  if (['murder', 'torture', 'coercion'].includes(crime.type)) changes.choir = (changes.choir || 0) + 2;   // the Choir admires cruelty
  const applied = factions.changeStanding(state, changes, 'crime');
  if (!state.reputation) state.reputation = {};
  state.reputation[crime.region] = Math.max(-100, (state.reputation[crime.region] || 0) - H * 7);
  state.infamy = Math.min(100, state.infamy + H * 4);
  crime.known = true;
  const world = chronicle.worldOf(state);
  if (world && state.character) {
    chronicle.addEvent(world, { type: 'crime', importance: H >= 7 ? 4 : 3, title: `${state.character.name} is accused of ${TYPES[crime.type] ? TYPES[crime.type].label : crime.type}${crime.victim ? ` against ${crime.victim}` : ''}`, text: `People in ${REGIONS[crime.region] ? REGIONS[crime.region].label : 'the region'} speak of it in whispers and in anger.`, actor: chronicle.actorOf(state), region: crime.region }, `crime:${crime.id}`);
  }
  return `Word spreads through ${REGIONS[crime.region] ? REGIONS[crime.region].label : 'the region'} (${how}). ${factions.formatStandingChanges(applied)}. Infamy: ${infamyLabel(state.infamy)}.`;
}

function infamyLabel(n) {
  if (n >= 70) return 'Reviled';
  if (n >= 40) return 'Infamous';
  if (n >= 15) return 'Whispered about';
  return 'Unknown';
}

/**
 * Records and resolves a crime: the deed is always remembered; what the
 * world learns depends on witnesses and clues. `extra` lets other systems
 * (coercion, slavery) supply a type, heinousness and who knows.
 */
function resolve(state, crime, extra = {}) {
  ensure(state);
  const world = chronicle.worldOf(state);
  const here = state.character.region;
  const rec = {
    id: `crime_${state.characterId || 'c'}_${state.actionCount || 0}_${hashInt(crime.text || crime.type)}`,
    type: crime.type, heinous: extra.heinous || (TYPES[crime.type] ? TYPES[crime.type].heinous : 5),
    victim: crime.victim ? crime.victim.name : crime.building ? `the ${crime.building}` : null,
    victimId: crime.victim ? crime.victim.id : null,
    region: here, at: world ? chronicle.nowHour(world) : 0, by: state.characterId || 'player',
    clues: extra.clues != null ? extra.clues : clueLevel(state, crime), known: false
  };
  if (crime.victim && crime.victim.child) rec.heinous = Math.max(rec.heinous, 10);
  const lines = [];
  const companionWitnesses = (state.companions || []).filter(c => !crime.victim || !crime.victim.companion || c.id !== crime.victim.companion.id);
  const seen = extra.forceSeen || Math.random() < witnessChance(state, crime);
  const victimReports = extra.victimReports != null ? extra.victimReports : false;

  state.deeds.push({ ...rec, when: world ? chronicle.formatDate(rec.at) : '', seen, perfect: !seen && !victimReports && rec.clues === 0 });
  state.corruption = Math.min(100, state.corruption + Math.ceil(rec.heinous * 2.25));

  // Companions see everything; whether they stay depends on who they are.
  for (const c of companionWitnesses) {
    const cold = c.faction === 'choir' || c.hired;
    const loss = cold ? Math.round(rec.heinous / 2) : rec.heinous * 6;
    c.loyalty = Math.max(0, (c.loyalty || 50) - loss);
    if (!cold && loss >= 18) lines.push(`${c.name} saw it. They will not forget (loyalty ${c.loyalty}).`);
    if (c.loyalty <= 10 && extra.removeCompanion) { extra.removeCompanion(state, c.id); lines.push(`${c.name} walks away from you — and may talk.`); if (Math.random() < 0.5) extra.forceKnown = true; }
  }

  if (seen || victimReports || extra.forceKnown) {
    lines.push(seen ? 'Someone saw you.' : 'The victim names you.');
    lines.push(makeKnown(state, rec, seen ? 'a witness' : 'the victim'));
    const r = REGIONS[here] || {};
    if (extra.noWarrant) { lines.push('No law here will act on it. People will remember it all the same.'); return { record: rec, seen, lines }; }
    state.warrants[here] = { crimes: [rec.id], evidence: seen ? 75 : 60, since: rec.at };
    if (r.settlement) { state.pendingTrial = buildTrial(state, here); lines.push('The watch comes for you. You will stand before the magistrate. (Your next action: "plead innocent", "confess", "bribe the magistrate", or "flee".)'); }
    else lines.push(`A warrant will wait for you in ${r.label || 'the nearest town'}.`);
  } else if (rec.clues > 0) {
    state.secrets.push(rec);
    if (world) worldUnsolved(world).push({ id: rec.id, type: rec.type, heinous: rec.heinous, victim: rec.victim, region: here, at: rec.at, clues: rec.clues, by: rec.by });
    lines.push('No one saw. But something was left behind, and someone may come looking.');
  } else {
    lines.push('No one saw, and nothing was left behind. Only you will ever know.');
  }
  return { record: rec, seen, lines };
}

// Commits a detected crime. Returns a result the route can narrate.
function commit(state, crime, helpers = {}) {
  ensure(state);
  if (crime.victim && crime.victim.kind === 'slave') return null;     // treatment of slaves is handled by slavery.js
  const ok = succeeds(state, crime);
  const world = chronicle.worldOf(state);
  const v = crime.victim;
  const lines = [];
  let type = crime.type;
  if (!ok) {
    // The victim survives and knows who you are: an attempt is still a crime.
    lines.push(type === 'theft' ? `${cap(v.name)} catches your hand in the act.` : `${cap(v.name)} fights you off and escapes.`);
    const res = resolve(state, { ...crime, type: type === 'theft' ? 'theft' : 'assault' }, { victimReports: true, removeCompanion: helpers.removeCompanion });
    return { success: true, crime: true, failed: true, hours: 1, message: [...lines, ...res.lines].join('\n'), hint: hintFor(state, crime, false, res), event: { type: 'crime', crime: type, victim: v ? v.name : null, failed: true, known: true, child: !!(v && v.child) }, trial: !!state.pendingTrial };
  }
  // Effects of the act itself.
  if (type === 'murder' && v) {
    if (v.kind === 'npc' && world) killNpc(world, v);
    if (v.kind === 'companion' && helpers.removeCompanion) { helpers.removeCompanion(state, v.companion.id); state.killedCompanions = { ...(state.killedCompanions || {}), [v.id]: true }; }
    lines.push(`${cap(v.name)} is dead.`);
  } else if (type === 'theft') {
    const lvl = require('./character').getPlayerLevel(state.totalXP || 0);
    const take = Math.round((10 + Math.random() * 40) * Math.max(1, (REGIONS[state.character.region] || {}).tier || 1) * (v && /noble|lord|lady|merchant|rich/.test(v.name) ? 3 : 1) + lvl);
    state.coin = (state.coin || 0) + take;
    lines.push(`You come away with ${take} copper.`);
  } else if (type === 'arson' && world) {
    const s = world.settlements[state.character.region] || { status: 'thriving' };
    s.status = s.status === 'thriving' ? 'struggling' : 'ruined'; s.since = chronicle.nowDay(world);
    world.settlements[state.character.region] = s;
    lines.push(`The ${crime.building} burns. By morning ${(REGIONS[state.character.region] || {}).label || 'the place'} is ${s.status}.`);
  } else if (type === 'kidnap' && v) {
    const slavery = require('./slavery');
    const s = slavery.addSlave(state, { name: v.name.replace(/^a /, 'a captive '), origin: 'kidnapped', gender: v.npc ? require('./appearance').npcGender(v.id, v.name) : null, fromNpcId: v.kind === 'npc' ? v.id : null });
    if (v.kind === 'npc' && world) killNpc(world, v, 'disappears');
    lines.push(`${cap(v.name)} is yours now, in chains. (${s.name} — type "slaves".)`);
  } else if (type === 'torture' && v && v.kind === 'npc') {
    const rel = (state.npcRelationships = state.npcRelationships || {})[v.id] || { rapport: 0 };
    rel.rapport = -100; rel.wronged = true; rel.metBefore = true; state.npcRelationships[v.id] = rel;
  } else if (type === 'assault' && v && v.kind === 'npc') {
    const rel = (state.npcRelationships = state.npcRelationships || {})[v.id] || { rapport: 0 };
    rel.rapport = Math.max(-100, (rel.rapport || 0) - 50); rel.wronged = true; state.npcRelationships[v.id] = rel;
  }
  // A living victim of a violent crime knows their attacker unless it was done unseen.
  const survivor = v && ['assault', 'torture', 'kidnap'].includes(type) && type !== 'kidnap';
  const victimReports = survivor && !STEALTH.test(crime.text) && Math.random() < 0.7;
  const res = resolve(state, crime, { victimReports, removeCompanion: helpers.removeCompanion });
  return {
    success: true, crime: true, hours: type === 'arson' || type === 'torture' ? 2 : 1,
    message: [...lines, ...res.lines].join('\n'),
    hint: hintFor(state, crime, true, res),
    event: { type: 'crime', crime: type, victim: v ? v.name : null, victimNpc: v && v.kind !== 'stranger' ? v.name : null, building: crime.building || null, known: res.seen || victimReports, child: !!(v && v.child) },
    trial: !!state.pendingTrial
  };
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function hintFor(state, crime, done, res) {
  const v = crime.victim;
  const who = v ? v.name : `the ${crime.building}`;
  const child = v && v.child ? ' The victim is a child: narrate the act and its weight without graphic injury detail.' : '';
  return `[CRIME — the player character ${done ? 'committed' : 'attempted'} ${TYPES[crime.type] ? TYPES[crime.type].label : crime.type} against ${who}. Narrate it as it happened, following the player's words and the content settings, and its immediate aftermath.${child} ${res.seen ? 'Someone saw.' : 'No one saw.'}]`;
}

// A murdered or vanished named person: their role passes to an heir.
function killNpc(world, victim, how = 'murdered') {
  const npc = victim.npc || victim;
  const rec = chronicle.npcRecord(world, npc);
  const heir = `${['Ada', 'Bram', 'Corin', 'Dessa', 'Fenn', 'Hild', 'Ivo', 'Orla', 'Soren', 'Yara'][hashInt(npc.id + rec.generation) % 10]} ${String(rec.name).split(' ').slice(-1)[0]}`;
  const region = Object.keys(REGIONS).find(k => (REGIONS[k].npcs || []).some(n => n.id === npc.id));
  chronicle.addEvent(world, { type: 'death', importance: 3, title: how === 'disappears' ? `${rec.name} disappears` : `${rec.name} is found dead`, text: `${heir} takes up the work.`, region }, `npcdeath:${npc.id}:${rec.generation}`);
  world.npcs[npc.id] = { born: chronicle.nowDay(world) - 25 * chronicle.DAYS_PER_YEAR, generation: rec.generation + 1, name: heir, predecessor: rec.name };
}

// Hiding the body, cleaning the blood: lowers the clues of the latest crime here.
function conceal(state, input) {
  ensure(state);
  const world = chronicle.worldOf(state);
  const now = world ? chronicle.nowHour(world) : 0;
  const last = [...state.secrets].reverse().find(c => c.region === state.character.region && now - c.at <= 24);
  const lastDeed = [...state.deeds].reverse().find(d => d.region === state.character.region && now - d.at <= 24);
  if (!lastDeed) return { success: false, message: 'There is nothing here that needs hiding.' };
  if (!last) return { success: true, hours: 2, message: 'You make sure. There was nothing left to find.', hint: '[CONCEALMENT — the player cleans up after themselves. Narrate it.]' };
  // Being seen at it is its own risk.
  const r = REGIONS[state.character.region] || {};
  if (r.settlement && Math.random() < 0.12) {
    const res = resolve(state, { type: last.type, victim: last.victim ? { name: last.victim } : null, text: input }, { forceSeen: true, clues: last.clues, heinous: last.heinous });
    state.secrets = state.secrets.filter(c => c.id !== last.id);
    if (world) world.unsolved = worldUnsolved(world).filter(c => c.id !== last.id);
    return { success: true, hours: 2, message: ['Someone sees you with it.', ...res.lines].join('\n'), event: { type: 'crime', crime: last.type, known: true } };
  }
  last.clues = Math.max(0, last.clues - 40);
  if (world) { const u = worldUnsolved(world).find(c => c.id === last.id); if (u) u.clues = last.clues; }
  if (last.clues === 0) {
    state.secrets = state.secrets.filter(c => c.id !== last.id);
    if (world) world.unsolved = worldUnsolved(world).filter(c => c.id !== last.id);
    const d = state.deeds.find(x => x.id === last.id); if (d) d.perfect = true;
    return { success: true, hours: 2, message: 'When you are done, there is nothing left to find. Only you will ever know.', hint: '[CONCEALMENT — the player hides what they did. Narrate it.]' };
  }
  return { success: true, hours: 2, message: 'You hide what you can. Some trace may remain.', hint: '[CONCEALMENT — the player hides what they did. Narrate it.]' };
}

// ---------------------------------------------
// The world's own crimes, investigations, warrants
// ---------------------------------------------
const NPC_CRIMES = [['theft', 2], ['theft', 2], ['assault', 3], ['murder', 7], ['arson', 6]];
const VICTIMS = ['a merchant', 'a farmer', 'a widow', 'a guard', 'a traveller', 'an innkeeper', 'a priest', 'a fisherman'];

// Months pass: others commit crimes too, and the law works its cases.
function monthly(state, months) {
  ensure(state);
  const world = chronicle.worldOf(state);
  if (!world) return [];
  const out = [];
  const list = worldUnsolved(world);
  for (let m = 0; m < Math.min(months, 24); m++) {
    if (Math.random() < 0.35) {
      const regions = Object.keys(REGIONS).filter(k => REGIONS[k].settlement);
      const reg = regions[Math.floor(Math.random() * regions.length)];
      const [type, heinous] = NPC_CRIMES[Math.floor(Math.random() * NPC_CRIMES.length)];
      list.push({ id: `npc_crime_${chronicle.nowHour(world)}_${m}_${reg}`, type, heinous, victim: VICTIMS[Math.floor(Math.random() * VICTIMS.length)], region: reg, at: chronicle.nowHour(world), clues: 20 + Math.floor(Math.random() * 50), by: 'unknown' });
    }
    // Investigations: clues and the investigator's suspicion of you.
    for (const c of [...state.secrets]) {
      const rep = (state.reputation && state.reputation[c.region]) || 0;
      const regard = Math.max(0, rep) / 200 + (fame(state) / 200);
      const p = (c.clues / 100) * 0.12 * (1 - Math.min(0.8, regard)) * (state.infamy >= 40 ? 1.5 : 1);
      if (Math.random() < p) {
        state.secrets = state.secrets.filter(x => x.id !== c.id);
        world.unsolved = list.filter(x => x.id !== c.id);
        const w = state.warrants[c.region] || { crimes: [], evidence: 0 };
        w.crimes.push(c.id); w.evidence = Math.max(w.evidence, 35 + c.clues / 2); w.since = chronicle.nowHour(world);
        state.warrants[c.region] = w;
        out.push(`The law in ${REGIONS[c.region] ? REGIONS[c.region].label : 'the region'} has found something: the ${TYPES[c.type] ? TYPES[c.type].label : c.type} of ${c.victim || 'someone'}. There is a warrant with your name on it.`);
        out.push(makeKnown(state, c, 'an investigation'));
      }
    }
  }
  if (list.length > 80) world.unsolved = list.slice(-80);
  return out;
}

// Fame shields a villain whose crimes are unknown.
function fame(state) {
  let f = 0;
  if (state.campaign && state.campaign.ending) f += 40;
  const lvl = require('./character').getPlayerLevel(state.totalXP || 0);
  f += Math.min(30, lvl / 4);
  f -= (state.infamy || 0);
  return Math.max(-60, Math.min(80, f));
}

// Entering a settlement with a warrant: arrest and trial.
function checkWarrant(state) {
  ensure(state);
  const here = state.character && state.character.region;
  const r = REGIONS[here] || {};
  // Coming back from exile is a crime of its own.
  if (r.settlement && state.exiled && state.exiled[here] && !state.warrants[here] && !state.pendingTrial) {
    const world = chronicle.worldOf(state);
    const rec = { id: `exile_${here}_${state.actionCount || 0}`, type: 'defying exile', heinous: 3, victim: null, region: here, at: world ? chronicle.nowHour(world) : 0, known: true };
    state.deeds.push({ ...rec, when: world ? chronicle.formatDate(rec.at) : '', seen: true });
    state.warrants[here] = { crimes: [rec.id], evidence: 90, since: rec.at };
  }
  if (!r.settlement || state.pendingTrial || !state.warrants[here]) return null;
  state.pendingTrial = buildTrial(state, here);
  return 'The watch is waiting for you. You are taken before the magistrate. (Your next action: "plead innocent", "confess", "bribe the magistrate", or "flee".)';
}

function buildTrial(state, region) {
  const world = chronicle.worldOf(state);
  const w = state.warrants[region] || { crimes: [], evidence: 50 };
  const mine = state.deeds.filter(d => w.crimes.includes(d.id));
  // Others' unsolved crimes nearby may be laid at your door — and some of
  // your own unsolved ones may be recognised. Standing protects you.
  const attached = [];
  const shield = Math.max(0, ((state.reputation && state.reputation[region]) || 0) / 200) + Math.max(0, fame(state)) / 200;
  for (const c of world ? worldUnsolved(world) : []) {
    if (c.region !== region || w.crimes.includes(c.id) || attached.length >= 3) continue;
    const similar = mine.some(m => m.type === c.type) ? 0.25 : 0;
    if (Math.random() < Math.max(0.02, 0.12 + similar + (state.infamy || 0) / 300 - shield)) attached.push(c);
  }
  return { region, crimes: mine.map(d => ({ id: d.id, type: d.type, heinous: d.heinous, victim: d.victim, yours: true })), attached: attached.map(c => ({ id: c.id, type: c.type, heinous: c.heinous, victim: c.victim, yours: c.by === (state.characterId || 'player') })), evidence: w.evidence };
}

const PLEA = {
  confess: /\b(confess|plead guilty|i did it|admit)\b/i,
  bribe: /\b(bribe|pay off|grease)\b/i,
  flee: /\b(flee|run|escape|break free|fight my way out)\b/i,
  innocent: /\b(plead innocent|plead not guilty|deny|innocent|not guilty)\b/i
};

// The trial: evidence against standing. Returns { lines, sentence, executed }.
function resolveTrial(state, input) {
  ensure(state);
  const t = state.pendingTrial;
  if (!t) return null;
  state.pendingTrial = null;
  const world = chronicle.worldOf(state);
  const lines = [];
  const lvl = require('./character').getPlayerLevel(state.totalXP || 0);
  const all = [...t.crimes, ...t.attached];
  if (t.attached.length) lines.push(`The magistrate reads more charges than you expected: ${t.attached.map(c => `the ${TYPES[c.type] ? TYPES[c.type].label : c.type} of ${c.victim || 'someone'}`).join(', ')}.`);
  const plea = PLEA.confess.test(input) ? 'confess' : PLEA.bribe.test(input) ? 'bribe' : PLEA.flee.test(input) ? 'flee' : 'innocent';
  let evidence = t.evidence + t.attached.length * 5;
  let defence = ((state.reputation && state.reputation[t.region]) || 0) / 2 + fame(state) / 2 + ((state.stats && state.stats.cha) || 10) - 10;
  const owner = factions.getRegionFaction(t.region);
  defence += ((state.factions && state.factions[owner]) || 0) / 4;
  if (plea === 'flee') {
    const ok = Math.random() < Math.min(0.8, 0.3 + ((state.stats && state.stats.dex) || 10) / 100 + lvl / 300);
    state.warrants[t.region] = { crimes: all.map(c => c.id), evidence: 90, since: world ? chronicle.nowHour(world) : 0 };
    if (ok) {
      state.outlaw = { ...(state.outlaw || {}), [t.region]: true };
      state.infamy = Math.min(100, state.infamy + 10);
      lines.push('You break free and run. You are an outlaw here now; the warrant will be waiting.');
      return { lines, sentence: 'outlaw', plea };
    }
    lines.push('You run, and they drag you back. Running counts against you.');
    evidence += 20;
  }
  if (plea === 'bribe') {
    const price = Math.round(all.reduce((s, c) => s + c.heinous, 0) * (20 + lvl * 4));
    const incorruptible = owner === 'wardens' && Math.random() < 0.6;
    if ((state.coin || 0) < price) lines.push(`You cannot afford the magistrate (${price} copper).`);
    else if (incorruptible) { state.coin -= Math.round(price / 4); evidence += 15; lines.push('The magistrate is not for sale, and remembers that you asked.'); }
    else { state.coin -= price; defence += 40; lines.push(`Coin changes hands (${price} copper). The magistrate finds the evidence less convincing.`); }
  }
  const pConvict = plea === 'confess' ? 1 : Math.max(0.03, Math.min(0.97, 0.5 + (evidence - 50) / 80 - defence / 120));
  const convicted = Math.random() < pConvict;
  if (!convicted) {
    delete state.warrants[t.region];
    lines.push(evidence > 60 ? 'Not guilty — though not everyone in the hall believes it.' : 'Not guilty. You walk out into the light.');
    if (world) for (const c of t.attached) { const u = worldUnsolved(world).find(x => x.id === c.id); if (u) u.clues = Math.max(0, u.clues - 10); }
    return { lines, sentence: 'acquitted', plea };
  }
  // Convicted: every charge is now yours in the world's eyes.
  delete state.warrants[t.region];
  if (world) world.unsolved = worldUnsolved(world).filter(u => !all.some(c => c.id === u.id));
  state.secrets = state.secrets.filter(s => !all.some(c => c.id === s.id));
  for (const c of t.attached) if (!c.yours) { state.infamy = Math.min(100, state.infamy + c.heinous * 2); }
  state.convictions = (state.convictions || 0) + all.length;
  const H = all.reduce((s, c) => s + c.heinous, 0) * (plea === 'confess' ? 0.75 : 1);
  const murders = all.filter(c => c.type === 'murder').length;
  lines.push(`Guilty${plea === 'confess' ? ', by your own confession' : ''}.`);
  if (H >= 25 || murders >= 3) {
    lines.push('The sentence is death.');
    return { lines, sentence: 'execution', plea, executed: true };
  }
  if (H <= 3) {
    const fine = Math.round(H * (15 + lvl * 3));
    state.coin = Math.max(0, (state.coin || 0) - fine);
    lines.push(`A fine of ${fine} copper.`);
    return { lines, sentence: 'fine', plea };
  }
  const months = H <= 7 ? Math.round(H) : H <= 14 ? Math.round(H / 3) * 12 : Math.min(30 * 12, Math.round(H) * 12);
  let exiledTo = null;
  if (H > 7) {
    state.exiled = { ...(state.exiled || {}), [t.region]: true };
    // Sent out under guard to the nearest place that will have you.
    const r = REGIONS[t.region] || {};
    const near = [...((r.connections && r.connections.same) || []), ...((r.connections && r.connections.next) || []), ...((r.connections && r.connections.prev) || []), ...(r.adjacent || [])].find(k => REGIONS[k] && !(state.exiled || {})[k]);
    if (near) { state.character.region = near; exiledTo = near; }
  }
  lines.push(`${months >= 12 ? `${Math.round(months / 12)} year${months >= 24 ? 's' : ''}` : `${months} month${months > 1 ? 's' : ''}`} in prison${H > 7 ? `, then exile from ${REGIONS[t.region] ? REGIONS[t.region].label : 'the region'}` : ''}.`);
  if (exiledTo) lines.push(`You are taken under guard to ${REGIONS[exiledTo].label} and told never to return.`);
  return { lines, sentence: 'prison', months, plea, exiledTo };
}

// The character's own memory of what they have done.
function ledger(state) {
  ensure(state);
  if (!state.deeds.length) return 'You have done nothing you would need to hide.';
  const out = ['WHAT YOU HAVE DONE', '──────────────────'];
  for (const d of state.deeds.slice(-30)) {
    const status = d.perfect ? 'no one will ever know' : d.known ? 'known' : state.secrets.some(s => s.id === d.id) ? 'unsolved — they are looking' : 'known';
    out.push(`• ${d.when || ''} ${TYPES[d.type] ? TYPES[d.type].label : d.type}${d.victim ? ` — ${d.victim}` : ''} (${REGIONS[d.region] ? REGIONS[d.region].label : d.region}) — ${status}`);
  }
  const warrants = Object.keys(state.warrants || {});
  if (warrants.length) out.push('', `Warrants: ${warrants.map(k => REGIONS[k] ? REGIONS[k].label : k).join(', ')}`);
  out.push('', `Infamy: ${infamyLabel(state.infamy || 0)}`);
  return out.join('\n');
}

module.exports = {
  TYPES, detect, commit, resolve, conceal, isConceal, monthly, checkWarrant, resolveTrial, buildTrial,
  makeKnown, ledger, infamyLabel, witnessChance, clueLevel, fame, ensure, killNpc, findVictim
};
