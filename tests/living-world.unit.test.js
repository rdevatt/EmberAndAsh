'use strict';

// Living world: unbounded XP, high-level combat, calendar & aging,
// longevity, succession, endings, legacy, the endless rift, sagas,
// crises, portraits and scene events. Pure game logic.
const { seedRandom } = require('./helpers');
const test   = require('node:test');
const assert = require('node:assert/strict');

const { createFreshState } = require('../game/state');
const ch        = require('../game/character');
const XP        = require('../game/character/xp');
const combat    = require('../game/combat');
const chronicle = require('../game/chronicle');
const endless   = require('../game/endless');
const legacy    = require('../game/legacy');
const campaign  = require('../game/campaign');
const appearanceMod = require('../game/appearance');
const { buildScene, combatEvents } = require('../game/scene');
const Art = require('../public/game/art.js');
const { REGIONS, GEAR_QUALITIES } = require('../game/constants');

function hero(level = 20, region = 'thornwick', desc = 'Tall, short black hair, brown eyes') {
  const s = createFreshState();
  s.creation.phase = 5;
  s.character = { name: 'Aldren', age: 25, gender: 'male', background: 'farmer', region, description: desc };
  s.stats = ch.calculateStats(25, 'farmer', 'average');
  s.totalXP = ch.getXPForLevel(level);
  s.maxHp = s.maxMana = s.maxStamina = 0;
  ch.recalculateResources(s);
  s.hp = s.maxHp; s.mana = s.maxMana; s.stamina = s.maxStamina;
  const w = chronicle.createWorld({ name: 'Test World' });
  chronicle.bindCharacter(s, w);
  return { s, w };
}

// ---------------- infinite progression ----------------
test('XP curve: exact round-trips from level 1 to 100,000, no cap, strictly increasing', () => {
  for (const L of [1, 2, 50, 100, 150, 200, 500, 1000, 10000, 100000]) {
    const xp = ch.getXPForLevel(L);
    assert.equal(ch.getPlayerLevel(xp), L, `level ${L}`);
    assert.equal(ch.getPlayerLevel(XP.fromBig(XP.toBig(xp) - 1n)), Math.max(1, L - 1), `one XP short of ${L}`);
    const cost = XP.levelCost(L);
    assert.ok(cost > 0n, `cost at ${L} positive`);
  }
  let prev = 0n;
  for (let L = 1; L < 5000; L++) { const c = XP.levelCost(L); assert.ok(c > prev, `cost increases at ${L}`); prev = c; }
  // Levels 1–100 keep the original curve: 5·L·(L−1).
  for (const L of [2, 10, 37, 100]) assert.equal(ch.getXPForLevel(L), 5 * L * (L - 1));
  assert.equal(typeof ch.getXPForLevel(1000), 'number');
  assert.equal(typeof ch.getXPForLevel(100000), 'string', 'beyond safe integers XP is stored exactly as a string');
  assert.equal(ch.getPlayerLevel('not a number'), 1);
  assert.equal(ch.getPlayerLevel(NaN), 1);
  assert.equal(ch.getPlayerLevel(-50), 1);
});

test('XP pacing: high levels become campaign-sized achievements', () => {
  const campaignXP = XP.toBig(ch.getXPForLevel(95));            // what the whole original story yields
  const sagaReward = (L) => BigInt(30 * L);                      // a typical saga at level L
  const sagasFor = (L) => Number(XP.levelCost(L) / sagaReward(L));
  assert.ok(sagasFor(30) < 1, 'level 30: well under one saga per level');
  assert.ok(sagasFor(150) >= 1 && sagasFor(150) <= 3, `level 150: a couple of sagas (${sagasFor(150)})`);
  assert.ok(sagasFor(200) >= 7, `level 200: a major arc (${sagasFor(200)} sagas)`);
  assert.ok(XP.levelCost(200) >= campaignXP, 'one level at 200 costs at least the whole original campaign');
  assert.ok(XP.levelCost(500) > campaignXP * 100n, 'level 500: over a hundred campaigns per level');
});

test('grantXP at extreme levels keeps state valid and serialisable', () => {
  const { s } = hero(1);
  s.totalXP = ch.getXPForLevel(100000);
  const before = ch.getPlayerLevel(s.totalXP);
  ch.grantXP(s, 5);
  assert.equal(ch.getPlayerLevel(s.totalXP), before);
  const json = JSON.parse(JSON.stringify({ xp: s.totalXP }));
  assert.equal(ch.getPlayerLevel(json.xp), before, 'survives a JSON round trip');
  s.totalXP = ch.getXPForLevel(199);
  const lu = ch.grantXP(s, Number(XP.levelCost(199)));
  assert.equal(lu.newLevel, 200);
});

test('combat stays finite and meaningful at levels 150, 500 and 1000', () => {
  seedRandom(21);
  for (const L of [150, 500, 1000]) {
    const { s } = hero(L, 'shattered_throne');
    for (let i = 1; i < L; i++) s.stats[['str', 'vit', 'dex'][i % 3]]++;
    let tier = 0; for (const q of GEAR_QUALITIES) if (L >= q.levelReq) tier = q.tier;
    s.gear.weapon = ch.buildGearItem({ name: 'sword', tier }, false);
    s.gear.armor = ch.buildGearItem({ name: 'plate', tier }, true);
    ch.recalculateResources(s); s.hp = s.maxHp; s.stamina = s.maxStamina;
    const depth = Math.max(1, Math.round((L - 92) / 2));
    s.campaign = { postgame: true, riftDepth: depth - 1, flags: {}, choices: {}, completed: [], bossesDefeated: [], unlocked: ['shattered_throne'] };
    const rift = endless.startRift(s);
    assert.equal(rift.success, true);
    s.inCombat = true; s.currentEnemy = rift.enemy;
    let rounds = 0;
    while (s.inCombat && s.hp > 0 && rounds < 120) {
      const r = combat.applyCombatRound(s, rounds % 3 === 2 ? 'I defend' : 'I slash at its throat with a precise strike');
      assert.ok(Number.isFinite(s.hp) && Number.isFinite(rift.enemy.currentHP), 'no NaN');
      assert.ok(!/NaN|undefined|Infinity/.test(r.combatLog), 'log is clean');
      rounds++;
    }
    assert.ok(rounds > 3, `level ${L} rift fight lasts more than a few rounds (${rounds})`);
    assert.ok(rift.enemy.maxHP < 1e9, 'no absurd HP pools');
  }
});

test('trivial enemies give almost no XP to legends', () => {
  assert.ok(combat.calculateEnemyXP(5, 200, 1) === 0);
  assert.ok(combat.calculateEnemyXP(85, 100, 1) < 85 * 0.3);
  assert.equal(combat.calculateEnemyXP(100, 100, 1), 100);
});

// ---------------- time, aging, longevity ----------------
test('calendar advances by real hours; days, months, years and decades; invalid time is ignored', () => {
  const { s, w } = hero();
  const h0 = chronicle.nowHour(w);
  chronicle.advanceTime(s, 0); chronicle.advanceTime(s, -10); chronicle.advanceTime(s, NaN);
  assert.equal(chronicle.nowHour(w), h0);
  chronicle.advanceTime(s, 24);
  assert.equal(chronicle.nowDay(w), 1);
  chronicle.advanceTime(s, 30 * 24);
  assert.equal(chronicle.dateOf(chronicle.nowHour(w)).month, 1);
  const age0 = s.character.age;
  chronicle.advanceTime(s, 360 * 24);
  assert.equal(s.character.age, age0 + 1);
  chronicle.advanceTime(s, 10 * 360 * 24);
  assert.equal(s.character.age, age0 + 11);
  assert.match(chronicle.formatDate(chronicle.nowHour(w)), /E\.R\./);
});

test('aging changes stats gently, longevity paths have real requirements, and old age ends a life', () => {
  const { s, w } = hero(20);
  const strYoung = ch.getEffectiveStats(s).str;
  chronicle.advanceTime(s, 45 * 360 * 24);                    // 70 years old
  assert.ok(ch.getEffectiveStats(s).str < strYoung, 'old age weakens');
  assert.ok(ch.getEffectiveStats(s).wis > s.stats.wis, 'and brings wisdom');
  assert.equal(chronicle.pursueLongevity(s, w, 'emberHeart', {}).success, false, 'needs the Ember');
  s.campaign = { flags: { emberTaken: true }, choices: {}, completed: [] };
  assert.equal(chronicle.pursueLongevity(s, w, 'emberHeart', {}).success, true);
  const body = chronicle.bodyAge(s, w);
  chronicle.advanceTime(s, 300 * 360 * 24);
  assert.equal(chronicle.bodyAge(s, w), body, 'the immortal body does not age');
  assert.equal(chronicle.isPastLifespan(s, w), false);
  assert.ok(s.character.age > 300, 'but the calendar age does');

  const elf = hero(20, 'thornwick', 'an elf with long silver hair').s;
  elf.appearance = appearanceMod.parseAppearance(elf.character.description, elf.character, 'e');
  assert.ok(chronicle.lifespan(elf) > 200, 'elves live for centuries');
  const m = hero(20).s;
  const mw = chronicle.worldOf(m);
  chronicle.advanceTime(m, 120 * 360 * 24);
  assert.equal(chronicle.isPastLifespan(m, mw), true, 'mortals reach the end');
});

test('NPCs age, die and are succeeded; legends die and leave one relic', () => {
  const { s, w } = hero(95);
  s.gear.weapon = ch.buildGearItem({ name: 'starforged longsword', tier: 9 }, false);
  s.campaign = { chapter: 10, step: 3, ending: null, flags: {}, choices: {}, completed: [1, 2, 3, 4, 5, 6, 7, 8, 9], bossesDefeated: [], unlocked: ['shattered_throne'] };
  chronicle.applyEnding(w, s, 'rekindle');
  const before = REGIONS.thornwick.npcs[0];
  chronicle.advanceTime({ ...s, __world: undefined }, 0);
  const other = hero(1).s; chronicle.attachWorld(other, w); other.characterId = 'c_newcomer';
  chronicle.advanceTime(other, 150 * 360 * 24);
  const holder = chronicle.currentHolder(w, before);
  assert.notEqual(holder.name, before.name, 'the miller was succeeded');
  assert.ok(w.history.some(e => e.type === 'death' && e.title.includes(before.name)));
  const fig = w.figures.find(f => f.characterId === s.characterId);
  assert.equal(fig.status, 'deceased', 'the mortal hero died of old age off-screen');
  assert.equal(w.relics.length, 1, 'exactly one heirloom');
  const c1 = legacy.claimRelic(w, other, fig.characterId);
  assert.equal(c1.success, true);
  const c2 = legacy.claimRelic(w, hero(1).s, fig.characterId);
  assert.equal(c2.success, false, 'never claimed twice');
});

// ---------------- endings, legacy ----------------
test('endings change the world once: era, realm, factions, legend, history', () => {
  const { s, w } = hero(95, 'shattered_throne');
  s.campaign = { flags: { emberTaken: true }, choices: { 10: 'Take the Throne' }, completed: [], startRegion: 'thornwick' };
  const era = chronicle.applyEnding(w, s, 'ascend');
  assert.equal(era.name, 'The Reign of the New Sovereign');
  assert.equal(w.realm.rulerId, s.characterId, 'the hero rules');
  assert.ok(w.factionPower.choir > 80);
  assert.equal(chronicle.applyEnding(w, s, 'rekindle'), null, 'history is not rewritten');
  assert.equal(w.figures.length, 1);
  assert.equal(w.history.filter(e => e.type === 'ending').length, 1);
  assert.match(endless.titlesFor(s, w).join(' '), /Sovereign/);
});

test('legends speak from their record; rumours cite real history', () => {
  const { s, w } = hero(95, 'shattered_throne');
  s.campaign = { flags: { ownKey: true }, choices: { 5: 'Keep it yourself' }, completed: [], startRegion: 'thornwick' };
  s.gear.weapon = ch.buildGearItem({ name: 'sun-blade', tier: 9 }, false);
  chronicle.applyEnding(w, s, 'imperium');
  const fig = w.figures[0];
  const newcomer = hero(1, 'old_veldrath').s; chronicle.attachWorld(newcomer, w); newcomer.characterId = 'c_new';
  assert.equal(legacy.figuresHere(w, newcomer)[0].name, 'Aldren');
  const d = legacy.figureDialogue(fig, w, newcomer);
  assert.match(d.text, /Aldren/);
  assert.match(d.text, /sun-blade/, 'their real equipment');
  assert.match(d.text, /keep it yourself/i, 'their real choice');
  const rumor = legacy.rumorFor(w, 'thornwick', 0);
  assert.ok(rumor && (rumor.includes('Aldren') || rumor.includes('Sun-Emperor') || rumor.includes('Imperium') || rumor.includes('Hollow')));
});

// ---------------- endless ----------------
test('rift depths are unbounded, gain affixes and phases, and reward each depth once', () => {
  assert.equal(endless.riftLevel(500), 1092);
  assert.ok(endless.riftAffixes(1).length === 0);
  assert.ok(endless.riftAffixes(40).length >= 5);
  const { s } = hero(150, 'shattered_throne');
  s.campaign = { postgame: true, riftDepth: 49, flags: {}, choices: {}, completed: [], bossesDefeated: [] };
  const r = endless.startRift(s);
  assert.ok(r.enemy.phases.length >= 6, 'deep echoes have many phases');
  assert.ok(r.enemy.environment && Object.keys(r.enemy.environment).length > 0, 'and hostile environments');
  const msg = endless.onRiftCleared(s, 50);
  assert.match(msg, /Riftforged/);
  assert.equal(endless.onRiftCleared(s, 50), null, 'no repeat reward');
  const newbie = hero(5, 'shattered_throne').s;
  newbie.campaign = { postgame: true, flags: {}, choices: {}, completed: [] };
  assert.equal(endless.startRift(newbie).success, false, 'newcomers are kept out of the rift');
});

test('sagas scale to the character and only validated progress counts', () => {
  const low = hero(8, 'thornwick');
  const sagaLow = endless.generateSaga(low.s, low.w);
  assert.ok(REGIONS[sagaLow.region].levelRange[0] <= 9, 'a newcomer gets a regional saga');
  const high = hero(160, 'the_core_wastes');
  const saga = endless.generateSaga(high.s, high.w);
  assert.ok(REGIONS[saga.region].tier >= 7, 'a legend gets an ascendant threat');
  assert.equal(saga.level, 160);
  high.s.saga = saga;
  high.s.character.region = saga.region;
  if (saga.steps[0].type === 'travel') endless.onSagaEvent(high.s, high.w, { type: 'arrived', region: saga.region });
  assert.equal(endless.onSagaEvent(high.s, high.w, { type: 'kill', meta: { saga: 'other' } }), null, 'unrelated kills do nothing');
  const inv = endless.handleSagaCommand(high.s, high.w, `investigate ${saga.steps[saga.step].site}`);
  assert.equal(inv.advance, true);
  endless.onSagaEvent(high.s, high.w, { type: 'investigated' });
  const xp0 = XP.toBig(high.s.totalXP);
  for (let i = 0; i < 3; i++) endless.onSagaEvent(high.s, high.w, { type: 'kill', meta: { saga: saga.id, sagaStep: high.s.saga.step } });
  const done = endless.onSagaEvent(high.s, high.w, { type: 'kill', meta: { saga: saga.id, sagaStep: high.s.saga.step } });
  assert.equal(done.complete, true);
  assert.ok(XP.toBig(high.s.totalXP) > xp0);
  assert.equal(high.s.saga, null);
  assert.equal(high.w.history.filter(e => e.type === 'saga').length, 1);
});

test('crises arise, fail when ignored, and can be resolved', () => {
  const { s, w } = hero(30);
  const c = chronicle.spawnCrisis(w, 30);
  assert.equal(c.status, 'active');
  chronicle.advanceTime(s, 90 * 24);
  assert.equal(c.status, 'failed');
  assert.notEqual(w.settlements[c.region].status, 'thriving');
  const c2 = chronicle.spawnCrisis(w, 30);
  s.character.region = c2.region;
  const fight = endless.startCrisisFight(s, w);
  assert.equal(fight.success, true);
  assert.match(endless.onCrisisWon(s, w, c2.id), /CRISIS ENDED/);
  assert.equal(endless.onCrisisWon(s, w, c2.id), null, 'resolved once');
});

// ---------------- art ----------------
test('portraits come from the description and are stable', () => {
  const a = appearanceMod.parseAppearance('long red braided hair, green eyes, pale freckled skin, scar on my cheek', { name: 'Mira', gender: 'female' }, 'm1');
  assert.equal(a.hairColor, 'red'); assert.equal(a.hairStyle, 'braided'); assert.equal(a.eyes, 'green');
  assert.equal(a.skin, 'pale'); assert.deepEqual(a.scars, ['cheek']); assert.ok(a.marks.includes('freckles'));
  const b = appearanceMod.parseAppearance('bald, dark skin, grey eyes, a thick beard, stocky dwarf', { name: 'Torv', gender: 'male' }, 't1');
  assert.equal(b.species, 'dwarf'); assert.equal(b.hairStyle, 'bald'); assert.equal(b.beard, 'beard'); assert.equal(b.build, 'broad');
  const pa = Art.portrait({ name: 'Mira', age: 25, appearance: a, weapon: { kind: 'sword' }, armor: { kind: 'leather' } });
  const pb = Art.portrait({ name: 'Torv', age: 25, appearance: b, weapon: { kind: 'axe' }, armor: { kind: 'mail' } });
  assert.notEqual(pa, pb);
  assert.equal(pa, Art.portrait({ name: 'Mira', age: 25, appearance: a, weapon: { kind: 'sword' }, armor: { kind: 'leather' } }), 'deterministic');
  assert.ok(pa.includes(a.hairHex), 'red hair is drawn red');
});

test('artwork follows equipment, age, scars and rank', () => {
  const { s, w } = hero(30);
  const base = Art.portrait(appearanceMod.portraitData(s));
  s.gear.weapon = ch.buildGearItem({ name: 'oak staff', tier: 4 }, false);
  const staff = Art.portrait(appearanceMod.portraitData(s));
  assert.notEqual(staff, base, 'new weapon shows');
  chronicle.advanceTime(s, 50 * 360 * 24);
  const old = appearanceMod.portraitData(s);
  assert.ok(old.age >= 70);
  assert.notEqual(Art.portrait(old), staff, 'age shows (grey hair, lines)');
  appearanceMod.addScar(s, 'brow');
  assert.ok(s.appearance.scars.includes('brow'));
  const crowned = Art.portrait(appearanceMod.portraitData(s, { ruler: true }));
  assert.ok(crowned.length > Art.portrait(appearanceMod.portraitData(s)).length, 'a crown is drawn');
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(s.appearance))), JSON.stringify(s.appearance), 'identity survives save/load');
});

test('scene events match engine results: misses are misses, the dead stay dead', () => {
  const miss = combatEvents({ playerHit: false, playerDamage: 0, enemyHit: true, enemyDamage: 5, enemyLines: ['◀ X strikes back — 5 damage'] }, false, 'Wolf');
  assert.equal(miss[0].type, 'attack'); assert.equal(miss[0].hit, false);
  assert.equal(miss[1].type, 'enemyAttack'); assert.equal(miss[1].hit, true);
  const kill = combatEvents({ playerHit: true, playerDamage: 20, enemyLines: [] }, true, 'Wolf');
  assert.equal(kill[kill.length - 1].type, 'death');
  assert.ok(!kill.some(e => e.type === 'enemyAttack'), 'a dead enemy does not strike back');

  const { s } = hero(5);
  const scene = buildScene(s, { killed: true, killedEnemy: { label: 'Road Wolf', level: 3, currentHP: 0, maxHP: 20 }, combatResult: { playerHit: true, playerDamage: 9, enemyLines: [] } });
  assert.equal(scene.enemy.dead, true);
  const next = buildScene(s, {});
  assert.equal(next.enemy, null, 'next turn: no enemy');
  assert.ok(Art.scene(scene).includes('ea-dead'));
  assert.ok(['farmland', 'plains', 'city'].includes(scene.biome));
});

// ---------------- dominion & legend agency ----------------
test('eras redraw the map; strong powers push borders; legends act on their own', () => {
  const { s, w } = hero(95, 'shattered_throne');
  chronicle.ensureDominion(w);
  assert.equal(chronicle.dominionOf(w, 'pale_city'), 'choir', 'the Choir holds the white city at first');
  s.campaign = { flags: { emberTaken: true }, choices: { 10: 'Take the Throne' }, completed: [], startRegion: 'thornwick' };
  chronicle.applyEnding(w, s, 'ascend');
  assert.equal(chronicle.dominionOf(w, 'the_crucible'), 'choir', 'the Dominion holds the inner ring');
  const held0 = Object.values(w.dominion).filter(x => x === 'choir').length;
  const newcomer = hero(1).s; chronicle.attachWorld(newcomer, w); newcomer.characterId = 'c_new';
  chronicle.advanceTime(newcomer, 20 * 360 * 24);
  const held1 = Object.values(w.dominion).filter(x => x === 'choir').length;
  assert.ok(held1 > held0, `the Sovereign's realm grows (${held0} → ${held1} regions)`);
  assert.ok(w.history.some(e => e.type === 'dominion' && e.actor && e.actor.name === 'Aldren'), 'the ruling legend annexes land in their own name');
  const years = new Set(w.history.filter(e => e.type === 'dominion').map(e => e.date.split(' (')[0].split(', ')[1]));
  assert.ok(years.size > 5, 'events over twenty years carry their own dates');
});

test('era effects reach play: hazards, prices and mana', () => {
  const a = hero(35, 'coldsnap_pass');
  const harsh = hero(35, 'coldsnap_pass');
  chronicle.applyEnding(harsh.w, { ...harsh.s, character: harsh.s.character, campaign: { flags: {}, choices: {} } }, 'ascend');
  const world = require('../game/world');
  const d0 = world.applyHazard(a.s).damage;
  const d1 = world.applyHazard(harsh.s).damage;
  assert.ok(d1 > d0, 'the dark age makes hazards worse');
  const mage = hero(30);
  mage.s.combatClass = 'wizard'; mage.s.classLevel = 1; mage.s.mana = 1000; mage.s.maxMana = 1000;
  chronicle.applyEnding(mage.w, { ...mage.s, character: mage.s.character, campaign: { flags: {}, choices: {} } }, 'shatter');
  const T = require('../game/combat-tactics');
  const firebolt = T.getKnownAbilities(mage.s).find(x => x.id === 'firebolt');
  T.payAbilityCost(mage.s, firebolt);
  assert.equal(mage.s.mana, 1000 - Math.ceil(12 * 1.25), 'magic costs more in the Ordinary Age');
});
