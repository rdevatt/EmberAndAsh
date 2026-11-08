'use strict';

// Unit tests for pure game logic (no server, no network).
const { seedRandom } = require('./helpers');
const test   = require('node:test');
const assert = require('node:assert/strict');

const { REGIONS, ENEMIES } = require('../game/constants');
const { createFreshState } = require('../game/state');
const ch     = require('../game/character');
const combat = require('../game/combat');
const quests = require('../game/quests');
const travel = require('../game/travel');
const prof   = require('../game/professions');
const { detectCraftingIntent } = require('../game/character/crafting');
const { detectCompanionIntent, applySocialRapport, equipWeapon, unequipWeapon, checkIntimacyAvailable } = require('../game/economy');
const { parsePickup } = require('../server/routes/gameplay/register');

function readyState(region = 'thornwick', level = 1) {
  const s = createFreshState();
  s.creation.phase = 5;
  s.character = { name: 'Test', age: 25, gender: 'female', background: 'farmer', region };
  s.stats = ch.calculateStats(25, 'farmer', 'average');
  s.totalXP = ch.getXPForLevel(level);
  s.maxHp = s.maxMana = s.maxStamina = 0;
  ch.recalculateResources(s);
  s.hp = s.maxHp; s.mana = s.maxMana; s.stamina = s.maxStamina;
  return s;
}

test('every region can spawn an enemy at its minimum level', () => {
  for (const [key, region] of Object.entries(REGIONS)) {
    const enemy = combat.spawnEnemy(key, region.levelRange[0]);
    assert.ok(enemy, `no enemy spawns in ${key}`);
    assert.ok(enemy.maxHP > 0);
  }
});

test('spawned enemies stay near the player level and rares need a named quest', () => {
  seedRandom(1);
  for (let i = 0; i < 300; i++) {
    const e = combat.spawnEnemy('thornwick', 1, { preferTargets: ['Road Bandits'] });
    assert.ok(e.level <= 5, `level-1 hunt spawned ${e.label} Lv${e.level}`);
    assert.ok(!e.isRare, `broad hunt spawned rare ${e.label}`);
  }
  let sawCaptain = false;
  for (let i = 0; i < 100; i++) {
    const e = combat.spawnEnemy('thornwick', 8, { preferTargets: ['Bandit Captain'] });
    if (e.label === 'Bandit Captain') sawCaptain = true;
  }
  assert.ok(sawCaptain, 'a Clear quest for "Bandit Captain" should be able to spawn it');
});

test('quest targets match enemy labels across plurals', () => {
  assert.ok(combat.enemyMatchesTarget('Forest Wolf', 'wolves'));
  assert.ok(combat.enemyMatchesTarget('Road Wolf', 'Road Wolves'));
  assert.ok(combat.enemyMatchesTarget('Bandit Thug', 'bandits'));
  assert.ok(combat.enemyMatchesTarget('Cave Troll', 'Cave Troll'));
  assert.ok(!combat.enemyMatchesTarget('Thornwick Scavenger', 'wolves'));
});

test('a level-appropriate fight with decent input is usually winnable', () => {
  seedRandom(7);
  let wins = 0;
  for (let i = 0; i < 200; i++) {
    const s = readyState('thornwick', 3);
    s.gear.weapon = ch.buildGearItem({ name: 'pitchfork', tier: 1 }, false);
    s.inCombat = true;
    s.currentEnemy = combat.spawnEnemy('thornwick', 3);
    let rounds = 0;
    while (s.inCombat && s.hp > 0 && rounds++ < 40) {
      combat.applyCombatRound(s, 'I feint left and slash at its torso, watching its footing');
    }
    if (s.hp > 0 && !s.inCombat) wins++;
  }
  assert.ok(wins / 200 > 0.75, `win rate too low: ${wins / 200}`);
});

test('spells cost mana and deal damage', () => {
  seedRandom(3);
  const s = readyState('thornwick', 2);
  s.spells = [ch.getStartingSpell('apprentice_mage') || { label: 'Mana Bolt', manaCost: 8, damage: { min: 4, max: 10 }, type: 'arcane' }];
  s.inCombat = true;
  s.currentEnemy = combat.spawnEnemy('thornwick', 2);
  s.mana = s.maxMana - 20;   // room for the in-combat mana trickle
  const before = s.mana;
  const r = combat.applyCombatRound(s, 'I cast mana bolt at its chest');
  // Casting spends the spell's cost; casters then regain ~3% per round.
  const trickle = Math.max(1, Math.round(s.maxMana * 0.03));
  assert.equal(s.mana, before - s.spells[0].manaCost + trickle);
  assert.ok(r.combatLog.includes(s.spells[0].label));
});

test('grantXP awards free points and resources on level-up', () => {
  const s = readyState('thornwick', 1);
  const oldMax = s.maxHp;
  const evt = ch.grantXP(s, ch.getXPForLevel(3));
  assert.equal(evt.type, 'levelUp');
  assert.equal(evt.newLevel, 3);
  assert.equal(s.freePoints, 2);
  assert.ok(s.maxHp > oldMax);
});

test('gear stat mods apply dynamically and never leak into base stats', () => {
  const s = readyState();
  const baseStr = s.stats.str;
  s.totalXP = ch.getXPForLevel(10);
  equipWeapon(s, { name: 'runed sword', tier: 1, statMods: { str: 3 } });
  assert.equal(s.stats.str, baseStr);
  assert.equal(ch.getEffectiveStats(s).str, baseStr + 3);
  unequipWeapon(s);
  assert.equal(ch.getEffectiveStats(s).str, baseStr);
});

test('creation: free-text numbers are not treated as background picks', () => {
  const s = createFreshState();
  s.creation.phase = 1;
  ch.processCreationInput(s, 'My name is Ana, I am 30 years old and female');
  ch.processCreationInput(s, 'Short and broad, red hair');
  // Previously the "10" selected background #10; the keyword "army" should win.
  ch.processCreationInput(s, 'I served 10 years in the army');
  assert.equal(s.creation.background, 'soldier');
  const s3 = createFreshState();
  s3.creation.phase = 1;
  ch.processCreationInput(s3, 'My name is Ana, I am 30 years old and female');
  ch.processCreationInput(s3, 'Short and broad, red hair');
  const r3 = ch.processCreationInput(s3, '10 years of quiet nothing');
  assert.equal(r3.error, true);
  assert.equal(s3.creation.phase, 3);
  // Plain selections still work
  const s2 = createFreshState();
  s2.creation.phase = 1;
  ch.processCreationInput(s2, 'My name is Ana, I am 30 years old and female');
  ch.processCreationInput(s2, 'Short and broad, red hair');
  ch.processCreationInput(s2, '2');
  assert.equal(s2.creation.background, s2.creation.availableBackgrounds[1]);
});

test('creation: adult content is never enabled for characters under 18', () => {
  const s = createFreshState();
  s.creation.phase = 1;
  ch.processCreationInput(s, 'My name is Kit, I am 15 years old and male');
  ch.processCreationInput(s, 'short, wiry, nipples and other explicit words');
  assert.equal(s.nsfwEnabled, false);
  const adult = readyState();
  adult.character.age = 15;
  adult.nsfwEnabled = true;
  assert.equal(checkIntimacyAvailable(adult, 'x').available, false);
});

test('class/profession offers only resolve on a clear yes/no', () => {
  assert.equal(prof.parseOfferAnswer('yes'), 'yes');
  assert.equal(prof.parseOfferAnswer('No thanks'), 'no');
  assert.equal(prof.parseOfferAnswer('I go north'), null);
  assert.equal(prof.parseOfferAnswer('I keep my eyes open'), null);
  const s = readyState();
  s.pendingClassOffer = 'fighter';
  assert.equal(prof.processClassOfferResponse(s, 'I walk north').handled, false);
  assert.equal(s.pendingClassOffer, 'fighter');
  assert.equal(prof.processClassOfferResponse(s, 'yes').accepted, true);
  assert.equal(s.combatClass, 'fighter');
});

test('profession tasks stay achievable across the 1-5 rank scale', () => {
  assert.ok(prof.calculateProfessionTaskXP(25, 1) > 0, 'level-25 task should be possible at rank 1');
  assert.ok(prof.calculateProfessionTaskXP(95, 5) > 0, 'top tasks should be possible at rank 5');
});

test('crafting needs a real crafting phrase', () => {
  assert.equal(detectCraftingIntent('I make my way to the inn in my cloak', 'blacksmith'), null);
  assert.equal(detectCraftingIntent('I hide and prepare to strike', null), null);
  assert.equal(detectCraftingIntent('I forge a sharp sword', 'blacksmith').itemName, 'sharp sword');
});

test('companion intents are explicit; rapport grows through conversation', () => {
  const st = { companions: [{ name: 'Elara' }], currentNPC: 'Bram', stats: { cha: 10 } };
  assert.equal(detectCompanionIntent('I leave the tavern', st), null);
  assert.equal(detectCompanionIntent('I fire an arrow', st), null);
  assert.equal(detectCompanionIntent('dismiss Elara', st).intent, 'leave');
  assert.equal(detectCompanionIntent('Bram, will you join me?', st).npcName, 'Bram');
  for (let i = 0; i < 5; i++) applySocialRapport(st, 'I talk with Bram about the road');
  assert.ok(st.npcRelationships.bram.rapport >= 30);
});

test('free-form pickups ignore idioms', () => {
  assert.equal(parsePickup('take a swing at the post'), null);
  assert.equal(parsePickup('take the quest'), null);
  assert.equal(parsePickup('take a deep breath'), null);
  assert.deepEqual(parsePickup('take the lantern, the rope and some coins'), ['lantern', 'rope', 'coins']);
  assert.deepEqual(parsePickup('grab the silver locket'), ['silver locket']);
});

test('board quests always point at reachable destinations', () => {
  seedRandom(5);
  for (const [key, region] of Object.entries(REGIONS)) {
    if (!region.hasBountyBoard) continue;
    for (let i = 0; i < 10; i++) {
      const s = readyState(key, region.levelRange[1] + 1);
      for (const q of quests.refreshBoard(s)) {
        if (q.destination) {
          assert.ok(travel.getConnectedRegionKeys(key).includes(q.destination), `${key}: ${q.label} -> ${q.destination}`);
          assert.notEqual(q.destination, key);
        }
        if (q.type === 'advance') {
          assert.ok(REGIONS[q.destination].tier <= region.tier + 1 || !Object.values(REGIONS).some(() => false),
            `${key} (tier ${region.tier}) advance quest skips to tier ${REGIONS[q.destination].tier}`);
          const oneUpExists = travel.getConnectedRegionKeys(key).some(k => REGIONS[k].tier === region.tier + 1);
          if (oneUpExists) assert.equal(REGIONS[q.destination].tier, region.tier + 1, `${key} -> ${q.destination}`);
        }
      }
    }
  }
});

test('hunt quests progress on matching kills and complete with rewards', () => {
  const s = readyState('thornwick', 2);
  s.activeQuests = [{ id: 'q1', type: 'hunt', label: 'Hunt: 2 Road Wolves', target: 'Road Wolves', targetCount: 2, progress: 0, reward: { coin: 100, xp: 50 }, regionKey: 'thornwick' }];
  quests.checkQuestProgress(s, 'attack', [{ type: 'enemyDefeated', enemyLabel: 'Road Wolf' }]);
  quests.checkQuestProgress(s, 'attack', [{ type: 'enemyDefeated', enemyLabel: 'Goblin' }]);
  assert.equal(s.activeQuests[0].progress, 1);
  quests.checkQuestProgress(s, 'attack', [{ type: 'enemyDefeated', enemyLabel: 'Forest Wolf' }]);
  const coin = s.coin;
  const done = quests.processQuestCompletions(s);
  assert.equal(done.length, 1);
  assert.equal(s.coin, coin + 100);
  assert.equal(s.activeQuests.length, 0);
});

test('retrieve quests need the guardian defeated, not just a keyword', () => {
  const s = readyState();
  s.activeQuests = [{ id: 'r', type: 'retrieve', label: 'Retrieve', target: 'stolen ledger', location: 'bandit camp', targetCount: 1, progress: 0, reward: { coin: 1, xp: 1 } }];
  quests.checkQuestProgress(s, 'I step back and come back later', []);
  assert.equal(s.activeQuests[0].progress, 0);
  const u = quests.checkQuestProgress(s, 'I sneak into the bandit camp', []);
  assert.equal(u[0].type, 'guardian');
  quests.checkQuestProgress(s, 'I strike', [{ type: 'enemyDefeated', enemyLabel: 'Road Bandit' }]);
  assert.equal(s.activeQuests[0].progress, 1);
});

test('travel moves between connected regions and gates higher tiers', () => {
  const s = readyState('thornwick', 1);
  assert.equal(travel.travelTo(s, 'greymere').success, false);          // tier 2 at level 1
  assert.equal(travel.travelTo(s, 'ironport').success, true);           // same tier
  assert.equal(s.character.region, 'ironport');
  assert.equal(travel.travelTo(s, 'shattered_throne').success, false);  // not connected
  s.totalXP = ch.getXPForLevel(10);
  assert.equal(travel.travelTo(s, 'greymere').success, true);
  assert.equal(travel.resolveRegion('greymere moors'), 'greymere');
  assert.deepEqual(travel.detectTravelIntent('travel to Ashwood Fringe'), { type: 'travel', destination: 'ashwood_shallow' });
  assert.equal(travel.detectTravelIntent('go to the inn'), null);
});

test('advance quests reveal and complete on arrival', () => {
  const s = readyState('thornwick', 11);
  s.boardQuests = [{ id: 'a', type: 'advance', label: 'Go', destination: 'greymere', targetCount: 1, progress: 0, reward: { coin: 10, xp: 10 } }];
  quests.acceptQuest(s, 'a');
  assert.ok(s.knownRegions.includes('greymere'));
  travel.travelTo(s, 'greymere');
  quests.checkQuestProgress(s, 'travel to greymere', [{ type: 'arrived', region: 'greymere' }]);
  assert.equal(quests.processQuestCompletions(s).length, 1);
});

test('the enemy table is large and every enemy is well-formed', () => {
  for (const [key, e] of Object.entries(ENEMIES)) {
    assert.ok(Array.isArray(e.levelRange) && e.levelRange[0] <= e.levelRange[1], key);
    assert.ok(e.hpBase > 0 && e.label, key);
  }
});

test('death in the wild revives at the last settlement', () => {
  // Every region but the Shattered Throne now has a settlement.
  const s = readyState('the_core_wastes', 95);
  s.visitedRegions = ['the_core_wastes'];
  s.lastSettlement = 'the_core_wastes';
  s.campaign = { unlocked: ['shattered_throne'], flags: {}, choices: {}, completed: [], bossesDefeated: [], chapter: 10, step: 0 };
  travel.travelTo(s, 'shattered_throne');
  assert.equal(s.character.region, 'shattered_throne');
  assert.equal(travel.isSettlement('shattered_throne'), false);
  assert.equal(travel.getRevivalRegion(s), 'the_core_wastes');
});
