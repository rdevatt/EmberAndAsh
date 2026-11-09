'use strict';

// The political simulation: legends and councils making war and peace on
// their personalities, wars with consequences, the player's choices, and
// persistence through a full restart.
const { seedRandom, startServer, stopServer, client, createCharacter } = require('./helpers');
const test   = require('node:test');
const assert = require('node:assert/strict');
const { createFreshState } = require('../game/state');
const ch = require('../game/character');
const chronicle = require('../game/chronicle');
const politics = require('../game/politics');
const { REGIONS } = require('../game/constants');

function worldWithHero(ending, flags, level = 150) {
  const s = createFreshState();
  s.creation.phase = 5;
  s.character = { name: 'Corvane', age: 30, gender: 'male', region: 'shattered_throne' };
  s.stats = ch.calculateStats(25, 'farmer', 'average');
  s.totalXP = ch.getXPForLevel(level);
  const w = chronicle.createWorld({});
  chronicle.bindCharacter(s, w);
  s.campaign = { flags, choices: {}, completed: [], startRegion: 'thornwick' };
  chronicle.applyEnding(w, s, ending);
  return { s, w };
}

function newcomer(w, region = 'thornwick', level = 3) {
  const n = createFreshState();
  n.creation.phase = 5;
  n.character = { name: 'Ash', age: 18, region };
  n.stats = ch.calculateStats(18, 'farmer', 'average');
  n.totalXP = ch.getXPForLevel(level);
  ch.recalculateResources(n); n.hp = n.maxHp;
  chronicle.attachWorld(n, w); n.characterId = 'c_newcomer';
  n.factions = { wardens: 0, compact: 0, remnant: 0, choir: -30 };
  return n;
}

test('decades of politics: legend-led wars, alliances, truces, casualties, bounded empires', () => {
  const { w } = worldWithHero('ascend', { emberTaken: true, soulsBound: true, tookPhylactery: true });
  const n = newcomer(w);
  chronicle.advanceTime(n, 40 * 360 * 24);
  const pol = w.history.filter(e => e.type === 'politics');
  assert.ok(pol.some(e => /declares war/.test(e.title)), 'wars are declared');
  assert.ok(pol.some(e => /allies with/.test(e.title)), 'alliances form');
  assert.ok(pol.some(e => /truce|makes peace/.test(e.title)), 'wars end');
  assert.ok(w.history.some(e => e.type === 'politics' && e.actor && e.actor.name === 'Corvane') || w.history.some(e => e.type === 'dominion' && e.actor && e.actor.name === 'Corvane'), 'the legend acts in their own name');
  assert.equal(politics.leaderOf(w, 'choir').name, 'Corvane', 'the ruthless sovereign leads the Choir');
  for (const f of politics.POWERS) assert.ok(Object.values(w.dominion).filter(x => x === f).length <= 20, `${f} stays bounded`);
  const years = new Set(pol.map(e => e.date.split(', ')[1]));
  assert.ok(years.size > 5, 'events are spread across the decades');
});

test('a merciful legend makes for a gentler world', () => {
  const harsh = worldWithHero('ascend', { emberTaken: true, soulsBound: true }).w;
  const kind = worldWithHero('rekindle', { shardReturned: true, soulsFreed: true, cantorSpared: true }).w;
  chronicle.advanceTime(newcomer(harsh), 30 * 360 * 24);
  chronicle.advanceTime(newcomer(kind), 30 * 360 * 24);
  const wars = w => w.history.filter(e => /declares war/.test(e.title)).length;
  assert.ok(wars(kind) <= wars(harsh), `fewer wars under the Long Fire (${wars(kind)} vs ${wars(harsh)})`);
});

test('the player can enlist, fight at the front, and broker peace — newcomers stay safe', () => {
  const { w } = worldWithHero('ascend', { emberTaken: true });
  politics.ensure(w);
  politics.setRelation(w, 'wardens', 'compact', 'war', 'test setup');
  const front = politics.fronts(w, 'wardens', 'compact')[0] || (() => { w.dominion.thornwick = 'wardens'; w.dominion.dustfall = 'compact'; return 'thornwick'; })();
  const n = newcomer(w, front, 3);
  assert.equal(politics.startBattle(n, w).success, false, 'no allegiance, no battle');
  assert.equal(politics.enlist(n, w, 'the wardens').success, true);
  const b = politics.startBattle(n, w);
  assert.equal(b.success, true);
  const [lo, hi] = REGIONS[n.character.region].levelRange;
  assert.ok(b.enemy.level >= lo && b.enemy.level <= hi, `front-line foes are of this region's calibre (${b.enemy.level})`);
  const before = politics.relation(w, 'wardens', 'compact').score;
  politics.onBattleWon(n, w, b.enemy.meta.war);
  assert.notEqual(politics.relation(w, 'wardens', 'compact').score, before, 'victories move the war');
  assert.equal(politics.negotiate(n, w, 'between the wardens and the compact').success, false, 'a nobody cannot end a war');
  n.factions.wardens = 50; n.factions.compact = 45;
  const peace = politics.negotiate(n, w, 'between the wardens and the compact');
  assert.equal(peace.success, true);
  assert.equal(politics.relation(w, 'wardens', 'compact').state, 'truce');
  assert.equal(politics.renounce(n).success, true);
});

test('rulers commit nations; war raises prices at the front', () => {
  const { s, w } = worldWithHero('ascend', { emberTaken: true });
  assert.equal(politics.declare(s, w, 'the wardens', 'truce').success, true, 'the Sovereign can make peace');
  assert.equal(politics.declare(s, w, 'the compact', 'war').success, false, 'already at war with the Compact');
  const r = politics.declare(s, w, 'the wardens', 'war');
  assert.equal(r.success, true, 'and can break the truce again');
  const n = newcomer(w); n.allegiance = null;
  assert.equal(politics.declare(n, w, 'the compact', 'war').success, false, 'commoners cannot');
  const front = politics.fronts(w, 'choir', 'wardens')[0] || politics.fronts(w, 'choir', 'compact')[0];
  if (front) assert.ok(politics.warPriceMult(w, front) > 1);
});

test('politics over the API, and through a full restart', async () => {
  seedRandom(41);
  const { base, sessions } = await startServer();
  const app = require('../server/app');
  try {
    const c = client(base);
    const g = await c.post('/auth/guest', {}); c.sessionId = g.sessionId;
    await createCharacter(c);
    const st = sessions.get(c.sessionId).state;
    const w = chronicle.worldOf(st);
    politics.ensure(w);
    w.dominion.thornwick = 'wardens'; w.dominion.dustfall = 'compact';
    politics.setRelation(w, 'wardens', 'compact', 'war', 'setup');
    const p = await c.act('politics');
    assert.match(p.output, /THE POWERS OF THE WORLD/);
    assert.match(p.output, /war/);
    const e = await c.act('enlist with the wardens');
    assert.match(e.output, /colours/);
    const fight = await c.act('fight in the war');
    assert.equal(fight.rightPanel.inCombat, true);
    for (let i = 0; i < 40 && sessions.get(c.sessionId).state.inCombat; i++) await c.act('I slash at its torso');
    await c.act('map');
    sessions.clear();
    app.worldStore.cache.clear();                          // force a reload from the database
    const back = await c.act('politics');
    assert.match(back.output, /Ember Wardens ↔ the Free Compact: war|the Ember Wardens ↔ the Free Compact: war|wardens.*war/i);
    assert.equal(sessions.get(c.sessionId).state.allegiance, 'wardens', 'allegiance kept');
  } finally {
    await stopServer();
  }
});
