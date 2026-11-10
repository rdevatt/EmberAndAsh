'use strict';

// Mature content after the completion pass: the six settings still hold,
// server-side, across everything added since — marriage, assassination
// contracts, companion stories, adventures, the world-life and NPC
// blocks in the narrator's prompt — and a minor never gets adult content.
const { seedRandom, startServer, stopServer, client, createCharacter } = require('./helpers');
const test   = require('node:test');
const assert = require('node:assert/strict');
const ch = require('../game/character');
const chronicle = require('../game/chronicle');

test('the settings survive the new systems, and gating stays server-side', async () => {
  seedRandom(2);
  const { base, sessions } = await startServer();
  try {
    const c = client(base);
    const g = await c.post('/auth/guest', {}); c.sessionId = g.sessionId;
    await createCharacter(c, { name: 'Vesper', age: 30 });
    const st = () => sessions.get(c.sessionId).state;
    await c.post('/settings/content', { adultConfirmed: true });
    await c.post('/settings/content', { prefs: { violence: 'off', romance: 'off' } });
    const prefs0 = JSON.stringify(st().contentPrefs);
    // Play through the new systems.
    st().character.region = 'thornwick';
    for (const cmd of ['news', 'adventures', 'opportunities', 'companion stories', 'paths', 'look around']) await c.act(cmd);
    assert.equal(JSON.stringify(st().contentPrefs), prefs0, 'nothing resets the player\'s choices');
    // Romance off: no marriage, whatever the regard.
    await c.act('talk to Brannoc');
    st().npcRelationships.brannoc.rapport = 100;
    st().partners = { brannoc: { since: 0 } };
    const m = await c.act('marry Brannoc');
    assert.doesNotMatch(m.output || '', /you are wed/, 'romance is off: no wedding');
    assert.equal(st().spouse, undefined);
    // The narrator's prompt still carries the settings with the new blocks in it.
    const prompt = require('../game/narrative/core').buildFullPrompt(st(), 'I look around');
    assert.match(prompt, /People of Thornwick|Thornwick Valley today/, 'the new world blocks are there');
    assert.ok(prompt.includes(require('../game/content-prefs').narrationDirective(st())), 'and so are the content settings, exactly as chosen');
    assert.ok(require('../game/content-prefs').effectivePrefs(st()).violence === 'off');
  } finally { await stopServer(); }
});

test('a contract killing narrated with violence off carries no gore', async () => {
  seedRandom(4);
  const { base, sessions } = await startServer();
  try {
    const c = client(base);
    const g = await c.post('/auth/guest', {}); c.sessionId = g.sessionId;
    await createCharacter(c, { name: 'Quill', age: 30 });
    const st = () => sessions.get(c.sessionId).state;
    await c.post('/settings/content', { prefs: { violence: 'off' } });
    Object.assign(st(), { profession: 'assassin', professionLevel: 3 });
    st().totalXP = ch.getXPForLevel(20); ch.recalculateResources(st());
    const list = require('../game/trade-work').contractsFor(st(), chronicle.worldOf(st()));
    st().contract = { ...list[0], taken: 0, deadlineDay: 1e9 };
    st().character.region = list[0].region;
    const r = await c.act('carry out the contract');
    assert.match(r.output, /It is done/);
    assert.doesNotMatch(r.output, /\b(blood|gore|entrails|viscera|gurgl\w*|spurt\w*|severed)\b/i, 'violence off: the fact, not the gore');
    assert.ok(st().deeds.some(d => d.type === 'murder'), 'the outcome is the same whatever the setting');
  } finally { await stopServer(); }
});

test('a minor character never gets adult content, even with the declaration, in the new systems', async () => {
  seedRandom(6);
  const { base, sessions } = await startServer();
  try {
    const c = client(base);
    const g = await c.post('/auth/guest', {}); c.sessionId = g.sessionId;
    await createCharacter(c, { name: 'Pip', age: 16 });
    const st = () => sessions.get(c.sessionId).state;
    await c.post('/settings/content', { adultConfirmed: true });
    const eff = (await c.get('/settings/content')).effective || {};
    assert.ok(['off', undefined].includes(eff.sexual) || eff.sexual === 'off', `sexual content off for a minor (${eff.sexual})`);
    await c.act('talk to Brannoc');
    st().npcRelationships.brannoc.rapport = 100;
    st().partners = { brannoc: { since: 0 } };
    const m = await c.act('marry Brannoc');
    assert.doesNotMatch(m.output || '', /you are wed/);
    const n = await c.act('spend the night with Brannoc');
    assert.doesNotMatch(n.output || '', /undress|naked|bed together/i);
    assert.equal(st().intimate, undefined, 'no intimate scene with a minor character');
  } finally { await stopServer(); }
});
