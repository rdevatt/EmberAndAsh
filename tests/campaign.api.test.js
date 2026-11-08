'use strict';

// API tests for the story, world commands, anti-exploit rules and
// persistence of the new systems across save/load and restart.
const { seedRandom, startServer, stopServer, client, createCharacter } = require('./helpers');
const test   = require('node:test');
const assert = require('node:assert/strict');

let base, sessions;
test.before(async () => { seedRandom(77); ({ base, sessions } = await startServer()); });
test.after(stopServer);

async function guestWithCharacter() {
  const c = client(base);
  const g = await c.post('/auth/guest', {});
  c.sessionId = g.sessionId;
  await createCharacter(c);
  return c;
}

test('story: panel, talking advances the step, decisions cannot be undone', async () => {
  const c = await guestWithCharacter();
  const st = await c.get('/state');
  assert.equal(st.story.chapter, 1);
  assert.match(st.story.objective, /Maren/);

  const story = await c.act('story');
  assert.match(story.output, /Smoke on the Road/);

  const talk = await c.act('talk to Maren');
  assert.match(talk.output, /emberglass/);
  assert.match(talk.story.objective, /Vesna/);
  assert.equal(talk.undoable, false);
  const undo = await c.post('/undo');
  assert.equal(undo.status, 409, 'story beats cannot be undone');

  const elsewhere = await c.act('talk to Vesna');
  assert.match(elsewhere.output, /Ironport/, 'NPC is elsewhere');
});

test('world commands: explore, landmark once, gather, factions, abilities, recipes', async () => {
  const c = await guestWithCharacter();
  const list = await c.act('explore');
  assert.match(list.output, /Black Standing Stone/);
  const lm = await c.act('explore the black standing stone');
  assert.match(lm.output, /Warden/);
  const again = await c.act('explore the black standing stone');
  assert.match(again.output, /already explored/);
  const g = await c.act('gather herbs');
  assert.match(g.output, /You gather/);
  for (const cmd of ['factions', 'abilities', 'recipes', 'materials', 'companions']) {
    const r = await c.act(cmd);
    assert.equal(r.isCommand, true, cmd);
  }
});

test('combat rounds lock undo; potions in combat cost a turn', async () => {
  const c = await guestWithCharacter();
  sessions.get(c.sessionId).state.coin = 500;
  await c.act('buy 2 healing potions');
  await c.act('I attack the nearest creature');
  const s = sessions.get(c.sessionId).state;
  assert.equal(s.inCombat, true);
  s.currentEnemy.currentHP = s.currentEnemy.maxHP = 5000;
  s.hp = Math.round(s.maxHp / 2);
  const r = await c.act('drink healing potion');
  assert.match(r.output, /drink a healing potion/);
  assert.match(r.output, /◀/, 'the enemy acts in the same round');
  assert.equal((await c.post('/undo')).status, 409);
  const equip = await c.act('equip common steel sword');
  assert.match(equip.output, /no time to change gear/);
});

test('scene pickups are worthless; invented companions cannot join', async () => {
  const c = await guestWithCharacter();
  const coin = (await c.get('/state')).character.coin;
  await c.act('take the jeweled crown');
  const sold = await c.act('sell jeweled crown');
  assert.match(sold.output, /Sold/);
  const after = (await c.get('/state')).character.coin;
  assert.ok(after - coin <= 1, `junk sold for ${after - coin}`);
  const join = await c.act('recruit Gandalf');
  assert.match(join.output, /Nobody by that name/);
  const cheat = await c.act('set companion Elara');
  assert.match(cheat.output, /earned/);
  assert.equal((await c.get('/state')).party.length, 0);
});

test('campaign, factions, companions, landmarks and travel survive save, restart and load', async () => {
  const c = await guestWithCharacter();
  const username = `camp${Date.now() % 100000}`;
  await c.post('/auth/register', { username, password: 'secret123' });
  const login = await c.post('/auth/login', { username, password: 'secret123', sessionId: c.sessionId });
  c.sessionId = login.sessionId;

  await c.act('talk to Maren');
  await c.act('explore the black standing stone');
  await c.act('travel to Ironport City');
  // Arrange a companion and standing directly (recruitment itself is unit-tested).
  const s = sessions.get(c.sessionId).state;
  s.factions.wardens = 42;
  s.companions.push({ id: 'companion_t', name: 'Brannoc', role: 'guardian', loyalty: 70, rosterId: 'brannoc' });
  await c.act('map');                           // any command persists
  await c.post('/saves/save-to-slot', { slot: 2 });

  sessions.clear();                             // server restart
  const restored = await c.get('/state');
  assert.equal(restored.success, true);
  const loaded = await c.post('/saves/load', { slot: 2 });
  assert.equal(loaded.success, true);
  const st = await c.get('/state');
  assert.match(st.story.objective, /Vesna/, 'story progress kept');
  assert.equal(st.factions.find(f => f.key === 'wardens').value, 42, 'standing kept');
  assert.equal(st.party[0].name, 'Brannoc', 'companion kept');
  assert.equal(st.character.region, 'Ironport City', 'location kept');
  const again = await c.act('travel to Thornwick Valley');
  if (!again.rightPanel || !again.rightPanel.inCombat) {
    const lm = await c.act('explore the black standing stone');
    assert.match(lm.output, /already explored/, 'landmark discovery kept');
  }
});
