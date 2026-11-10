'use strict';

// =============================================================
// NPC LIFE
// The named people of the world have their own goals, worries and views,
// grounded in the actual state of the world — not invented by the
// narrator. A miller in a struggling valley worries about the harvest; a
// Warden whose region the Choir took is bitter; a smith whose rival was
// murdered last year still speaks of it; the heir of a man the player
// killed knows who did it. People retire, hand their work on, die in
// retirement, and every one of those steps enters the canon.
// No AI calls. No database calls. Pure game logic.
// =============================================================

const chronicle = require('./chronicle');
const { REGIONS } = require('./constants');

function hashInt(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// What a person in this line of work wants out of life.
const GOALS = [
  [/smith|forge/i,        ['to forge one blade worth remembering', 'to train an apprentice who outdoes them', 'to pay off the forge before the winter']],
  [/miller|farmer|salt/i, ['to see one good harvest in a row', 'to keep the land in the family', 'to rebuild the old granary']],
  [/innkeeper/i,          ['to keep every room full through the season', 'to buy the stable next door', 'to hear every rumour first']],
  [/caravan|trader|merchant|harbour|ferry/i, ['to open a new trade road', 'to clear their debts with the Compact', 'to outlast their rivals on the route']],
  [/captain|commander|warden|castellan|general|officer|pass-warden|watcher/i, ['to hold their post with no one lost', 'to be relieved before they grow too old for it', 'to see the road safe for ordinary folk']],
  [/scholar|archivist|monk|seer|druid|witch|tender|keeper/i, ['to finish the work their teacher began', 'to find a book that should not exist', 'to understand what the Ash really is']],
  [/fence|smuggler|wrecker|scavenger/i, ['to make one last score and quit', 'to stay one step ahead of the law', 'to buy their way into respectability']],
  [/heir|magistrate|chief|elder/i, ['to see their people prosper', 'to restore the old house\'s standing', 'to name a worthy successor']]
];
const FALLBACK_GOALS = ['to be left in peace', 'to see their family safe', 'to leave the place better than they found it'];

function goalOf(npc, holderName) {
  for (const [re, list] of GOALS) if (re.test(npc.role || '')) return list[hashInt(holderName) % list.length];
  return FALLBACK_GOALS[hashInt(holderName) % FALLBACK_GOALS.length];
}

// Friendships and rivalries among the people of one region, stable for
// a given pair of holders (heirs make their own).
function relationsOf(world, regionKey, npc) {
  const people = (REGIONS[regionKey].npcs || []).filter(n => n.id !== npc.id);
  const me = chronicle.currentHolder(world, npc).name;
  const out = [];
  for (const other of people) {
    const them = chronicle.currentHolder(world, other).name;
    const h = hashInt([me, them].sort().join('|')) % 10;
    // In a small place everyone knows everyone: a rival, a friend, or just a neighbour.
    out.push({ name: them, role: other.role, kind: h < 3 ? 'rival' : h < 7 ? 'friend' : 'neighbour' });
  }
  return out.slice(0, 3);
}

// What is on their mind, from the world as it is.
function concernsOf(world, state, regionKey, npc) {
  const out = [];
  const label = REGIONS[regionKey].label;
  const settlement = (world.settlements || {})[regionKey];
  if (settlement && settlement.status === 'struggling') out.push(`times are hard in ${label}: trade is thin and people are leaving`);
  if (settlement && settlement.status === 'thriving') out.push(`${label} is prospering, and prices are rising with it`);
  if (settlement && settlement.status === 'ruined') out.push(`${label} lies half in ruins and they are trying to rebuild`);
  const holder = chronicle.dominionOf ? chronicle.dominionOf(world, regionKey) : null;
  if (holder && holder !== 'lawless' && npc.faction && holder !== npc.faction) {
    out.push(`${chronicle.FACTION_NAMES[holder] || holder} hold ${label} now, and they ${npc.faction === 'choir' || holder === 'choir' ? 'hate it' : 'do not like it'}`);
  }
  try {
    const wars = require('./politics').activeWars(world) || [];
    const w = wars.find(x => npc.faction && (x.a === npc.faction || x.b === npc.faction));
    if (w) out.push(`the war between ${chronicle.FACTION_NAMES[w.a] || w.a} and ${chronicle.FACTION_NAMES[w.b] || w.b} weighs on them`);
  } catch { /* politics not set up for this world */ }
  const crisis = (world.crises || []).find(c => c.region === regionKey && c.status === 'active');
  if (crisis) out.push(`${crisis.title} frightens them`);
  const L = world.life || {};
  const dz = (L.disasters || []).find(d => d.region === regionKey && d.progress < 100);
  if (dz) out.push(`${dz.title} — the rebuilding is ${dz.progress}% done`);
  const mv = (L.movements || []).find(m => m.strength > 0 && m.regions.includes(regionKey));
  if (mv) out.push(`${mv.name} are preaching here (${mv.creed})`);
  // Recent deaths and crimes among the people they knew.
  const ledger = (world.canon && world.canon.ledger) || [];
  const year = chronicle.dateOf(chronicle.nowHour(world)).year;
  const recentDeath = [...ledger].reverse().find(r => r.t === 'death' && r.r === regionKey && year - r.y <= 10 && !r.s.startsWith(chronicle.currentHolder(world, npc).name));
  if (recentDeath) out.push(`they still speak of it: ${recentDeath.s.replace(/ dies at \d+$/, ' died').replace(/ is found dead$/, ' was found dead')} (${recentDeath.y})`);
  return out.slice(0, 3);
}

// What they think of the player, from what the world knows.
function viewOf(world, state, npc) {
  const rec = chronicle.npcRecord(world, npc);
  const rel = (state.npcRelationships || {})[npc.id] || {};
  const reasons = [];
  let score = (rel.rapport || 0) / 2;
  if (rel.wronged) { score -= 80; reasons.push('you wronged them'); }
  // The heir of someone the player is known to have killed.
  if (rec.predecessor && (state.deeds || []).some(d => d.victim === rec.predecessor && d.known)) { score -= 70; reasons.push(`everyone knows you killed ${rec.predecessor}`); }
  const standing = require('./factions').getStanding(state, npc.faction || 'compact');
  if (npc.faction) { score += standing / 3; if (Math.abs(standing) >= 25) reasons.push(`their faction ${standing > 0 ? 'trusts' : 'distrusts'} you`); }
  const infamy = state.infamy || 0;
  if (infamy >= 25) { score -= infamy / 2; reasons.push('your name is spoken with fear'); }
  const road = require('./morality').value(state);
  if (road >= 40 && npc.faction !== 'choir') { score += 10; reasons.push('you are known as a decent soul'); }
  if (road <= -40) { score += npc.faction === 'choir' ? 10 : -10; reasons.push('there is darkness on you'); }
  if ((state.warrants || {})[state.character && state.character.region]) { score -= 20; reasons.push('the law wants you here'); }
  const legend = (world.figures || []).find(f => f.characterId === state.characterId);
  if (legend) { score += 15; reasons.push('they know your legend'); }
  const word = score >= 40 ? 'admiring' : score >= 15 ? 'friendly' : score > -15 ? 'wary' : score > -50 ? 'cold' : 'hostile';
  return { word, score: Math.round(score), reasons: reasons.slice(0, 3) };
}

function profile(world, state, regionKey, npc) {
  const holder = chronicle.currentHolder(world, npc);
  const rec = chronicle.npcRecord(world, npc);
  return {
    id: npc.id, name: holder.name, role: npc.role, faction: npc.faction || null, age: holder.age,
    generation: rec.generation, predecessor: rec.predecessor || null, predecessorRetired: !!rec.predecessorRetired,
    goal: goalOf(npc, holder.name),
    concerns: concernsOf(world, state, regionKey, npc),
    relations: relationsOf(world, regionKey, npc),
    view: viewOf(world, state, npc)
  };
}

// One line for the narrator: grounded facts it must keep to.
function promptLine(p) {
  const bits = [`${p.name}, ${p.role}${p.age ? `, ${p.age}` : ''}`];
  if (p.predecessor) bits.push(`took over from ${p.predecessor}${p.predecessorRetired ? ' (retired)' : ' (dead)'}`);
  bits.push(`wants ${p.goal}`);
  if (p.concerns.length) bits.push(`on their mind: ${p.concerns.join('; ')}`);
  if (p.relations.length) bits.push(p.relations.map(r => `${r.kind} of ${r.name}`).join(', '));
  bits.push(`towards the player: ${p.view.word}${p.view.reasons.length ? ` (${p.view.reasons.join(', ')})` : ''}`);
  return bits.join(' — ');
}

// The people of the player's region, for the narrator.
function sceneBlock(state, { focus = null, limit = 3 } = {}) {
  const world = chronicle.worldOf(state);
  const regionKey = state.character && state.character.region;
  if (!world || !regionKey || !REGIONS[regionKey]) return '';
  const npcs = REGIONS[regionKey].npcs || [];
  if (!npcs.length) return '';
  const f = focus ? String(focus).toLowerCase() : null;
  const ordered = [...npcs].sort((a, b) => {
    const ah = chronicle.currentHolder(world, a).name.toLowerCase(), bh = chronicle.currentHolder(world, b).name.toLowerCase();
    return (f && bh.includes(f) ? 1 : 0) - (f && ah.includes(f) ? 1 : 0);
  });
  const lines = ordered.slice(0, limit).map(n => promptLine(profile(world, state, regionKey, n)));
  return `[People of ${REGIONS[regionKey].label} — facts to keep to; let them show only as the scene invites:\n${lines.map(l => `- ${l}`).join('\n')}]`;
}

// Retirement: older people hand their work on before they die, and
// live on in retirement; their deaths are recorded too.
function retire(world) {
  const out = [];
  if (!Array.isArray(world.retirees)) world.retirees = [];
  const today = chronicle.nowDay(world);
  for (const [regionKey, r] of Object.entries(REGIONS)) {
    for (const npc of r.npcs || []) {
      const rec = chronicle.npcRecord(world, npc);
      const age = Math.floor((today - rec.born) / chronicle.DAYS_PER_YEAR);
      const span = 68 + (hashInt(npc.id + rec.generation) % 25);      // the same span chronicle.ageNpcs uses
      const retireAt = span - 6 - (hashInt(npc.id + 'r' + rec.generation) % 8);
      if (age < retireAt || age >= span || hashInt(npc.id + 'k' + rec.generation) % 3 === 0) continue;  // some work till they drop
      const heirFirst = chronicle.HEIR_NAMES[hashInt(npc.id + 'apprentice' + rec.generation) % chronicle.HEIR_NAMES.length];
      const heir = `${heirFirst} ${String(rec.name).split(' ').slice(-1)[0]}`;
      require('./canon').person(world, rec.name, { role: npc.role, region: regionKey, born: chronicle.dateOf(rec.born * 24).year, retired: chronicle.dateOf(chronicle.nowHour(world)).year });
      const e = chronicle.addEvent(world, { type: 'retirement', importance: 3, title: `${rec.name} retires as ${npc.role} of ${r.label}; ${heir} takes up the work`, region: regionKey }, `retire:${npc.id}:${rec.generation}`);
      if (e) out.push(e);
      world.retirees.push({ name: rec.name, role: npc.role, region: regionKey, born: rec.born, dies: rec.born + span * chronicle.DAYS_PER_YEAR });
      world.npcs[npc.id] = { born: today - (24 + (hashInt(heir) % 12)) * chronicle.DAYS_PER_YEAR, generation: rec.generation + 1, name: heir, predecessor: rec.name, predecessorRetired: true };
    }
  }
  // Deaths in retirement.
  world.retirees = world.retirees.filter(x => {
    if (today < x.dies) return true;
    const age = Math.floor((x.dies - x.born) / chronicle.DAYS_PER_YEAR);
    const e = chronicle.addEvent(world, { type: 'death', title: `${x.name} dies at ${age}`, text: `${x.name}, once ${x.role} of ${REGIONS[x.region].label}, dies in retirement.`, region: x.region }, `retiree-death:${x.name}:${x.born}`);
    if (e) out.push(e);
    return false;
  });
  if (world.retirees.length > 400) world.retirees = world.retirees.slice(-400);
  return out;
}

module.exports = { profile, promptLine, sceneBlock, retire, goalOf, concernsOf, viewOf, relationsOf };
