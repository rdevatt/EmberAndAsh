'use strict';

// The road a character walks (good ↔ evil), shown in the portrait and a
// meter; slaves who fight beside you or turn on you; and slave revolts.
const { seedRandom, startServer, stopServer, client, createCharacter } = require('./helpers');
const test   = require('node:test');
const assert = require('node:assert/strict');
const { createFreshState } = require('../game/state');
const ch = require('../game/character');
const chronicle = require('../game/chronicle');
const morality = require('../game/morality');
const crime = require('../game/crime');
const slavery = require('../game/slavery');
const combat = require('../game/combat');
const appearance = require('../game/appearance');
const Art = require('../public/game/art.js');

function person(region = 'old_veldrath', level = 25) {
  const s = createFreshState();
  s.creation.phase = 5;
  s.character = { name: 'Vey', age: 30, gender: 'female', background: 'farmer', region };
  s.stats = ch.calculateStats(25, 'farmer', 'average');
  s.totalXP = ch.getXPForLevel(level);
  s.maxHp = s.maxMana = s.maxStamina = 0; ch.recalculateResources(s); s.hp = s.maxHp;
  chronicle.bindCharacter(s, chronicle.createWorld({}));
  s.factions = { wardens: 0, compact: 0, remnant: 0, choir: 0 }; s.campaign = {};
  crime.ensure(s);
  return s;
}

test('the road follows what the character does, known or not', () => {
  seedRandom(1);
  const s = person('wyrmwood');
  assert.equal(morality.value(s), 0);
  crime.resolve(s, { type: 'murder', victim: { name: 'a traveller' }, text: 'I quietly strangle a traveller' }, { clues: 0 });
  assert.ok(morality.value(s) <= -21, 'a murder no one saw still darkens the road');
  const sl = slavery.addSlave(s, { name: 'Bek', gender: 'male' });
  slavery.handle(s, 'free Bek');
  assert.ok(morality.value(s) > -21, 'mercy lifts it');
  s.campaign.flags = { soulsFreed: true, cantorSpared: true };
  assert.ok(morality.value(s) > -1, 'the story\'s great choices weigh on it');
  assert.ok(morality.label(85) === 'Saintly' && morality.label(-85) === 'Monstrous');
});

test('the portrait shows the road: light and haloed, or red, black and horned', () => {
  const s = person();
  s.alignment = 85;
  const good = Art.portrait(appearance.portraitData(s));
  assert.ok(good.includes('#ffe08a'), 'a halo on the saintly road');
  s.alignment = -85;
  const d = appearance.portraitData(s);
  assert.equal(d.road.horns, 2);
  const evil = Art.portrait(d);
  assert.ok(evil.includes('#d01818') && evil.includes('#1a0a0a'), 'red eyes and great horns');
  assert.ok(Art.figure({ ...d, armor: { kind: 'leather' } }, 'idle', {}).includes('#2a1414'), 'horns in scenes too');
  const panel = require('../server/routes/extra-panels').extraPanels(s, false);
  assert.equal(panel.morality.label, 'Monstrous');
});

function fightWith(s) {
  s.inCombat = true; s.currentEnemy = combat.spawnEnemy(s.character.region, 25);
  s.currentEnemy.currentHP = s.currentEnemy.maxHP = 2000;
  s.combatRound = 0; s.weaponDrawn = true;
}

test('slaves who fight: loyal ones strike your enemies, hated masters are betrayed', () => {
  seedRandom(4);
  const s = person();
  const loyal = slavery.addSlave(s, { name: 'Garr', gender: 'male' });
  loyal.job = 'fighter'; loyal.loyalty = 70; loyal.fear = 20;
  fightWith(s);
  combat.applyCombatRound(s, 'I strike at it');
  assert.ok(s.pendingCombatResult.companionAttacks.some(a => a.name === 'Garr'), 'Garr fights beside you');
  assert.equal(slavery.betrayalChance(s, loyal), 0, 'the loyal never turn');

  let turned = 0;
  for (let i = 0; i < 40; i++) {
    seedRandom(100 + i);
    const t = person();
    const hated = slavery.addSlave(t, { name: 'Asha', gender: 'female' });
    hated.job = 'fighter'; hated.loyalty = 0; hated.fear = 95; hated.cruelty = 6;
    fightWith(t);
    const hp = t.hp;
    combat.applyCombatRound(t, 'I strike at it');
    if (!t.slaves.length) { turned++; assert.ok(t.hp < hp || t.hp === 1, 'the blow lands'); assert.ok(t.infamy > 0, 'and the runaway talks'); }
  }
  assert.ok(turned >= 4, `a hated master is turned on (${turned}/40)`);
});

test('many slaves and a cruel master: revolt', () => {
  seedRandom(9);
  const s = person();
  for (let i = 0; i < 6; i++) { const x = slavery.addSlave(s, {}); x.cruelty = 4; x.loyalty = 3; x.fear = 90; }
  assert.ok(slavery.rebellionChance(s) >= 0.3, 'a powder keg');
  const calm = person();
  for (let i = 0; i < 6; i++) { const x = slavery.addSlave(calm, {}); x.loyalty = 70; x.fear = 10; }
  assert.equal(slavery.rebellionChance(calm), 0, 'treated well, no revolt');
  let msgs = [];
  for (let m = 0; m < 12 && !s.pendingRebellion; m++) msgs = msgs.concat(slavery.monthly(s, 1));
  assert.ok(s.pendingRebellion, 'they rise');
  assert.ok(s.infamy > 0, 'and everyone hears of it');
  const e = slavery.rebellionEnemy(s, combat.spawnEnemy);
  assert.match(e.label, /rebelling slaves|in revolt/);
  const n = s.slaves.length;
  slavery.endRebellion(s, false);
  assert.ok(s.slaves.length < n, 'lose, and they are gone');
});

test('a revolt interrupts play as a real fight, over the API', async () => {
  seedRandom(19);
  const { base, sessions } = await startServer();
  try {
    const c = client(base);
    const g = await c.post('/auth/guest', {}); c.sessionId = g.sessionId;
    await createCharacter(c);
    const st = sessions.get(c.sessionId).state;
    for (let i = 0; i < 3; i++) slavery.addSlave(st, {});
    st.pendingRebellion = { names: st.slaves.map(x => x.name), count: 3 };
    const r = await c.act('I look around');
    assert.match(r.output, /risen against you/);
    assert.equal(r.rightPanel.inCombat, true);
    for (let i = 0; i < 6 && sessions.get(c.sessionId).state.inCombat; i++) await c.act('flee');
    if (!sessions.get(c.sessionId).state.inCombat) assert.equal(sessions.get(c.sessionId).state.pendingRebellion, null, 'the revolt ends one way or the other');
    assert.ok(typeof r.morality.value === 'number', 'the road meter rides along');
  } finally { await stopServer(); }
});
