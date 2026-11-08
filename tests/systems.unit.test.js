'use strict';

// Unit tests for the world, campaign, combat tactics, crafting,
// economy and companion systems. Pure game logic — no server.
const { seedRandom } = require('./helpers');
const test   = require('node:test');
const assert = require('node:assert/strict');

const { createFreshState } = require('../game/state');
const ch       = require('../game/character');
const combat   = require('../game/combat');
const T        = require('../game/combat-tactics');
const campaign = require('../game/campaign');
const world    = require('../game/world');
const travel   = require('../game/travel');
const crafting = require('../game/crafting-recipes');
const shop     = require('../game/shop');
const comps    = require('../game/companions');
const factions = require('../game/factions');
const { REGIONS } = require('../game/constants');

function ready(region = 'thornwick', level = 1, extra = {}) {
  const s = createFreshState();
  s.creation.phase = 5;
  s.character = { name: 'Test', age: 25, gender: 'female', background: 'farmer', region };
  s.stats = ch.calculateStats(25, 'farmer', 'average');
  s.totalXP = ch.getXPForLevel(level);
  s.maxHp = s.maxMana = s.maxStamina = 0;
  ch.recalculateResources(s);
  s.hp = s.maxHp; s.mana = s.maxMana; s.stamina = s.maxStamina;
  Object.assign(s, extra);
  return s;
}

// ---------------- world ----------------
test('every region is reachable and has a meaningful identity', () => {
  const seen = new Set(['thornwick']);
  const q = ['thornwick'];
  while (q.length) for (const n of REGIONS[q.shift()].adjacent) if (!seen.has(n)) { seen.add(n); q.push(n); }
  assert.equal(seen.size, Object.keys(REGIONS).length, 'all regions reachable from the start');
  for (const [key, r] of Object.entries(REGIONS)) {
    assert.ok(r.landmarks.length >= 1, `${key} has landmarks`);
    assert.ok(r.resources.length >= 1, `${key} has resources`);
    if (key !== 'shattered_throne') {
      assert.ok(r.settlement, `${key} has a settlement`);
      assert.ok(r.npcs.length >= 1, `${key} has named people`);
    }
    for (const n of r.adjacent) assert.ok(REGIONS[n].adjacent.includes(key), `road ${key}↔${n} is two-way`);
  }
  for (let tier = 1; tier < 10; tier++) {
    const regions = Object.keys(REGIONS).filter(k => REGIONS[k].tier === tier);
    assert.ok(regions.some(k => REGIONS[k].adjacent.some(n => REGIONS[n].tier === tier + 1)), `tier ${tier} leads to tier ${tier + 1}`);
  }
});

test('landmarks reward once; hazards hurt unless warded; gathering is rate-limited', () => {
  seedRandom(5);
  const s = ready('thornwick', 3);
  const first = world.exploreLandmark(s, 'standing stone');
  assert.equal(first.success, true);
  const xp = s.totalXP;
  const again = world.exploreLandmark(s, 'standing stone');
  assert.equal(again.already, true);
  assert.equal(s.totalXP, xp, 'no second reward');

  const cold = ready('coldsnap_pass', 32);
  const hz = world.applyHazard(cold);
  assert.ok(hz.damage > 0);
  cold.inventory.push({ name: 'fur-lined cloak', type: 'ward' });
  assert.equal(world.applyHazard(cold).warded, true);

  let ok = 0;
  for (let i = 0; i < 6; i++) { s.stamina = s.maxStamina; if (world.gather(s).success) ok++; }
  assert.equal(ok, world.GATHER_LIMIT, 'gathering stops at the limit until time passes');
  assert.equal(world.detectGatherIntent('gather my courage'), null);
});

test('the Shattered Throne is sealed until the story opens it', () => {
  const s = ready('the_core_wastes', 95);
  campaign.ensureCampaign(s);
  assert.equal(travel.canEnterRegion(s, 'shattered_throne').ok, false);
  s.campaign.unlocked.push('shattered_throne');
  assert.equal(travel.canEnterRegion(s, 'shattered_throne').ok, true);
});

// ---------------- campaign ----------------
test('every chapter has a defined boss, reachable regions and real NPCs', () => {
  assert.equal(campaign.CHAPTERS.length, 10);
  campaign.CHAPTERS.forEach((chap, i) => {
    assert.equal(chap.tier, i + 1);
    for (const step of chap.steps) {
      if (step.region && step.region !== 'start') assert.ok(REGIONS[step.region], `${chap.id}: region ${step.region}`);
      if (step.type === 'boss') assert.ok(campaign.BOSSES[step.boss], `${chap.id}: boss ${step.boss}`);
      if (step.type === 'talk') assert.ok(campaign.getNpc(step.npc), `${chap.id}: npc ${step.npc}`);
      if (step.type === 'explore') assert.ok(REGIONS[step.region].landmarks.some(l => l.id === step.landmark), `${chap.id}: landmark ${step.landmark}`);
    }
    assert.ok(chap.steps.some(st => st.type === 'boss'), `chapter ${chap.id} has a boss`);
  });
});

test('chapter 1 plays through: talk, travel-gated talk, boss, choice; rewards once', () => {
  const s = ready('thornwick', 8);
  campaign.ensureCampaign(s);
  assert.equal(campaign.handleTalk(s, 'Vesna'), null, 'wrong NPC for the step does nothing');
  const t1 = campaign.handleTalk(s, 'Maren');
  assert.ok(t1.messages[0].includes('Maren'));
  const away = campaign.handleTalk(s, 'Vesna');
  assert.equal(away.notHere, true, 'must be in Ironport');
  s.character.region = 'ironport';
  campaign.handleTalk(s, 'Vesna Coil');

  // The boss can only be started in Dustfall, and only the right one.
  assert.equal(campaign.detectConfront(s, 'confront the goblin'), null);
  const conf = campaign.detectConfront(s, 'confront Varrick');
  assert.equal(campaign.startBoss(s, conf).success, false);
  s.character.region = 'dustfall';
  const boss = campaign.startBoss(s, conf).enemy;
  assert.equal(boss.isBoss, true);

  // Defeat it (event), then choose.
  campaign.onEvent(s, { type: 'bossDefeated', boss: 'varrick' });
  const xpBefore = s.totalXP;
  const choice = campaign.makeChoice(s, 1);
  assert.equal(choice.success, true);
  assert.ok(s.totalXP > xpBefore, 'chapter reward granted');
  assert.ok(s.factions.wardens > 0, 'choice moved Warden standing');
  assert.equal(s.campaign.chapter, 2);
  assert.deepEqual(s.campaign.completed, [1]);

  // Re-sending the event or choice gives nothing more.
  const xp2 = s.totalXP;
  campaign.onEvent(s, { type: 'bossDefeated', boss: 'varrick' });
  assert.equal(campaign.makeChoice(s, 1).success, false);
  assert.equal(s.totalXP, xp2);
});

test('chapters are level-gated and endings depend on earlier choices', () => {
  const s = ready('oakhaven', 5);
  campaign.ensureCampaign(s);
  s.campaign.chapter = 2; s.campaign.step = 0; s.campaign.completed = [1];
  assert.equal(campaign.handleTalk(s, 'Maren').notReady, true, 'level 5 cannot start chapter 2');

  const f = ready('shattered_throne', 100);
  campaign.ensureCampaign(f);
  Object.assign(f.campaign, { chapter: 10, step: 3, completed: [1, 2, 3, 4, 5, 6, 7, 8, 9] });
  assert.equal(campaign.makeChoice(f, 3).success, false, 'cannot take the Throne without a dark bargain');
  assert.equal(campaign.makeChoice(f, 2).success, false, 'cannot use the Sun-Key without having it');
  const end = campaign.makeChoice(f, 1);
  assert.equal(end.success, true);
  assert.equal(f.campaign.ending, 'rekindle');
  assert.equal(f.campaign.postgame, true);
  assert.ok(campaign.buildStoryText(f).includes('POSTGAME'));
});

// ---------------- combat tactics ----------------
function duel(s, enemy) { s.inCombat = true; s.currentEnemy = enemy; T.clearCombatEffects(s); }

test('defending blunts a telegraphed heavy attack', () => {
  seedRandom(11);
  let defended = 0, open = 0;
  for (let i = 0; i < 60; i++) {
    for (const mode of ['defend', 'attack']) {
      const s = ready('greymere', 18);
      s.hp = s.maxHp = 5000;
      const boss = campaign.buildBossEnemy('ulric');
      boss.currentHP = boss.maxHP = 1e6;
      duel(s, boss);
      combat.applyCombatRound(s, 'I slash at it'); combat.applyCombatRound(s, 'I slash at it');
      const wind = combat.applyCombatRound(s, 'I slash at it');   // turn 3: wind-up
      assert.match(wind.combatLog, /defend to blunt/);
      const before = s.hp;
      combat.applyCombatRound(s, mode === 'defend' ? 'I raise my shield and defend' : 'I slash at its torso');
      if (mode === 'defend') defended += before - s.hp; else open += before - s.hp;
    }
  }
  assert.ok(defended < open * 0.5, `defending should more than halve the blow (${defended} vs ${open})`);
});

test('abilities cost resources, respect cooldowns, and fail safely without them', () => {
  seedRandom(2);
  const s = ready('thornwick', 10, { combatClass: 'fighter', classLevel: 1 });
  duel(s, combat.spawnEnemy('thornwick', 10));
  s.currentEnemy.currentHP = s.currentEnemy.maxHP = 10000;
  const st = s.stamina;
  const r1 = combat.applyCombatRound(s, 'I use shield bash');
  assert.match(r1.combatLog, /Shield Bash/);
  assert.ok(s.stamina <= st - 12);
  const r2 = combat.applyCombatRound(s, 'I use shield bash');
  assert.match(r2.combatLog, /not ready/, 'cooldown enforced');
  s.stamina = 0;
  s.abilityCooldowns = {};
  const r3 = combat.applyCombatRound(s, 'shield bash');
  assert.match(r3.combatLog, /Not enough stamina/);
  assert.equal(T.detectAbility(ready(), 'shield bash'), null, 'classless characters lack class abilities');
});

test('resistances and weaknesses change damage', () => {
  const skeleton = { label: 'Skeleton Warrior' };
  assert.ok(T.resistMultiplier(skeleton, 'holy') > 1.2);
  assert.ok(T.resistMultiplier({ label: 'Moor Wraith' }, 'physical') < 0.8);
  assert.ok(T.resistMultiplier({ label: 'Cinder Drake' }, 'fire') < 0.6);
  const traits = T.getEnemyTraits(skeleton);
  assert.ok(traits.immune.includes('bleed'));
});

test('an under-levelled, under-geared hero cannot beat a late boss', () => {
  seedRandom(9);
  let wins = 0;
  for (let i = 0; i < 20; i++) {
    const s = ready('the_core_wastes', 70);
    s.gear.weapon = ch.buildGearItem({ name: 'sword', tier: 4 }, false);
    duel(s, campaign.buildBossEnemy('cantor'));
    for (let r = 0; r < 80 && s.inCombat && s.hp > 0; r++) combat.applyCombatRound(s, 'I slash at its throat with a precise strike');
    if (s.hp > 0 && !s.inCombat) wins++;
  }
  assert.equal(wins, 0);
});

test('casting a spell is never mistaken for fleeing', () => {
  assert.equal(combat.detectFleeIntent('I cast Mana Bolt at it'), false);
  assert.equal(combat.detectFleeIntent('I turn and run'), true);
});

// ---------------- crafting & economy ----------------
test('crafting consumes materials and needs the right profession', () => {
  const s = ready('thornwick', 12, { profession: 'blacksmith', profXP: 160 });
  const noMats = crafting.craft(s, crafting.detectCraft(s, 'forge a sword'));
  assert.equal(noMats.success, false);
  world.addMaterial(s, 'iron ore', 3);
  const made = crafting.craft(s, crafting.detectCraft(s, 'forge a sword'));
  assert.equal(made.success, true);
  assert.equal(world.countMaterial(s, 'iron ore'), 0, 'ore consumed');
  assert.ok(made.item.tier <= 3, 'iron caps the quality');
  const notSmith = ready('thornwick', 12, { profession: 'cook' });
  world.addMaterial(notSmith, 'iron ore', 3);
  assert.equal(crafting.craft(notSmith, crafting.detectCraft(notSmith, 'forge a sword')).success, false);
  assert.equal(crafting.detectCraft(s, 'make my way north'), null);
});

test('merchants never buy for more than they sell', () => {
  const s = ready('ironport', 30, { coin: 1e6 });
  for (const item of shop.getShopStock(s)) {
    const before = s.coin;
    const r = shop.buyItem(s, item.name);
    assert.equal(r.success, true, item.name);
    const bought = s.inventory[s.inventory.length - 1];
    assert.ok((bought.value || 0) < before - s.coin, `${item.name} resale ${bought.value} < price ${before - s.coin}`);
  }
});

test('equipment stat bonuses vanish when unequipped', () => {
  const s = ready('thornwick', 30);
  const base = ch.getEffectiveStats(s).str;
  s.inventory.push({ name: 'emberforged sword', tier: 4, statMods: { str: 3 } });
  const { processEquipCommand, detectEquipIntent } = require('../game/economy');
  processEquipCommand(s, detectEquipIntent('equip emberforged sword'));
  assert.equal(ch.getEffectiveStats(s).str, base + 3);
  processEquipCommand(s, detectEquipIntent('unequip emberforged sword'));
  assert.equal(ch.getEffectiveStats(s).str, base);
  assert.equal(s.stats.str, base, 'base stats never mutated');
});

// ---------------- companions & factions ----------------
test('companions must be earned, and loyalty follows faction choices', () => {
  const s = ready('thornwick', 5);
  assert.equal(comps.recruit(s, 'Brannoc').success, false, 'not met');
  comps.onMeet(s, 'brannoc');
  assert.equal(comps.recruit(s, 'Brannoc').success, false, 'met but not trusted');
  assert.equal(comps.onMeet(s, 'brannoc'), null, 'meeting twice gives nothing');
  comps.onQuestCompleted(s, 'thornwick');
  const r = comps.recruit(s, 'Brannoc');
  assert.equal(r.success, true);
  assert.equal(r.companion.role, 'guardian');
  assert.equal(comps.recruit(s, 'Gandalf').unknown, true, 'invented names cannot be recruited');

  const loyaltyBefore = r.companion.loyalty;
  comps.onFactionChanges(s, [{ faction: 'compact', delta: -20 }]);
  assert.ok(s.companions[0].loyalty < loyaltyBefore);

  factions.ensureFactions(s);
  factions.changeStanding(s, { compact: 60 });
  assert.ok(factions.getPriceModifier(s) < 1, 'Compact friends get better prices');
});

// ---------------- quests ----------------
const quests = require('../game/quests');

test('retrieve quests need the guardian, the item, and a turn-in at home', () => {
  const s = ready('thornwick', 5);
  const q = { id: 'q1', type: 'retrieve', target: 'stolen ledger', location: 'the old mill', targetCount: 1, progress: 0, regionKey: 'thornwick', reward: { coin: 10, xp: 10 } };
  s.activeQuests = [q];
  quests.checkQuestProgress(s, 'I walk to the old mill', []);
  assert.equal(q.guardianPending, true);
  quests.checkQuestProgress(s, 'x', [{ type: 'enemyDefeated', enemyLabel: 'Road Wolf', meta: null }]);
  assert.equal(q.recovered, undefined, 'an unrelated kill does not count');
  quests.checkQuestProgress(s, 'x', [{ type: 'enemyDefeated', enemyLabel: 'Road Wolf', meta: { questGuardian: 'q1' } }]);
  assert.equal(q.recovered, true);
  assert.ok(s.inventory.some(i => i.name === 'stolen ledger (quest item)'));
  assert.equal(q.progress, 0, 'not complete until turned in');
  s.character.region = 'dustfall';
  quests.checkQuestProgress(s, 'I turn in the ledger', []);
  assert.equal(q.progress, 0, 'must turn in where the job was posted');
  s.character.region = 'thornwick';
  quests.checkQuestProgress(s, 'I turn in the ledger', []);
  assert.equal(q.progress, 1);
  assert.ok(!s.inventory.some(i => i.name === 'stolen ledger (quest item)'), 'item handed over');
});

test('supply contracts consume real materials; escorts cannot be talked into completion', () => {
  const s = ready('thornwick', 5);
  const sup = { id: 'q2', type: 'supply', target: 'timber', targetCount: 3, progress: 0, regionKey: 'thornwick', tier: 1, reward: { coin: 10, xp: 10 } };
  s.activeQuests = [sup];
  world.addMaterial(s, 'timber', 2);
  quests.checkQuestProgress(s, 'deliver the timber', []);
  assert.equal(sup.progress, 0);
  world.addMaterial(s, 'timber', 2);
  quests.checkQuestProgress(s, 'deliver the timber', []);
  assert.equal(sup.progress, 3);
  assert.equal(world.countMaterial(s, 'timber'), 1, 'exactly 3 consumed');

  const esc = { id: 'q3', type: 'escort', targetCount: 1, progress: 0, reward: { coin: 1, xp: 1 } };
  s.activeQuests = [esc];
  quests.checkQuestProgress(s, "we're here, we arrived", []);
  assert.equal(esc.progress, 0);
});

// ---------------- durability ----------------
const D = require('../game/durability');

test('gear wears in combat, loses power when worn/broken, and keeps wear through re-equipping', () => {
  seedRandom(4);
  const s = ready('ironport', 20);
  s.gear.weapon = ch.buildGearItem({ name: 'sword', tier: 4 }, false);
  s.gear.weapon.durability = 26;
  for (let i = 0; i < 40; i++) D.wearGear(s, { struck: true, wasHit: false });
  assert.ok(s.gear.weapon.durability < 26);
  assert.ok(D.durabilityFactor(s.gear.weapon) < 1);
  s.gear.weapon.durability = 0;
  assert.equal(D.durabilityFactor(s.gear.weapon), 0, 'broken gear gives nothing');
  const { processEquipCommand, detectEquipIntent } = require('../game/economy');
  processEquipCommand(s, detectEquipIntent('unequip sword'));
  processEquipCommand(s, detectEquipIntent('equip sword'));
  assert.equal(s.gear.weapon.durability, 0, 'unequip/equip is not a free repair');
});

test('repairs cost coin at a merchant or ore for a blacksmith; reforging needs skill', () => {
  const s = ready('ironport', 20, { coin: 0 });
  s.gear.weapon = ch.buildGearItem({ name: 'sword', tier: 4 }, false);
  s.gear.weapon.durability = 40;
  assert.equal(D.repair(s).success, false, 'no coin, no repair');
  s.coin = 10000;
  assert.equal(D.repair(s).success, true);
  assert.equal(s.gear.weapon.durability, 100);
  assert.ok(s.coin < 10000);

  const smith = ready('the_core_wastes', 40, { profession: 'blacksmith', profXP: 0, coin: 5000 });
  smith.character.region = 'shattered_throne';   // no settlement
  smith.gear.weapon = ch.buildGearItem({ name: 'sword', tier: 3 }, false);
  smith.gear.weapon.durability = 50;
  world.addMaterial(smith, 'silver ore', 5);
  assert.equal(D.repair(smith).success, true, 'blacksmiths repair with ore anywhere');
  assert.equal(world.countMaterial(smith, 'silver ore'), 3);
  assert.equal(D.reforge(smith, 'sword').success, false, 'needs profession level 3');
  smith.profXP = 200;
  const r = D.reforge(smith, 'sword');
  assert.equal(r.success, true, r.message);
  assert.equal(smith.gear.weapon.tier, 4);
  assert.equal(world.countMaterial(smith, 'silver ore'), 0);
});

test('profession unlocks: gated recipes, combat elixirs and snares, scholar scrolls', () => {
  seedRandom(6);
  const alch = ready('ironport', 30, { profession: 'alchemist', profXP: 60 });   // level 2
  world.addMaterial(alch, 'herbs', 4); world.addMaterial(alch, 'emberglass', 1);
  assert.equal(crafting.craft(alch, crafting.detectCraft(alch, 'brew elixir of might')).success, false, 'needs level 3');
  alch.profXP = 160;
  assert.equal(crafting.craft(alch, crafting.detectCraft(alch, 'brew elixir of might')).success, true);
  assert.equal(alch.inventory.filter(i => i.name === 'elixir of might').length, 3, '2 + level-3 bonus');

  alch.inCombat = true; alch.currentEnemy = combat.spawnEnemy('ironport', 30); T.clearCombatEffects(alch);
  alch.currentEnemy.currentHP = alch.currentEnemy.maxHP = 10000;
  const r = combat.applyCombatRound(alch, 'I drink an elixir of might');
  assert.match(r.combatLog, /elixir of might/);
  assert.ok(T.hasEffect(alch, 'player', 'rage'), 'fury active');
  assert.equal(alch.inventory.filter(i => i.name === 'elixir of might').length, 2, 'one consumed');

  alch.inventory.push({ name: 'snare', type: 'potion', snare: true });
  const snared = combat.applyCombatRound(alch, 'I set a snare');
  assert.match(snared.combatLog, /snare/);
});
