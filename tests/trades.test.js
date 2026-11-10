'use strict';

// Professions and classes: every class can be earned by playing it; class
// paths at level 20; what each trade opens up in the world (commissions,
// voyages, the inn, contracts, masterworks); and a peaceful career that
// moves a life forward without a sword.
const { seedRandom, startServer, stopServer, client, createCharacter } = require('./helpers');
const test   = require('node:test');
const assert = require('node:assert/strict');
const { createFreshState } = require('../game/state');
const ch = require('../game/character');
const chronicle = require('../game/chronicle');
const tw = require('../game/trade-work');
const specs = require('../game/specializations');
const perks = require('../game/profession-perks');
const combat = require('../game/combat');
const prof = require('../game/professions');
const { CLASSES } = require('../game/constants');
const { REGIONS } = require('../game/constants');

function hero(name = 'Ash', level = 10, extra = {}) {
  const s = createFreshState();
  s.creation.phase = 5;
  s.character = { name, age: 30, gender: 'female', background: 'farmer', region: 'ironport' };
  s.stats = ch.calculateStats(25, 'farmer', 'average');
  s.totalXP = ch.getXPForLevel(level);
  ch.recalculateResources(s); s.hp = s.maxHp;
  s.coin = 100000; s.materials = { 'iron ore': 60, timber: 30 };
  s.characterId = `c_${name.toLowerCase()}`;
  Object.assign(s, extra);
  chronicle.bindCharacter(s, chronicle.createWorld({}));
  return { s, w: chronicle.worldOf(s) };
}

test('class audit: every class can be earned by playing it, and no class comes from ordinary talk', () => {
  for (const [key, cls] of Object.entries(CLASSES)) {
    const others = Object.entries(CLASSES).filter(([k]) => k !== key).flatMap(([, c]) => c.affinities);
    const own = cls.affinities.filter(a => !others.includes(a));
    assert.ok(own.length >= 2, `${key}: has words of its own (${own})`);
    const { s } = hero(`A${key}`);
    s.actionProgress = {};
    const sentence = `I ${own.slice(0, 2).join(' and ')} with everything I have`;
    let got = null, n = 0;
    while (!got && n < 40) { combat.updateActionProgress(s, sentence); got = prof.checkClassUnlock(s); n++; }
    assert.equal(got, key, `${key}: "${sentence}" earns it`);
    assert.ok(n <= Math.ceil(cls.requirement / 2) + 1, `${key}: in ${n} actions`);
  }
  const { s } = hero('Plain');
  s.actionProgress = {};
  for (const line of ['I walk down the road', 'I ask the innkeeper about the weather', 'I look around the square', 'I eat some bread'])
    for (let i = 0; i < 30; i++) combat.updateActionProgress(s, line);
  assert.equal(prof.checkClassUnlock(s), null, 'ordinary talk earns nothing');
});

test('class paths: two for every class, opened at level 20, chosen for life, and felt in combat', () => {
  assert.deepEqual(Object.keys(specs.SPECS).sort(), Object.keys(CLASSES).sort());
  for (const [k, two] of Object.entries(specs.SPECS)) assert.equal(Object.keys(two).length, 2, k);
  const { s } = hero('Path', 15, { combatClass: 'bard' });
  assert.match(specs.choose(s, 'valor').message, /opens at level 20/);
  s.totalXP = ch.getXPForLevel(21);
  const before = perks.combatMods(s, null);
  const r = specs.choose(s, 'the college of valor');
  assert.ok(r.success, r.message);
  assert.equal(s.specialization, 'valor');
  const after = perks.combatMods(s, null);
  assert.ok(after.dmg > before.dmg && after.armor < before.armor, 'more damage, less taken');
  assert.match(specs.choose(s, 'lore').message, /already walk the path/);
  assert.match(specs.listText(s), /► College of Valor/);
});

test('a commission from the named people here pays more and earns regard, once in a while', () => {
  const { s } = hero('Comm', 10, { profession: 'blacksmith', professionLevel: 2 });
  const c = tw.commissionFor(s);
  assert.ok(c && c.pay > 0 && /they want /.test(c.what), JSON.stringify(c));
  const coin = s.coin, xp = s.totalXP;
  const r = tw.takeCommission(s);
  assert.ok(r.success && s.coin === coin + c.pay && s.totalXP > xp, r.message);
  assert.ok(s.npcRelationships[c.npcId].rapport >= 6);
  assert.match(tw.takeCommission(s).message, /come back in a few days/);
});

test('a peaceful career: shifts of honest work raise a farmer to real levels, paid in years', () => {
  const { s } = hero('Field', 1, { profession: 'farmer', professionLevel: 1 });
  s.character.region = 'thornwick';
  REGIONS.thornwick.resources;            // farming is open-country work; Thornwick has fields
  let shifts = 0;
  while (ch.getPlayerLevel(s.totalXP) < 10 && shifts < 2000) {
    const r = perks.work(s, 8);
    assert.ok(r.success, r.message);
    shifts++;
  }
  assert.ok(ch.getPlayerLevel(s.totalXP) >= 10, `level 10 after ${shifts} shifts`);
  assert.ok(shifts >= 40 && shifts <= 700, `a working life, not a shortcut: ${shifts} shifts (${Math.round(shifts / 300 * 10) / 10} working years)`);
});

test('sailors: voyages between the ports, paid as crew; others pay passage; the sea has storms and pirates', () => {
  seedRandom(4);
  const { s } = hero('Salt', 15, { profession: 'sailor', professionLevel: 2 });
  const coin = s.coin;
  const r = tw.voyage(s, 'Salten Bay', { spawnEnemy: combat.spawnEnemy });
  assert.ok(r.success, r.message);
  assert.equal(s.character.region, 'saltenbay');
  assert.ok(s.coin > coin && r.hours === tw.voyageDays('ironport', 'saltenbay') * 24);
  const { s: p } = hero('Pass', 25);
  const c2 = p.coin;
  assert.ok(tw.voyage(p, 'Ember Coast', { spawnEnemy: combat.spawnEnemy }).success);
  assert.ok(p.coin < c2, 'passengers pay');
  p.character.region = 'thornwick';
  assert.match(tw.voyage(p, 'Ironport').message, /no harbour/);
  let pirates = 0, storms = 0;
  for (let i = 0; i < 60; i++) {
    const { s: q } = hero(`Q${i}`, 25, { profession: 'sailor' });
    const v = tw.voyage(q, 'saltenbay', { spawnEnemy: combat.spawnEnemy });
    if (v.spawn) pirates++; if (/storm/.test(v.message)) storms++;
  }
  assert.ok(pirates > 0 && storms > 0 && pirates + storms < 40, `pirates ${pirates}, storms ${storms}`);
});

test('innkeepers: the inn earns by the town\'s size and fortunes; a real innkeeper runs it better', () => {
  const { s, w } = hero('Tap', 20, { profession: 'innkeeper', professionLevel: 3 });
  const price = tw.innPrice(s, w, 'ironport');
  const r = tw.buyInn(s);
  assert.ok(r.success, r.message);
  assert.equal(s.coin, 100000 - price);
  chronicle.advanceTime(s, 30 * 24);
  w.settlements.ironport = { status: 'thriving', since: 0 };
  const good = tw.innTakings(s, w).coin;
  w.settlements.ironport = { status: 'struggling', since: 0 };
  const bad = tw.innTakings(s, w).coin;
  assert.ok(good > bad * 2, `fortunes matter (${good} vs ${bad})`);
  s.profession = 'farmer';
  assert.ok(tw.innTakings(s, w).coin < bad, 'an amateur runs it worse');
  s.profession = 'innkeeper';
  s.character.region = 'thornwick';
  assert.match(tw.collectInn(s).message, /Your inn is in Ironport/);
  s.character.region = 'ironport';
  const c0 = s.coin;
  const col = tw.collectInn(s);
  assert.ok(col.success && s.coin > c0);
  assert.equal(tw.innTakings(s, w).coin, 0, 'collected');
});

test('assassins: contracts on named people, with the law and the canon behind every killing', () => {
  seedRandom(2);
  const { s, w } = hero('Knife', 20, { profession: 'assassin', professionLevel: 3 });
  s.stats.dex = 30;
  const { s: farmer } = hero('Honest', 20, { profession: 'farmer' });
  assert.match(tw.takeContract(farmer, 1).message, /not in the trade/);
  const list = tw.contractsFor(s, w);
  assert.ok(list.length >= 1 && list.every(c => c.kind === 'npc'), 'no rulers below level 60');
  const roster = require('../game/companions').ROSTER;
  assert.ok(list.every(c => !Object.values(roster).some(r => r.name === c.target)), 'never a companion');
  assert.ok(tw.takeContract(s, 1).success);
  const c = s.contract;
  if (c.region !== s.character.region) {
    assert.match(tw.carryOut(s).message, new RegExp(`is in ${REGIONS[c.region].label}`));
    s.character.region = c.region;
  }
  const coin = s.coin;
  const r = tw.carryOut(s);
  assert.ok(r.success, r.message);
  assert.ok(s.coin > coin);
  assert.ok(s.deeds.some(d => d.type === 'murder' && d.victim === c.target), 'the deed is the player\'s');
  assert.notEqual(chronicle.currentHolder(w, REGIONS[c.region].npcs.find(n => n.id === c.npcId)).name, c.target, 'someone else holds the work now');
  assert.ok(w.canon.ledger.some(x => x.s.startsWith(c.target)), 'the death is in the canon');
  // At the top: a ruler.
  const { s: top, w: w2 } = hero('Shadow', 70, { profession: 'assassin', professionLevel: 5 });
  const rulerC = tw.contractsFor(top, w2).find(x => x.kind === 'ruler');
  assert.ok(rulerC, 'a ruler, at level 60+');
  top.contract = { ...rulerC, taken: chronicle.nowDay(w2), deadlineDay: chronicle.nowDay(w2) + 30 };
  top.character.region = rulerC.region;
  assert.ok(tw.carryOut(top).success);
  const L = require('../game/world-life').ensure(w2);
  assert.notEqual(L.dynasties[rulerC.faction].ruler.name, rulerC.target, 'the seat has passed');
  assert.ok(w2.canon.people[require('../game/canon').keyOf(rulerC.target)].died);
});

test('smiths: masterworks from real materials, and a name that rises to master', () => {
  const { s, w } = hero('Anvil', 30, { profession: 'weaponsmith', professionLevel: 1 });
  assert.match(tw.forgeMasterwork(s, 'forge a masterwork weapon').message, /trade level 2/);
  s.professionLevel = 3;
  const lvlTier = require('../game/constants').GEAR_QUALITIES.filter(q => 30 >= q.levelReq).pop().tier;
  const r = tw.forgeMasterwork(s, 'forge a masterwork weapon');
  assert.ok(r.success, r.message);
  const item = s.inventory.find(i => i && i.masterwork);
  assert.ok(item.tier > lvlTier, `better than the shops (${item.tier} > ${lvlTier})`);
  assert.equal(tw.smithRank(s), 'journeyman');
  tw.forgeMasterwork(s, 'forge a masterwork armour');
  tw.forgeMasterwork(s, 'forge a masterwork weapon');
  assert.equal(tw.smithRank(s), 'master');
  assert.ok(w.canon.ledger.some(x => /Anvil is named master smith/.test(x.s)));
  s.materials = { 'iron ore': 1, timber: 0 };
  assert.match(tw.forgeMasterwork(s, 'forge a masterwork weapon').message, /needs \d+ iron ore/);
});

test('over the API: opportunities, a voyage, and a path', async () => {
  seedRandom(6);
  const { base, sessions } = await startServer();
  try {
    const c = client(base);
    const g = await c.post('/auth/guest', {}); c.sessionId = g.sessionId;
    await createCharacter(c, { name: 'Gull' });
    const st = () => sessions.get(c.sessionId).state;
    Object.assign(st(), { profession: 'sailor', professionLevel: 2, combatClass: 'ranger' });
    st().totalXP = ch.getXPForLevel(22); ch.recalculateResources(st()); st().hp = st().maxHp;
    st().character.region = 'ironport';
    const o = await c.act('opportunities');
    assert.match(o.output, /Ships leave for: .*Salten Bay/);
    const v = await c.act('sign on for a voyage to Salten Bay');
    assert.match(v.output, /You sign on as crew/);
    assert.equal(st().character.region, 'saltenbay');
    const p = await c.act('paths');
    assert.match(p.output, /PATHS OF THE RANGER/);
    const sp = await c.act('specialize in marksman');
    assert.match(sp.output, /path of the Marksman/);
    assert.equal(st().specialization, 'marksman');
  } finally { await stopServer(); }
});
