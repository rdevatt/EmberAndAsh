'use strict';

// Adventures built from world state: eleven kinds, each with enforced
// steps (place, words, people, coin, materials, days of work, persuasion
// rolls, fights, choices), deadlines, failures that cost something, and
// consequences written into the world.
const { seedRandom, startServer, stopServer, client, createCharacter } = require('./helpers');
const test   = require('node:test');
const assert = require('node:assert/strict');
const { createFreshState } = require('../game/state');
const ch = require('../game/character');
const chronicle = require('../game/chronicle');
const adv = require('../game/adventures');
const wl = require('../game/world-life');
const politics = require('../game/politics');
const crime = require('../game/crime');
const { spawnEnemy } = require('../game/combat');
const { REGIONS } = require('../game/constants');

function hero(name = 'Sable', level = 25) {
  const s = createFreshState();
  s.creation.phase = 5;
  s.character = { name, age: 30, gender: 'female', background: 'farmer', region: 'thornwick' };
  s.stats = ch.calculateStats(25, 'farmer', 'average');
  s.stats.cha = 30;
  s.totalXP = ch.getXPForLevel(level);
  ch.recalculateResources(s); s.hp = s.maxHp;
  s.coin = 50000; s.materials = { wood: 20, stone: 20, herbs: 5 };
  s.characterId = `c_${name.toLowerCase()}`;
  s.campaign = { flags: {}, choices: {}, completed: [], startRegion: 'thornwick' };
  chronicle.bindCharacter(s, chronicle.createWorld({}));
  return { s, w: chronicle.worldOf(s) };
}
// A world with something for every kind of adventure to stand on.
function richWorld(name) {
  const { s, w } = hero(name);
  chronicle.addEvent(w, { type: 'founding', importance: 4, title: 'The Old Mill of Thornwick burns', region: 'thornwick' });
  chronicle.advanceTime(s, 45 * 360 * 24);
  s.character.region = 'thornwick';
  const hask = REGIONS.thornwick.npcs.find(n => n.id === 'hask');
  crime.killNpc(w, { npc: hask, id: hask.id, name: chronicle.currentHolder(w, hask).name });
  w.unsolved = [{ id: 'u1', victim: chronicle.npcRecord(w, hask).predecessor, region: 'thornwick', clues: 40 }];
  w.settlements.dustfall = { status: 'struggling', since: chronicle.nowDay(w) };
  politics.setRelation(w, 'wardens', 'remnant', 'war', 'test');
  // A front: the two sides hold neighbouring regions.
  chronicle.setDominion(w, 'thornwick', 'wardens', 'test');
  chronicle.setDominion(w, REGIONS.thornwick.adjacent[0], 'remnant', 'test');
  const L = wl.ensure(w);
  L.dynasties.remnant.dispute = { claimant: { name: 'Cassia Aurel', born: chronicle.nowDay(w) - 30 * 360, trait: 'ambitious' }, since: chronicle.nowDay(w) };
  w.organizations.push({ name: 'the Lantern College', founder: 'Ilsa', founderId: 'x', seat: 'oakhaven', members: 200, status: 'open' });
  s.lineage = { parentName: 'Marrow' };
  return { s, w };
}

// Plays the current adventure through, step by step, as a player would.
function play(s, w, { choose = 1 } = {}) {
  const a = adv.current(s);
  const log = [];
  for (let guard = 0; guard < 40 && adv.current(s); guard++) {
    const st = adv.stepOf(a);
    if (st.kind === 'go') { s.character.region = st.region; const r = adv.onEvent(s, w, { type: 'arrived', region: st.region }); log.push(r && r.message); continue; }
    if (st.region) s.character.region = st.region;
    if (st.kind === 'choice' || s.pendingAdventureChoice) { const r = adv.decide(s, w, choose, { spawnEnemy }); log.push(r.message); continue; }
    if (st.kind === 'fight') {
      const r = adv.handle(s, w, `attack the ${st.foe}`, { spawnEnemy });
      assert.ok(r && r.spawn && r.spawn.meta.adventure === a.id, `${a.kind}: the foe appears`);
      assert.equal(r.spawn.label, st.foe);
      const k = adv.onEvent(s, w, { type: 'kill', meta: r.spawn.meta });
      log.push(k && k.message); continue;
    }
    const quoted = (st.text.match(/"([^"]+)"/) || [])[1];
    const input = st.kind === 'talk' ? `talk to ${st.who}` : quoted;
    assert.ok(input, `${a.kind}: ${st.kind} step says what to do: ${st.text}`);
    const times = st.kind === 'work' ? st.count : 1;
    for (let i = 0; i < times; i++) { const r = adv.handle(s, w, input, { spawnEnemy }); assert.ok(r, `${a.kind}: "${input}" counts`); log.push(r.message); }
  }
  return log.join('\n');
}

test('every kind of adventure can be built from a world that gives it ground, and played to its end', () => {
  seedRandom(3);
  const { s, w } = richWorld('Tarn');
  const kinds = Object.keys(adv.KINDS);
  assert.equal(kinds.length, 11);
  for (const k of kinds) {
    s.character.region = 'thornwick';
    const a = adv.KINDS[k](s, w, `seed:${k}`);
    assert.ok(a, `${k}: built from this world`);
    // Set up as offers() would.
    s.adventureOffers = [Object.assign(a, { id: `t_${k}`, step: 0, level: 25, reward: { xp: 1000, coin: 500 } })];
    if (a.steps[0].kind === 'go' && a.steps[0].region === s.character.region) a.steps.shift();
    const t = adv.take(s, w, 1);
    assert.ok(t.success, t.message);
    const xp0 = s.totalXP;
    const log = play(s, w);
    assert.equal(s.adventure.outcome, 'done', `${k}: done\n${log}`);
    assert.ok(s.totalXP > xp0, `${k}: rewarded`);
    if (a.success && a.success.canon || a.steps.some(x => x.kind === 'choice')) assert.ok(w.canon.ledger.some(r => r.t === 'adventure' && /Tarn/.test(r.s)), `${k}: remembered`);
  }
  assert.equal(s.adventuresDone, 11);
});

test('offers come from the world, vary, and a bare world still offers something', () => {
  const { s, w } = richWorld('Uma');
  const a = adv.offers(s, w);
  assert.equal(a.length, 3);
  assert.equal(new Set(a.map(x => x.kind)).size, 3, 'three different kinds');
  const seen = new Set();
  for (let i = 0; i < 12; i++) { s.adventuresDone = i; for (const o of adv.offers(s, w)) seen.add(o.kind); }
  assert.ok(seen.size >= 8, `variety over time (${[...seen]})`);
  const bare = hero('Vik');
  for (const r of Object.values(politics.ensure(bare.w))) r.state = 'peace';
  assert.ok(adv.offers(bare.s, bare.w).length >= 2, 'even a quiet world has work');
});

test('steps are enforced: the right place, the right words, coin, materials, and persuasion with limited tries', () => {
  seedRandom(1);
  const { s, w } = richWorld('Wynn');
  // Trade: pay first; not enough coin is refused.
  const trade = Object.assign(adv.KINDS.trade(s, w, 'x'), { id: 't1', step: 0, level: 25, reward: { xp: 10, coin: 10 } });
  s.adventureOffers = [trade]; adv.take(s, w, 1);
  s.coin = 5;
  assert.match(adv.handle(s, w, 'buy the grain').message, /need \d+ copper/);
  s.coin = 50000;
  assert.equal(adv.handle(s, w, 'I whistle a tune'), null, 'unrelated words do nothing');
  assert.ok(adv.handle(s, w, 'buy the grain'));
  assert.match(adv.handle(s, w, 'deliver the grain').message, new RegExp(`That is in ${REGIONS[trade.region].label}`), 'not here');
  adv.abandon(s, w);
  // Construction: materials are needed.
  s.character.region = 'thornwick';
  const build = Object.assign(adv.KINDS.construction(s, w, 'y'), { id: 't2', step: 0, level: 25, reward: { xp: 10, coin: 10 } });
  s.adventureOffers = [build]; adv.take(s, w, 1);
  const mat = build.steps[0].material;
  s.materials[mat] = 2;
  assert.match(adv.handle(s, w, `deliver the ${mat}`).message, /you need 6/);
  adv.abandon(s, w);
  // Negotiation: three failed rolls end it, at a cost.
  const neg = Object.assign(adv.KINDS.negotiation(s, w, 'z'), { id: 't3', step: 0, level: 25, reward: { xp: 10, coin: 10 } });
  if (neg.steps[0].kind === 'go') neg.steps.shift();
  s.character.region = neg.region;
  s.adventureOffers = [neg]; adv.take(s, w, 1);
  adv.handle(s, w, 'meet the envoy');
  s.stats.cha = -40;
  const before = { ...s.factions };
  let r;
  for (let i = 0; i < 3; i++) r = adv.handle(s, w, 'persuade the councils');
  assert.ok(r.failed, r.message);
  assert.match(r.message, /The talks are over/);
  assert.ok(s.factions.wardens < (before.wardens || 0), 'the failure costs standing');
  assert.equal(politics.relation(w, 'wardens', 'remnant').state, 'war', 'and the war goes on');
});

test('deadlines: a rescue left too long ends in a death the world remembers', () => {
  const { s, w } = richWorld('Xan');
  const a = Object.assign(adv.KINDS.rescue(s, w, 'r'), { id: 't4', step: 0, level: 25, reward: { xp: 10, coin: 10 } });
  s.adventureOffers = [a]; adv.take(s, w, 1);
  chronicle.advanceTime(s, 25 * 24);
  const r = adv.checkDeadline(s, w);
  assert.ok(r && r.failed, 'it fails when time runs out');
  const captive = a.fail.death;
  assert.ok(w.canon.people[require('../game/canon').keyOf(captive)].died, 'the captive is dead in the canon');
  assert.ok(w.canon.ledger.some(x => x.s.includes(`${captive}, taken on the road`)));
  assert.equal(adv.current(s), null);
});

test('consequences change the world: a truce, a throne, a held front, a new well', () => {
  seedRandom(8);
  const { s, w } = richWorld('Yeva');
  const run = (k, choose = 1) => {
    s.character.region = 'thornwick';
    const a = Object.assign(adv.KINDS[k](s, w, `c:${k}`), { id: `c_${k}`, step: 0, level: 25, reward: { xp: 10, coin: 10 } });
    s.adventureOffers = [a]; adv.take(s, w, 1);
    play(s, w, { choose });
    return a;
  };
  s.stats.cha = 60;
  run('negotiation');
  assert.equal(politics.relation(w, 'wardens', 'remnant').state, 'truce');
  run('intrigue', 2);
  assert.equal(wl.rulerOf(w, 'remnant').name, 'Cassia Aurel', 'the letters put the claimant on the throne');
  assert.ok(w.canon.reigns.some(r => r.ruler === 'Cassia Aurel'));
  const cap0 = wl.econ(w, 'thornwick').cap;
  run('construction');
  assert.ok(wl.econ(w, 'thornwick').cap > cap0, 'the land can feed more');
  assert.ok(w.canon.foundations.some(f => f.founder === 'Yeva'));
  const tr = run('trade');
  assert.equal(w.settlements[tr.region].status, 'rebuilding');
  run('research', 2);
  assert.ok(s.inventory.some(i => i && i.type === 'keepsake'), 'kept the relic');
  assert.ok(Object.values(w.canon.artifacts).some(x => x.owners.some(o => o.owner === 'Yeva')), 'the canon knows who holds it');
});

test('over the API: ask for work, take it, play a step, see it on the status', async () => {
  seedRandom(12);
  const { base, sessions } = await startServer();
  try {
    const c = client(base);
    const g = await c.post('/auth/guest', {}); c.sessionId = g.sessionId;
    await createCharacter(c, { name: 'Zell' });
    const st = () => sessions.get(c.sessionId).state;
    st().totalXP = ch.getXPForLevel(12); ch.recalculateResources(st()); st().hp = st().maxHp;
    st().character.region = 'thornwick';
    const list = await c.act('adventures');
    assert.match(list.output, /WORK THE WORLD NEEDS[\s\S]*1\. [\s\S]*take adventure N/);
    const took = await c.act('take adventure 1');
    assert.match(took.output, /You take on/);
    const a = st().adventure;
    assert.ok(a && a.deadlineDay > 0);
    const status = await c.act('adventures');
    assert.match(status.output, new RegExp(a.title.replace(/[()?]/g, '.')));
    assert.match(status.output, /days left/);
    const ab = await c.act('abandon adventure');
    assert.match(ab.output, /has failed/);
    assert.equal(st().adventure.outcome, 'failed');
  } finally { await stopServer(); }
});
