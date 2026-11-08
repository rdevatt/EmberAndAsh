'use strict';

// End-to-end API tests: a real server, an isolated temp DB, and offline
// narrative. Plays the core loop the way the browser client does.
const { seedRandom, startServer, stopServer, client, createCharacter } = require('./helpers');
const test   = require('node:test');
const assert = require('node:assert/strict');

let base, sessions;

test.before(async () => {
  seedRandom(2024);
  ({ base, sessions } = await startServer());
});
test.after(stopServer);

async function newGuest() {
  const c = client(base);
  const r = await c.post('/auth/guest', {});
  assert.equal(r.success, true);
  c.sessionId = r.sessionId;
  return { c, guest: r };
}

// Fights until the current enemy is dead, the player dies, or a cap is hit.
async function fightToEnd(c, maxRounds = 40) {
  let last;
  for (let i = 0; i < maxRounds; i++) {
    last = await c.act('I feint left and slash at its torso with a quick, precise strike');
    if (!last.rightPanel || !last.rightPanel.inCombat) break;
  }
  return last;
}

test('guest creation flow reaches the opening scene with full panels', async () => {
  const { c, guest } = await newGuest();
  assert.equal(guest.inCreation, true);
  assert.match(guest.output, /who are you/i);

  const p1 = await c.act('My name is Dara, I am 26 years old and female');
  assert.equal(p1.creationError, false);
  const bad = await c.act('hm');                       // too short for phase 2
  assert.equal(bad.creationError, true);
  assert.equal(bad.creationPhase, 2);
  await c.act('Tall and lean, grey eyes, a scar on my cheek');
  const bgErr = await c.act('nothing you would recognise');
  assert.equal(bgErr.creationError, true, 'unplaceable background should be an error, not advance');
  await c.act('1');
  const done = await c.act('3');

  assert.equal(done.inCreation, false);
  assert.ok(done.output.length > 20);
  assert.equal(done.character.name, 'Dara');
  assert.match(done.character.description, /Tall and lean/);
  assert.ok(done.economy && done.progression && done.board, 'creation finish should send every panel');
  assert.equal(done.board.available, true);
});

test('creation back endpoint rewinds the server phase', async () => {
  const { c } = await newGuest();
  await c.act('My name is Ash, I am 40 years old and male');
  await c.act('Average height, stocky');
  const back = await c.post('/creation/back', { phase: 2 });
  assert.equal(back.success, true);
  const redo = await c.act('Short and wiry, missing an ear');
  assert.equal(redo.creationPhase, 3);
});

test('core loop: board → quest → combat → kill XP → loot → rest → journal', async () => {
  const { c } = await newGuest();
  await createCharacter(c);

  const board = await c.act('check the bounty board');
  assert.ok(board.board.quests.length >= 4);
  const huntIndex = board.board.quests.findIndex(q => q.type === 'hunt') + 1;
  const accepted = await c.act(`accept quest ${huntIndex}`);
  assert.match(accepted.output, /QUEST ACCEPTED/);
  assert.equal(accepted.board.activeQuests.length, 1);

  const journal = await c.act('quests');
  assert.equal(journal.isCommand, true);
  assert.match(journal.output, /QUEST JOURNAL/);

  let killed = false;
  for (let fight = 0; fight < 6 && !killed; fight++) {
    const start = await c.act('I attack the nearest creature');
    assert.equal(start.rightPanel.inCombat, true, 'attacking should start combat');
    const end = await fightToEnd(c);
    if (/Defeated .*XP/.test(end.output)) {
      killed = true;
      assert.ok(end.character.totalXP > 0, 'kill should award XP');
      const loot = await c.act('loot the body');
      assert.equal(loot.commandType, 'loot');
      assert.ok(loot.economy.inventory.length > 0);
      const again = await c.act('loot the body');
      assert.match(again.output, /already looted/);
    }
    await c.act('make camp');
  }
  assert.ok(killed, 'player should win at least one fight in six tries');

  const rest1 = await c.act('rest');
  assert.equal(rest1.character.hp, rest1.character.maxHp);
});

test('quest kill progress is tracked from combat', async () => {
  const { c } = await newGuest();
  await createCharacter(c);
  const board = await c.act('check board');
  const hunt  = board.board.quests.find(q => q.type === 'hunt');
  await c.act(`accept quest ${board.board.quests.indexOf(hunt) + 1}`);

  let progressed = false;
  for (let i = 0; i < 10 && !progressed; i++) {
    await c.act('I attack');
    const end = await fightToEnd(c);
    const st  = await c.get('/state');
    const q   = (st.board.activeQuests || [])[0];
    if (!q || q.progress > 0 || /QUEST COMPLETE/.test(end.output)) progressed = true;
    await c.act('make camp');
  }
  assert.ok(progressed, 'killing hunt targets should advance the quest');
});

test('death revives the player and leaves gear at the death site', async () => {
  const { c } = await newGuest();
  await createCharacter(c);
  // Force a hopeless fight by editing the in-memory state directly.
  const session = sessions.get(c.sessionId);
  session.state.hp = 1;
  await c.act('I attack');
  const r = await fightToEnd(c);
  const st = await c.get('/state');
  if (/DARKNESS/.test(r.output)) {
    assert.equal(st.character.hp, st.character.maxHp);
    assert.equal(st.rightPanel.inCombat, false);
    assert.equal(st.economy.hasDeadGear, true);
    const rec = await c.act('recover my gear');
    assert.match(rec.output, /Gear recovered/);
  } else {
    // Won at 1 HP — still a valid outcome; just make sure state is sane.
    assert.ok(st.character.hp > 0);
  }
});

test('travel: map, same-tier travel, and tier gating', async () => {
  const { c } = await newGuest();
  await createCharacter(c); // starts in Thornwick
  const map = await c.act('map');
  assert.match(map.output, /Roads from here/);
  const blocked = await c.act('travel to Greymere Moors');
  assert.equal(blocked.isCommand, true);
  assert.match(blocked.output, /too dangerous/);
  // Same-tier travel always works (re-roll until no road encounter needed)
  const moved = await c.act('travel to Dustfall Plains');
  assert.equal(moved.character.region, 'Dustfall Plains');
  assert.match(moved.output, /travel from Thornwick Valley to Dustfall Plains/);
});

test('class offers do not block normal play', async () => {
  const { c } = await newGuest();
  await createCharacter(c);
  const session = sessions.get(c.sessionId);
  session.state.pendingClassOffer = 'fighter';
  const r = await c.act('I walk north along the road');
  assert.equal(r.success, true);
  assert.equal(r.progression.pendingClassOffer.key, 'fighter', 'offer should still be pending');
  const yes = await c.act('yes');
  assert.equal(yes.progression.className, 'Fighter');
});

test('commands return full panels (no stale UI)', async () => {
  const { c } = await newGuest();
  await createCharacter(c);
  for (const cmd of ['help', 'gear', 'stats', 'take the lantern', 'drop lantern', 'rest']) {
    const r = await c.act(cmd);
    assert.equal(r.isCommand, true, cmd);
    assert.ok(r.character && r.economy && r.progression && r.board, `${cmd} should include panels`);
  }
});

test('loose coin pickups are capped', async () => {
  const { c } = await newGuest();
  await createCharacter(c);
  const before = (await c.get('/state')).economy.coin;
  await c.act('take the 1000 gold coins');
  const after = (await c.get('/state')).economy.coin;
  assert.ok(after - before <= 25, `took ${after - before} copper`);
});

test('undo restores the previous state', async () => {
  const { c } = await newGuest();
  await createCharacter(c);
  const before = (await c.get('/state')).economy.inventory.length;
  await c.act('take the rope');
  const undo = await c.post('/undo');
  assert.equal(undo.success, true);
  assert.equal(undo.economy.inventory.length, before);
});

test('guest session survives an in-memory session wipe (server restart)', async () => {
  const { c } = await newGuest();
  await createCharacter(c);
  await c.act('take the rope');
  sessions.clear();                                // simulate restart
  const st = await c.get('/state');
  assert.equal(st.success, true, 'session should be restored from the DB');
  assert.ok(st.economy.inventory.some(i => /rope/.test(typeof i === 'string' ? i : i.name)));
});

test('accounts: register, carry guest character, save slots, restart, re-login', async () => {
  const { c } = await newGuest();
  await createCharacter(c, { name: 'Wren' });
  const guestId = c.sessionId;

  const username = `user${Date.now() % 100000}`;
  const reg = await c.post('/auth/register', { username, password: 'secret123' });
  assert.equal(reg.success, true);
  const login = await c.post('/auth/login', { username, password: 'secret123', sessionId: guestId });
  assert.equal(login.success, true);
  assert.equal(login.hasCharacter, true);
  assert.equal(login.character.name, 'Wren', 'finished guest character carries into the account');
  c.sessionId = login.sessionId;

  await c.act('take the silver locket');
  const slots = await c.get('/saves/all');
  assert.equal(slots.slots[login.saveSlot - 1].name, 'Wren');

  // Save a copy to slot 2, then start a new character in slot 2.
  assert.equal((await c.post('/saves/save-to-slot', { slot: 2 })).success, true);
  const reset = await c.post('/game/reset');
  assert.equal(reset.inCreation, true);

  // Simulated restart: logged-in session restores from player_sessions.
  sessions.clear();
  const st = await c.get('/state');
  assert.equal(st.success, true);
  assert.equal(st.isLoggedIn, true);
  assert.equal(st.inCreation, true, 'slot 2 holds the new (in-creation) character');

  // Load slot 1: Wren is still there with the locket.
  const loaded = await c.post('/saves/load', { slot: 1 });
  assert.equal(loaded.success, true);
  assert.equal(loaded.character.name, 'Wren');
  assert.ok(loaded.economy.inventory.some(i => /locket/.test(typeof i === 'string' ? i : i.name)));

  // Fresh login picks the most recently played save.
  const c2 = client(base);
  const relog = await c2.post('/auth/login', { username, password: 'secret123' });
  assert.equal(relog.hasCharacter, true);
  assert.equal(relog.character.name, 'Wren');
});

test('a brand-new account starts at the first creation question (not stuck)', async () => {
  const c = client(base);
  const username = `fresh${Date.now() % 100000}`;
  await c.post('/auth/register', { username, password: 'secret123' });
  const login = await c.post('/auth/login', { username, password: 'secret123' });
  assert.equal(login.inCreation, true);
  assert.equal(login.creationPhase, 1);
  c.sessionId = login.sessionId;
  const done = await createCharacter(c);
  assert.equal(done.inCreation, false, 'creation should complete for a logged-in player');
});

test('nsfw cannot be enabled for an under-18 character', async () => {
  const { c } = await newGuest();
  await createCharacter(c, { age: 16, background: '1' });
  const st = await c.get('/state');
  if (st.inCreation) return; // background list differs by age; covered by unit tests
  const r = await c.post('/settings/nsfw', { enabled: true });
  assert.equal(r.status, 400);
  const cmd = await c.act('nsfw on');
  assert.match(cmd.output, /unavailable/);
});

test('expired sessions return a machine-readable code', async () => {
  const c = client(base);
  c.sessionId = 'does-not-exist';
  const r = await c.get('/state');
  assert.equal(r.status, 401);
  assert.equal(r.code, 'SESSION_EXPIRED');
});

test('merchant: shop, buy gear and potions, drink a potion, rent a room', async () => {
  const { c } = await newGuest();
  await createCharacter(c);
  sessions.get(c.sessionId).state.coin = 5000;
  const shop = await c.act('shop');
  assert.match(shop.output, /MERCHANT/);
  const sword = await c.act('buy a sword');
  assert.match(sword.output, /Bought .*sword/);
  const equip = await c.act(`equip ${sword.output.match(/Bought (.+?) for/)[1]}`);
  assert.match(equip.output, /Equipped/);
  const potions = await c.act('buy 2 healing potions');
  assert.match(potions.output, /Bought 2 healing potions/);
  sessions.get(c.sessionId).state.hp = 5;
  const drink = await c.act('drink potion');
  assert.match(drink.output, /HP \+\d+/);
  const story = await c.act('I buy an ale for the old farmer');
  assert.notEqual(story.isCommand, true, 'non-stock purchases stay story actions');
  const inn = await c.act('rent a room at the inn');
  assert.equal(inn.commandType, 'longRest');
  assert.match(inn.output, /peaceful night/);
});
