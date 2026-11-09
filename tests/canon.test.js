'use strict';

// The world's permanent canon: important events and relationships kept
// indefinitely (the display chronicle is capped), retrieved for the
// narrator when a scene touches them — across centuries, generations,
// family lines, save/load and restarts, and never contradicted.
const { seedRandom, startServer, stopServer, client, createCharacter } = require('./helpers');
const test   = require('node:test');
const assert = require('node:assert/strict');
const { createFreshState } = require('../game/state');
const ch = require('../game/character');
const chronicle = require('../game/chronicle');
const canon = require('../game/canon');
const memory = require('../game/narrative/memory');
const crime = require('../game/crime');
const { REGIONS } = require('../game/constants');

function hero(name = 'Corvane', level = 120) {
  const s = createFreshState();
  s.creation.phase = 5;
  s.character = { name, age: 30, gender: 'male', background: 'farmer', region: 'thornwick' };
  s.stats = ch.calculateStats(25, 'farmer', 'average');
  s.totalXP = ch.getXPForLevel(level);
  s.maxHp = s.maxMana = s.maxStamina = 0; ch.recalculateResources(s); s.hp = s.maxHp;
  const w = chronicle.createWorld({});
  chronicle.bindCharacter(s, w);
  s.characterId = `c_${name.toLowerCase()}`;
  s.campaign = { flags: { emberTaken: true }, choices: {}, completed: [], startRegion: 'thornwick' };
  return { s, w };
}
function newcomer(w, name = 'Ash', region = 'thornwick') {
  const n = createFreshState();
  n.creation.phase = 5;
  n.character = { name, age: 18, region };
  n.stats = ch.calculateStats(18, 'farmer', 'average');
  n.totalXP = ch.getXPForLevel(3);
  ch.recalculateResources(n); n.hp = n.maxHp;
  chronicle.attachWorld(n, w); n.characterId = `c_${name.toLowerCase()}`;
  return n;
}

test('three hundred years: the founding deeds outlive the display log and reach a newcomer', () => {
  seedRandom(3);
  const { s, w } = hero();
  chronicle.applyEnding(w, s, 'ascend');
  const hask = REGIONS.thornwick.npcs.find(n => n.id === 'hask');
  crime.killNpc(w, { npc: hask, id: hask.id, name: hask.name });
  chronicle.addEvent(w, { type: 'founding', importance: 4, title: 'Corvane founds the Order of the Grey Lantern', region: 'thornwick', actor: chronicle.actorOf(s) });
  canon.oath(w, { by: 'Corvane', to: 'the people of Thornwick', what: 'swore the valley would never again starve', kind: 'promise' });
  const n = newcomer(w);
  chronicle.advanceTime(n, 300 * 360 * 24);
  const year = chronicle.dateOf(chronicle.nowHour(w)).year;
  assert.ok(year >= 1312);
  assert.ok(w.canon.ledger.some(r => r.t === 'ending' && r.y === 1012), 'the ending of 1012 is in the canon');
  assert.ok(w.canon.reigns.length >= 1 && w.canon.choices.length >= 1, 'reigns and great choices recorded');
  assert.ok(w.canon.wars.length > 0 && w.canon.treaties.length > 0, 'three centuries of wars and treaties');
  const p = w.canon.people[canon.keyOf(hask.name)];
  assert.equal(p.died, 1012); assert.equal(p.cause, 'murdered'); assert.ok(p.successor, 'and who took up the work');
  const block = memory.promptBlock(n, 'I ask the villagers about Old Hask and the Grey Lantern order');
  assert.match(block, /Old Hask.*died 1012 \(murdered\)/, 'a murder 300 years ago is known when it comes up');
  assert.match(block, /Grey Lantern, founded by Corvane in 1012/, 'the order still stands in the valley');
  assert.match(memory.promptBlock(n, 'I ask who swore to keep the valley fed'), /swore the valley would never again starve/, 'an old oath is remembered');
});

test('the canon is never contradicted: a note cannot raise the dead', () => {
  const { s, w } = hero('Ilsa');
  const hask = REGIONS.thornwick.npcs.find(x => x.id === 'hask');
  crime.killNpc(w, { npc: hask, id: hask.id, name: hask.name });
  s.actionCount = 5;
  memory.record(s, { input: 'I look around', narrative: 'Quiet.', notes: [{ name: 'Old Hask', kind: 'person', fact: 'he waves from the mill, alive and well' }] });
  assert.ok(!Object.values(s.memory.entities).some(e => e.name === 'Old Hask' && e.facts.some(f => /alive/.test(f.text))), 'the false note is not kept');
  s.actionCount = 6;
  memory.record(s, { input: 'I visit the grave', narrative: 'A stone.', notes: [{ name: 'Old Hask', kind: 'person', fact: 'his grave lies behind the mill' }] });
  assert.ok(Object.values(s.memory.entities).some(e => e.name === 'Old Hask' && e.facts.some(f => /grave/.test(f.text))), 'true things about the dead are kept');
  assert.match(memory.promptBlock(s, 'I go to see Old Hask'), /died \d+ \(murdered\)/, 'and the narrator is told he is dead');
});

test('the ledger stays bounded but keeps every major event verbatim', () => {
  const { w } = hero('Tamsin');
  for (let i = 0; i < 16000; i++) chronicle.addEvent(w, { type: 'dominion', importance: 3, title: `A minor border shift number ${i}`, region: 'dustfall' });
  for (let i = 0; i < 5; i++) chronicle.addEvent(w, { type: 'death', importance: 5, title: `Great King ${i} dies at 90`, region: 'ironport' });
  assert.ok(w.canon.ledger.length <= 12500, `bounded (${w.canon.ledger.length})`);
  for (let i = 0; i < 5; i++) assert.ok(w.canon.ledger.some(r => r.s === `Great King ${i} dies at 90`), 'major events are kept word for word');
  assert.ok(w.canon.ledger.some(r => r.t === 'summary'), 'old minor events are folded into summaries');
  assert.ok(w.history.length <= 2000, 'the display log is capped as before');
  assert.ok(canon.size(w) < 3000000, 'and the canon stays a reasonable size');
});

test('separate worlds keep separate canons', () => {
  const a = hero('Aldren').w;
  const b = hero('Brisa').w;
  chronicle.addEvent(a, { type: 'founding', importance: 4, title: 'Aldren founds the Ashen Library', region: 'ironport' });
  assert.ok(a.canon.foundations.length === 1);
  assert.equal(canon.ensure(b).foundations.length, 0, 'nothing leaks between worlds');
});

test('family lines and marriage over the API, through a full restart', async () => {
  seedRandom(41);
  const { base, sessions } = await startServer();
  const app = require('../server/app');
  try {
    const c = client(base);
    const g = await c.post('/auth/guest', {}); c.sessionId = g.sessionId;
    await createCharacter(c, { name: 'Marrow' });
    const st = () => sessions.get(c.sessionId).state;
    // Marriage: a lover who trusts you deeply.
    await c.act('talk to Brannoc');
    st().npcRelationships.brannoc.rapport = 90;
    await c.post('/settings/content', { adultConfirmed: true });
    await c.act('spend the night with Brannoc');
    await c.act('stop');
    const wed = await c.act('marry Brannoc');
    assert.match(wed.output, /you are wed/);
    const w = chronicle.worldOf(st());
    assert.ok(w.canon.relations.some(r => r.kind === 'married' && r.a === 'Marrow' && r.b === 'Brannoc'));
    // The story ends; a child of Marrow takes up the world 25 years later.
    st().campaign.ending = 'rekindle';
    chronicle.applyEnding(w, st(), 'rekindle');
    const next = await c.act('new character in this world as the child of Marrow, 25 years later');
    assert.equal(next.inCreation, true, JSON.stringify(next).slice(0, 200));
    await c.act('My name is Wren, I am 19 years old and female');
    await c.act('Short, red hair');
    await c.act('1');
    await c.act('3');
    assert.equal(st().lineage.parentName, 'Marrow');
    assert.ok(w.canon.people.wren.parents.includes('Marrow'), 'the canon knows the family');
    assert.match(memory.promptBlock(st(), 'I ask about my mother'), /child of Marrow/);
    assert.match(memory.promptBlock(st(), 'I visit Brannoc'), /married Brannoc|married Marrow/, 'and her marriage');
    // Restart: the canon comes back from the database.
    await c.act('map');
    sessions.clear(); app.worldStore.cache.clear();
    await c.get('/state');
    const w2 = chronicle.worldOf(sessions.get(c.sessionId).state);
    assert.ok(w2.canon.relations.some(r => r.kind === 'married'), 'kept through a restart');
    assert.ok(w2.canon.people.wren.parents.includes('Marrow'));
    const bad = await c.act('new character in this world as the child of Nobody Ever, 5 years later');
    assert.match(bad.output || bad.error || '', /No one called/);
  } finally { await stopServer(); }
});
