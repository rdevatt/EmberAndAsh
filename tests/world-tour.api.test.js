'use strict';

// Visits all 38 regions through the real API: travel by road, check the
// settlement/merchant, list and explore a landmark, talk to a local,
// gather, and fight. Level is raised between tiers as test setup (the
// full progression is covered by scripts/playthrough.js).
const { seedRandom, startServer, stopServer, client, createCharacter } = require('./helpers');
const test   = require('node:test');
const assert = require('node:assert/strict');
const { REGIONS } = require('../game/constants');
const ch = require('../game/character');

let base, sessions;
test.before(async () => { seedRandom(38); ({ base, sessions } = await startServer()); });
test.after(stopServer);

// Shortest road that never passes through a tier above the destination's.
function route(from, to) {
  const maxTier = Math.max(REGIONS[to].tier, REGIONS[from].tier);
  const prev = { [from]: null }; const q = [from];
  while (q.length) { const k = q.shift(); for (const n of REGIONS[k].adjacent) if (!(n in prev) && REGIONS[n].tier <= maxTier) { prev[n] = k; q.push(n); } }
  const out = []; for (let k = to; k !== from; k = prev[k]) out.unshift(k);
  return out;
}

test('every region can be reached by road and played', { timeout: 240000 }, async () => {
  const c = client(base);
  const g = await c.post('/auth/guest', {}); c.sessionId = g.sessionId;
  await createCharacter(c);
  const s = () => sessions.get(c.sessionId).state;
  const order = Object.keys(REGIONS).sort((a, b) => REGIONS[a].tier - REGIONS[b].tier);
  const visited = new Set([s().character.region]);
  const problems = [];

  for (const dest of order) {
    // Setup: be strong enough for the destination, and have the Throne unsealed.
    const need = REGIONS[dest].levelRange[0] + 4;
    if (ch.getPlayerLevel(s().totalXP) < need) { s().totalXP = ch.getXPForLevel(need); ch.recalculateResources(s()); }
    if (dest === 'shattered_throne') s().campaign.unlocked.push('shattered_throne');
    for (const hop of route(s().character.region, dest)) {
      Object.assign(s(), { inCombat: false, currentEnemy: null, hp: s().maxHp, stamina: s().maxStamina });
      const r = await c.act(`travel to ${REGIONS[hop].label}`);
      if (!r.success || r.character.region !== REGIONS[hop].label) problems.push(`travel ${hop}: ${(r.output || r.error || '').slice(0, 80)}`);
      visited.add(hop);
    }
    Object.assign(s(), { inCombat: false, currentEnemy: null, hp: s().maxHp, stamina: s().maxStamina });
    const r = REGIONS[dest];

    const places = await c.act('explore');
    if (!places.output.includes(r.landmarks[0].name)) problems.push(`${dest}: landmark list`);
    const shop = await c.act('shop');
    if (r.settlement && !/MERCHANTS/.test(shop.output)) problems.push(`${dest}: no merchant`);
    if (r.npcs.length) {
      const talk = await c.act(`talk to ${r.npcs[0].name}`);
      if (!talk.success || talk.status >= 500) problems.push(`${dest}: talk failed`);
    }
    const gather = await c.act('gather');
    if (!/gather|picked this area clean/i.test(gather.output || '')) problems.push(`${dest}: gather`);
    Object.assign(s(), { inCombat: false, currentEnemy: null, hp: s().maxHp });
    const fight = await c.act('I attack the nearest creature');
    if (!fight.rightPanel || !fight.rightPanel.inCombat) problems.push(`${dest}: no enemy spawned`);
    for (let i = 0; i < 40 && s().inCombat; i++) await c.act('I feint and slash at its torso');
    const lm = await c.act(`explore ${r.landmarks[r.landmarks.length - 1].name}`);
    if (lm.status >= 500) problems.push(`${dest}: explore error`);
    Object.assign(s(), { inCombat: false, currentEnemy: null });
  }

  assert.deepEqual(problems, []);
  assert.equal(visited.size, Object.keys(REGIONS).length, 'all regions visited');
});
