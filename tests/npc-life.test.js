'use strict';

// NPC depth: goals, concerns from the actual world, views of the player,
// rivalries and friendships, retirement and successors — coherent across
// centuries and visible to the narrator as facts to keep to.
const { seedRandom, startServer, stopServer, client, createCharacter } = require('./helpers');
const test   = require('node:test');
const assert = require('node:assert/strict');
const { createFreshState } = require('../game/state');
const ch = require('../game/character');
const chronicle = require('../game/chronicle');
const crime = require('../game/crime');
const life = require('../game/npc-life');
const politics = require('../game/politics');
const { REGIONS } = require('../game/constants');

function hero(name = 'Tobin') {
  const s = createFreshState();
  s.creation.phase = 5;
  s.character = { name, age: 30, gender: 'male', background: 'farmer', region: 'thornwick' };
  s.stats = ch.calculateStats(25, 'farmer', 'average');
  s.totalXP = ch.getXPForLevel(10);
  ch.recalculateResources(s); s.hp = s.maxHp;
  s.characterId = `c_${name.toLowerCase()}`;
  chronicle.bindCharacter(s, chronicle.createWorld({}));
  return { s, w: chronicle.worldOf(s) };
}
const npc = (region, id) => REGIONS[region].npcs.find(n => n.id === id);

test('every named person has a goal that fits their work, and it is stable', () => {
  const { s, w } = hero();
  for (const [rk, r] of Object.entries(REGIONS)) for (const n of r.npcs || []) {
    const p = life.profile(w, s, rk, n);
    assert.ok(p.goal && p.goal.length > 8, `${n.name}: ${p.goal}`);
    assert.equal(life.profile(w, s, rk, n).goal, p.goal, 'stable');
    assert.ok(['admiring', 'friendly', 'wary', 'cold', 'hostile'].includes(p.view.word));
  }
  const smith = REGIONS.thornwick.npcs.find(n => /smith/.test(n.role));
  assert.match(life.profile(w, s, 'thornwick', smith).goal, /blade|apprentice|forge/);
});

test('concerns come from the world as it is: hard times, occupation, war, crisis, a recent death', () => {
  const { s, w } = hero();
  const hask = npc('thornwick', 'hask');
  const other = REGIONS.thornwick.npcs.find(n => n.id !== 'hask');
  assert.match(life.concernsOf(w, s, 'thornwick', other).join(' '), /war between the Ashen Choir and the Free Compact/, 'the world begins at war, and they feel it');
  for (const r of Object.values(politics.ensure(w))) r.state = 'peace';      // setup: a quiet world
  assert.equal(life.concernsOf(w, s, 'thornwick', other).length, 0, 'a quiet world, nothing on their mind');
  w.settlements.thornwick = { status: 'struggling', since: 0 };
  assert.match(life.concernsOf(w, s, 'thornwick', other).join(' '), /times are hard/);
  w.settlements.thornwick = { status: 'thriving', since: 0 };
  assert.match(life.concernsOf(w, s, 'thornwick', other).join(' '), /prospering/);
  delete w.settlements.thornwick;
  const occupier = other.faction === 'choir' ? 'wardens' : 'choir';
  chronicle.setDominion(w, 'thornwick', occupier, 'test');
  assert.match(life.concernsOf(w, s, 'thornwick', other).join(' '), /hold Thornwick.*hate it|hold .* now/);
  chronicle.setDominion(w, 'thornwick', other.faction, 'test');
  politics.setRelation(w, other.faction, other.faction === 'choir' ? 'wardens' : 'choir', 'war', 'test');
  if (politics.activeWars(w).length) assert.match(life.concernsOf(w, s, 'thornwick', other).join(' '), /war between/);
  crime.killNpc(w, { npc: hask, id: hask.id, name: hask.name });
  const c = life.concernsOf(w, s, 'thornwick', other).join(' ');
  assert.match(c, /Old Hask was found dead/, `neighbours still speak of it: ${c}`);
});

test('views of the player: the heir knows who killed their predecessor; a legend is admired', () => {
  const { s, w } = hero();
  const hask = npc('thornwick', 'hask');
  assert.equal(life.viewOf(w, s, hask).word, 'wary', 'a stranger');
  s.npcRelationships = { hask: { rapport: 90 } };
  assert.ok(['friendly', 'admiring'].includes(life.viewOf(w, s, hask).word), 'trust earned');
  crime.killNpc(w, { npc: hask, id: hask.id, name: hask.name });
  s.npcRelationships = {};
  s.deeds = [{ type: 'murder', victim: 'Old Hask', known: true, region: 'thornwick' }];
  const v = life.viewOf(w, s, hask);
  assert.equal(v.word, 'hostile');
  assert.ok(v.reasons.some(r => /killed Old Hask/.test(r)));
  const p = life.profile(w, s, 'thornwick', hask);
  assert.notEqual(p.name, 'Old Hask');
  assert.equal(p.predecessor, 'Old Hask');
  assert.match(life.promptLine(p), /took over from Old Hask \(dead\).*hostile/);
  // Infamy is felt by everyone.
  const { s: s2, w: w2 } = hero('Grim');
  s2.infamy = 80;
  assert.ok(['cold', 'hostile'].includes(life.viewOf(w2, s2, npc('thornwick', 'hask')).word));
});

test('rivalries and friendships among neighbours; heirs make their own', () => {
  const { w } = hero();
  const kinds = new Set();
  for (const [rk, r] of Object.entries(REGIONS)) for (const n of r.npcs || []) {
    const rel = life.relationsOf(w, rk, n);
    assert.equal(rel.length, Math.min(3, r.npcs.length - 1), `${n.name} knows their neighbours`);
    for (const x of rel) kinds.add(x.kind);
    for (const x of rel) {
      const back = life.relationsOf(w, rk, r.npcs.find(o => chronicle.currentHolder(w, o).name === x.name));
      const mine = back.find(b => b.name === chronicle.currentHolder(w, n).name);
      if (mine) assert.equal(mine.kind, x.kind, 'relations are mutual');
    }
  }
  assert.ok(kinds.has('rival') && kinds.has('friend'), `rivals and friends (${[...kinds]})`);
  // An heir's relations are their own.
  const hask = npc('thornwick', 'hask');
  const before = JSON.stringify(life.relationsOf(w, 'thornwick', hask).map(x => x.kind));
  let changed = false;
  for (let i = 0; i < 6 && !changed; i++) { crime.killNpc(w, { npc: hask, id: hask.id, name: chronicle.currentHolder(w, hask).name }); changed = JSON.stringify(life.relationsOf(w, 'thornwick', hask).map(x => x.kind)) !== before; }
  assert.ok(changed, 'successors do not simply inherit every friendship and feud');
});

test('two hundred years: people retire, hand on their work, die in retirement — all in the canon', () => {
  seedRandom(9);
  const { s, w } = hero('Ferris');
  chronicle.advanceTime(s, 200 * 360 * 24);
  const ledger = w.canon.ledger;
  const retired = ledger.filter(r => r.t === 'retirement');
  assert.ok(retired.length >= 10, `retirements (${retired.length})`);
  assert.ok(ledger.some(r => r.t === 'death' && /in retirement/.test(r.x || '')), 'deaths in retirement');
  const someone = w.canon.people[Object.keys(w.canon.people).find(k => w.canon.people[k].retired)];
  assert.ok(someone && someone.retired >= 1012);
  // Successors are coherent: one holder per role, each with a predecessor.
  for (const r of Object.values(REGIONS)) for (const n of r.npcs || []) {
    const rec = w.npcs[n.id];
    if (rec.generation > 1) assert.ok(rec.predecessor, `${n.id}: whose work they took up`);
    const age = Math.floor((chronicle.nowDay(w) - rec.born) / 360);
    assert.ok(age >= 0 && age < 100, `${rec.name} is ${age}`);
  }
  const heir = REGIONS.thornwick.npcs.map(n => chronicle.currentHolder(w, n)).find(h => h.heirOf);
  assert.ok(heir && /took on the work after .* (retired|died)/.test(heir.greet));
  assert.ok((w.retirees || []).every(x => x.dies > chronicle.nowDay(w)), 'no one is left alive past their span');
});

test('the narrator is given the people of the scene, with heirs\' real names', () => {
  const { s, w } = hero();
  const hask = npc('thornwick', 'hask');
  crime.killNpc(w, { npc: hask, id: hask.id, name: hask.name });
  const heir = chronicle.currentHolder(w, hask).name;
  s.currentNPC = heir;
  const block = life.sceneBlock(s, { focus: heir, limit: 2 });
  assert.match(block, new RegExp(`- ${heir}, miller`));
  const prompt = require('../game/narrative/core').buildFullPrompt(s, 'I talk with the miller');
  assert.match(prompt, /People of Thornwick/);
  s.inCombat = true; s.currentEnemy = { label: 'Wolf', currentHP: 5, maxHP: 10, behavior: 'x', desc: '' };
  assert.doesNotMatch(require('../game/narrative/core').buildFullPrompt(s, 'attack'), /People of Thornwick/, 'not in the middle of a fight');
});

test('over the API: talking to an heir shows who they are and what is on their mind', async () => {
  seedRandom(17);
  const { base, sessions } = await startServer();
  try {
    const c = client(base);
    const g = await c.post('/auth/guest', {}); c.sessionId = g.sessionId;
    await createCharacter(c, { name: 'Pell' });
    const st = () => sessions.get(c.sessionId).state;
    st().character.region = 'thornwick';
    const w = chronicle.worldOf(st());
    const hask = npc('thornwick', 'hask');
    crime.killNpc(w, { npc: hask, id: hask.id, name: hask.name });
    w.settlements.thornwick = { status: 'struggling', since: 0 };
    const heir = chronicle.currentHolder(w, hask).name;
    const r = await c.act(`talk to ${heir.split(' ')[0]}`);
    assert.match(r.output, new RegExp(`${heir}.*took on the work after Old Hask died`, 's'));
    assert.match(r.output, /things on their mind: (times are hard|they still speak of it)/);
  } finally { await stopServer(); }
});
