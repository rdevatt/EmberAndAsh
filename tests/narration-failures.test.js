'use strict';

// Every way the AI narrator can fail, with a fake client (no network):
// connection refused, a retired or invalid model, a request that never
// answers, a refusal, a repeated reply, and malformed content. Each time
// the turn is still told (by the game's own narrator if need be), the
// game state is untouched, and the breaker pauses calls only when it
// should.
require('./helpers');
const test   = require('node:test');
const assert = require('node:assert/strict');
const narrative = require('../game/narrative/core');
const { createFreshState } = require('../game/state');
const ch = require('../game/character');

function state() {
  const s = createFreshState();
  s.creation.phase = 5;
  s.character = { name: 'Fail', age: 25, gender: 'female', background: 'farmer', region: 'thornwick' };
  s.stats = ch.calculateStats(25, 'farmer', 'average');
  ch.recalculateResources(s); s.hp = s.maxHp;
  return s;
}
function fake(behaviour) {
  const seen = [];
  return { seen, chat: { completions: { create: async (req) => { seen.push(req.model); return behaviour(seen.length, req); } } } };
}
const snapshot = (s) => JSON.stringify({ hp: s.hp, coin: s.coin, xp: s.totalXP, inv: s.inventory, region: s.character.region });
const PROSE = 'Mist lies in the low fields. Somewhere a dog barks twice and goes quiet, and the smell of woodsmoke drifts from the mill.';

test.beforeEach(() => { process.env.NARRATIVE_OFFLINE = '0'; process.env.GROQ_API_KEY = 'test-key'; });
test.after(() => { process.env.NARRATIVE_OFFLINE = '1'; delete process.env.GROQ_API_KEY; delete process.env.EMBER_AI_TIMEOUT_MS; });

test('connection refused: the turn is told offline, and repeated failures pause the AI', async () => {
  const client = fake(() => { throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'), { code: 'ECONNREFUSED' }); });
  narrative.__setGroqClientForTests(client);
  const s = state(); const before = snapshot(s);
  for (let i = 0; i < 3; i++) {
    const r = await narrative.processNarrative(s, `I walk on ${i}`, []);
    assert.equal(r.aiSuccess, false);
    assert.ok(r.narrative.length > 20, 'still told');
  }
  assert.equal(snapshot(s), before, 'nothing changed');
  const st = narrative.getNarrationStatus();
  assert.equal(st.mode, 'offline'); assert.match(st.reason, /unreachable/);
  const calls = client.seen.length;
  await narrative.processNarrative(s, 'I wait', []);
  assert.equal(client.seen.length, calls, 'paused: no call while the breaker is open');
});

test('an invalid or retired model: another is tried; if none answer, the turn is told offline', async () => {
  narrative.__setGroqClientForTests(fake((n, req) => {
    if (n === 1) throw Object.assign(new Error('404 model_not_found'), { status: 404 });
    return { choices: [{ message: { content: PROSE } }] };
  }));
  const s = state();
  const r = await narrative.processNarrative(s, 'I look around', []);
  assert.equal(r.aiSuccess, true, 'a fallback model answered');
  const client = fake(() => { throw Object.assign(new Error('404 model_not_found'), { status: 404 }); });
  narrative.__setGroqClientForTests(client);
  const r2 = await narrative.processNarrative(state(), 'I look around', []);
  assert.equal(r2.aiSuccess, false);
  assert.ok(r2.narrative.length > 20);
  assert.ok(new Set(client.seen).size >= 2, `several models tried (${[...new Set(client.seen)].length})`);
});

test('a request that never answers is abandoned on our own deadline', async () => {
  process.env.EMBER_AI_TIMEOUT_MS = '100';
  narrative.__setGroqClientForTests(fake(() => new Promise(() => {})));
  const s = state();
  const t0 = Date.now();
  const r = await narrative.processNarrative(s, 'I look around', []);
  const ms = Date.now() - t0;
  assert.equal(r.aiSuccess, false);
  assert.ok(r.narrative.length > 20, 'told offline');
  assert.ok(ms < 10000, `gave up in ${ms} ms`);
  delete process.env.EMBER_AI_TIMEOUT_MS;
});

test('a refusal is reported honestly, told offline, and does not count as an outage', async () => {
  narrative.__setGroqClientForTests(fake(() => ({ choices: [{ message: { content: "I'm sorry, but I can't continue with that request." } }] })));
  const s = state();
  const r = await narrative.processNarrative(s, 'I look around', []);
  assert.equal(r.aiSuccess, false);
  assert.doesNotMatch(r.narrative, /I'm sorry, but I can't/, 'the refusal is not shown as story');
  assert.ok(r.narrative.length > 20);
  assert.equal(narrative.getNarrationStatus().mode, 'ai', 'the narrator is not marked as down');
});

test('a repeated reply is caught and the turn is retold', async () => {
  narrative.__setGroqClientForTests(fake(() => ({ choices: [{ message: { content: PROSE } }] })));
  const s = state();
  await narrative.processNarrative(s, 'I look around', []);
  const r = await narrative.processNarrative(s, 'I look around again', []);
  assert.ok(s.narrationStats.repeats >= 1, 'the repeat was noticed');
  assert.ok(r.narrative.length > 20);
  assert.notEqual(r.narrative.trim(), PROSE, 'not the same paragraph twice');
});

test('malformed content: empty, whitespace, an object, thinking tags, control characters, a flood of text', async () => {
  const bad = [
    { choices: [{ message: { content: '' } }] },
    { choices: [{ message: { content: '   \n  ' } }] },
    { choices: [{ message: { content: { text: 'object' } } }] },
    { choices: [{ message: {} }] },
    {},
    null
  ];
  for (const b of bad) {
    narrative.__setGroqClientForTests(fake(() => b));
    const s = state(); const before = snapshot(s);
    const r = await narrative.processNarrative(s, 'I look around', []);
    assert.equal(r.aiSuccess, false, JSON.stringify(b));
    assert.ok(r.narrative.length > 20, 'still told');
    assert.equal(snapshot(s), before);
  }
  narrative.__setGroqClientForTests(fake(() => ({ choices: [{ message: { content: `<think>secret plan</think>${PROSE}\u0000\u0007 ` + 'The road goes on. '.repeat(400) } }] })));
  const r = await narrative.processNarrative(state(), 'I look around', []);
  assert.doesNotMatch(r.narrative, /secret plan|<think>/, 'hidden reasoning never reaches the player');
  assert.ok(r.narrative.length <= 2600, `bounded (${r.narrative.length})`);
});
