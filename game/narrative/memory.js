'use strict';

// =============================================================
// STORY MEMORY — the narrator's notebook
// A long game (10,000 turns and more) cannot fit in a prompt. The engine
// keeps a bounded, tagged codex instead and recalls what this turn needs:
//
//   entities  people, places, factions, creatures and things, each with
//             a name, aliases, tags and a short list of facts (who they
//             are to the character, what was promised, what was done).
//   events    what happened, when and where, tagged with the entities and
//             kinds involved, with an importance score.
//   chapters  every CHAPTER_TURNS turns the events are rolled into a short
//             chapter note; old chapters are rolled into eras.
//   recent    a compact log of the last turns (the player's words and the
//             gist of the narration) for immediate continuity.
//   threads   built live from the game state (quests, saga, story chapter,
//             partners, slaves, warrants, a trial) — never stale.
//
// Sources are engine facts (always) and the narrator's own notes: the AI is
// asked to end each reply with "NOTES:" lines naming anyone or anything it
// introduced, so the barkeep it called Gorm is still Gorm a thousand turns
// later. Notes are parsed out before the player sees the text.
//
// Every store has a hard cap, so memory and prompt size stay flat however
// long the game runs. Recall is scored by name/alias matches in the
// player's words, tag overlap with the current scene, importance and
// recency, within a fixed character budget.
// No AI calls here (the caller may summarise with the AI). Pure logic.
// =============================================================

const CAPS = { entities: 260, factsPerEntity: 8, events: 360, chapters: 30, eras: 8, recent: 10 };
const CHAPTER_TURNS = 25;
const BUDGET = { entities: 1500, events: 900, chapters: 900, recent: 900 };

const STOP = new Set('the a an and or but of to in on at for with from by into onto over under about as is are was were be been i you he she they it we me my your his her their its our this that these those there here then than so not no yes do does did have has had will would can could should may might must just also very really what who whom whose which when where why how all any some each every more most other such only own same too out up down off again further once again ask asks asked tell tells told say says said look looks walk walks go goes went come comes take takes give gives get gets make makes see sees want wants know knows'.split(' '));

function ensure(state) {
  if (!state.memory || typeof state.memory !== 'object') state.memory = {};
  const m = state.memory;
  if (!m.entities || typeof m.entities !== 'object') m.entities = {};
  if (!Array.isArray(m.events)) m.events = [];
  if (!Array.isArray(m.chapters)) m.chapters = [];
  if (!Array.isArray(m.eras)) m.eras = [];
  if (!Array.isArray(m.recent)) m.recent = [];
  if (typeof m.turn !== 'number') m.turn = 0;
  if (typeof m.chapterFrom !== 'number') m.chapterFrom = 0;
  return m;
}

function keyOf(name) { return String(name || '').toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9' ]+/g, '').trim().replace(/\s+/g, '_'); }
function words(text) { return String(text || '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)); }

// Adds or updates an entity; facts are de-duplicated and capped (the most
// important and the newest survive).
const ROLE_RE = /\b(barkeep|bartender|innkeeper|tavern ?keeper|blacksmith|smith|guard|captain|priest|priestess|merchant|trader|healer|farmer|miller|ferryman|fisherman|sailor|stablehand|cook|maid|servant|magistrate|scholar|witch|hunter|mercenary|soldier|noble|lord|lady|beggar|whore|courtesan|fence|smuggler|thief)\b/i;
const WEIGHTY = /\b(promis\w*|swore|oath|owe[sd]?|debt|lover|married|betroth\w*|murder\w*|killed|dead|forced|secret|betray\w*|enemy|hates?|revenge|vow\w*|slave|freed|child|heir|stole|wanted)\b/i;

function note(state, { name, kind = 'person', aliases = [], tags = [], fact = null, importance = 1, region = null }) {
  if (!name || String(name).length < 2) return null;
  const m = ensure(state);
  const k = keyOf(name);
  if (!k) return null;
  let e = m.entities[k];
  if (!e) {
    e = m.entities[k] = { key: k, name: String(name).trim(), kind, aliases: [], tags: [], facts: [], first: m.turn, last: m.turn, mentions: 0, importance: 0 };
  }
  e.last = m.turn; e.mentions++; e.importance = Math.min(50, e.importance + importance);
  if (kind && e.kind === 'person' && kind !== 'person') e.kind = kind;
  const roleInFact = fact && String(fact).match(ROLE_RE);
  if (roleInFact && kind === 'person') aliases = [...aliases, roleInFact[1].toLowerCase()];
  for (const a of aliases) { const al = String(a).toLowerCase().trim(); if (al && al !== e.name.toLowerCase() && !e.aliases.includes(al) && e.aliases.length < 6) e.aliases.push(al); }
  for (const t of [...tags, region].filter(Boolean)) { const tg = String(t).toLowerCase(); if (!e.tags.includes(tg) && e.tags.length < 12) e.tags.push(tg); }
  if (fact) {
    const f = String(fact).trim().slice(0, 200);
    // Promises, debts, lovers, victims and secrets are what a story must not forget.
    if (WEIGHTY.test(f)) importance += 3;
    const dup = e.facts.find(x => x.text.toLowerCase() === f.toLowerCase());
    if (dup) { dup.t = m.turn; dup.w = Math.max(dup.w, importance); }
    else e.facts.push({ t: m.turn, text: f, w: importance });
    if (e.facts.length > CAPS.factsPerEntity) {
      // Keep the weightiest, then the newest.
      e.facts.sort((a, b) => (b.w - a.w) || (b.t - a.t));
      e.facts = e.facts.slice(0, CAPS.factsPerEntity).sort((a, b) => a.t - b.t);
    }
  }
  pruneEntities(m);
  return e;
}

function pruneEntities(m) {
  const keys = Object.keys(m.entities);
  if (keys.length <= CAPS.entities) return;
  // Forget the least important, least recently seen.
  const scored = keys.map(k => {
    const e = m.entities[k];
    const weight = e.facts.reduce((t, f) => t + (f.w || 1), 0);
    return [k, e.importance * 3 + Math.min(30, e.mentions) + weight - Math.min(8, (m.turn - e.last) / 1000)];
  }).sort((a, b) => a[1] - b[1]);
  for (const [k] of scored.slice(0, keys.length - CAPS.entities)) delete m.entities[k];
}

function event(state, { text, tags = [], entities = [], importance = 1, date = null, region = null }) {
  if (!text) return null;
  const m = ensure(state);
  const ev = { t: m.turn, text: String(text).slice(0, 220), tags: [...new Set([...tags, region].filter(Boolean).map(x => String(x).toLowerCase()))], ents: [...new Set(entities.map(keyOf).filter(Boolean))], w: importance, date };
  const last = m.events[m.events.length - 1];
  if (last && last.text === ev.text) return last;
  m.events.push(ev);
  if (m.events.length > CAPS.events) {
    // Drop the least important of the oldest third; chapters keep their gist.
    const third = Math.floor(m.events.length / 3);
    const old = m.events.slice(0, third).sort((a, b) => a.w - b.w);
    const drop = new Set(old.slice(0, m.events.length - CAPS.events).map(e => e));
    m.events = m.events.filter(e => !drop.has(e));
  }
  return ev;
}

// ---------------------------------------------
// The narrator's own notes
// ---------------------------------------------
const NOTES_INSTRUCTION = `After the narration, on a new line, write "NOTES:" and then up to three lines in the form
Name | kind (person/place/thing/faction) | one short fact (include he/she and their role)
for any person, place or thing you introduced or that changed in this scene. ALWAYS note any name you give to someone or somewhere (e.g. "Kael | person | he, the barkeep of the Mud & Barrel in Thornwick"), and any promise, debt or secret. Write "NOTES: none" if nothing new. The player never sees these lines.`;

// Splits "NOTES:" off a reply. Returns { text, notes: [{name, kind, fact}] }.
function parseNotes(reply) {
  const s = String(reply || '');
  const i = s.search(/\n\s*\**NOTES\**\s*:/i);
  if (i < 0) return { text: s.trim(), notes: [] };
  const text = s.slice(0, i).trim();
  const body = s.slice(i).replace(/^\s*\**NOTES\**\s*:\s*/i, '');
  const notes = [];
  for (const line of body.split('\n')) {
    const l = line.replace(/^[-*•\d.)\s]+/, '').trim();
    if (!l || /^none\.?$/i.test(l)) continue;
    const parts = l.split('|').map(x => x.trim());
    if (parts.length >= 3 && parts[0].length >= 2 && parts[0].length <= 60) notes.push({ name: parts[0], kind: /place|town|city|tavern|inn/i.test(parts[1]) ? 'place' : /thing|item|object/i.test(parts[1]) ? 'thing' : /faction|guild|order|band/i.test(parts[1]) ? 'faction' : 'person', fact: parts.slice(2).join(' | ').slice(0, 200) });
    if (notes.length >= 3) break;
  }
  return { text, notes };
}

// ---------------------------------------------
// Names the prose gives people
// ---------------------------------------------
const NAME = "([A-Z][a-z'’]{2,}(?: [A-Z][a-z'’]{2,})?)";
function namesInProse(text, regionLabel) {
  const t = String(text || '');
  const found = [];
  const roleSrc = ROLE_RE.source.replace(/^\\b\(|\)\\b$/g, '');
  const pats = [
    new RegExp(`\\b(?:the|a|an)\\s+(${roleSrc}),?\\s+(?:named|called)?\\s*${NAME}[,.\\s]`, 'gi'),
    new RegExp(`\\b(?:the|a|an)\\s+(${roleSrc})\\s+(?:named|called)\\s+${NAME}`, 'gi'),
    new RegExp(`${NAME},\\s+the\\s+(${roleSrc})\\b`, 'g')
  ];
  for (const [i, re] of pats.entries()) {
    let m;
    while ((m = re.exec(t))) {
      const role = (i === 2 ? m[2] : m[1]).toLowerCase();
      const name = i === 2 ? m[1] : m[2];
      if (!isProperName(name)) continue;
      const after = t.slice(m.index + m[0].length, m.index + m[0].length + 240);
      const pr = (after.match(/\b(he|she|his|her|him)\b/i) || [])[1];
      found.push({ name, role, pronoun: pr ? (/^(she|her)$/i.test(pr) ? 'she' : 'he') : null });
    }
  }
  // "Name's Gorm" / "I'm Gorm" / "call me Gorm", spoken by a role named nearby.
  const intro = new RegExp(`["“][^"”]*?\\b(?:name's|name’s|name is|I'm|I am|call me)\\s+${NAME}`, 'gi');
  let m;
  while ((m = intro.exec(t))) {
    if (!isProperName(m[1])) continue;
    const before = t.slice(Math.max(0, m.index - 220), m.index);
    const role = (before.match(new RegExp(`\\b(${roleSrc})\\b(?![\\s\\S]*\\b(${roleSrc})\\b)`, 'i')) || [])[1];
    if (role) found.push({ name: m[1], role: role.toLowerCase(), pronoun: null });
  }
  return found.slice(0, 4);
}

// A real name: every word capitalised, and not a common word at a sentence start.
const NOT_NAMES = /^(The|You|He|She|They|His|Her|Your|It|And|But|Then|This|That|There|Here|What|When|Where|Who|Why|How|One|No|Yes|Not|Just|Well|Good|Sir|Madam|Lady|Lord|Friend|Stranger)$/;
function isProperName(name) {
  const parts = String(name || '').split(' ');
  return parts.every(p => /^[A-Z][a-z'’]+$/.test(p)) && !NOT_NAMES.test(parts[0]);
}

// A named person who fills a role here takes over what was known of "the
// barkeep of Thornwick" — one person, not two.
function mergeRole(state, n, region) {
  const m = ensure(state);
  const REGIONS = require('../constants').REGIONS;
  const label = region && REGIONS[region] ? REGIONS[region].label : 'this place';
  const e = note(state, { name: n.name, kind: 'person', aliases: [n.role], tags: ['narrated', n.role], region, fact: `${n.pronoun ? `${n.pronoun}, ` : ''}the ${n.role} of ${label}`, importance: 2 });
  const roleKey = keyOf(`the ${n.role} of ${label}`);
  const anon = m.entities[roleKey];
  if (e && anon && anon !== e) {
    for (const f of anon.facts) if (!e.facts.some(x => x.text === f.text)) e.facts.push(f);
    e.facts = e.facts.slice(-CAPS.factsPerEntity);
    e.importance = Math.min(50, e.importance + anon.importance);
    delete m.entities[roleKey];
  }
  return e;
}

// ---------------------------------------------
// Recording a turn
// ---------------------------------------------
const EVENT_TEXT = {
  questComplete: (e) => `Completed: ${e.quest && e.quest.label}`,
  chapterComplete: (e) => `Finished story chapter ${e.chapter}`,
  levelUp: (e) => (e.newLevel % 10 === 0 ? `Reached level ${e.newLevel}` : null),
  death: (e) => `Was killed and revived in ${e.regionLabel || 'a citadel'}`,
  companionJoined: (e) => e.companion && `${e.companion.name} joined the party`,
  intimacy: (e) => `Spent the night with ${e.partner}`,
  villainy: (e) => `Forced themself on ${e.partner}`,
  crime: (e) => `${e.failed ? 'Attempted' : 'Committed'} ${e.crime}${e.victim ? ` against ${e.victim}` : e.building ? ` (the ${e.building})` : ''}${e.known ? ' — it is known' : ' — unseen'}`,
  trial: (e) => `Stood trial: ${e.sentence}`,
  prison: (e) => `Served ${e.months} months in prison`,
  slaves: (e) => e.action === 'bought' ? `Bought ${e.name} as a slave` : e.action === 'freed' ? `Freed ${e.name}` : e.action === 'sold' ? `Sold ${e.name}` : null,
  travel: (e) => e.to && `Travelled to ${e.toLabel || e.to}`,
  romance: (e) => e.stage === 'ended' ? `Parted from ${e.partner}` : null,
  work: (e) => null
};
const EVENT_WEIGHT = { villainy: 6, crime: 5, trial: 5, prison: 5, intimacy: 4, chapterComplete: 6, death: 3, companionJoined: 4, questComplete: 2, slaves: 3, levelUp: 2, romance: 3, travel: 1 };

function record(state, { input = '', narrative = '', events = [], notes = [] } = {}) {
  const m = ensure(state);
  m.turn = (state.actionCount || m.turn + 1);
  const region = state.character && state.character.region;
  const REGIONS = require('../constants').REGIONS;
  const regionLabel = region && REGIONS[region] ? REGIONS[region].label : null;
  let date = null;
  try { const C = require('../chronicle'); const w = C.worldOf(state); if (w) date = C.formatDate(C.nowHour(w)); } catch (e) { /* no world */ }

  // Places: where the character is.
  if (regionLabel) note(state, { name: regionLabel, kind: 'place', tags: ['place', region], importance: 0.2 });

  // People the scene is about.
  if (state.currentNPC) note(state, { name: state.currentNPC, kind: 'person', tags: ['npc'], region, importance: 1 });
  for (const c of state.companions || []) note(state, { name: c.name, kind: 'person', tags: ['companion', c.role].filter(Boolean), importance: 0.1, fact: `travels with the character (${c.role || 'companion'}), loyalty ${c.loyalty}` });
  for (const [id, p] of Object.entries(state.partners || {})) note(state, { name: p.name, kind: 'person', tags: ['lover', 'partner'], importance: 0.1, fact: 'the character\'s lover' });

  // Quoted words the player addressed to someone are worth remembering —
  // filed under whoever the words were addressed to: a person named in the
  // input, a role ("the barkeep"), or the person being talked to.
  const quote = (String(input).match(/"([^"]{3,160})"|“([^”]{3,160})”/) || []);
  const said = quote[1] || quote[2];
  if (said) {
    const bare = String(input).replace(/"[^"]*"|“[^”]*”/g, ' ');
    const firstWord = (e) => e.name.replace(/^(the|a|an)\s+/i, '').split(' ')[0].replace(/[^a-z]/gi, '');
    const known = Object.values(m.entities).find(e => e.kind === 'person' && ((firstWord(e).length >= 3 && !STOP.has(firstWord(e).toLowerCase()) && new RegExp(`\\b${firstWord(e)}\\b`, 'i').test(bare)) || e.aliases.some(a => a.length > 3 && bare.toLowerCase().includes(a))));
    const role = (bare.match(ROLE_RE) || [])[1];
    const npcNamed = state.currentNPC && new RegExp(`\\b${String(state.currentNPC).split(' ').pop().replace(/[^a-z]/gi, '')}\\b`, 'i').test(bare);
    const to = known ? known.name : role ? `the ${role.toLowerCase()} of ${regionLabel || 'this place'}` : (npcNamed || !/\b(tell|ask|say|shout|call|whisper)\b/i.test(bare)) ? state.currentNPC : null;
    if (to) note(state, { name: to, fact: `the character told them: "${said}"`, importance: 2, region, aliases: role ? [role.toLowerCase()] : [] });
  }

  // Engine events.
  for (const e of events) {
    const f = EVENT_TEXT[e.type];
    const text = f ? f(e) : null;
    if (!text) continue;
    const ents = [e.partner, e.victim, e.victimNpc, e.name, e.companion && e.companion.name].filter(x => x && typeof x === 'string');
    event(state, { text, tags: [e.type, e.crime].filter(Boolean), entities: ents, importance: EVENT_WEIGHT[e.type] || 1, date, region: regionLabel || region });
    for (const n of ents) {
      const facts = {
        intimacy: 'the character\'s lover', villainy: 'was forced by the character — never forgets it',
        crime: e.crime === 'murder' && !e.failed ? 'was murdered by the character' + (e.known ? '' : ' (no one knows)') : `the character committed ${e.crime} against them`,
        slaves: e.action === 'freed' ? 'was freed by the character' : 'a slave of the character',
        companionJoined: 'joined the character\'s party'
      };
      note(state, { name: n, kind: 'person', tags: [e.type, e.crime].filter(Boolean), fact: facts[e.type] || null, importance: EVENT_WEIGHT[e.type] || 1, region });
    }
  }

  // Names the narration gave, even when it forgot to note them:
  // "the barkeep, Kael", "a guard named Joss", "Name's Gorm".
  for (const n of namesInProse(narrative, regionLabel)) mergeRole(state, n, region);

  // The narrator's own notes (names it gave, promises, secrets).
  for (const n of notes) note(state, { name: n.name, kind: n.kind, fact: n.fact, importance: 2, region, tags: ['narrated'] });

  // Recent turns, compact.
  const gist = String(narrative || '').replace(/\s+/g, ' ').slice(0, 260);
  m.recent.push({ t: m.turn, input: String(input).slice(0, 200), gist });
  if (m.recent.length > CAPS.recent) m.recent = m.recent.slice(-CAPS.recent);
}

// Every CHAPTER_TURNS turns: the events of those turns become a chapter note.
// summarise(text) may use the AI; without it, the most important events are kept.
async function maybeCloseChapter(state, summarise = null) {
  const m = ensure(state);
  if (m.turn - m.chapterFrom < CHAPTER_TURNS) return null;
  const evs = m.events.filter(e => e.t > m.chapterFrom && e.t <= m.turn);
  const recentRaw = m.recent.filter(r => r.t > m.chapterFrom);
  const recent = recentRaw.map(r => `> ${r.input} — ${r.gist.slice(0, 140)}`);
  let summary = null;
  const material = [...evs.map(e => `- ${e.text}`), ...recent.slice(-8)].join('\n');
  if (summarise && material.length > 40) { try { summary = await summarise(material); } catch (e) { summary = null; } }
  if (!summary) {
    const top = [...evs].sort((a, b) => b.w - a.w).slice(0, 5).sort((a, b) => a.t - b.t).map(e => e.text);
    summary = top.length ? top.join('; ') + '.' : (recentRaw.length ? `Quiet days: ${recentRaw[0].input}${recentRaw.length > 1 ? ` … ${recentRaw[recentRaw.length - 1].input}` : ''}.` : null);
  }
  const ch = { from: m.chapterFrom + 1, to: m.turn, text: String(summary || '').slice(0, 500) };
  m.chapterFrom = m.turn;
  if (ch.text) m.chapters.push(ch);
  if (m.chapters.length > CAPS.chapters) {
    // Roll the oldest chapters into an era.
    const old = m.chapters.splice(0, 10);
    m.eras.push({ from: old[0].from, to: old[old.length - 1].to, text: old.map(c => c.text).join(' ').slice(0, 600) });
    if (m.eras.length > CAPS.eras) {
      const a = m.eras.splice(0, 2);
      m.eras.unshift({ from: a[0].from, to: a[1].to, text: (a[0].text + ' ' + a[1].text).slice(0, 600) });
    }
  }
  return ch;
}

// ---------------------------------------------
// Recall: what this turn needs
// ---------------------------------------------
function threads(state) {
  const out = [];
  try {
    const camp = require('../campaign');
    const cur = camp.getCurrentStep && camp.getCurrentStep(state);
    if (cur && cur.step) out.push(`Main story: chapter ${cur.chapter.id}, "${cur.chapter.title}" — ${cur.step.objective}`);
  } catch (e) { /* no campaign */ }
  for (const q of (state.activeQuests || []).slice(0, 4)) out.push(`Quest: ${q.label}`);
  if (state.saga && state.saga.steps) { const st = state.saga.steps[state.saga.step]; if (st) out.push(`Saga "${state.saga.title}": ${st.objective}`); }
  const partners = Object.values(state.partners || {}).map(p => p.name);
  if (partners.length) out.push(`Lover${partners.length > 1 ? 's' : ''}: ${partners.join(', ')}`);
  const slaves = (state.slaves || []).map(s => `${s.name}${s.location === 'with you' ? '' : ' (kept elsewhere)'}`);
  if (slaves.length) out.push(`Slaves: ${slaves.slice(0, 6).join(', ')}${slaves.length > 6 ? '…' : ''}`);
  const wanted = Object.keys(state.warrants || {});
  if (wanted.length) out.push(`Wanted in: ${wanted.join(', ')}`);
  if (state.pendingTrial) out.push('Standing trial now');
  if (state.intimate) out.push(`In an intimate scene with ${state.intimate.name}`);
  return out;
}

function recall(state, input = '') {
  const m = ensure(state);
  const region = state.character && state.character.region;
  const q = new Set(words(input));
  const inputLower = String(input || '').toLowerCase();
  const scene = new Set([region, state.currentNPC && keyOf(state.currentNPC), state.currentEnemy && keyOf(state.currentEnemy.label)].filter(Boolean).map(String));
  const named = (e) => new RegExp(`\\b${e.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(inputLower) || e.name.toLowerCase().split(/\s+/).some(w => w.length > 3 && !STOP.has(w) && q.has(w)) || e.aliases.some(a => a.length > 3 && inputLower.includes(a));

  // Entities: named in the player's words first, then the scene, then weight.
  const ents = Object.values(m.entities).filter(e => e.kind !== 'place' || named(e)).map(e => {
    let s = 0;
    if (named(e)) s += 100;
    if (scene.has(e.key) || (state.currentNPC && e.name === state.currentNPC)) s += 60;
    if (e.tags.includes(region)) s += 8;
    for (const t of e.tags) if (q.has(t)) s += 6;
    s += Math.min(20, e.importance) + Math.max(0, 10 - (m.turn - e.last) / 50);
    return [e, s];
  }).sort((a, b) => b[1] - a[1]);
  // Everyone the player named or who is in the scene; then only a few
  // background figures, chosen by how much they matter, not how recent.
  const foreground = ents.filter(([, s]) => s >= 60);
  const background = ents.filter(([e, s]) => s < 60 && (e.importance >= 4 || e.facts.some(f => (f.w || 1) >= 3))).sort((a, b) => b[0].importance - a[0].importance).slice(0, 4);
  ents.length = 0; ents.push(...foreground, ...background);
  const entLines = [];
  let used = 0;
  for (const [e] of ents) {
    const facts = e.facts.slice(-5).map(f => f.text).join('; ');
    const line = `${e.name}${e.tags.length ? ` [${e.tags.slice(0, 4).join(', ')}]` : ''}${facts ? `: ${facts}` : ''}`;
    if (used + line.length > BUDGET.entities) break;
    entLines.push(line); used += line.length;
  }

  // Events: touching what the player named or the scene, then the weightiest.
  const key = new Set([...ents.slice(0, 6).map(([e]) => e.key), ...scene]);
  const evs = m.events.map(ev => {
    let s = ev.w * 2 + Math.max(0, 8 - (m.turn - ev.t) / 100);
    if (ev.ents.some(k => key.has(k))) s += 30;
    for (const t of ev.tags) if (q.has(t) || scene.has(t)) s += 5;
    for (const w of words(ev.text)) if (q.has(w)) s += 3;
    return [ev, s];
  }).sort((a, b) => b[1] - a[1]);
  // Events touching the scene or the player's words; then the five weightiest.
  const relevant = evs.filter(([, s]) => s >= 30);
  const weighty = evs.filter(([, s]) => s < 30).sort((a, b) => b[0].w - a[0].w || b[0].t - a[0].t).slice(0, 5);
  const evLines = [];
  used = 0;
  for (const [ev] of [...relevant, ...weighty]) {
    const line = `${ev.date ? `${ev.date.split(' (')[0]}: ` : `turn ${ev.t}: `}${ev.text}`;
    if (used + line.length > BUDGET.events) break;
    evLines.push([ev.t, line]); used += line.length;
  }
  evLines.sort((a, b) => a[0] - b[0]);

  // Chapters: the era gist and the latest chapters.
  const chapLines = [];
  used = 0;
  for (const c of [...m.eras.slice(-1).map(e => ({ ...e, era: true })), ...m.chapters.slice(-3)]) {
    const line = `${c.era ? 'Long ago' : `Turns ${c.from}–${c.to}`}: ${c.text}`;
    if (used + line.length > BUDGET.chapters) break;
    chapLines.push(line); used += line.length;
  }

  const recentLines = [];
  used = 0;
  for (const r of m.recent.slice(-4)) {
    const line = `> ${r.input} → ${r.gist.slice(0, 160)}`;
    if (used + line.length > BUDGET.recent) break;
    recentLines.push(line); used += line.length;
  }
  return { threads: threads(state), entities: entLines, events: evLines.map(x => x[1]), chapters: chapLines, recent: recentLines };
}

// The block that goes into the prompt.
function promptBlock(state, input) {
  const r = recall(state, input);
  const parts = ['[STORY NOTES — established facts; stay consistent with them. Do not recite them.]'];
  if (r.chapters.length) parts.push(`Story so far:\n${r.chapters.join('\n')}`);
  if (r.threads.length) parts.push(`Open threads:\n${r.threads.join('\n')}`);
  if (r.entities.length) parts.push(`People, places and things:\n${r.entities.join('\n')}`);
  if (r.events.length) parts.push(`Past events:\n${r.events.join('\n')}`);
  if (r.recent.length) parts.push(`Last turns:\n${r.recent.join('\n')}`);
  return parts.length > 1 ? parts.join('\n') : '';
}

// The right-hand panel's "story so far".
function panelSummary(state) {
  const m = ensure(state);
  const last = m.chapters[m.chapters.length - 1];
  return last ? last.text : '';
}

module.exports = { ensure, note, event, record, recall, promptBlock, parseNotes, maybeCloseChapter, panelSummary, threads, NOTES_INSTRUCTION, CAPS, CHAPTER_TURNS, keyOf };
