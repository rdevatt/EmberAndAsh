'use strict';

// Player agency: the player alone decides what their character says and
// does. Quoted speech is used verbatim, described speech becomes one short
// line, no speech means silence; weapons are only in hand when the player
// draws or names them, and abilities only when named.
const { seedRandom } = require('./helpers');
const test   = require('node:test');
const assert = require('node:assert/strict');
const A = require('../game/agency');
const { createFreshState } = require('../game/state');
const ch = require('../game/character');
const combat = require('../game/combat');
const narrative = require('../game/narrative/core');
const { buildOfflineNarrative } = require('../game/narrative/offline');

const DESCRIBED = 'I walk down the street and stop at the bar, asking for a drink.';
const QUOTED = 'I walk down the street and turn to the bartender asking for a drink "hey barkeep how about an ale"';

test('speech: quoted is exact, described is one short line, none is silence', () => {
  assert.deepEqual(A.playerLine(QUOTED), { exact: true, lines: ['hey barkeep how about an ale'] });
  assert.deepEqual(A.playerLine(DESCRIBED), { exact: false, lines: ['A drink, please.'] });
  assert.equal(A.playerLine('I fight back'), null);
  assert.equal(A.playerLine('I walk to the bar'), null);
  assert.equal(A.voiceDescribed('asking the guard about the missing caravan'), 'What can you tell me about the missing caravan?');
  assert.equal(A.toSecondPerson('I walk to my horse and check its shoes'), 'You walk to your horse and check its shoes.');
  assert.equal(A.toSecondPerson('I shout "I am the law here"'), 'You shout "I am the law here"', 'words inside quotes are never changed');
});

test('AI narration cannot put words in the player\'s mouth', () => {
  const ai = 'You push through the door. "Hey there, bartender! Long day on the road, how about a drink and a hot meal?" you call out. The barkeep grunts. "Coin first," he says, and looks at you and says, "Well?" You add, "I can pay."';
  const q = A.enforcePlayerVoice(ai, QUOTED);
  assert.match(q, /"hey barkeep how about an ale" you call out/, 'the player\'s exact words replace the invented line');
  assert.doesNotMatch(q, /hot meal|I can pay/, 'nothing added before or after, and no second line');
  assert.match(q, /"Coin first," he says/, 'NPC lines are untouched');
  assert.match(q, /"Well\?"/, 'even when they mention "you"');
  const d = A.enforcePlayerVoice(ai, DESCRIBED);
  assert.match(d, /"A drink, please\."/);
  assert.doesNotMatch(d, /I can pay|hot meal/);
  const none = A.enforcePlayerVoice(ai, 'I walk to the bar');
  assert.doesNotMatch(none, /bartender!|I can pay/, 'no speech given: the character says nothing');
  assert.equal(A.enforcePlayerVoice('The barkeep slides a mug across.', QUOTED).startsWith('"hey barkeep how about an ale"'), true, 'speech the model left out is restored verbatim');
});

test('the prompt states the rules and what is in hand', () => {
  const s = createFreshState();
  s.creation.phase = 5;
  s.character = { name: 'Rook', age: 30, gender: 'male', background: 'farmer', region: 'thornwick' };
  s.stats = ch.calculateStats(25, 'farmer', 'average');
  s.gear = { weapon: ch.buildGearItem({ name: 'steel sword', tier: 2 }, false) };
  s.inCombat = true; s.currentEnemy = combat.spawnEnemy('thornwick', 3);
  const p = narrative.buildFullPrompt(s, 'I fight back');
  assert.match(p, /UNARMED: their steel sword is still sheathed/);
  s.weaponDrawn = true;
  assert.match(narrative.buildFullPrompt(s, 'I fight back'), /In hand: steel sword/);
  assert.match(narrative.SYSTEM_PROMPT || require('../game/agency').PROMPT_RULES, /verbatim/);
});

function fighter(cls = null) {
  const s = createFreshState();
  s.creation.phase = 5;
  s.character = { name: 'Rook', age: 30, gender: 'male', background: 'farmer', region: 'thornwick' };
  s.stats = ch.calculateStats(25, 'farmer', 'average');
  s.totalXP = ch.getXPForLevel(10);
  s.gear = { weapon: ch.buildGearItem({ name: 'steel sword', tier: 3 }, false) };
  if (cls) { s.combatClass = cls; s.classLevel = 3; s.spells = [{ label: 'Mana Bolt', manaCost: 5, damage: 10, type: 'arcane' }]; }
  s.maxHp = s.maxMana = s.maxStamina = 0; ch.recalculateResources(s);
  s.hp = s.maxHp; s.mana = s.maxMana; s.stamina = s.maxStamina;
  s.inCombat = true; s.currentEnemy = combat.spawnEnemy('thornwick', 10);
  s.currentEnemy.currentHP = s.currentEnemy.maxHP = 5000;
  return s;
}

test('weapons stay sheathed until the player draws or names one', () => {
  seedRandom(5);
  const s = fighter();
  combat.applyCombatRound(s, 'I fight back');
  assert.equal(s.pendingCombatResult.unarmed, true, '"I fight back" is fists, not the sword');
  assert.match(buildOfflineNarrative(s, 'I fight back', '[COMBAT NARRATIVE INSTRUCTIONS]'), /fist|knuckle|kick|elbow|shoulder|knee|swing|grab/i);
  combat.applyCombatRound(s, 'I draw my sword and attack');
  assert.equal(s.pendingCombatResult.unarmed, false);
  assert.equal(s.pendingCombatResult.weaponUsed, 'steel sword');
  combat.applyCombatRound(s, 'I fight back');
  assert.equal(s.pendingCombatResult.unarmed, false, 'once drawn it stays in hand');
  combat.applyCombatRound(s, 'I sheathe my sword and raise my fists');
  assert.equal(s.weaponDrawn, false);
  combat.applyCombatRound(s, 'I slash at its throat');
  assert.equal(s.pendingCombatResult.unarmed, false, 'a blade verb names the blade');
});

test('a class never decides the action: no spells or abilities unless named', () => {
  seedRandom(6);
  const s = fighter('wizard');
  const mana = s.mana;
  combat.applyCombatRound(s, 'I fight back');
  assert.equal(s.pendingCombatResult.spellCast, undefined);
  assert.equal(s.pendingCombatResult.abilityUsed, undefined);
  assert.equal(s.mana, mana, 'no mana spent on a spell the player never cast');
  combat.applyCombatRound(s, 'I cast mana bolt');
  assert.ok(s.mana < mana, 'naming the spell casts it');
});

test('the live narrator path filters an AI reply that speaks for the player', async () => {
  process.env.NARRATIVE_OFFLINE = '0'; process.env.GROQ_API_KEY = 'test-key';
  narrative.__setGroqClientForTests({ chat: { completions: { create: async () => ({ choices: [{ message: { content: 'You lean on the bar. "Evening, friend — I\'ll take your strongest ale and a room for the night," you say with a wink. The barkeep nods. "Two coppers."' } }] }) } } });
  const s = fighter(); s.inCombat = false; s.currentEnemy = null;
  const r = await narrative.processNarrative(s, QUOTED, []);
  assert.match(r.narrative, /"hey barkeep how about an ale" you say/);
  assert.doesNotMatch(r.narrative, /strongest ale|room for the night/);
  assert.match(r.narrative, /"Two coppers\."/);
  process.env.NARRATIVE_OFFLINE = '1'; delete process.env.GROQ_API_KEY;
});

test('a quote the model re-capitalised is restored in place, not duplicated', () => {
  const ai = 'You turn to the bar.\n\n"Hey barkeep, how about an ale?"\n\nHe grunts. "Five coppers."';
  const out = A.enforcePlayerVoice(ai, QUOTED);
  assert.equal((out.match(/hey barkeep how about an ale/gi) || []).length, 1, 'once');
  assert.ok(out.includes('"hey barkeep how about an ale"'), 'exactly as the player wrote it');
});
