'use strict';

// =============================================================
// EMBER AND ASH — LEGACY
// Past player characters live on in their world: as rulers, patrons,
// mentors or rivals you can meet; in rumours that cite real history;
// on monuments; and in tombs holding a single heirloom that one worthy
// successor may claim. Everything here is read from the world record —
// names, deeds, choices, gear, companions, appearance, personality.
// =============================================================

const { REGIONS, GEAR_QUALITIES } = require('./constants');
const { getPlayerLevel } = require('./character');
const chronicle = require('./chronicle');

function hashInt(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

function otherFigures(world, state) {
  return (world && world.figures || []).filter(f => f.characterId !== (state && state.characterId));
}

// Living legends present in this region (their seat), or the realm's ruler at the seat.
function figuresHere(world, state) {
  const here = state.character.region;
  return otherFigures(world, state).filter(f => f.status !== 'deceased' && f.seat === here);
}

function nameMatches(f, text) {
  const t = String(text || '').toLowerCase();
  return f.name && f.name.toLowerCase().split(/\s+/).some(w => w.length > 2 && t.includes(w));
}

function findFigure(world, state, text) {
  return otherFigures(world, state).find(f => nameMatches(f, text)) || null;
}

// How this legend regards the newcomer, from the world they made and the
// newcomer's own standing.
function relation(f, world, state) {
  const fac = state.factions || {};
  if (f.role === 'ruler') {
    if (world.ending === 'ascend') return (fac.choir || 0) >= 20 ? 'liege' : 'tyrant';
    return (fac.remnant || 0) >= 0 ? 'liege' : 'stern ruler';
  }
  if (f.role === 'patron') return 'patron';
  if (f.role === 'mentor') return 'mentor';
  return 'legend';
}

function describeFigure(f, world) {
  const s = f.snapshot || {};
  const age = chronicle.figureAge(f, world);
  const L = s.longevity;
  const looks = L && L.immortal ? `untouched by the ${age !== null ? age : 'many'} years` : age !== null ? (age >= 70 ? `white-haired and stooped at ${age}` : age >= 50 ? `grey at the temples at ${age}` : `${age} years old`) : '';
  const kit = [s.weapon && `carrying ${s.weapon}`, s.armor && `in ${s.armor}`].filter(Boolean).join(', ');
  return `${f.name}, ${f.title}${looks ? ` — ${looks}` : ''}${kit ? `, ${kit}` : ''}.`;
}

function figureDialogue(f, world, state) {
  const s = f.snapshot || {};
  const rel = relation(f, world, state);
  const traits = (f.personality || []).join(' and ') || 'unreadable';
  const deeds = [...(f.achievements || [])].slice(-2);
  const choices = Object.values(s.choices || {});
  const lines = [describeFigure(f, world), `They are ${traits}${s.class ? `, a ${s.class} of the old wars` : ''}.`];
  const memory = choices.length ? `"I chose to ${choices[choices.length - 1].replace(/^(\w)/, m => m.toLowerCase())}. I would choose it again."` : '"We did what we had to."';
  if (rel === 'tyrant') lines.push(`"Another little hero, come to look at the throne." ${memory} "Kneel, or go home. Those are the choices left in my world."`);
  else if (rel === 'liege') lines.push(`"You serve the realm well, I hear." ${memory} "Bring me news of the crises, and you will not find me ungrateful."`);
  else if (rel === 'stern ruler') lines.push(`"Your loyalties are… unclear." ${memory}`);
  else if (rel === 'patron') lines.push(`"The fire still needs tending, and I am old." ${memory} "Ask me for a commission — there is always work."`);
  else if (rel === 'mentor') lines.push(`"Magic is going out of the world, and I am not sorry." ${memory} "Sit. I will teach you one thing I learned the hard way."`);
  else lines.push(memory);
  if (s.companions && s.companions.length) lines.push(`They speak of ${s.companions.join(' and ')} as if they were still in the room.`);
  if (deeds.length) lines.push(`(Known for: ${deeds.join('; ')}.)`);
  return { relation: rel, text: lines.join(' ') };
}

// A mentor's lesson: once per newcomer per legend, +1 to the legend's best attribute.
function takeLesson(f, state) {
  if (!state.legacyLessons) state.legacyLessons = {};
  if (state.legacyLessons[f.characterId]) return null;
  const s = f.snapshot || {};
  const stat = { fighter: 'str', barbarian: 'str', paladin: 'str', rogue: 'dex', ranger: 'dex', monk: 'dex', wizard: 'int', sorcerer: 'cha', warlock: 'cha', bard: 'cha', cleric: 'wis', druid: 'wis' }[s.class] || 'wis';
  state.legacyLessons[f.characterId] = true;
  state.stats[stat] = (state.stats[stat] || 10) + 1;
  return `${f.name} teaches you what they learned the hard way. ${stat.toUpperCase()} +1.`;
}

// A line of world-memory for a region's people to share.
function rumorFor(world, regionKey, seed = 0) {
  if (!world) return null;
  const options = [];
  if (world.realm) options.push(`"${world.realm.title.split(',')[0]} rules now — ${world.era.name}, the scribes call it."`);
  for (const f of world.figures) {
    if (f.status === 'deceased') options.push(`"They buried ${f.name}, ${f.title}, in ${REGIONS[f.tomb] ? REGIONS[f.tomb].label : 'the old ground'}. Some say the grave isn't empty of treasure."`);
    else if ((f.achievements || []).length) options.push(`"${f.name}? ${f.achievements[f.achievements.length - 1]} — I heard it from a man who was there."`);
    else options.push(`"${f.name} — ${f.title}. My grandmother saw them once."`);
  }
  const recent = world.history.filter(e => e.importance >= 2).slice(-6);
  for (const e of recent) options.push(`"Did you hear? ${e.title}."`);
  const crisis = (world.crises || []).find(c => c.status === 'active' && c.region === regionKey);
  if (crisis) return `"${crisis.title}. Somebody has to do something."`;
  const s = world.settlements && world.settlements[regionKey];
  if (s && s.status !== 'thriving') options.unshift(`"Times are hard here. We're ${s.status}."`);
  if (!options.length) return null;
  return options[(hashInt(regionKey) + seed) % options.length];
}

// ---------------------------------------------
// Monuments and tombs (dynamic places)
// ---------------------------------------------
function legacyPlaces(world, state) {
  if (!world) return [];
  const here = state.character.region;
  const places = [];
  for (const f of otherFigures(world, state)) {
    const home = f.snapshot && f.snapshot.homeRegion ? f.snapshot.homeRegion : null;
    if ((f.monument || home) === here || (f.seat === here && f.status !== 'deceased')) {
      places.push({ id: `monument_${f.characterId}`, name: `the monument to ${f.name}`, kind: 'monument', figure: f,
        desc: `A statue of ${f.name}, ${f.title}. The plinth lists: ${(f.achievements || []).slice(0, 4).join('; ') || 'their deeds are still being carved'}.` });
    }
    if (f.status === 'deceased' && f.tomb === here) {
      const relic = (world.relics || []).find(r => r.figureId === f.characterId);
      places.push({ id: `tomb_${f.characterId}`, name: `the tomb of ${f.name}`, kind: 'tomb', figure: f, relic,
        desc: `${f.name} lies here${relic && !relic.claimedBy ? `, and with them ${relic.name}` : ''}. Something keeps watch.` });
    }
  }
  return places;
}

function findLegacyPlace(world, state, text) {
  const t = String(text || '').toLowerCase();
  return legacyPlaces(world, state).find(p => (t.includes('tomb') && p.kind === 'tomb' || t.includes('monument') || t.includes('statue')) && nameMatches(p.figure, t)) ||
         legacyPlaces(world, state).find(p => t.includes(p.kind) || (t.includes('statue') && p.kind === 'monument')) || null;
}

// Claims a tomb relic. One claim per world, ever.
function claimRelic(world, state, figureId) {
  const relic = (world.relics || []).find(r => r.figureId === figureId);
  if (!relic) return { success: false, message: 'There is nothing to claim here.' };
  if (relic.claimedBy) return { success: false, message: `${relic.name} was claimed long ago by ${relic.claimedByName || 'another'}.` };
  const level = getPlayerLevel(state.totalXP || 0);
  let tier = 0; for (const q of GEAR_QUALITIES) if (level >= q.levelReq) tier = q.tier;
  relic.claimedBy = state.characterId;
  relic.claimedByName = state.character.name;
  const item = { name: relic.name, tier, type: 'weapon', statMods: { str: 2, wis: 2 }, unique: true, relicOf: figureId };
  if (!Array.isArray(state.inventory)) state.inventory = [];
  state.inventory.push(item);
  chronicle.addEvent(world, { type: 'relic', importance: 3, title: `${state.character.name} claims ${relic.name}`, region: state.character.region, actor: chronicle.actorOf(state) }, `relic:${relic.id}`);
  return { success: true, item, message: `You lift ${relic.name} from the tomb. It is yours now — the only one there will ever be. ("equip ${relic.name}")` };
}

function buildLegendsText(world, state) {
  const figs = otherFigures(world, state);
  if (!figs.length) return 'No legends walk this world yet — perhaps you will be the first.';
  const lines = ['LEGENDS OF THIS WORLD', ''];
  for (const f of figs) {
    lines.push(`  ${f.name}, ${f.title} — ${chronicle.figureStatus(f, world)}`);
    if ((f.achievements || []).length) lines.push(`    ${f.achievements.slice(-3).join('; ')}`);
  }
  lines.push('', 'Living legends can be met where they hold their seat ("talk to <name>").');
  return lines.join('\n');
}

module.exports = { figuresHere, findFigure, figureDialogue, describeFigure, relation, takeLesson, rumorFor, legacyPlaces, findLegacyPlace, claimRelic, buildLegendsText, otherFigures };
