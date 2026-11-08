'use strict';

// Shared test setup: an isolated temp database, offline narrative (no
// network / AI calls), and an in-process server on a random port.

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ember-test-'));
process.env.EMBER_DB_PATH      = path.join(tmpDir, 'test.db');
process.env.NARRATIVE_OFFLINE  = '1';
process.env.EMBER_NO_AUTOSTART = '1';

// Deterministic randomness so combat/loot-dependent tests are stable.
function seedRandom(seed = 12345) {
  let s = seed >>> 0;
  Math.random = function seeded() {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

let serverInfo = null;

async function startServer() {
  if (serverInfo) return serverInfo;
  const appModule = require('../server/app');
  const server    = appModule.start(0);
  await new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  serverInfo = { server, base, sessions: appModule.sessions };
  return serverInfo;
}

async function stopServer() {
  if (!serverInfo) return;
  await new Promise(resolve => serverInfo.server.close(resolve));
  serverInfo = null;
}

function client(base) {
  let sessionId = null;
  async function call(method, route, body) {
    const res = await fetch(base + route, {
      method,
      headers: { 'Content-Type': 'application/json', ...(sessionId ? { 'x-session-id': sessionId } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, ...json };
  }
  return {
    get sessionId() { return sessionId; },
    set sessionId(v) { sessionId = v; },
    call,
    post: (route, body = {}) => call('POST', route, body),
    get:  (route) => call('GET', route),
    act:  (input) => call('POST', '/action', { input })
  };
}

// Plays character creation through to the opening scene.
async function createCharacter(c, { name = 'Dara', age = 26, background = '1', environment = '3' } = {}) {
  await c.act(`My name is ${name}, I am ${age} years old and female`);
  await c.act('Tall and lean, grey eyes, a scar on my cheek');
  await c.act(background);
  return c.act(environment);
}

module.exports = { seedRandom, startServer, stopServer, client, createCharacter, tmpDir };
