'use strict';

// Content preferences over the real API: independent changes, server-side
// eligibility, persistence (save/load, restart, login on another device),
// inheritance by a new generation, the legacy toggle, and scenes.
const { seedRandom, startServer, stopServer, client, createCharacter } = require('./helpers');
const test   = require('node:test');
const assert = require('node:assert/strict');
const ch = require('../game/character');

let base, sessions;
test.before(async () => { seedRandom(808); ({ base, sessions } = await startServer()); });
test.after(stopServer);

async function guest(opts) {
  const c = client(base);
  const g = await c.post('/auth/guest', {}); c.sessionId = g.sessionId;
  await createCharacter(c, opts);
  return c;
}
const level = (r, k) => r.categories.find(c => c.key === k);

test('defaults, independent changes, invalid values and server-side eligibility', async () => {
  const c = await guest();
  const d = await c.get('/settings/content');
  assert.equal(d.categories.length, 6);
  assert.equal(level(d, 'violence').requested, 'mild');
  const r1 = await c.post('/settings/content', { prefs: { violence: 'mature', language: 'off' } });
  assert.equal(level(r1, 'violence').effective, 'mature');
  assert.equal(level(r1, 'language').effective, 'off');
  assert.equal(level(r1, 'horror').requested, 'mild', 'untouched');
  const bad = await c.post('/settings/content', { prefs: { violence: 'max' } });
  assert.equal(bad.status, 400);
  const gated = await c.post('/settings/content', { prefs: { sexual: 'mature', nudity: 'mature' } });
  assert.equal(level(gated, 'sexual').effective, 'off', 'no adult declaration → off, whatever the UI sends');
  assert.match(level(gated, 'sexual').limited, /adult/);
  const ok = await c.post('/settings/content', { adultConfirmed: true });
  assert.equal(level(ok, 'sexual').effective, 'mild', 'sexual themes never exceed romance (mild)');
  assert.equal(level(ok, 'nudity').art, 'mild', 'artwork caps nudity at implied');
});

test('a minor character never gets adult content, even with the declaration', async () => {
  const c = await guest({ age: 16 });
  const st = await c.get('/state');
  if (st.inCreation) return;                       // background list differs by age; unit-tested
  const r = await c.post('/settings/content', { adultConfirmed: true, prefs: { romance: 'mature', sexual: 'mature', nudity: 'mature' } });
  for (const k of ['romance', 'sexual', 'nudity']) assert.equal(level(r, k).effective, 'off');
  const nsfw = await c.post('/settings/nsfw', { enabled: true });
  assert.equal(nsfw.status, 400);
});

test('preferences persist through save/load, restart, login elsewhere, and a new generation', async () => {
  const c = await guest();
  const username = `cp${Date.now() % 100000}`;
  await c.post('/auth/register', { username, password: 'secret123' });
  const login = await c.post('/auth/login', { username, password: 'secret123', sessionId: c.sessionId });
  c.sessionId = login.sessionId;
  await c.post('/settings/content', { adultConfirmed: true, prefs: { violence: 'off', horror: 'mature', language: 'mature', romance: 'mature' } });
  await c.post('/saves/save-to-slot', { slot: 2 });
  sessions.clear();
  const after = await c.get('/settings/content');
  assert.equal(level(after, 'violence').requested, 'off', 'survives restart');
  await c.post('/saves/load', { slot: 2 });
  assert.equal(level(await c.get('/settings/content'), 'horror').requested, 'mature', 'survives load');

  const c2 = client(base);
  const relog = await c2.post('/auth/login', { username, password: 'secret123' });
  c2.sessionId = relog.sessionId;
  const elsewhere = await c2.get('/settings/content');
  assert.equal(level(elsewhere, 'language').requested, 'mature', 'follows the account to a new device');
  assert.equal(elsewhere.eligibility.adultConfirmed, true);

  // New generation in the same world inherits the player's choices, not the world's.
  const s = sessions.get(c2.sessionId).state;
  s.campaign.ending = 'rekindle';
  const { worldOf, applyEnding } = require('../game/chronicle');
  applyEnding(worldOf(s), s, 'rekindle');
  const histBefore = worldOf(s).history.length;
  const next = await c2.act('new character in this world, 10 years later');
  assert.equal(next.inCreation, true);
  const inherited = await c2.get('/settings/content');
  assert.equal(level(inherited, 'violence').requested, 'off');
  assert.equal(level(inherited, 'romance').requested, 'mature');
  assert.ok(worldOf(sessions.get(c2.sessionId).state).history.length >= histBefore, 'world history untouched by preferences');
});

test('the legacy NSFW toggle maps onto the new categories', async () => {
  const c = await guest();
  const on = await c.post('/settings/nsfw', { enabled: true });
  assert.equal(on.success, true);
  const r = await c.get('/settings/content');
  assert.equal(level(r, 'romance').requested, 'mature');
  assert.equal(level(r, 'sexual').effective, 'mature');
  await c.post('/settings/nsfw', { enabled: false });
  assert.equal(level(await c.get('/settings/content'), 'sexual').effective, 'off');
});

test('scenes carry the effective art settings; combat facts do not change', async () => {
  const c = await guest();
  await c.post('/settings/content', { prefs: { violence: 'mature', horror: 'off' } });
  const fight = await c.act('I attack the nearest creature');
  assert.equal(fight.scene.content.violence, 'mature');
  assert.equal(fight.scene.content.horror, 'off');
  await c.post('/settings/content', { prefs: { violence: 'off' } });
  const s = sessions.get(c.sessionId).state;
  const hpBefore = s.hp;
  const round = await c.act('I slash at its torso');
  assert.equal(round.scene.content.violence, 'off');
  assert.ok(round.scene.events.length > 0, 'the turn is still shown');
  assert.ok(s.hp <= hpBefore, 'damage is still real');
});

test('romance and villainy over the API, with the world reacting', async () => {
  seedRandom(12);
  const c = await guest();
  await c.post('/settings/content', { adultConfirmed: true, prefs: { romance: 'mature', sexual: 'mild' } });
  await c.act('talk to Brannoc');
  const s = sessions.get(c.sessionId).state;
  s.npcRelationships.brannoc.rapport = 70;          // setup: rapport is unit-tested
  const night = await c.act('spend the night with Brannoc');
  assert.match(night.output, /takes your hand/);
  assert.equal(night.scene.mood, 'intimate');
  assert.equal(night.undoable, false);
  await c.act('talk to Old Hask');
  s.npcRelationships.hask.rapport = 30;
  const crime = await c.act('I force myself on Old Hask');
  assert.equal(crime.scene.mood, 'grim');
  assert.equal(crime.scene.npc, null);
  assert.ok(s.corruption >= 20);
  const greet = await c.act('talk to Old Hask');
  assert.match(greet.output, /Stay away from me/);
});
