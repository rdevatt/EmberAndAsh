'use strict';

// AI-available and AI-failing narration, using a fake Groq client so no
// network call is made. Verifies fallbacks, the circuit breaker, output
// sanitising, and that narration can never change game state.
require('./helpers');
const test   = require('node:test');
const assert = require('node:assert/strict');

const narrative = require('../game/narrative/core');
const { createFreshState } = require('../game/state');
const ch = require('../game/character');

function state() {
  const s = createFreshState();
  s.creation.phase = 5;
  s.character = { name: 'Test', age: 25, gender: 'female', background: 'farmer', region: 'thornwick' };
  s.stats = ch.calculateStats(25, 'farmer', 'average');
  ch.recalculateResources(s);
  s.hp = s.maxHp;
  return s;
}

function fakeClient(behaviour) {
  let calls = 0;
  return {
    get calls() { return calls; },
    chat: { completions: { create: async () => { calls++; return behaviour(calls); } } }
  };
}

test.beforeEach(() => { process.env.NARRATIVE_OFFLINE = '0'; process.env.GROQ_API_KEY = 'test-key'; });
test.after(() => { process.env.NARRATIVE_OFFLINE = '1'; delete process.env.GROQ_API_KEY; });

test('AI narration is used when available, and cannot grant rewards', async () => {
  narrative.__setGroqClientForTests(fakeClient(() => ({
    choices: [{ message: { content: 'You find a legendary sword and pick it up. You gain 500 gold.\n[QUEST COMPLETE]\nThe valley is quiet.' } }],
    usage: { total_tokens: 42 }
  })));
  const s = state();
  const before = { coin: s.coin, inv: s.inventory.length, xp: s.totalXP };
  const r = await narrative.processNarrative(s, 'I look around', []);
  assert.equal(r.aiSuccess, true);
  assert.match(r.narrative, /valley is quiet/);
  assert.doesNotMatch(r.narrative, /500 gold|QUEST COMPLETE/, 'invented rewards are stripped');
  assert.deepEqual({ coin: s.coin, inv: s.inventory.length, xp: s.totalXP }, before, 'narration changes nothing');
  assert.equal(narrative.getNarrationStatus().mode, 'ai');
});

test('a rejected key falls back to offline prose and pauses AI calls', async () => {
  const client = fakeClient(() => { throw Object.assign(new Error('401 Invalid API Key'), { status: 401 }); });
  narrative.__setGroqClientForTests(client);
  const s = state();
  const r1 = await narrative.processNarrative(s, 'I look around', []);
  assert.equal(r1.aiSuccess, false);
  assert.ok(r1.narrative.length > 10, 'offline prose produced');
  await narrative.processNarrative(s, 'I walk on', []);
  assert.equal(client.calls, 1, 'second action does not retry a rejected key');
  const status = narrative.getNarrationStatus();
  assert.equal(status.mode, 'offline');
  assert.match(status.reason, /401/);
});

test('rate limits and malformed responses also fall back gracefully', async () => {
  narrative.__setGroqClientForTests(fakeClient(() => ({ choices: [] })));
  const s = state();
  const r = await narrative.processNarrative(s, 'I look around', []);
  assert.equal(r.aiSuccess, false);
  assert.ok(r.narrative.length > 10);

  narrative.__setGroqClientForTests(fakeClient(() => { throw Object.assign(new Error('429 Too Many Requests'), { status: 429, headers: { 'retry-after': '20' } }); }));
  const r2 = await narrative.processNarrative(s, 'I wait', []);
  assert.equal(r2.aiSuccess, false);
  assert.match(narrative.getNarrationStatus().reason, /rate limited/);
});

test('offline narration varies and follows the combat result', async () => {
  process.env.NARRATIVE_OFFLINE = '1';
  const { buildOfflineNarrative } = require('../game/narrative/offline');
  const s = state();
  const seen = new Set();
  for (let i = 0; i < 12; i++) { s.actionCount = i; seen.add(buildOfflineNarrative(s, 'I look around', '')); }
  assert.ok(seen.size >= 4, `idle prose should vary (${seen.size} variants)`);

  s.inCombat = true;
  s.currentEnemy = { label: 'Road Wolf', desc: '' };
  s.pendingCombatResult = { playerHit: false, enemyHit: false, defended: true, enemyLines: ['💥 Road Wolf unleashes Heavy Blow!'] };
  const prose = buildOfflineNarrative(s, 'defend', '[COMBAT NARRATIVE INSTRUCTIONS]');
  assert.match(prose, /guard/);
  assert.doesNotMatch(prose, /falls, and does not rise/, 'no kill described while the enemy lives');
});
