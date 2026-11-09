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

// ---------------- the action guard ----------------
const G = require('../game/action-guard');

test('the narrator cannot act for the player: the bar, the sword, the walk-out', () => {
  const r = G.guard('You settle onto a stool and order an ale. The barkeep pours it. You draw your sword and threaten him. You smile thinly. You walk away into the night. You see the regulars stiffen.', 'I sit at the bar and order an ale', {});
  assert.match(r.text, /settle onto a stool and order an ale/, 'what the player did stays');
  assert.match(r.text, /barkeep pours it/, 'the world stays');
  assert.match(r.text, /You see the regulars stiffen/, 'perception is not a choice');
  assert.doesNotMatch(r.text, /draw your sword|threaten|smile|walk away/);
  assert.deepEqual(r.removed.map(x => x.kind).sort(), ['draw', 'gesture', 'leave']);
});

test('overlapping and ambiguous intentions are honoured exactly', () => {
  const both = G.guard('You punch the guard square in the jaw and run for the gate. Your hand drifts to your dagger.', 'I punch the guard and run', { combat: true, attacked: true });
  assert.match(both.text, /punch the guard square in the jaw and run for the gate/, 'both stated acts stay');
  assert.doesNotMatch(both.text, /hand drifts to your dagger/, 'reaching for a weapon was not stated');
  const look = G.guard('You run your eye over the blades. You buy a fine dagger for ten coins. You nod to the merchant.', "I look at the merchant's wares", {});
  assert.match(look.text, /run your eye over the blades/, 'looking is looking');
  assert.doesNotMatch(look.text, /buy|nod/, 'looking is not buying, or nodding');
  const enter = G.guard('You step inside. You sit at a corner table.', 'I enter the tavern', {});
  assert.doesNotMatch(enter.text, /sit at a corner table/, 'entering is not sitting down');
  const quoted = G.guard('"If you draw that blade, you die," the guard warns.', 'I glare at the guard', {});
  assert.match(quoted.text, /If you draw that blade/, 'an NPC\'s words are not the player\'s acts');
  const talk = G.guard('You ask the smith about the road north. He shrugs.', 'I ask the smith about the road north', {});
  assert.equal(talk.removed.length, 0);
});

test('the engine decides outcomes: no prose kills, spells or weapons it did not allow', () => {
  const kill = G.guard('You kill the wolf with one blow.', 'I attack the wolf', { combat: true, attacked: true, killed: false });
  assert.equal(kill.text, '', 'the wolf is alive: the engine says so');
  const ok = G.guard('You bring the wolf down.', 'I attack the wolf', { combat: true, attacked: true, killed: true });
  assert.equal(ok.removed.length, 0);
  const spell = G.guard('You drive your fist into its ribs. You cast a spell of fire.', 'I fight back', { combat: true, attacked: true });
  assert.doesNotMatch(spell.text, /cast/);
  const sword = G.guard('You draw your sword and strike.', 'I attack it', { combat: true, attacked: true, weaponDrawn: false });
  assert.doesNotMatch(sword.text, /draw your sword/, 'a sheathed weapon stays sheathed');
  const drawn = G.guard('You draw your sword and strike.', 'I draw my sword and attack', { combat: true, attacked: true, weaponDrawn: true });
  assert.equal(drawn.removed.length, 0);
});

test('repetition is caught across recent replies, not only by its opening', () => {
  const a = 'The rain hammers the docks. Gulls wheel over the masts.\n\nThe harbourmaster counts crates under a dripping awning, muttering numbers that never add up.';
  const b = 'Night has come early.\n\nThe harbourmaster counts crates under a dripping awning, muttering numbers that never add up.\n\nThe rain hammers the docks. Gulls wheel over the masts.';
  const r = G.repetition(b, [a]);
  assert.ok(r.droppedParagraphs >= 1, 'paragraphs repeated word for word are dropped');
  assert.ok(r.repeated, 'and a reply that is mostly a rerun is flagged');
  assert.equal(G.repetition('A wholly different scene unfolds by the river, with new people in it and new trouble.', [a]).repeated, false);
});

test('sixty turns with a narrator that keeps acting for the player: none of it survives', async () => {
  process.env.NARRATIVE_OFFLINE = '0'; process.env.GROQ_API_KEY = 'test-key';
  const inventions = ['You draw your blade.', 'You smile and nod.', 'You buy a round for the house.', 'You walk out without a word.', 'You kiss the barmaid.', 'You decide to leave town.'];
  let n = 0;
  narrative.__setGroqClientForTests({ chat: { completions: { create: async () => {
    n++;
    const words = ['river', 'lamp', 'crow', 'bell', 'mud', 'smoke', 'cart', 'gull', 'tide', 'ash'];
    const w = (k) => words[(n * 3 + k) % words.length];
    return { choices: [{ message: { content: `The ${w(1)} and the ${w(2)} shift in the half-light near the ${w(3)}; somewhere a ${w(4)} answers on turn ${n}. ${inventions[n % inventions.length]} The ${w(5)} goes on regardless.` } }] };
  } } } });
  const s = fighter(); s.inCombat = false; s.currentEnemy = null;
  for (let t = 1; t <= 60; t++) {
    s.actionCount = t;
    const r = await narrative.processNarrative(s, t % 2 ? 'I sit by the fire and listen' : 'I watch the door', []);
    assert.doesNotMatch(r.narrative, /draw your blade|smile and nod|buy a round|walk out|kiss the barmaid|decide to leave/, `turn ${t}: ${r.narrative}`);
  }
  assert.ok(s.narrationStats.removedSentences >= 50, 'the guard did the work');
  process.env.NARRATIVE_OFFLINE = '1'; delete process.env.GROQ_API_KEY;
});
