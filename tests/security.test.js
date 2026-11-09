'use strict';

// Security: headers and cross-origin policy, rate limits, password rules
// (and old accounts still working), remember-me tokens stored only as
// hashes, session revocation, request limits, and account isolation —
// tested with direct unauthorised requests against a temporary database.
const { seedRandom, startServer, stopServer, client, createCharacter } = require('./helpers');
const test   = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

let base, sessions, db, origin;
test.before(async () => {
  seedRandom(77);
  ({ base, sessions } = await startServer());
  db = require('../db/database');
  origin = base.replace(/\/api$/, '');
});
test.after(stopServer);

const raw = (path, opts = {}) => fetch(origin + path, opts);
const uniq = (p) => `${p}${Date.now() % 1000000}${Math.floor(Math.random() * 1000)}`;

async function account(name) {
  const c = client(base);
  const g = await c.post('/auth/guest', {}); c.sessionId = g.sessionId;
  const username = uniq(name);
  const reg = await c.post('/auth/register', { username, password: 'a-decent-pass' });
  assert.equal(reg.success, true, JSON.stringify(reg));
  const login = await c.post('/auth/login', { username, password: 'a-decent-pass', sessionId: c.sessionId });
  c.sessionId = login.sessionId;
  return { c, username, login };
}

test('headers: strict CSP, no framing, no sniffing, no x-powered-by; same-origin CORS', async () => {
  const r = await raw('/');
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /script-src 'self'(;|$)/, 'no inline or remote scripts');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-powered-by'), null);
  const evil = await raw('/api/health', { headers: { Origin: 'https://evil.example' } });
  assert.equal(evil.headers.get('access-control-allow-origin'), null, 'other sites may not read the API');
  const pre = await raw('/api/action', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
  assert.equal(pre.status, 403);
  const health = await (await raw('/api/health')).json();
  assert.deepEqual(Object.keys(health).sort(), ['status', 'uptime'], 'health publishes no counts');
  const api = await raw('/api/state');
  assert.equal(api.headers.get('cache-control'), 'no-store');
});

test('requests: forged session ids, oversized and malformed bodies, unknown routes', async () => {
  const forged = await raw('/api/state', { headers: { 'x-session-id': "' OR 1=1 --" } });
  assert.equal(forged.status, 401);
  const unknown = await raw('/api/state', { headers: { 'x-session-id': '00000000-0000-4000-8000-000000000000' } });
  assert.equal(unknown.status, 401);
  const big = await raw('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'x', password: 'y'.repeat(200000) }) });
  assert.equal(big.status, 413);
  const bad = await raw('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"username": ' });
  assert.equal(bad.status, 400);
  const badBody = await bad.json();
  assert.ok(!/at |stack|node_modules/.test(JSON.stringify(badBody)), 'no internals leaked');
  const none = await raw('/api/does-not-exist');
  assert.equal(none.status, 404);
});

test('passwords: new rules for new passwords; old accounts still log in and are upgraded', async () => {
  const c = client(base);
  for (const [pw, why] of [['short', /at least 8/], ['aaaaaaaaaa', /repeated/], ['password', /common/]]) {
    const r = await c.post('/auth/register', { username: uniq('weak'), password: pw });
    assert.equal(r.status, 400); assert.match(r.error, why);
  }
  const same = uniq('same');
  assert.match((await c.post('/auth/register', { username: same, password: same })).error, /username/);
  // An account created under the old rules (6 characters, 10 rounds).
  const legacy = uniq('legacy');
  db.createPlayer(legacy, bcrypt.hashSync('old123', 10), null);
  const login = await c.post('/auth/login', { username: legacy, password: 'old123' });
  assert.equal(login.success, true, 'existing accounts keep working');
  assert.equal(bcrypt.getRounds(db.getPlayerByUsername(legacy).password_hash), 12, 'and are rehashed at the stronger setting');
  const wrong = await c.post('/auth/login', { username: legacy, password: 'nope' });
  const ghost = await c.post('/auth/login', { username: uniq('nobody'), password: 'nope' });
  assert.equal(wrong.status, 401); assert.equal(ghost.status, 401);
  assert.equal(wrong.error, ghost.error, 'no hint whether the account exists');
});

test('rate limits: repeated failed logins are slowed down', async () => {
  process.env.EMBER_RATE_LIMIT_SCALE = '1';
  try {
    const c = client(base);
    const target = uniq('victim');
    let blocked = null;
    for (let i = 0; i < 14 && !blocked; i++) {
      const r = await c.post('/auth/login', { username: target, password: `guess${i}` });
      if (r.status === 429) blocked = i;
    }
    assert.ok(blocked !== null && blocked <= 11, `guessing is cut off (after ${blocked} tries)`);
  } finally { process.env.EMBER_RATE_LIMIT_SCALE = '1000'; }
});

test('remember-me: tokens stored only as hashes; old raw tokens migrate; logout revokes', async () => {
  const c = client(base);
  const username = uniq('remember');
  await c.post('/auth/register', { username, password: 'a-decent-pass' });
  const login = await c.post('/auth/login', { username, password: 'a-decent-pass', rememberMe: true });
  assert.ok(login.rememberToken && login.rememberToken.length >= 40);
  const player = db.getPlayerByUsername(username);
  assert.equal(db.getPlayerByRememberToken(login.rememberToken), null, 'the raw token is not what is stored');
  const auto = await client(base).post('/auth/auto-login', { rememberToken: login.rememberToken });
  assert.equal(auto.success, true);
  // A token issued before hashing (stored raw) still works once, then is hashed.
  const legacyToken = 'legacy-raw-token-0123456789';
  db.storeRememberToken(player.id, legacyToken);
  const again = await client(base).post('/auth/auto-login', { rememberToken: legacyToken });
  assert.equal(again.success, true);
  assert.equal(db.getPlayerByRememberToken(legacyToken), null, 'migrated to its hash');
  // Logout revokes both the token and the session.
  const lc = client(base); lc.sessionId = auto.sessionId;
  await lc.post('/auth/logout', { rememberToken: login.rememberToken });
  assert.equal((await lc.get('/state')).status, 401, 'the session is gone, in memory and in the database');
  assert.equal((await client(base).post('/auth/auto-login', { rememberToken: login.rememberToken })).status, 401);
});

test('sign out everywhere, and password change revoking other devices', async () => {
  const { c, username } = await account('multi');
  const other = client(base);
  const second = await other.post('/auth/login', { username, password: 'a-decent-pass', rememberMe: true });
  other.sessionId = second.sessionId;
  assert.equal((await other.get('/state')).status, 200);
  const r = await c.post('/auth/logout-all', {});
  assert.equal(r.success, true);
  assert.equal((await other.get('/state')).status, 401, 'the other device is signed out');
  assert.equal((await c.get('/state')).status, 200, 'this one stays');
  assert.equal((await client(base).post('/auth/auto-login', { rememberToken: second.rememberToken })).status, 401);

  const third = client(base);
  third.sessionId = (await third.post('/auth/login', { username, password: 'a-decent-pass' })).sessionId;
  assert.equal((await c.post('/auth/change-password', { currentPassword: 'wrong', newPassword: 'another-good-one' })).status, 401);
  assert.equal((await c.post('/auth/change-password', { currentPassword: 'a-decent-pass', newPassword: 'short' })).status, 400);
  assert.equal((await c.post('/auth/change-password', { currentPassword: 'a-decent-pass', newPassword: 'another-good-one' })).success, true);
  assert.equal((await third.get('/state')).status, 401, 'other sessions end with the old password');
  assert.equal((await client(base).post('/auth/login', { username, password: 'a-decent-pass' })).status, 401);
  assert.equal((await client(base).post('/auth/login', { username, password: 'another-good-one' })).success, true);
  assert.equal((await client(base).post('/auth/logout-all', {})).status, 401, 'guests cannot revoke anything');
});

test('isolation: nobody can load, resume or overwrite another player\'s saves and characters', async () => {
  const a = await account('alice');
  await createCharacter(a.c, { name: 'Alys' });
  await a.c.post('/saves/save-to-slot', { slot: 2 });
  const aliceState = sessions.get(a.c.sessionId).state;
  const aliceWorld = aliceState.worldId;
  // Alice sets her character aside (archived) and starts a new one.
  const nw = await a.c.post('/world/new-character', { mode: 'new' });
  const archivedId = nw.archivedCharacterId;
  assert.ok(archivedId);

  const b = await account('bob');
  await createCharacter(b.c, { name: 'Bram' });
  const steal = await b.c.post('/world/resume', { characterId: archivedId });
  assert.equal(steal.status, 404, 'Bob cannot take Alice\'s archived character');
  const bobWorld = await b.c.get('/world');
  assert.ok(!(bobWorld.worlds || []).some(w => w.id === aliceWorld), 'Bob does not see Alice\'s worlds');
  assert.ok(!(bobWorld.archived || []).some(x => x.character_id === archivedId), 'or her archive');
  const load = await b.c.post('/saves/load', { slot: 2 });
  assert.equal(load.status, 404, 'Bob\'s slot 2 is Bob\'s, and empty');
  const guest = client(base); guest.sessionId = (await guest.post('/auth/guest', {})).sessionId;
  assert.equal((await guest.post('/saves/load', { slot: 2 })).status, 401, 'guests have no account saves');
  assert.equal((await guest.post('/world/resume', { characterId: archivedId })).status, 404);
  // Alice still has her character, untouched.
  assert.equal((await a.c.post('/world/resume', { characterId: archivedId })).success, true);
});

test('guest to account: the character comes along, the old guest id stops working, a new session id is issued', async () => {
  const c = client(base);
  const g = await c.post('/auth/guest', {}); c.sessionId = g.sessionId;
  await createCharacter(c, { name: 'Wren' });
  const guestId = c.sessionId;
  const username = uniq('convert');
  await c.post('/auth/register', { username, password: 'a-decent-pass' });
  const login = await c.post('/auth/login', { username, password: 'a-decent-pass', sessionId: guestId });
  assert.notEqual(login.sessionId, guestId, 'a fresh session id (no fixation)');
  assert.equal(login.carriedGuest, true);
  assert.equal(login.character.name, 'Wren');
  const old = client(base); old.sessionId = guestId;
  sessions.delete(guestId);
  const r = await old.get('/state');
  assert.ok(r.status === 401 || !r.character || r.character.name !== 'Wren', 'the guest copy is gone');
  const fake = await client(base).post('/auth/login', { username, password: 'a-decent-pass', sessionId: 'not-a-uuid' });
  assert.equal(fake.status, 400);
});

test('backups: consistent online copies, integrity-checked; restore refuses a damaged file and keeps the old one', async () => {
  const fs = require('fs'); const path = require('path'); const os = require('os');
  const B = require('../scripts/db-backup');
  const Database = require('better-sqlite3');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ember-backup-'));
  const dbPath = path.join(dir, 'game.db');
  const live = new Database(dbPath);
  live.pragma('journal_mode = WAL');
  live.exec('CREATE TABLE saves (id INTEGER PRIMARY KEY, state TEXT)');
  for (let i = 0; i < 50; i++) live.prepare('INSERT INTO saves (state) VALUES (?)').run(JSON.stringify({ hero: `h${i}` }));
  const r = await B.backup(dbPath, path.join(dir, 'backups'), 3);   // taken while the database is open
  assert.equal(r.ok, true); assert.equal(r.tables.saves, 50);
  live.prepare('DELETE FROM saves').run();
  live.close();
  const restored = B.restore(r.file, dbPath);
  assert.equal(restored.ok, true); assert.equal(restored.tables.saves, 50, 'everything is back');
  assert.ok(fs.readdirSync(dir).some(f => /before-restore/.test(f)), 'the replaced database is kept');
  const broken = path.join(dir, 'broken.db');
  fs.writeFileSync(broken, Buffer.alloc(8192, 7));
  assert.throws(() => B.restore(broken, dbPath), /integrity|not a database|file is not/i, 'a damaged backup is refused');
  for (let i = 0; i < 4; i++) await B.backup(dbPath, path.join(dir, 'backups'), 3);
  assert.equal(B.list(path.join(dir, 'backups')).length, 3, 'old backups are pruned');
});
