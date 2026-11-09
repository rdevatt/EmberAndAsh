'use strict';

// =============================================================
// CANON — the world's permanent, authoritative history
//
// Two layers of memory:
//   canon (this file)   per world, permanent, structured, authoritative:
//                       people (birth, death, successors, family, titles,
//                       bonds), reigns, wars and treaties, territory,
//                       foundations, artifacts and their owners, oaths and
//                       debts and betrayals, great choices — and a ledger
//                       of every important event. It is never summarised
//                       away: the oldest minor ledger rows are folded into
//                       decade summaries only past a very large size, and
//                       events of importance 4+ are kept verbatim forever.
//   working memory      per character (game/narrative/memory.js): what the
//                       narrator needs this turn, drawn from canon and from
//                       the character's own recent story.
//
// The chronicle (world.history) is a display log capped at 2,000 entries;
// canon is fed from it as events are added, plus explicit calls where facts
// are made (a succession, a marriage, an oath, a lineage). A new character
// centuries later meets the results: who rules, who founded the school in
// town, whose sword hangs in the hall, and what their own ancestors did.
// No AI calls. No database calls. Pure logic.
// =============================================================

const LEDGER_SOFT_CAP = 12000;

function ensure(world) {
  if (!world) return null;
  if (!world.canon || typeof world.canon !== 'object') world.canon = {};
  const c = world.canon;
  for (const k of ['ledger', 'reigns', 'wars', 'treaties', 'foundations', 'relations', 'oaths', 'choices']) if (!Array.isArray(c[k])) c[k] = [];
  for (const k of ['people', 'artifacts', 'territory']) if (!c[k] || typeof c[k] !== 'object') c[k] = {};
  return c;
}

function keyOf(name) { return String(name || '').toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9' ]+/g, '').trim().replace(/\s+/g, '_'); }
function yearOfEntry(entry) { const m = String(entry && entry.date || '').match(/(\d+) E\.R\./); return m ? Number(m[1]) : null; }
function nowYear(world) {
  try { const C = require('./chronicle'); return C.dateOf(C.nowHour(world)).year; } catch (e) { return null; }
}

// ---------------------------------------------
// People
// ---------------------------------------------
function person(world, name, patch = {}) {
  const c = ensure(world);
  const k = keyOf(name);
  if (!k || k.length < 2) return null;
  const p = c.people[k] || (c.people[k] = { name: String(name).trim(), titles: [], bonds: [], parents: [], children: [], deeds: [] });
  for (const [f, v] of Object.entries(patch)) {
    if (v === undefined || v === null) continue;
    if (['titles', 'deeds'].includes(f)) { for (const x of [].concat(v)) if (x && !p[f].includes(x)) p[f].push(x); if (p[f].length > 12) p[f] = p[f].slice(-12); }
    else if (['parents', 'children'].includes(f)) { for (const x of [].concat(v)) if (x && !p[f].includes(x)) p[f].push(x); }
    else if (f === 'died' && p.died) continue;                  // a death is not undone
    else p[f] = v;
  }
  return p;
}

function isDead(world, name) { const p = ensure(world) && world.canon.people[keyOf(name)]; return !!(p && p.died); }

function relate(world, a, b, kind, year) {
  const c = ensure(world);
  if (!a || !b) return;
  if (c.relations.some(r => r.a === a && r.b === b && r.kind === kind)) return;
  c.relations.push({ a, b, kind, y: year || nowYear(world) });
  person(world, a); person(world, b);
  for (const [x, y] of [[a, b], [b, a]]) { const p = c.people[keyOf(x)]; if (p && !p.bonds.some(q => q.with === y && q.kind === kind)) p.bonds.push({ with: y, kind, y: year || nowYear(world) }); }
}

// A promise, debt, betrayal or secret — between named people.
function oath(world, { by, to, what, kind = 'promise', year }) {
  const c = ensure(world);
  if (!by || !what) return null;
  const text = String(what).slice(0, 200);
  if (c.oaths.some(o => o.by === by && o.to === to && o.what === text)) return null;
  const o = { by, to: to || null, what: text, kind, y: year || nowYear(world), status: 'open' };
  c.oaths.push(o);
  return o;
}

function lineage(world, child, parent, year) {
  person(world, child, { parents: [parent], born: year || nowYear(world) });
  person(world, parent, { children: [child] });
  relate(world, parent, child, 'parent of', year);
}

// ---------------------------------------------
// Ingesting chronicle events
// ---------------------------------------------
const ALWAYS = new Set(['death', 'succession', 'founding', 'ending', 'war', 'politics', 'crime', 'relic', 'bond', 'revolt', 'governance', 'longevity', 'monument', 'marriage', 'birth', 'oath', 'companion', 'lineage', 'retirement']);

function ingest(world, entry) {
  if (!world || !entry) return;
  const c = ensure(world);
  const y = yearOfEntry(entry) || nowYear(world);
  const title = String(entry.title || '');
  const actor = entry.actor && entry.actor.name;
  if ((entry.importance || 1) >= 3 || ALWAYS.has(entry.type)) {
    c.ledger.push({ y, t: entry.type, s: title.slice(0, 170), x: String(entry.text || '').slice(0, 140) || undefined, r: entry.region || undefined, a: actor || undefined, i: entry.importance || 1 });
    if (c.ledger.length > LEDGER_SOFT_CAP) compact(c);
  }
  let m;
  switch (entry.type) {
    case 'death': {
      const who = (m = title.match(/^(.+?)(?:, [^,]+,)? (?:dies at (\d+)|is found dead|disappears|is killed in the fighting at (.+)|is executed)/)) ? m[1] : null;
      if (who) {
        const cause = /killed in the fighting/.test(title) ? `killed in the fighting at ${m[3]}` : /found dead/.test(title) ? 'murdered' : /disappears/.test(title) ? 'disappeared' : /executed/.test(title) ? 'executed' : m[2] ? `old age, at ${m[2]}` : 'died';
        person(world, who, { died: y, cause, region: entry.region || undefined });
        const heir = String(entry.text || '').match(/^(?:.*?\. )?([A-Z][a-z'’]+(?: [A-Z][a-z'’]+)?) takes up the work/);
        if (heir) { person(world, heir[1], { successorOf: who, region: entry.region || undefined, role: c.people[keyOf(who)] && c.people[keyOf(who)].role }); person(world, who, { successor: heir[1] }); }
      }
      break;
    }
    case 'politics':
      if ((m = title.match(/^(.+?) declares war on (.+)$/))) c.wars.push({ a: m[1], b: m[2], from: y, to: null });
      else if ((m = title.match(/^(.+?) (?:agrees a truce with|makes peace with) (.+)$/))) {
        const w = [...c.wars].reverse().find(x => !x.to && ((x.a === m[1] && x.b === m[2]) || (x.a === m[2] && x.b === m[1])));
        if (w) w.to = y;
        c.treaties.push({ a: m[1], b: m[2], kind: /truce/.test(title) ? 'truce' : 'peace', y });
      } else if ((m = title.match(/^(.+?) allies with (.+)$/))) c.treaties.push({ a: m[1], b: m[2], kind: 'alliance', y });
      break;
    case 'dominion':
      if (entry.region) {
        const holder = (m = title.match(/^(.+?) takes? control of/)) ? m[1] : /lawlessness/.test(title) ? 'no one (lawless)' : null;
        if (holder) { const t = c.territory[entry.region] || (c.territory[entry.region] = []); t.push({ holder, y }); if (t.length > 60) t.splice(0, t.length - 60); }
      }
      break;
    case 'ending':
      c.choices.push({ y, by: actor || 'a hero', what: `${title}. ${entry.text || ''}`.slice(0, 260) });
      break;
    case 'succession':
      c.reigns.push({ realm: (m = title.match(/The (.+?) passes to/)) ? m[1] : 'the realm', ruler: (m = title.match(/passes to (.+)$/)) ? m[1] : 'unknown', from: y, how: 'succession' });
      break;
    case 'founding':
      if ((m = title.match(/^(.+?) founds (.+)$/))) c.foundations.push({ name: m[2], founder: m[1], region: entry.region || null, y, kind: /school/i.test(m[2]) ? 'school' : /order/i.test(m[2]) ? 'order' : 'organisation', status: 'standing' });
      break;
    case 'relic':
      if ((m = title.match(/^(.+?) claims (.+)$/))) { const a = c.artifacts[keyOf(m[2])] || (c.artifacts[keyOf(m[2])] = { name: m[2], owners: [] }); a.owners.push({ owner: m[1], y, how: 'claimed' }); }
      break;
    case 'bond':
      if ((m = title.match(/^(.+?) and (.+?) are bound to each other/))) relate(world, m[1], m[2], 'lovers', y);
      break;
    case 'marriage':
      if ((m = title.match(/^(.+?) marries (.+)$/))) relate(world, m[1], m[2], 'married', y);
      break;
    default: break;
  }
}

// Fold the oldest minor rows into decade summaries; major ones stay forever.
function compact(c) {
  const minor = [];
  const keep = [];
  const cutoff = Math.floor(c.ledger.length * 0.25);
  c.ledger.forEach((r, i) => (i < cutoff && r.i <= 3 && r.t !== 'summary' ? minor : keep).push(r));
  const groups = {};
  for (const r of minor) { const k = `${Math.floor(r.y / 10) * 10}|${r.t}`; (groups[k] = groups[k] || []).push(r); }
  const summaries = Object.entries(groups).map(([k, rows]) => { const [dec, t] = k.split('|'); return { y: Number(dec), t: 'summary', s: `${rows.length} ${t} event${rows.length > 1 ? 's' : ''} in the ${dec}s, e.g. ${rows[0].s}`, i: 3 }; });
  c.ledger = [...summaries, ...keep].sort((a, b) => a.y - b.y);
}

// ---------------------------------------------
// Recall: the canon a scene needs
// ---------------------------------------------
const STOP = new Set('the a an and or but of to in on at for with from by into this that there here what who how all some your you my i me he she they it is are was were be been have has had will would can could ask tell say look walk go come take give get see want know about'.split(' '));

function recall(world, { input = '', region = null, names = [], character = null, budget = 1100 } = {}) {
  const c = ensure(world);
  if (!c) return [];
  const y = nowYear(world) || 0;
  const terms = new Set(String(input).toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(w => w.length > 3 && !STOP.has(w)));
  const nameSet = new Set(names.filter(Boolean).map(keyOf));
  const out = [];
  const add = (line, w) => out.push([w, line]);
  const REGIONS = require('./constants').REGIONS;
  const label = (r) => (REGIONS[r] ? REGIONS[r].label : r);

  // People named in the player's words, or tied to the character.
  for (const p of Object.values(c.people)) {
    const k = keyOf(p.name);
    const first = p.name.split(' ')[0].toLowerCase();
    const named = nameSet.has(k) || (first.length > 3 && terms.has(first)) || String(input).toLowerCase().includes(p.name.toLowerCase());
    const kin = character && (p.children.includes(character) || p.parents.includes(character) || p.bonds.some(b => b.with === character));
    if (!named && !kin) continue;
    const bits = [p.role, p.region && label(p.region)].filter(Boolean).join(', ');
    const life = p.died ? `died ${p.died} (${p.cause || 'dead'})` : p.lastSeen && y - p.lastSeen > 60 ? `last heard of ${p.lastSeen} — long gone by now` : p.born ? `born ${p.born}` : '';
    const rel = [p.successorOf && `succeeded ${p.successorOf}`, p.successor && `succeeded by ${p.successor}`, p.parents.length && `child of ${p.parents.join(' and ')}`, p.children.length && `parent of ${p.children.slice(0, 3).join(', ')}`, ...p.bonds.slice(-3).map(b => `${b.kind} ${b.with} (${b.y})`), ...p.titles.slice(-2)].filter(Boolean).join('; ');
    add(`${p.name}${bits ? ` (${bits})` : ''}${life ? `: ${life}` : ''}${rel ? `; ${rel}` : ''}`, named ? 100 : 80);
  }
  // Oaths, debts, betrayals involving them.
  for (const o of c.oaths) {
    if (nameSet.has(keyOf(o.by)) || nameSet.has(keyOf(o.to)) || (character && (o.by === character || o.to === character)) || [...terms].some(t => o.what.toLowerCase().includes(t))) add(`${o.kind} (${o.y}): ${o.by}${o.to ? ` → ${o.to}` : ''}: ${o.what} [${o.status}]`, 90);
  }
  // Where the character stands: who holds it, since when; what was founded here.
  if (region) {
    const t = c.territory[region];
    if (t && t.length) { const last = t[t.length - 1]; add(`${label(region)} has been held by ${last.holder} since ${last.y}${t.length > 1 ? ` (before them ${t[t.length - 2].holder}, from ${t[t.length - 2].y})` : ''}.`, 50); }
    for (const f of c.foundations.filter(f => f.region === region)) add(`${f.name}, founded by ${f.founder} in ${f.y}, stands here.`, 60);
    for (const r of c.ledger.filter(r => r.r === region && r.i >= 4).slice(-3)) add(`${r.y}: ${r.s}`, 40);
  }
  // Ongoing wars.
  for (const w of c.wars.filter(w => !w.to).slice(-2)) add(`${w.a} and ${w.b} have been at war since ${w.from}.`, 35);
  // Great choices that shaped the age.
  for (const ch of c.choices.slice(-1)) add(`${ch.y}: ${ch.what}`, 30);
  // Ledger rows the player's words point to, however old.
  if (terms.size) {
    for (const r of c.ledger) {
      const words = r.s.toLowerCase();
      let hits = 0;
      for (const t of terms) if (words.includes(t)) hits++;
      if (hits) add(`${r.y}: ${r.s}`, 20 + hits * 10 + r.i * 2);
    }
  }
  const seen = new Set();
  const lines = [];
  let used = 0;
  for (const [, line] of out.sort((a, b) => b[0] - a[0])) {
    if (seen.has(line)) continue;
    seen.add(line);
    if (used + line.length > budget) continue;
    lines.push(line); used += line.length;
  }
  return lines;
}

function size(world) { return JSON.stringify(ensure(world)).length; }

module.exports = { ensure, ingest, person, relate, oath, lineage, isDead, recall, size, keyOf, compact };
