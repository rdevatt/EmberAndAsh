'use strict';
// Professions measured against each other the way classes are:
//   1. combat: six-fight chains (resting as a player would) for several
//      classes in several regions, each profession at rank 3;
//   2. income: expected value of an 8-hour work shift (coin + materials at
//      their sale value; the thief's risk of being caught included).
// Usage: node scripts/profession-sweep.js [--fights 40] [--rank 3]
process.env.NARRATIVE_OFFLINE = '1';
const path = require('path');
const G = p => require(path.join(__dirname, '..', 'game', p));
const { makePlayer, fight } = require('./lib/builds');
const cb = G('combat'); const ch = G('character'); const perks = G('profession-perks'); const chronicle = G('chronicle');
const { REGIONS, PROFESSIONS } = G('constants');
let seed = 777; Math.random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const argv = process.argv.slice(2); const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const N = parseInt(arg('--fights', '40'), 10);
const RANK = parseInt(arg('--rank', '3'), 10);
const GAP = parseInt(arg('--gap', '6'), 10);      // fight this many levels under the zone, where the edge matters
const CLASSES = ['fighter', 'wizard', 'rogue', 'cleric'];
const REG = ['dustfall', 'greymere', 'sunkenfen_deep', 'old_veldrath', 'the_crucible'];
const profs = [null, ...Object.keys(PROFESSIONS)];

function chainWin(cls, region, prof) {
  const r = REGIONS[region]; const mid = Math.round((r.levelRange[0] + r.levelRange[1]) / 2); const level = Math.max(2, mid - GAP);
  let w = 0;
  for (let i = 0; i < N; i++) {
    const s = makePlayer(level, cls, { region, potions: 3 });
    if (prof) { s.profession = prof; s.professionLevel = RANK; s.maxHp = 0; ch.recalculateResources(s); s.hp = s.maxHp; }
    let alive = true;
    for (let f = 0; f < 6 && alive; f++) {
      const res = fight(s, cb.spawnEnemy(region, mid));
      if (!res.win) { alive = false; break; }
      if (s.hp < s.maxHp * 0.6 || s.mana < s.maxMana * 0.35) { s.hp = s.maxHp; s.mana = s.maxMana; s.stamina = s.maxStamina; }
    }
    if (alive) w++;
  }
  return w / N;
}

console.log(`COMBAT — six-fight chains ${GAP} levels under the zone, rank ${RANK}, ${N} trials per cell, classes ${CLASSES.join('/')}, regions ${REG.join('/')}`);
const rows = [];
for (const p of profs) {
  let sum = 0, n = 0;
  for (const c of CLASSES) for (const r of REG) { sum += chainWin(c, r, p); n++; }
  rows.push({ prof: p || '(none)', win: sum / n });
}
const base = rows[0].win;
for (const r of rows) console.log(`${r.prof.padEnd(11)} ${(r.win * 100).toFixed(1).padStart(5)}%  ${r.prof === '(none)' ? '' : `${((r.win - base) * 100 >= 0 ? '+' : '')}${((r.win - base) * 100).toFixed(1)}`}`);

console.log(`\nINCOME — an 8-hour shift, rank ${RANK}: coin + materials at sale value, per region tier. Risky trades show how often they are caught.`);
const { createFreshState } = G('state');
const MATERIAL_VALUE = { hide: 6, timber: 5, 'iron ore': 7, herbs: 4 };
for (const p of Object.keys(PROFESSIONS)) {
  const def = perks.PERKS[p];
  const region = def.work.where === 'wild' ? 'wyrmwood' : 'ironport';
  let total = 0, pay = 0, caught = 0; const T = 400;
  for (let i = 0; i < T; i++) {
    const s = createFreshState(); s.creation.phase = 5; s.character = { name: 'W', age: 30, region }; s.stats = ch.calculateStats(25, 'farmer', 'average');
    s.totalXP = ch.getXPForLevel(30); s.profession = p; s.professionLevel = RANK; s.coin = 0; s.materials = {};
    chronicle.bindCharacter(s, chronicle.createWorld({})); s.factions = {};
    const r = perks.work(s, 8);
    if (!r.success) { total = NaN; break; }
    let v = s.coin;
    for (const [m, q] of Object.entries(s.materials)) v += q * (MATERIAL_VALUE[m] || 6) * (REGIONS[region].tier || 1);
    pay += v;
    if ((s.deeds || []).length) caught++;
    total += v;
  }
  const tier = REGIONS[region].tier || 1;
  console.log(`${p.padEnd(13)} ${String(Math.round(total / T / tier)).padStart(4)} per tier${def.work.risk ? `  — risky: caught on ${(100 * caught / T).toFixed(1)}% of shifts (${def.work.crime ? def.work.crime.type : 'theft'}, then the law)` : ''}  (${region})`);
}
