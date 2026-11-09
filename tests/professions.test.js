'use strict';

// Twelve professions, each with a combat edge, a living and a skill of its
// own — balanced against each other (scripts/profession-sweep.js measures
// combat; these tests pin the structure, income and skills).
const { seedRandom, startServer, stopServer, client, createCharacter } = require('./helpers');
const test   = require('node:test');
const assert = require('node:assert/strict');
const { createFreshState } = require('../game/state');
const ch = require('../game/character');
const chronicle = require('../game/chronicle');
const combat = require('../game/combat');
const perks = require('../game/profession-perks');
const { PROFESSIONS, REGIONS } = require('../game/constants');

function worker(prof, region = 'ironport', rank = 3) {
  const s = createFreshState();
  s.creation.phase = 5;
  s.character = { name: 'Ada', age: 30, gender: 'female', background: 'farmer', region };
  s.stats = ch.calculateStats(25, 'farmer', 'average');
  s.totalXP = ch.getXPForLevel(30);
  s.profession = prof; s.professionLevel = rank; s.coin = 0; s.materials = {};
  s.maxHp = s.maxMana = s.maxStamina = 0; ch.recalculateResources(s); s.hp = s.maxHp;
  chronicle.bindCharacter(s, chronicle.createWorld({})); s.factions = {};
  return s;
}

test('thirty-nine professions, each with an edge, a living and a skill', () => {
  assert.equal(Object.keys(PROFESSIONS).length, 39);
  for (const k of ['carpenter', 'wainwright', 'carver', 'bowyer', 'woodsman']) assert.ok(PROFESSIONS[k], `${k} is its own trade`);
  for (const k of Object.keys(PROFESSIONS)) {
    const p = perks.PERKS[k];
    assert.ok(p && p.edge && p.work && p.skill, `${k} is fully defined`);
    assert.ok(Object.keys(p.combat).length >= 1, `${k} has a combat edge`);
  }
  const kinds = new Set(Object.values(perks.PERKS).map(p => Object.keys(p.combat).sort().join('+')));
  assert.ok(kinds.size >= 25, 'and the edges differ in kind');
});

test('every trade earns the same expected living per hour', () => {
  const MATERIAL_VALUE = { hide: 6, timber: 5, 'iron ore': 7, herbs: 4 };
  const per = {};
  for (const k of Object.keys(PROFESSIONS)) {
    if (perks.PERKS[k].work.risk) continue;           // risky trades are measured below
    seedRandom(9);
    const region = perks.PERKS[k].work.where === 'wild' ? 'wyrmwood' : 'ironport';
    let v = 0;
    for (let i = 0; i < 60; i++) {
      const s = worker(k, region);
      perks.work(s, 8);
      v += s.coin + Object.entries(s.materials).reduce((t, [m, q]) => t + q * (MATERIAL_VALUE[m] || 6) * (REGIONS[region].tier || 1), 0);
    }
    per[k] = v / 60 / (REGIONS[region].tier || 1);
  }
  const vals = Object.values(per);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  for (const [k, v] of Object.entries(per)) assert.ok(Math.abs(v - mean) / mean < 0.15, `${k} earns ${v.toFixed(1)} per tier (mean ${mean.toFixed(1)})`);
  // The thief is paid more for the risk of being caught.
  seedRandom(4);
  let caught = 0, pay = 0;
  for (let i = 0; i < 200; i++) { const s = worker('thief'); crime(s); perks.work(s, 8); pay += s.coin; if ((s.deeds || []).length) caught++; }
  assert.ok(pay / 200 > mean * 1.2, 'better pay');
  assert.ok(caught > 0 && caught < 60, `and a real chance of being caught (${caught}/200)`);
  function crime(s) { require('../game/crime').ensure(s); }
  assert.equal(perks.work(worker('scholar', 'shattered_throne'), 8).success, false, 'town trades need a town');
});

test('edges grow with rank and change real combat numbers', () => {
  const lo = perks.combatMods(worker('miner', 'ironport', 1), null);
  const hi = perks.combatMods(worker('miner', 'ironport', 5), null);
  assert.ok(hi.armor < lo.armor && lo.armor < 1, 'more rank, less damage taken');
  const e = { traits: { tags: ['beast'] }, label: 'Wolf' };
  assert.ok(perks.combatMods(worker('hunter'), e).dmg > perks.combatMods(worker('hunter'), { traits: { tags: [] } }).dmg, 'hunters hit beasts harder');
  assert.ok(worker('woodsman').maxHp > worker('scholar').maxHp, 'woodsmen are hardier');
});

test('trade skills: treat, sharpen, shelter, prospect; and in a fight: study, bribe, steal', () => {
  seedRandom(2);
  const doc = worker('physician'); doc.hp = Math.round(doc.maxHp * 0.3);
  const h0 = doc.hp;
  assert.equal(perks.useSkill(doc, perks.detectSkill(doc, 'I treat my wounds')).success, true);
  assert.ok(doc.hp > h0);
  const smith = worker('blacksmith');
  perks.useSkill(smith, perks.detectSkill(smith, 'I sharpen my blade'));
  assert.ok(perks.combatMods(smith, null).weapon > perks.combatMods(worker('blacksmith'), null).weapon);
  const miner = worker('miner', 'blackstone_foothills');
  perks.useSkill(miner, perks.detectSkill(miner, 'I prospect for ore'));
  assert.ok(miner.materials['iron ore'] >= 1);
  assert.equal(perks.detectSkill(worker('cook'), 'I sharpen my blade'), null, 'only the trade that knows it');

  const fightWith = (prof, label) => {
    const s = worker(prof, 'thornwick'); s.coin = 1000;
    s.inCombat = true; s.currentEnemy = combat.spawnEnemy('thornwick', 10); s.currentEnemy.label = label; s.currentEnemy.currentHP = s.currentEnemy.maxHP = 999;
    return s;
  };
  const m = fightWith('merchant', 'Road Bandit');
  const r = combat.applyCombatRound(m, 'I bribe it to leave');
  assert.equal(r.bribed, true); assert.equal(m.inCombat, false); assert.ok(m.coin < 1000);
  assert.equal(perks.useFightSkill(fightWith('merchant', 'Road Wolf'), 'merchant').success, false, 'there is no bribing a wolf');
  const sch = fightWith('scholar', 'Moor Wraith');
  combat.applyCombatRound(sch, 'I study it');
  assert.equal(sch.buffs.studied, 'Moor Wraith');
  const th = fightWith('thief', 'Road Bandit'); th.coin = 0;
  for (let i = 0; i < 4; i++) combat.applyCombatRound(th, 'I steal from it');
  assert.ok(th.coin > 0, 'quick hands');
});

test('working for a living over the API', async () => {
  seedRandom(14);
  const { base, sessions } = await startServer();
  try {
    const c = client(base);
    const g = await c.post('/auth/guest', {}); c.sessionId = g.sessionId;
    await createCharacter(c);
    const s = sessions.get(c.sessionId).state;
    const none = await c.act('work');
    assert.match(none.output, /no trade yet/);
    s.profession = 'cook'; s.professionLevel = 2;
    const w = chronicle.worldOf(s); const h0 = chronicle.nowHour(w); const coin0 = s.coin || 0;
    const r = await c.act('work for 6 hours');
    assert.match(r.output, /inn kitchen/);
    assert.ok((s.coin || 0) > coin0);
    assert.ok(chronicle.nowHour(w) - h0 >= 6, 'the hours pass');
    const t = await c.act('my trade');
    assert.match(t.output, /COOK/);
  } finally { await stopServer(); }
});

test('the wider trades: buffs, healing, gathering, coin, charting, and calming beasts', () => {
  seedRandom(8);
  const c = worker('carver');
  const k = perks.detectSkill(c, 'I carve a charm from bone');
  assert.equal(perks.useSkill(c, k).success, true);
  assert.ok(perks.combatMods(c, null).dmg > perks.combatMods(worker('carver'), null).dmg, 'a charm for the next fight');
  const h = worker('herbalist'); h.hp = Math.round(h.maxHp / 3); const h0 = h.hp;
  perks.useSkill(h, perks.detectSkill(h, 'I make a poultice'));
  assert.ok(h.hp > h0);
  const f = worker('farmer', 'wyrmwood');
  perks.useSkill(f, perks.detectSkill(f, 'I forage the fields'));
  assert.ok(f.materials.herbs >= 1);
  const map = worker('cartographer', 'thornwick');
  assert.match(perks.useSkill(map, perks.detectSkill(map, 'I chart the land')).message, /chart the land/);
  assert.equal(perks.detectSkill(worker('baker'), 'I carve a charm'), null, 'another trade\'s skill is just a story action');
  const tamer = worker('tamer', 'thornwick');
  tamer.inCombat = true; tamer.currentEnemy = combat.spawnEnemy('thornwick', 10); tamer.currentEnemy.label = 'Road Wolf';
  let calmed = false;
  for (let i = 0; i < 6 && tamer.inCombat; i++) { const r = combat.applyCombatRound(tamer, 'I calm it'); if (r.bribed) calmed = true; }
  assert.ok(calmed || !tamer.inCombat, 'a tamer can end a fight with a beast without blood');
  const g = worker('gravedigger');
  assert.ok(perks.combatMods(g, { traits: { tags: ['undead'] }, label: 'Ghoul' }).dmg > perks.combatMods(g, { traits: { tags: [] }, label: 'Bandit' }).dmg, 'gravediggers fight the dead better');
});
