'use strict';

// The narrator's long memory: tagged people, places and events, chapter
// notes rolled into eras, the narrator's own NOTES captured — all bounded,
// so turn 10,000 costs what turn 100 does, and what matters is still
// recalled when the player brings it up.
const { seedRandom } = require('./helpers');
const test   = require('node:test');
const assert = require('node:assert/strict');
const { createFreshState } = require('../game/state');
const ch = require('../game/character');
const chronicle = require('../game/chronicle');
const narrative = require('../game/narrative/core');
const memory = require('../game/narrative/memory');

function person() {
  const s = createFreshState();
  s.creation.phase = 5;
  s.character = { name: 'Rook', age: 30, gender: 'male', background: 'farmer', region: 'ironport' };
  s.stats = ch.calculateStats(25, 'farmer', 'average');
  s.totalXP = ch.getXPForLevel(12);
  s.maxHp = s.maxMana = s.maxStamina = 0; ch.recalculateResources(s); s.hp = s.maxHp;
  chronicle.bindCharacter(s, chronicle.createWorld({}));
  return s;
}

test('the narrator\'s NOTES are captured and never shown', () => {
  const r = memory.parseNotes('The barkeep slides a mug over. "Name\'s Gorm."\n\nNOTES:\nGorm | person | barkeep of the Salt Rat tavern in Ironport\nSalt Rat | place | a dockside tavern\n');
  assert.equal(r.text, 'The barkeep slides a mug over. "Name\'s Gorm."');
  assert.equal(r.notes.length, 2);
  assert.deepEqual(r.notes[0], { name: 'Gorm', kind: 'person', fact: 'barkeep of the Salt Rat tavern in Ironport' });
  assert.equal(memory.parseNotes('Quiet.\nNOTES: none').notes.length, 0);
  assert.equal(memory.parseNotes('No notes here.').text, 'No notes here.');
});

test('ten thousand turns: bounded memory, flat prompts, nothing important forgotten', async () => {
  seedRandom(10);
  process.env.NARRATIVE_OFFLINE = '0'; process.env.GROQ_API_KEY = 'test-key';
  let turn = 0;
  const prompts = {};
  narrative.__setGroqClientForTests({ chat: { completions: { create: async (req) => {
    const user = req.messages[req.messages.length - 1].content;
    if (/Summarise these events/.test(user)) return { choices: [{ message: { content: `Rook kept moving through Ironport and beyond, turn ${turn}.` } }] };
    // Varied prose, as a real narrator writes (a repeated reply is caught and retried).
    const W = ['ash', 'rain', 'lantern', 'gull', 'cart', 'bell', 'smoke', 'river', 'crow', 'dust', 'harbour', 'forge', 'candle', 'wind', 'mud', 'tide'];
    const P = (k) => W[(turn * 7 + k * 13 + Math.floor(turn / 3)) % W.length];
    let text = `A ${P(1)} drifts over the ${P(2)} while a ${P(3)} rattles somewhere near the ${P(4)}. Beyond the ${P(5)}, the ${P(6)} and the ${P(7)} carry on as they did on day ${turn}.`;
    if (turn === 5) text += '\n\nNOTES:\nGorm | person | barkeep of the Salt Rat in Ironport';
    else if (turn === 7) text += '\n\nNOTES:\nGorm | person | promised to forge Rook a sword by spring';
    else text += `\n\nNOTES:\nStranger ${turn} | person | someone Rook passed on turn ${turn}`;
    return { choices: [{ message: { content: text } }] };
  } } } });
  const s = person();
  const t0 = Date.now();
  for (turn = 1; turn <= 10000; turn++) {
    s.actionCount = turn;
    const events = [];
    if (turn === 30) events.push({ type: 'crime', crime: 'murder', victim: 'Old Hask', known: false });
    if (turn % 97 === 0) events.push({ type: 'questComplete', quest: { label: `Bounty ${turn}` } });
    if (turn % 211 === 0) events.push({ type: 'travel', to: 'dustfall', toLabel: 'Dustfall Plains' });
    const input = turn === 6 ? 'I tell the barkeep "I need a blade that will not break"' : `I walk on, step ${turn}`;
    if (turn === 6) s.currentNPC = 'Gorm';
    const r = await narrative.processNarrative(s, input, events);
    if (turn === 6) s.currentNPC = null;
    assert.ok(!/NOTES:/.test(r.narrative), 'notes never reach the player');
    if (turn === 100 || turn === 10000) prompts[turn] = narrative.buildFullPrompt(s, 'I walk on');
  }
  const ms = Date.now() - t0;
  const m = s.memory;
  assert.ok(Object.keys(m.entities).length <= memory.CAPS.entities, 'people and places are capped');
  assert.ok(m.events.length <= memory.CAPS.events && m.chapters.length <= memory.CAPS.chapters && m.eras.length <= memory.CAPS.eras && m.recent.length <= memory.CAPS.recent, 'events, chapters, eras and recent turns are capped');
  assert.ok(JSON.stringify(m).length < 250000, `memory stays small (${JSON.stringify(m).length} bytes)`);
  assert.ok(s.conversationHistory.length <= 8 && s.conversationHistory.filter(h => h.role === 'user').every(h => /^\[Player action\]: /.test(h.content)), 'history is compact: the player\'s words, not replayed prompts');
  assert.ok(prompts[10000].length < prompts[100].length * 1.6 + 2000, `the prompt stays flat (${prompts[100].length} → ${prompts[10000].length} chars)`);
  assert.ok(m.eras.length >= 1, 'old chapters roll into eras');

  const gorm = memory.promptBlock(s, 'I go back to Gorm and ask about the sword he promised');
  assert.match(gorm, /Gorm/, 'the barkeep from turn 5 is still known at turn 10,000');
  assert.match(gorm, /promised to forge Rook a sword/, 'and so is his promise');
  assert.match(gorm, /I need a blade that will not break/, 'and what the player said to him');
  const hask = memory.promptBlock(s, 'I think about Old Hask');
  assert.match(hask, /murder against Old Hask/, 'a murder from turn 30 is remembered when it matters');
  assert.ok(ms / 10000 < 20, `fast enough to run every turn (${(ms / 10000).toFixed(2)} ms per turn)`);
  process.env.NARRATIVE_OFFLINE = '1'; delete process.env.GROQ_API_KEY;
});

test('engine events become tagged memory even with no AI at all', async () => {
  process.env.NARRATIVE_OFFLINE = '1';
  const s = person();
  s.actionCount = 1;
  await narrative.processNarrative(s, 'I spend the night with Brannoc', [{ type: 'intimacy', partner: 'Brannoc', style: 'explicit' }]);
  s.actionCount = 2;
  await narrative.processNarrative(s, 'I buy a slave', [{ type: 'slaves', action: 'bought', name: 'Asha' }]);
  const r = memory.recall(s, 'I go to see Brannoc');
  assert.ok(r.entities.some(l => /Brannoc/.test(l) && /lover/.test(l)));
  assert.ok(memory.recall(s, 'Asha').entities.some(l => /Asha/.test(l)));
  assert.ok(memory.threads({ ...s, partners: { b: { name: 'Brannoc' } } }).some(t => /Brannoc/.test(t)), 'open threads are built live from the game');
});

test('names the narration gives are kept, merged with their role, with the right pronoun', () => {
  const s = person(); s.character.region = 'thornwick';
  s.actionCount = 1; memory.record(s, { input: 'I tell the barkeep "Keep a room for me"', narrative: 'He nods.' });
  s.actionCount = 2; memory.record(s, { input: 'I ask his name', narrative: 'The barkeep, Kael, stops wiping the counter. He looks you over.' });
  s.actionCount = 3; memory.record(s, { input: 'I look around', narrative: 'A guard named Joss Harrow leans on the wall. She spits. The smith wipes his hands. "Name\'s Gorm," he says.' });
  const people = Object.values(s.memory.entities).filter(e => e.kind === 'person');
  const kael = people.find(e => e.name === 'Kael');
  assert.ok(kael && kael.facts.some(f => /^he, the barkeep/.test(f.text)) && kael.facts.some(f => /Keep a room/.test(f.text)), 'one barkeep: Kael, he, and what was said to him');
  assert.ok(!people.some(e => /the barkeep of/.test(e.name)), 'the anonymous barkeep entry merged into Kael');
  assert.ok(people.some(e => e.name === 'Joss Harrow' && e.facts.some(f => /^she/.test(f.text))));
  assert.ok(people.some(e => e.name === 'Gorm'));
  assert.ok(!people.some(e => /wipes|his/i.test(e.name)), 'no false names');
  assert.match(memory.promptBlock(s, 'I look for the barkeep'), /Kael/, '"the barkeep" finds Kael');
});

test('a reply that repeats the last one is retried, then told by the game itself', async () => {
  process.env.NARRATIVE_OFFLINE = '0'; process.env.GROQ_API_KEY = 'test-key';
  let calls = 0;
  narrative.__setGroqClientForTests({ chat: { completions: { create: async () => { calls++; return { choices: [{ message: { content: 'The heat in the Old Veldrath is a physical weight, pressing down on the red dunes until the air itself seems to shimmer and warp. The sand sings at noon.' } }] }; } } } });
  const s = person();
  s.actionCount = 1; const a = await narrative.processNarrative(s, 'I feed Hessa well', []);
  s.actionCount = 2; const b = await narrative.processNarrative(s, 'I put Hessa to work as a fighter', []);
  assert.notEqual(b.narrative.slice(0, 80), a.narrative.slice(0, 80), 'the same text is never shown twice in a row');
  assert.ok(calls >= 3, 'it asked again first');
  process.env.NARRATIVE_OFFLINE = '1'; delete process.env.GROQ_API_KEY;
});
