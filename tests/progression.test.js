'use strict';

// Infinite progression: every milestone level from 1 to 2,500 is an exact,
// valid, playable character (XP, resources, gear, enemies, rewards); death
// costs stay bounded; save/load keeps huge XP exact through a restart;
// buying and selling never makes money; one-time rewards cannot be taken
// twice; and a legend gains real XP by playing, not by fixtures.
const { seedRandom, startServer, stopServer, client, createCharacter } = require('./helpers');
const test   = require('node:test');
const assert = require('node:assert/strict');
const { createFreshState } = require('../game/state');
const ch = require('../game/character');
const XP = require('../game/character/xp');
const chronicle = require('../game/chronicle');
const combat = require('../game/combat');
const { GEAR_QUALITIES, CLASSES } = require('../game/constants');

const MILESTONES = [1, 2, 10, 50, 99, 100, 101, 150, 200, 300, 500, 1000, 2500];
const tierFor = (L) => GEAR_QUALITIES.filter(q => L >= q.levelReq).pop().tier;
const finite = (n) => typeof n === 'number' && Number.isFinite(n);

function legend(L, cls = 'fighter') {
  const s = createFreshState();
  s.creation.phase = 5;
  s.character = { name: `L${L}`, age: 30, region: 'shattered_throne' };
  s.stats = ch.calculateStats(25, 'farmer', 'average');
  for (let i = 1; i < Math.min(L, 400); i++) s.stats[['str', 'vit', 'dex'][i % 3]]++;
  s.combatClass = cls; s.classLevel = 5;
  s.totalXP = ch.getXPForLevel(L);
  const t = tierFor(L);
  s.gear = { weapon: ch.buildGearItem({ name: 'steel sword', tier: t }, false), armor: ch.buildGearItem({ name: 'leather armor', tier: t }, true) };
  s.maxHp = s.maxMana = s.maxStamina = 0; ch.recalculateResources(s); s.hp = s.maxHp; s.mana = s.maxMana; s.stamina = s.maxStamina;
  s.characterId = `c_l${L}`;
  chronicle.bindCharacter(s, chronicle.createWorld({}));
  return s;
}

test('every milestone level is exact and playable: XP, resources, gear, enemies, rewards, a fight', () => {
  seedRandom(5);
  let prevTier = -1;
  for (const L of MILESTONES) {
    const xp = ch.getXPForLevel(L);
    assert.equal(ch.getPlayerLevel(xp), L, `${L}: exact threshold`);
    if (L > 1) assert.equal(ch.getPlayerLevel(XP.fromBig(XP.toBig(xp) - 1n)), L - 1, `${L}: one XP short is ${L - 1}`);
    const s = legend(L);
    for (const k of ['maxHp', 'maxMana', 'maxStamina']) assert.ok(finite(s[k]) && s[k] > 0, `${L}: ${k} ${s[k]}`);
    const t = tierFor(L);
    assert.ok(t >= prevTier, `${L}: gear never gets worse with level`); prevTier = t;
    assert.ok(finite(s.gear.weapon.weaponBonus) && s.gear.weapon.weaponBonus > 0, `${L}: weapon`);
    const e = combat.spawnEnemy('shattered_throne', L);
    assert.ok(finite(e.maxHP) && e.maxHP > 0 && finite(e.level), `${L}: enemy`);
    const kx = combat.calculateEnemyXP(L, L, 1);
    assert.ok(finite(kx) && kx >= 1, `${L}: a kill is worth something (${kx})`);
    assert.equal(combat.calculateEnemyXP(1, L, 1) <= Math.max(1, kx / 10), true, `${L}: trivial foes are worth little`);
    s.inCombat = true; s.currentEnemy = e; s.weaponDrawn = true;
    const r = combat.applyCombatRound(s, 'I slash at its torso');
    assert.ok(finite(s.hp) && finite(e.currentHP), `${L}: a round stays finite`);
    assert.ok(typeof r.combatLog === 'string' && !/NaN|Infinity|undefined/.test(r.combatLog), `${L}: the log is clean`);
    const back = JSON.parse(JSON.stringify(s));
    assert.equal(back.totalXP, s.totalXP, `${L}: XP survives serialisation exactly`);
  }
});

test('XP never overflows: huge grants keep the state valid and the level moves', () => {
  const s = legend(1000);
  const before = ch.getPlayerLevel(s.totalXP);
  for (let i = 0; i < 50; i++) ch.grantXP(s, Number.MAX_SAFE_INTEGER);
  const after = ch.getPlayerLevel(s.totalXP);
  assert.ok(after > before, `${before} → ${after}`);
  assert.ok(finite(s.maxHp) && s.maxHp > 0 && finite(s.freePoints));
  assert.ok(XP.toBig(s.totalXP) > BigInt(Number.MAX_SAFE_INTEGER), 'beyond safe integers, held exactly');
  assert.equal(ch.getPlayerLevel(JSON.parse(JSON.stringify(s)).totalXP), after);
});

async function dieAt(c, st, L) {
  const s = st();
  Object.assign(s, legend(L), { characterId: s.characterId, __world: s.__world });
  s.character.region = 'thornwick';
  s.campaign = { ...(s.campaign || {}), flags: {}, completed: [], chapter: 1 };
  s.hp = 1;
  const e = combat.spawnEnemy('thornwick', L);
  e.effectiveStr = 99999; e.currentHP = e.maxHP = 1e9; e.label = 'Doom';
  s.inCombat = true; s.currentEnemy = e;
  for (let i = 0; i < 10 && st().inCombat; i++) await c.act('I defend');
  return st();
}

test('over the API: death costs are bounded at every level, and saves keep huge XP exact through a restart', async () => {
  seedRandom(9);
  const { base, sessions } = await startServer();
  const app = require('../server/app');
  try {
    const c = client(base);
    const g = await c.post('/auth/guest', {}); c.sessionId = g.sessionId;
    await createCharacter(c, { name: 'Mortal' });
    const st = () => sessions.get(c.sessionId).state;
    // Below 100: one level, never below the chapter's floor.
    let s = await dieAt(c, st, 50);
    assert.equal(ch.getPlayerLevel(s.totalXP), 49, 'one level');
    // Beyond 100: a quarter of the progress toward the next level, no level lost.
    s = await dieAt(c, st, 300);
    const floor = XP.toBig(ch.getXPForLevel(300));
    s.totalXP = XP.fromBig(floor + 4000n);
    s.hp = 1; s.inCombat = true; s.currentEnemy = Object.assign(combat.spawnEnemy('thornwick', 300), { effectiveStr: 99999, currentHP: 1e9, maxHP: 1e9 });
    for (let i = 0; i < 10 && st().inCombat; i++) await c.act('I defend');
    assert.equal(ch.getPlayerLevel(st().totalXP), 300, 'a legend keeps the level');
    assert.equal(XP.toBig(st().totalXP), floor + 3000n, 'and loses exactly a quarter of the progress');
    // Save and load: an enormous XP total comes back to the digit.
    const huge = XP.fromBig(XP.toBig(ch.getXPForLevel(2500)) + 123456789n);
    st().totalXP = huge; st().inCombat = false; st().currentEnemy = null;
    ch.recalculateResources(st());
    await c.act('look around');
    sessions.clear(); app.worldStore.cache.clear();
    await c.get('/state');
    assert.equal(String(st().totalXP), String(huge), 'exact after a restart');
    assert.equal(ch.getPlayerLevel(st().totalXP), 2500);
  } finally { await stopServer(); }
});

test('over the API: buying and selling never makes money, even with every discount', async () => {
  seedRandom(3);
  const { base, sessions } = await startServer();
  try {
    const c = client(base);
    const g = await c.post('/auth/guest', {}); c.sessionId = g.sessionId;
    await createCharacter(c, { name: 'Haggler' });
    const st = () => sessions.get(c.sessionId).state;
    let sales = 0;
    for (const L of [10, 150, 500]) {
      const s = st();
      s.totalXP = ch.getXPForLevel(L); ch.recalculateResources(s);
      s.character.region = 'ironport';
      Object.assign(s, { profession: 'merchant', professionLevel: 5, coin: 1e12 });
      s.factions = { ...(s.factions || {}), compact: 100, wardens: 100, remnant: 100, choir: 100 };
      const w = chronicle.worldOf(s);
      w.settlements.ironport = { status: 'thriving', since: 0 };
      require('../game/world-life').ensure(w).decrees.push({ by: 'Test', faction: chronicle.dominionOf(w, 'ironport'), text: 'tolls cut', price: 0.9, from: 0, until: 1e9 });
      for (const item of ['sword', 'longbow', 'leather armor', 'healing potion']) {
        const before = st().coin;
        const b = await c.act(`buy ${item}`);
        assert.ok(st().coin < before, `${L}: bought ${item}: ${(b.output || '').slice(0, 80)}`);
        const bought = before - st().coin;
        const name = (st().inventory || []).map(i => (typeof i === 'string' ? i : i.name)).reverse().find(n => n && n.toLowerCase().includes(item.split(' ').pop()));
        if (!name) continue;                        // potions etc. may stack differently
        const mid = st().coin;
        await c.act(`sell ${name}`);
        const got = st().coin - mid;
        assert.ok(got < bought, `${L}: ${item} bought for ${bought}, sold for ${got}`);
        if (got > 0) sales++;
      }
    }
    assert.ok(sales >= 6, `the loop was really tried (${sales} sales)`);
  } finally { await stopServer(); }
});

test('one-time rewards cannot be taken twice', () => {
  seedRandom(1);
  const adv = require('../game/adventures');
  const tw = require('../game/trade-work');
  const s = legend(30);
  s.character.region = 'thornwick';
  const w = chronicle.worldOf(s);
  const a = Object.assign(adv.KINDS.construction(s, w, 'once'), { id: 'once', step: 0, level: 30, reward: { xp: 500, coin: 500 } });
  s.materials = { wood: 50, stone: 50 };
  s.adventureOffers = [a]; adv.take(s, w, 1);
  const mat = a.steps[0].material;
  adv.handle(s, w, `deliver the ${mat}`);
  for (let i = 0; i < 4; i++) adv.handle(s, w, `work on the ${a.title.split(' ').pop().toLowerCase()}`);
  assert.equal(a.outcome, 'done');
  const coin = s.coin, xp = String(s.totalXP);
  assert.equal(adv.handle(s, w, 'work on the wall'), null, 'a finished adventure pays nothing more');
  assert.match(adv.take(s, w, 1).message, /Ask for work first/);
  assert.equal(s.coin, coin); assert.equal(String(s.totalXP), xp);
  // The inn pays for days that passed, once.
  Object.assign(s, { profession: 'innkeeper', coin: 1e9 });
  s.character.region = 'ironport';
  tw.buyInn(s);
  chronicle.advanceTime(s, 10 * 24);
  const first = tw.collectInn(s);
  const c2 = s.coin;
  tw.collectInn(s);
  assert.equal(s.coin, c2, 'collecting twice gives nothing the second time');
  assert.ok(first.success);
  // A world reward: rebuilding pays XP at most twelve times per disaster.
  const wl = require('../game/world-life');
  const d = wl.strike(w, 'ironport', wl.DISASTERS[0], []);
  d.progress = 0;
  let paid = 0;
  for (let i = 0; i < 40; i++) { d.progress = Math.min(d.progress, 50); if (/XP/.test(wl.helpRebuild(s, 'help rebuild').message)) paid++; }
  assert.equal(paid, 12);
});

test('over the API: a legend gains real XP by playing the rift, not by fixtures', async () => {
  seedRandom(31);
  const { base, sessions } = await startServer();
  try {
    const c = client(base);
    const g = await c.post('/auth/guest', {}); c.sessionId = g.sessionId;
    await createCharacter(c, { name: 'Diver' });
    const st = () => sessions.get(c.sessionId).state;
    const s = st();
    const L = legend(150);
    Object.assign(s, { totalXP: L.totalXP, stats: L.stats, combatClass: 'fighter', classLevel: 5, gear: L.gear, coin: 1e9 });
    s.maxHp = s.maxMana = s.maxStamina = 0; ch.recalculateResources(s); s.hp = s.maxHp; s.mana = s.maxMana; s.stamina = s.maxStamina;
    s.inventory = Array.from({ length: 8 }, () => ({ name: 'healing potion', type: 'potion', heal: 0.4 }));
    Object.assign(s.campaign, { chapter: null, completed: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], ending: 'rekindle', postgame: true, afterEnding: 'continue', unlocked: ['shattered_throne'], riftDepth: 25 });
    const w = chronicle.worldOf(s);
    if (!w.ending) chronicle.applyEnding(w, s, 'rekindle');
    s.character.region = 'shattered_throne';
    const xp0 = XP.toBig(st().totalXP);
    let won = 0, actions = 0;
    for (let dive = 0; dive < 3; dive++) {
      st().hp = st().maxHp; st().character.region = 'shattered_throne';
      const depth0 = st().campaign.riftDepth;
      const r = await c.act('enter the rift'); actions++;
      assert.ok(st().inCombat, `the rift opens: ${(r.output || '').slice(0, 120)}`);
      let last = '';
      for (let i = 0; i < 120 && st().inCombat; i++) {
        const input = /defend to blunt/.test(last) ? 'I raise my guard and defend'
          : st().hp < st().maxHp * 0.35 ? 'drink healing potion'
          : `${st().weaponDrawn ? 'I' : 'I draw my sword and'} feint left and slash at its torso`;
        last = (await c.act(input)).output || ''; actions++;
      }
      if (st().campaign.riftDepth > depth0) won++;
    }
    const gained = XP.toBig(st().totalXP) - xp0;
    assert.ok(won >= 1, 'a legend can win in the rift');
    assert.ok(gained > 0n, `played XP: +${gained} in ${actions} actions`);
    assert.ok(st().campaign.riftDepth > 25, 'and goes deeper');
  } finally { await stopServer(); }
});
