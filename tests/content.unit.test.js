'use strict';

// Mature content preferences: six independent categories, eligibility,
// narration (AI prompt and offline), artwork and its limits, romance,
// villainy, and the rule that preferences never change outcomes.
const { seedRandom } = require('./helpers');
const test   = require('node:test');
const assert = require('node:assert/strict');

const { createFreshState } = require('../game/state');
const ch        = require('../game/character');
const combat    = require('../game/combat');
const prefs     = require('../game/content-prefs');
const romance   = require('../game/romance');
const chronicle = require('../game/chronicle');
const narrative = require('../game/narrative/core');
const { buildOfflineNarrative } = require('../game/narrative/offline');
const { buildScene } = require('../game/scene');
const appearance = require('../game/appearance');
const comps     = require('../game/companions');
const Art       = require('../public/game/art.js');

function adult(age = 30, region = 'oakhaven') {
  const s = createFreshState();
  s.creation.phase = 5;
  s.character = { name: 'Vey', age, gender: 'female', background: 'farmer', region, description: 'long black hair, scar on my cheek' };
  s.stats = ch.calculateStats(25, 'farmer', 'average');
  s.totalXP = ch.getXPForLevel(20);
  s.maxHp = s.maxMana = s.maxStamina = 0; ch.recalculateResources(s);
  s.hp = s.maxHp; s.mana = s.maxMana; s.stamina = s.maxStamina;
  chronicle.bindCharacter(s, chronicle.createWorld({}));
  return s;
}

test('six categories change independently; invalid values are rejected', () => {
  const s = adult();
  assert.deepEqual(prefs.ensurePrefs(s), prefs.DEFAULTS);
  for (const c of prefs.CATEGORIES) {
    for (const lvl of prefs.LEVELS) {
      const before = { ...prefs.ensurePrefs(s) };
      prefs.updatePrefs(s, { [c]: lvl });
      for (const other of prefs.CATEGORIES) if (other !== c) assert.equal(s.contentPrefs[other], before[other], `${c} change left ${other} alone`);
      assert.equal(s.contentPrefs[c], lvl);
    }
  }
  const bad = prefs.updatePrefs(s, { violence: 'extreme', gore: 'mature' });
  assert.equal(bad.rejected.length, 2);
});

test('adult-gated categories need a declared adult player and an adult character', () => {
  const s = adult();
  prefs.updatePrefs(s, { nudity: 'mature', sexual: 'mature', romance: 'mature', violence: 'mature' });
  let eff = prefs.effectivePrefs(s);
  assert.equal(eff.violence, 'mature', 'violence is not age-gated');
  assert.equal(eff.sexual, 'off', 'no attestation → no sexual themes');
  assert.equal(eff.romance, 'mild');
  assert.equal(eff.nudity, 'off');
  s.adultConfirmed = true;
  eff = prefs.effectivePrefs(s);
  assert.equal(eff.sexual, 'mature'); assert.equal(eff.romance, 'mature'); assert.equal(eff.nudity, 'mature');
  assert.equal(prefs.effectivePrefs(s, 'art').nudity, 'mature', 'the renderer draws nudity for eligible adults');
  const young = adult(16); young.adultConfirmed = true;
  prefs.updatePrefs(young, { romance: 'mature', sexual: 'mature', nudity: 'mature' });
  const ey = prefs.effectivePrefs(young);
  assert.deepEqual([ey.romance, ey.sexual, ey.nudity], ['off', 'off', 'off'], 'never for a minor character');
  assert.match(prefs.describe(s).eligibility.notice, /not verified/);
});

test('the AI prompt carries the current preferences', () => {
  const s = adult(); s.adultConfirmed = true;
  prefs.updatePrefs(s, { violence: 'mature', language: 'off', sexual: 'off' });
  const p1 = narrative.buildFullPrompt(s, 'I look around');
  assert.match(p1, /Violence: graphic is allowed/);
  assert.match(p1, /no profanity/);
  assert.match(p1, /never sexualise anyone under 18/);
  prefs.updatePrefs(s, { violence: 'off', language: 'mature' });
  const p2 = narrative.buildFullPrompt(s, 'I look around');
  assert.match(p2, /without blood or injury detail/);
  assert.match(p2, /swear freely/);
});

test('offline narration follows the preferences; outcomes do not', () => {
  const run = (level) => {
    seedRandom(77);
    const s = adult(30, 'thornwick');
    prefs.updatePrefs(s, { violence: level });
    s.inCombat = true; s.currentEnemy = combat.spawnEnemy('thornwick', 20);
    s.currentEnemy.currentHP = s.currentEnemy.maxHP = 5000;
    const out = [];
    for (let i = 0; i < 6; i++) {
      combat.applyCombatRound(s, 'I slash at its torso');
      out.push(buildOfflineNarrative(s, 'I slash', '[COMBAT NARRATIVE INSTRUCTIONS]'));
    }
    return { text: out.join(' '), hp: s.hp, enemy: s.currentEnemy.currentHP };
  };
  const off = run('off'), mature = run('mature');
  assert.equal(off.hp, mature.hp, 'same wounds taken');
  assert.equal(off.enemy, mature.enemy, 'same damage dealt');
  assert.doesNotMatch(off.text, /blood/i);
  assert.match(mature.text, /blood/i);
});

test('artwork follows violence and horror; intimacy is implied only', () => {
  const s = adult(30, 'shattered_throne');
  s.hp = Math.round(s.maxHp * 0.2);
  const killed = { label: 'Bone Warden', level: 20, currentHP: 0, maxHP: 50 };
  const draw = (v, h) => { prefs.updatePrefs(s, { violence: v, horror: h }); const sc = buildScene(s, { killed: true, killedEnemy: killed }); return { sc, svg: Art.scene(sc) }; };
  const off = draw('off', 'off'), mild = draw('mild', 'mild'), mature = draw('mature', 'mature');
  assert.equal(off.sc.wounds, 2, 'the injury is a fact in every setting');
  assert.ok(!/6a0a0a/.test(off.svg) && !/ea-bandage/.test(off.svg), 'off: no gore drawn');
  assert.ok(/ea-bandage/.test(mild.svg), 'mild: bandaged');
  assert.ok(/6a0a0a/.test(mature.svg) && /ea-blood/.test(mature.svg), 'mature: blood');
  assert.ok(/ea-eyes/.test(mature.svg) && !/ea-eyes/.test(mild.svg), 'horror imagery only at mature');

  s.adultConfirmed = true;
  const partner = { appearance: appearance.parseAppearance('', { name: 'Ren' }, 'r') };
  const room = (romanceLvl, nudity) => { prefs.updatePrefs(s, { romance: romanceLvl, nudity }); return Art.scene({ ...buildScene(s, {}), enemy: null, mood: 'intimate', npc: partner, events: [{ type: 'intimacy', style: 'sensual' }] }); };
  const clothed = room('mature', 'off');
  const implied = room('mature', 'mature');
  assert.notEqual(clothed, implied, 'bare shoulders only when nudity is allowed');
  assert.ok(implied.includes(s.appearance.skinHex), 'implied: skin at the shoulders, nothing more');
});

test('romance is earned, adult-only and refusable; flirting cannot be farmed', () => {
  const s = adult(30, 'thornwick');
  s.adultConfirmed = true;
  prefs.updatePrefs(s, { romance: 'mature', sexual: 'mild' });
  assert.match(romance.handle(s, 'kiss Brannoc').message, /not met/);
  comps.onMeet(s, 'brannoc');
  s.npcRelationships.brannoc.rapport = 25;
  const k1 = romance.handle(s, 'flirt with Brannoc');
  assert.equal(k1.success, true);
  const r1 = s.npcRelationships.brannoc.rapport;
  romance.handle(s, 'flirt with Brannoc');
  assert.equal(s.npcRelationships.brannoc.rapport, r1, 'once a day');
  const no = romance.handle(s, 'spend the night with Brannoc');
  assert.equal(no.success, false); assert.match(no.message, /says no/);
  s.npcRelationships.brannoc.rapport = 60;
  const yes = romance.handle(s, 'spend the night with Brannoc');
  assert.equal(yes.success, true);
  assert.equal(yes.event.style, 'sensual', 'sexual: mild → sensual, not explicit');
  assert.ok(s.partners.brannoc);
  assert.equal(romance.handle(s, 'compliment the stew'), null, 'ordinary actions are not romance');

  const young = adult(16, 'thornwick');
  comps.onMeet(young, 'brannoc'); young.npcRelationships.brannoc.rapport = 90;
  assert.equal(romance.handle(young, 'kiss Brannoc').success, false, 'never for a minor character');

  prefs.updatePrefs(s, { romance: 'off' });
  assert.match(romance.handle(s, 'kiss Brannoc').message, /switched off/);
});

test('children can never be involved, villain or not', () => {
  const s = adult(30, 'ruinwatch'); s.adultConfirmed = true;
  prefs.updatePrefs(s, { romance: 'mature', sexual: 'mature' });
  s.npcRelationships = { pick: { rapport: 100, metBefore: true } };
  assert.match(romance.handle(s, 'kiss Pick').message, /child/);
  assert.match(romance.handle(s, 'I force myself on Pick').message, /child/);
  assert.ok(!s.secrets || !s.secrets.length, 'nothing recorded — nothing happened');
});

test('villainy: possible for adults, never depicted, and the world reacts', () => {
  seedRandom(3);
  const s = adult(30, 'oakhaven'); s.adultConfirmed = true;
  prefs.updatePrefs(s, { romance: 'mild' });
  comps.onMeet(s, 'sexton'); s.npcRelationships.sexton.rapport = 40;
  s.companions = [{ id: 'c1', name: 'Tamsin Reed', rosterId: 'tamsin', role: 'striker', loyalty: 60, faction: 'compact' }];
  const standing = { ...s.factions };
  const v = romance.handle(s, 'I force myself on Sexton Abel', { removeCompanion: require('../game/economy').removeCompanion });
  assert.equal(v.villainy, true);
  assert.match(v.hint, /no sexual detail at any setting/);
  assert.equal(s.npcRelationships.sexton.wronged, true, 'the victim never forgives');
  assert.ok(s.corruption >= 20);
  assert.ok(!s.companions.some(c => c.name === 'Tamsin Reed') || s.companions[0].loyalty <= 15, 'the witness turns away');
  assert.match(romance.handle(s, 'kiss Sexton Abel').message, /nothing to do with you/);
  if (v.event.discovered) {
    assert.ok(s.factions.compact < (standing.compact || 0));
    assert.ok(s.infamy >= 30);
    assert.ok(chronicle.worldOf(s).history.some(e => e.type === 'crime'));
  } else {
    assert.equal(s.secrets.length, 1, 'or it waits to surface');
    const infamy = require('../game/infamy');
    seedRandom(1);
    infamy.secretsSurface(s, 60);
    assert.ok(s.infamy >= 30, 'secrets come out eventually');
  }
  const scene = buildScene(s, { events: [v.event] });
  assert.equal(scene.mood, 'grim'); assert.equal(scene.npc.victim, true, 'threat and aftermath drawn, never the act');
  assert.ok(!/ea-rock|ea-bob/.test(Art.scene(scene)), 'no intimate animation in a crime scene');
  const sheltered = adult(30, 'oakhaven');
  comps.onMeet(sheltered, 'sexton'); sheltered.npcRelationships.sexton.rapport = 40;
  assert.match(romance.handle(sheltered, 'I force myself on Sexton Abel').message, /adult player/, 'needs the adult declaration');
});

test('an AI refusal is reported honestly and falls back offline', async () => {
  process.env.NARRATIVE_OFFLINE = '0'; process.env.GROQ_API_KEY = 'test-key';
  narrative.__setGroqClientForTests({ chat: { completions: { create: async () => ({ choices: [{ message: { content: "I'm sorry, but I can't help with that." } }] }) } } });
  const s = adult();
  const r = await narrative.processNarrative(s, 'I look around', []);
  assert.equal(r.aiDeclined, true);
  assert.match(r.narrative, /AI narrator declined/);
  assert.equal(narrative.getNarrationStatus().mode, 'ai', 'a refusal is not an outage');
  process.env.NARRATIVE_OFFLINE = '1'; delete process.env.GROQ_API_KEY;
});

test('explicit consensual art: the pose the player describes, bodies by the nudity setting', () => {
  const s = adult(30, 'oakhaven'); s.adultConfirmed = true;
  prefs.updatePrefs(s, { romance: 'mature', sexual: 'mature', nudity: 'mature' });
  const partner = { appearance: appearance.parseAppearance('', { name: 'Brannoc', gender: 'male' }, 'b'), gender: 'male', age: 35 };
  const draw = (pose, extra = {}) => Art.scene({ ...buildScene(s, {}), enemy: null, mood: 'intimate', npc: partner, events: [{ type: 'intimacy', style: 'explicit', pose }], intimacy: { pose, undressed: true }, ...extra });
  assert.equal(romance.poseFrom('I climb on top of him and ride him'), 'astride');
  assert.equal(romance.poseFrom('I take her from behind'), 'behind');
  assert.equal(romance.poseFrom('I kiss him'), 'kiss');
  for (const pose of ['lying', 'astride', 'behind', 'oral']) assert.match(draw(pose), /ea-rock|ea-bob/, `${pose} is animated`);
  const full = draw('lying');
  assert.ok(full.includes('r="3.6"'), 'her body is drawn, not implied');
  assert.ok(!draw('lying').includes('#d8d0c0" opacity="0.95"'), 'no sheet at Mature');
  prefs.updatePrefs(s, { nudity: 'mild' });
  assert.ok(Art.scene({ ...buildScene(s, {}), enemy: null, mood: 'intimate', npc: partner, events: [{ type: 'intimacy', style: 'explicit', pose: 'lying' }], intimacy: { pose: 'lying', undressed: true } }).includes('opacity="0.95"'), 'Mild: a sheet over the hips');
  prefs.updatePrefs(s, { sexual: 'mild', nudity: 'mature' });
  assert.doesNotMatch(Art.scene({ ...buildScene(s, {}), enemy: null, mood: 'intimate', npc: partner, events: [{ type: 'intimacy', style: 'sensual', pose: 'lying' }], intimacy: { pose: 'lying', undressed: true } }), /ea-rock|ea-bob/, 'sensual stays under the covers');
});

test('undressing is the player\'s to describe, and is drawn as the setting allows', () => {
  const agency = require('../game/agency');
  const s = adult(30, 'wyrmwood'); s.adultConfirmed = true;
  assert.equal(agency.updateDress(s, 'I undress and wade into the river'), 'undressed');
  prefs.updatePrefs(s, { nudity: 'mature' });
  let sc = buildScene(s, {});
  assert.equal(sc.player.nude, true);
  assert.ok(Art.scene(sc).includes('r="3.6"'), 'drawn nude at Mature');
  prefs.updatePrefs(s, { nudity: 'off' });
  assert.ok(Art.scene(buildScene(s, {})).includes('#d8d0c0'), 'a plain shift at Off');
  agency.updateDress(s, 'I get dressed');
  assert.equal(buildScene(s, {}).player.nude, false);
  const young = adult(16, 'wyrmwood'); young.adultConfirmed = true; agency.updateDress(young, 'I undress');
  prefs.updatePrefs(young, { nudity: 'mature' });
  assert.ok(!Art.scene(buildScene(young, {})).includes('r="3.6"'), 'never for a minor character');
});

test('offline narration: explicit for consenting adults at Mature, the crime told without sexual detail', () => {
  const s = adult(30, 'thornwick'); s.adultConfirmed = true;
  prefs.updatePrefs(s, { romance: 'mature', sexual: 'mature' });
  const x = buildOfflineNarrative(s, 'I climb on top of him', '[INTIMATE SCENE — Brannoc (an adult) and the player, both willing, now: astride. The player\'s settings allow explicit sex: write it fully.]');
  assert.match(x, /straddle|ride|on top/i);
  assert.match(x, /\bhim\b|\bhis\b/, 'Brannoc is "he"');
  const crime = buildOfflineNarrative(s, 'I force myself on Old Hask', '[VILLAIN ACT — the player character coerced Old Hask (an adult). Narrate it.]');
  assert.match(crime, /never offered|silent|curls away|begs/);
  assert.doesNotMatch(crime, /moan|thrust|ride|naked|bare/i, 'no sexual detail');
});
