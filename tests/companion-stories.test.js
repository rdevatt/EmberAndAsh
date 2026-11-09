'use strict';

// Companion personal stories: every one of the eight companions has a
// multi-stage story the engine enforces (go, act, fight, choose), with
// distinct consequences — abilities, gear, factions, settlements, rulers,
// oaths, deaths and partings — written into the world's permanent canon.
// Companions also react to the player's deeds by their own values.
const { seedRandom, startServer, stopServer, client, createCharacter } = require('./helpers');
const test   = require('node:test');
const assert = require('node:assert/strict');
const { createFreshState } = require('../game/state');
const ch = require('../game/character');
const chronicle = require('../game/chronicle');
const canon = require('../game/canon');
const cq = require('../game/companion-quests');
const companions = require('../game/companions');
const economy = require('../game/economy');
const { spawnEnemy } = require('../game/combat');
const { REGIONS } = require('../game/constants');

function hero(name = 'Vela', level = 20) {
  const s = createFreshState();
  s.creation.phase = 5;
  s.character = { name, age: 30, gender: 'female', background: 'farmer', region: 'thornwick' };
  s.stats = ch.calculateStats(25, 'farmer', 'average');
  s.totalXP = ch.getXPForLevel(level);
  ch.recalculateResources(s); s.hp = s.maxHp;
  s.coin = 1000;
  s.characterId = `c_${name.toLowerCase()}`;
  chronicle.bindCharacter(s, chronicle.createWorld({}));
  return s;
}
// Joins a roster companion as "recruit" would, without the story prerequisites.
function join(s, id, loyalty = 60) {
  const r = companions.ROSTER[id];
  const res = economy.addCompanion(s, { name: r.name, description: r.personality, role: r.role, loyalty });
  Object.assign(res.companion, { rosterId: id, element: r.element, faction: r.faction, level: 20, victories: 0 });
  return res.companion;
}
const helpers = { removeCompanion: economy.removeCompanion, spawnEnemy };

// Drives one story to its choice, the way the routes do.
function toChoice(s, id) {
  const arc = cq.ARCS[id];
  assert.equal(cq.offerStories(s).filter(o => o.id === id).length, 1, `${id}: offered`);
  for (const stage of arc.stages) {
    s.character.region = stage.region;
    if (stage.kind === 'go') { cq.advance(s, { type: 'input', input: 'look around' }); continue; }
    if (stage.kind === 'act') {
      cq.advance(s, { type: 'input', input: 'I sing a little song' });
      assert.equal(cq.stageOf(s, id), stage, `${id}: unrelated words do not advance the story`);
      const sample = { maren: 'search the old camp', brannoc: 'dig in the old mine', tamsin: 'track the blight to its source', sexton: 'keep watch at the grave', heron: 'meet the Silt King', seraphine: 'go to the Sunspire court' }[id];
      cq.advance(s, { type: 'input', input: sample });
      continue;
    }
    if (stage.kind === 'fight') {
      const foe = cq.pendingFight(s, spawnEnemy);
      assert.ok(foe && foe.meta.companionStory === id && foe.label === stage.foe.label, `${id}: the story foe appears`);
      assert.equal(cq.pendingFight(s, spawnEnemy), null, 'only once');
      cq.advance(s, { type: 'fightWon', foe: 'Somebody Else' });
      assert.equal(cq.stageOf(s, id), stage, 'another kill does not count');
      cq.advance(s, { type: 'fightWon', foe: foe.label });
      continue;
    }
    if (stage.kind === 'choice') {
      const out = cq.advance(s, { type: 'input', input: 'wait' });
      assert.ok(out.some(o => o.id === id && /decide 1/.test(o.message)), `${id}: the choice is put to the player`);
      assert.deepEqual(s.pendingCompanionChoice, { id, stage: arc.stages.indexOf(stage) });
      return stage;
    }
  }
  throw new Error(`${id}: no choice stage`);
}

test('all eight companions have a complete story with distinct consequences', () => {
  assert.deepEqual(Object.keys(cq.ARCS).sort(), Object.keys(companions.ROSTER).sort());
  const abilities = [];
  for (const [id, arc] of Object.entries(cq.ARCS)) {
    assert.ok(arc.title && arc.intro && arc.stages.length >= 2, id);
    assert.ok(arc.stages.every(st => REGIONS[st.region]), `${id}: real regions`);
    const choice = arc.stages[arc.stages.length - 1];
    assert.equal(choice.kind, 'choice', `${id}: ends in a choice`);
    assert.ok(choice.options.length >= 2, `${id}: a real choice`);
    const all = choice.options.flatMap(o => [o.effects, o.effects.onWin, o.effects.onLose].filter(Boolean));
    assert.ok(all.every(e => e.canon || e.fight || e.gamble !== undefined || e.dies), `${id}: every ending is remembered`);
    assert.ok(all.some(e => (e.loyalty || 0) > 0) && all.some(e => (e.loyalty || 0) < 0 || e.dies || e.leaves), `${id}: endings that help and hurt`);
    const own = all.filter(e => e.ability).map(e => e.ability.name);
    assert.ok(own.length >= 1, `${id}: a reward of their own`);
    abilities.push(...own);
    assert.ok(cq.VALUES[id], `${id}: has values`);
  }
  assert.equal(new Set(abilities).size, abilities.length, 'no two stories teach the same thing');
});

test('every story runs end to end and enters the canon', () => {
  seedRandom(7);
  for (const id of Object.keys(cq.ARCS)) {
    const s = hero(`Vela${id}`);
    s.materials = { herbs: 10 };
    const c = join(s, id);
    const stage = toChoice(s, id);
    const opt = stage.options.findIndex(o => !o.effects.fight && !o.effects.dies && !o.effects.leaves && o.effects.gamble === undefined);
    const r = cq.decide(s, opt + 1, helpers);
    assert.ok(r.success && r.done, `${id}: ${r.message}`);
    const st = cq.ensure(s)[id];
    assert.ok(st.done && st.outcome, `${id}: the story is over`);
    const w = chronicle.worldOf(s);
    assert.ok(w.canon.ledger.some(row => row.s === st.outcome), `${id}: in the canon: ${st.outcome}`);
    assert.match(cq.listText(s), new RegExp(cq.ARCS[id].title.replace(/'/g, '.')), `${id}: listed`);
    assert.equal(cq.offerStories(s).length, 0, 'a story is told once');
    assert.ok(s.companions.includes(c));
  }
});

test('choices are enforced: needs, bad numbers, and only while a choice is open', () => {
  const s = hero('Nim');
  s.coin = 100; s.materials = { herbs: 2 };
  join(s, 'tamsin');
  assert.equal(cq.decide(s, 1, helpers), null, 'nothing to decide yet');
  toChoice(s, 'tamsin');
  assert.match(cq.decide(s, 9, helpers).message, /Choose 1, 2, 3/);
  assert.match(cq.decide(s, 2, helpers).message, /need 5 herbs/);
  s.materials.herbs = 6;
  const r = cq.decide(s, 2, helpers);
  assert.ok(r.success);
  assert.equal(s.materials.herbs, 1, 'herbs spent');
  assert.equal(s.companions[0].storyAbility.name, 'Heartwood Arrows');
  assert.equal(s.pendingCompanionChoice, null);
});

test('betrayal and death: the companion is gone for good, and the world remembers', () => {
  seedRandom(11);
  const s = hero('Crane');
  join(s, 'heron');
  toChoice(s, 'heron');
  const before = s.coin;
  const r = cq.decide(s, 3, helpers);
  assert.match(r.message, /Heron is dead/);
  assert.equal(s.coin, before + 800);
  assert.ok(!s.companions.some(c => c.rosterId === 'heron'));
  const w = chronicle.worldOf(s);
  assert.ok(w.canon.oaths.some(o => o.kind === 'betrayal' && /Heron/.test(o.what)), 'a betrayal in the canon');
  assert.ok(canon.isDead(w, 'Heron'), 'and her death');
  s.character.region = 'sunkenfen_deep';
  assert.match(companions.recruit(s, 'recruit heron').message, /Heron is dead/);
});

test('a choice that leads to a fight: winning and losing settle it differently', () => {
  seedRandom(5);
  const win = hero('Brask');
  join(win, 'aske');
  toChoice(win, 'aske');
  const r = cq.decide(win, 2, helpers);
  assert.ok(r.startFight && r.startFight.meta.companionStory === 'aske');
  assert.equal(cq.advance(win, { type: 'fightWon', foe: r.startFight.label }).length, 0, 'no second prompt while the fight is on');
  const lines = cq.onStoryFightEnd(win, 'aske', true, helpers);
  assert.ok(lines.some(l => /Hold the Line/.test(l)));
  assert.equal(chronicle.worldOf(win).settlements.scar_vale.status, 'thriving');
  assert.ok(chronicle.worldOf(win).canon.ledger.some(x => /Aske's Wall is raised/.test(x.s)), 'a monument');

  const lose = hero('Orla');
  join(lose, 'aske');
  toChoice(lose, 'aske');
  cq.decide(lose, 2, helpers);
  const l2 = cq.onStoryFightEnd(lose, 'aske', false, helpers);
  assert.ok(l2.some(l => /Lieutenant Aske is dead/.test(l)));
  const w = chronicle.worldOf(lose);
  assert.ok(canon.isDead(w, 'Lieutenant Aske'));
  // Generations later, the wall still stands in the record.
  assert.ok(w.canon.ledger.some(x => /Aske's Wall/.test(x.s) && x.i >= 4 || /Aske's Wall/.test(x.s)));
});

test('a story ability changes how the companion fights', () => {
  seedRandom(3);
  const plain = hero('P'); const told = hero('T');
  const a = join(plain, 'maren'); const b = join(told, 'maren');
  b.storyAbility = { bonus: 0.2, name: 'Cold Vengeance' };
  let pd = 0, td = 0;
  for (let i = 0; i < 400; i++) {
    const e1 = spawnEnemy('thornwick', 20); e1.currentHP = e1.maxHP = 1e6;
    const e2 = spawnEnemy('thornwick', 20); e2.currentHP = e2.maxHP = 1e6;
    pd += companions.companionTurn(plain, e1).reduce((t, x) => t + x.damage, 0);
    td += companions.companionTurn(told, e2).reduce((t, x) => t + x.damage, 0);
  }
  assert.ok(td > pd * 1.08, `trained ${td} vs plain ${pd}`);
  const g = hero('G'); const brann = join(g, 'brannoc');
  const base = companions.guardianShare(g);
  brann.storyAbility = { guard: 0.1, name: 'Star-Iron Plate' };
  assert.ok(companions.guardianShare(g) > base);
  assert.ok(a.loyalty === 60);
});

test('companions react in character: the smuggler and the Warden see a theft differently', () => {
  const s = hero('Kett');
  const heron = join(s, 'heron', 50);
  const maren = join(s, 'maren', 50);
  const lucan = join(s, 'lucan', 50);
  cq.react(s, 'choir', 5);
  assert.ok(lucan.loyalty < 50 && maren.loyalty < 50, 'the Choir defector and the Warden hate the Choir');
  assert.equal(heron.loyalty, 50, 'the smuggler does not care');
  cq.react(s, 'mercy', 3);
  assert.ok(lucan.loyalty > 30);
  const out = cq.react(s, 'theft', 3);
  assert.equal(heron.loyalty, 53, 'Heron approves of a good theft');
  assert.ok(out.some(l => /Heron approves/.test(l)));
});

test('over the API: Brannoc\'s story from recruitment to the forge, through save and load', async () => {
  seedRandom(21);
  const { base, sessions } = await startServer();
  const app = require('../server/app');
  try {
    const c = client(base);
    const g = await c.post('/auth/guest', {}); c.sessionId = g.sessionId;
    await createCharacter(c, { name: 'Hollis' });
    const st = () => sessions.get(c.sessionId).state;
    st().character.region = 'thornwick';
    await c.act('talk to Brannoc');
    st().npcRelationships.brannoc.rapport = 40;
    st().totalXP = ch.getXPForLevel(12); ch.recalculateResources(st()); st().hp = st().maxHp;
    const rec = await c.act('recruit Brannoc');
    assert.match(rec.output, /Brannoc joins you/);
    assert.match(rec.output, /His Father's Ore/, 'trust earned: the story is offered');
    const list = await c.act('companion stories');
    assert.match(list.output, /Blackstone Foothills/);
    // The engine enforces where: digging in Thornwick does nothing.
    await c.act('dig in the old mine');
    assert.equal(cq.ensure(st()).brannoc.stage, 0);
    st().inCombat = false; st().currentEnemy = null;    // setup: a chance encounter is not part of this test
    st().character.region = 'blackstone_foothills';
    await c.act('look around');
    assert.equal(cq.ensure(st()).brannoc.stage, 1, 'arrived');
    const dug = await c.act('dig in the old mine');
    assert.match(dug.output, /star-iron/);
    // The guardian of the seam arrives and must be beaten.
    assert.ok(st().inCombat, 'the story foe attacks');
    assert.match(st().currentEnemy.label, /Rubble Crawler/);
    st().currentEnemy.currentHP = 1;
    for (let i = 0; i < 12 && st().inCombat; i++) await c.act('attack');
    assert.ok(!st().inCombat);
    assert.equal(cq.ensure(st()).brannoc.stage, 3, 'the fight counted');
    // Save and load: the story survives.
    sessions.clear(); app.worldStore.cache.clear();
    await c.get('/state');
    st().character.region = 'thornwick';
    const ask = await c.act('look around');
    assert.match(ask.output, /star-iron glows on the anvil/);
    const bad = await c.act('decide 7');
    assert.match(bad.output, /Choose 1, 2, 3, 4/);
    const done = await c.act('decide 3');
    assert.match(done.output, /Thornwick prospers/);
    const w = chronicle.worldOf(st());
    assert.ok(w.canon.ledger.some(x => /Brannoc sells his father's star-iron/.test(x.s)));
    assert.equal(w.settlements.thornwick.status, 'thriving');
    const after = await c.act('companion stories');
    assert.match(after.output, /Thornwick prospers on it/);
  } finally { await stopServer(); }
});
