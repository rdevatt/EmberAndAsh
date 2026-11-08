'use strict';

// End-to-end living world over the real API (isolated temp DB, offline
// narration): ending → three paths, a new generation meeting the old
// hero, separate worlds, resuming characters, time accounting, and
// artwork continuity across restarts.
const { seedRandom, startServer, stopServer, client, createCharacter } = require('./helpers');
const test   = require('node:test');
const assert = require('node:assert/strict');
const ch = require('../game/character');
const chronicle = require('../game/chronicle');

let base, sessions;
test.before(async () => { seedRandom(500); ({ base, sessions } = await startServer()); });
test.after(stopServer);

async function newPlayer(name = 'Aldren', desc) {
  const c = client(base);
  const g = await c.post('/auth/guest', {}); c.sessionId = g.sessionId;
  await c.act(`My name is ${name}, I am 30 years old and male`);
  await c.act(desc || 'Tall, short black hair, grey eyes, a scar on my cheek');
  await c.act('1');
  await c.act('3');
  return c;
}

// Test setup: put the character at the final decision of the campaign.
function atFinalChoice(c, flags = {}) {
  const s = sessions.get(c.sessionId).state;
  s.totalXP = ch.getXPForLevel(95);
  ch.recalculateResources(s);
  s.character.region = 'shattered_throne';
  s.gear.weapon = ch.buildGearItem({ name: 'starforged longsword', tier: 9 }, false);
  Object.assign(s.campaign, { chapter: 10, step: 3, completed: [1, 2, 3, 4, 5, 6, 7, 8, 9], flags: { ...s.campaign.flags, ...flags }, unlocked: ['shattered_throne'] });
  s.factions.wardens = 60;
  return s;
}

test('an ending becomes history, offers three paths, and the hero continues', async () => {
  const c = await newPlayer();
  atFinalChoice(c);
  const end = await c.act('choose 1');
  assert.match(end.output, /THE END — The Long Fire/);
  assert.match(end.output, /A NEW AGE: The Age of the Long Fire/);
  assert.match(end.output, /new character in this world/);
  assert.equal(end.world.afterEnding, true);
  const chron = await c.act('chronicle');
  assert.match(chron.output, /The Hollow Sovereign falls/);
  assert.match(chron.output, /Aldren, Keeper of the Ember/);
  const cont = await c.act('continue');
  assert.match(cont.output, /story goes on/);
  const st = await c.get('/state');
  assert.equal(st.world.afterEnding, false);
  const noWork = await c.act('sagas');
  assert.match(noWork.output, /no one here/, 'no patrons at the Throne itself');
  sessions.get(c.sessionId).state.character.region = 'the_core_wastes';   // setup: walk to Last Light
  const sagas = await c.act('sagas');
  assert.match(sagas.output, /A new saga/);
  assert.match(sagas.output, /Ascendant|Travel|Investigate/);
});

test('a new generation in the same world meets the old hero, with its own progression', async () => {
  const c = await newPlayer('Seren', 'long silver hair, violet eyes, dark skin, a tattoo on my cheek');
  atFinalChoice(c, { ownKey: true });
  const end = await c.act('choose 2');
  assert.match(end.output, /The Sun Rises/);
  const heroState = sessions.get(c.sessionId).state;
  const worldId = heroState.worldId;
  const heroPortrait = JSON.stringify(heroState.appearance);

  const next = await c.act('new character in this world, 40 years later');
  assert.equal(next.inCreation, true);
  assert.equal(next.worldId, worldId);
  await c.act('My name is Pell, I am 17 years old and female');
  await c.act('Short and wiry, freckles, red curly hair');
  await c.act('1');
  const born = await c.act('3');
  assert.equal(born.inCreation, false);
  const s = sessions.get(c.sessionId).state;
  assert.equal(s.worldId, worldId, 'same world');
  assert.notEqual(s.characterId, heroState.characterId);
  assert.equal(ch.getPlayerLevel(s.totalXP), 1, 'starts weak');
  assert.ok(!s.inventory.some(i => /starforged/.test(typeof i === 'string' ? i : i.name)), 'no inherited gear');
  assert.equal(s.campaign.inherited, true, 'the Sovereign story is history, not replayed');
  assert.match(born.world.era, /Sunrise Imperium/);
  assert.match(born.world.realm, /Seren, Sun-Emperor/);

  const legends = await c.act('legends');
  assert.match(legends.output, /Seren, Sun-Emperor of Veldrath/);
  const w = chronicle.worldOf(s);
  const fig = w.figures.find(f => f.name === 'Seren');
  assert.equal(JSON.stringify(fig.snapshot.appearance), heroPortrait, 'the legend keeps their look');

  // Travel to the hero's seat (setup: high enough to walk the roads) and meet them.
  s.character.region = 'old_veldrath';
  const talk = await c.act('talk to Seren');
  assert.match(talk.output, /Seren, Sun-Emperor of Veldrath/);
  assert.match(talk.output, /starforged longsword/);
  assert.equal(talk.scene.npc.legend, true, 'the legend is drawn with their stored look');
});

test('a new world is fully separate, the old one is kept, and characters can be resumed', async () => {
  const c = await newPlayer('Bryn');
  const first = sessions.get(c.sessionId).state;
  const oldWorld = first.worldId;
  await c.act('explore the black standing stone');
  const fresh = await c.act('new world');
  assert.equal(fresh.inCreation, true);
  assert.notEqual(fresh.worldId, oldWorld);
  await c.act('My name is Corin, I am 20 years old and male');
  await c.act('Average build, brown hair');
  await c.act('1');
  await c.act('3');
  const chron = await c.act('chronicle');
  assert.doesNotMatch(chron.output, /Bryn/, 'no leakage between worlds');
  const list = await c.get('/world');
  assert.ok(list.worlds.some(w => w.id === oldWorld), 'old world kept');
  const archived = list.archived.find(a => a.name === 'Bryn');
  assert.ok(archived, 'old character archived, not deleted');
  const back = await c.post('/world/resume', { characterId: archived.character_id });
  assert.equal(back.success, true);
  assert.equal(back.character.name, 'Bryn');
  const again = await c.act('explore the black standing stone');
  assert.match(again.output, /already explored/, 'progress intact');
  const list2 = await c.get('/world');
  assert.ok(list2.archived.some(a => a.name === 'Corin'), 'the other character is now set aside');
});

test('time passes only for real actions', async () => {
  const c = await newPlayer('Tamm');
  const w = () => chronicle.worldOf(sessions.get(c.sessionId).state);
  const h0 = chronicle.nowHour(w());
  for (const cmd of ['help', 'map', 'stats', 'story', 'chronicle', 'date', 'factions']) await c.act(cmd);
  await c.get('/state'); await c.get('/state');
  assert.equal(chronicle.nowHour(w()), h0, 'menus and refreshes take no time');
  await c.act('talk to Old Hask');
  assert.equal(chronicle.nowHour(w()), h0, 'a conversation takes no time');
  await c.act('travel to Greymere Moors');                        // refused: too dangerous
  assert.equal(chronicle.nowHour(w()), h0, 'a failed request takes no time');
  await c.act('I look around the valley');
  assert.equal(chronicle.nowHour(w()), h0 + 1, 'a narrated action takes an hour');
  const undo = await c.post('/undo');
  assert.equal(undo.success, true);
  assert.equal(chronicle.nowHour(w()), h0, 'undo rewinds the clock with the action');
  const s = sessions.get(c.sessionId).state; s.inCombat = false;
  await c.act('travel to Dustfall Plains');
  assert.ok(chronicle.nowHour(w()) >= h0 + 48, 'a journey takes days');
  const before = chronicle.nowHour(w());
  sessions.get(c.sessionId).state.inCombat = false;
  await c.act('make camp');
  const d = chronicle.dateOf(chronicle.nowHour(w()));
  assert.ok(chronicle.nowHour(w()) > before);
  assert.equal(d.hour % 24, 7, 'a long rest ends at morning');
  const year0 = sessions.get(c.sessionId).state.character.age;
  const train = await c.act('train strength for 2 years');
  assert.match(train.output, /STR \+/);
  assert.equal(sessions.get(c.sessionId).state.character.age, year0 + 2, 'training ages you');
});

test('portrait identity and world state survive save, restart and load', async () => {
  const c = await newPlayer('Ines', 'long braided auburn hair, green eyes, tan skin');
  const username = `lw${Date.now() % 100000}`;
  await c.post('/auth/register', { username, password: 'secret123' });
  const login = await c.post('/auth/login', { username, password: 'secret123', sessionId: c.sessionId });
  c.sessionId = login.sessionId;
  const p0 = (await c.get('/state')).portrait;
  assert.equal(p0.appearance.hairStyle, 'braided');
  await c.act('I look around');
  const h = chronicle.nowHour(chronicle.worldOf(sessions.get(c.sessionId).state));
  sessions.clear();
  const st = await c.get('/state');
  assert.deepEqual(st.portrait, p0, 'same face after restart');
  assert.equal(chronicle.nowHour(chronicle.worldOf(sessions.get(c.sessionId).state)), h, 'same moment in time');
});
