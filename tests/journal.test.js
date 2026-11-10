'use strict';

// The journal: nine pages built from the player's own state, protected
// by the session, never carrying secrets; and every button in it is a
// real command the game understands.
const { seedRandom, startServer, stopServer, client, createCharacter } = require('./helpers');
const test   = require('node:test');
const assert = require('node:assert/strict');
const ch = require('../game/character');
const { TABS } = require('../server/routes/journal');

test('over the API: every page loads for a playing character, is protected, and carries no secrets', async () => {
  seedRandom(3);
  const hadKey = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = hadKey || 'gsk_test_never_shown_0123456789';
  const { base, sessions } = await startServer();
  try {
    const anon = client(base);
    assert.equal((await anon.get('/journal/map')).status, 401, 'no session, no journal');
    const c = client(base);
    const g = await c.post('/auth/guest', {}); c.sessionId = g.sessionId;
    assert.equal((await c.get('/journal/map')).status, 409, 'not before the character exists');
    await createCharacter(c, { name: 'Leaf' });
    assert.equal((await c.get('/journal/nonsense')).status, 404);
    assert.equal((await c.get('/journal/..%2F..%2Fetc')).status, 404);
    const st = () => sessions.get(c.sessionId).state;
    Object.assign(st(), { profession: 'blacksmith', professionLevel: 2, combatClass: 'fighter', freePoints: 2 });
    st().totalXP = ch.getXPForLevel(22); ch.recalculateResources(st());
    const shapes = {
      map: ['here', 'roads', 'known'], quests: ['bounties', 'companionStories', 'actions'], skills: ['stats', 'abilities', 'paths', 'spend'],
      trade: ['profession', 'edge', 'actions'], companions: ['party', 'actions'], politics: ['seats', 'relations', 'here', 'standings'],
      chronicle: ['entries', 'legends'], crafting: ['materials', 'recipes'], ai: ['mode', 'keyConfigured', 'turns']
    };
    assert.deepEqual(TABS.slice().sort(), Object.keys(shapes).sort());
    for (const tab of TABS) {
      const r = await c.get(`/journal/${tab}`);
      assert.equal(r.status, 200, `${tab}: ${r.error}`);
      for (const k of shapes[tab]) assert.ok(k in r.data, `${tab}: has ${k}`);
      const raw = JSON.stringify(r);
      assert.doesNotMatch(raw, /gsk_[A-Za-z0-9_]+/, `${tab}: no key`);
      if (process.env.GROQ_API_KEY.length > 8) assert.ok(!raw.includes(process.env.GROQ_API_KEY), `${tab}: no key`);
      assert.doesNotMatch(raw, /passwordHash|password_hash|\$2[aby]\$|remember_token|sessionId/i, `${tab}: nothing private`);
    }
    const ai = await c.get('/journal/ai');
    assert.equal(ai.data.keyConfigured, true, 'whether a key is set is a yes/no, not the key');
  } finally { await stopServer(); if (hadKey === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = hadKey; }
});

test('over the API: every button in the journal is a real command', async () => {
  seedRandom(5);
  const { base, sessions } = await startServer();
  try {
    const c = client(base);
    const g = await c.post('/auth/guest', {}); c.sessionId = g.sessionId;
    await createCharacter(c, { name: 'Sedge' });
    const st = () => sessions.get(c.sessionId).state;
    Object.assign(st(), { profession: 'blacksmith', professionLevel: 2, combatClass: 'fighter', freePoints: 1 });
    st().totalXP = ch.getXPForLevel(22); ch.recalculateResources(st());
    st().character.region = 'ironport';
    const cmds = new Set();
    for (const tab of TABS) {
      const d = (await c.get(`/journal/${tab}`)).data;
      const walk = (o) => { if (!o || typeof o !== 'object') return; if (typeof o.cmd === 'string') cmds.add(o.cmd); Object.values(o).forEach(walk); };
      walk(d);
    }
    assert.ok(cmds.size >= 15, `buttons found (${cmds.size})`);
    const generic = /The world carries on around you|You are not sure what you mean|Nothing happens/;
    for (const cmd of cmds) {
      if (/^dismiss /.test(cmd)) continue;                   // tested elsewhere; would empty the party
      const before = st().character.region;
      if (st().inCombat) { st().inCombat = false; st().currentEnemy = null; }
      const r = await c.act(cmd);
      assert.ok(r.status === 200 || r.success, `${cmd}: ${r.status} ${r.error || ''}`);
      assert.ok(r.isCommand || (r.output && !generic.test(r.output.split('\n')[0])) || st().character.region !== before, `"${cmd}" is understood: ${(r.output || '').slice(0, 100)}`);
      if (/^travel to /.test(cmd) && st().character.region !== before) st().character.region = before;
      if (/^sign on for a voyage/.test(cmd)) st().character.region = 'ironport';
    }
  } finally { await stopServer(); }
});
