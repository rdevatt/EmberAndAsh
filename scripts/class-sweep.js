'use strict';
// Every class against every region at the region's mid level.
// Usage: node scripts/class-sweep.js [--fights N] [--regions a,b] [--classes x,y]
process.env.NARRATIVE_OFFLINE = '1';
const path = require('path');
const { BUILDS, makePlayer, fight } = require('./lib/builds');
const cb = require(path.join(__dirname, '..', 'game', 'combat'));
const { REGIONS } = require(path.join(__dirname, '..', 'game', 'constants'));
let seed = 4242; Math.random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const argv = process.argv.slice(2); const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const N = parseInt(arg('--fights', '80'), 10);
const regions = arg('--regions', '') ? arg('--regions').split(',') : Object.keys(REGIONS);
const classes = arg('--classes', '') ? arg('--classes').split(',') : Object.keys(BUILDS);
const CHAIN = parseInt(arg('--chain', '0'), 10);   // fights in a row, resting like the bot
const CASTERS = ['wizard', 'sorcerer', 'warlock', 'cleric', 'druid', 'bard', 'paladin'];
const killers = {};
console.log('region'.padEnd(21) + 'lvl ' + classes.map(c => c.slice(0, 6).padEnd(7)).join(''));
const totals = {};
for (const key of regions) {
  const r = REGIONS[key]; const level = Math.round((r.levelRange[0] + r.levelRange[1]) / 2);
  const row = [];
  for (const cls of classes) {
    let w = 0;
    for (let i = 0; i < N; i++) {
      const s = makePlayer(level, cls, { region: key, potions: CHAIN ? 3 : 0 });
      let alive = true;
      for (let f = 0; f < Math.max(1, CHAIN) && alive; f++) {
        const res = fight(s, cb.spawnEnemy(key, level));
        if (!res.win) { alive = false; killers[cls] = killers[cls] || {}; killers[cls][res.label] = (killers[cls][res.label] || 0) + 1; break; }
        // Between fights: rest when hurt (or out of mana, for casters), otherwise one step of recovery.
        const lowMana = CASTERS.includes(cls) && s.mana < s.maxMana * 0.35;
        if (s.hp < s.maxHp * 0.6 || lowMana) { s.hp = s.maxHp; s.mana = s.maxMana; s.stamina = s.maxStamina; }
        else { s.stamina = Math.min(s.maxStamina, s.stamina + Math.floor(s.maxStamina * 0.15)); s.mana = Math.min(s.maxMana, s.mana + Math.floor(s.maxMana * 0.1)); }
      }
      if (alive) w++;
    }
    const pct = Math.round(w / N * 100);
    totals[cls] = (totals[cls] || 0) + pct;
    row.push(String(pct).padEnd(7));
  }
  console.log(key.padEnd(21) + String(level).padEnd(4) + row.join(''));
}
console.log('\nmean'.padEnd(26) + classes.map(c => String(Math.round(totals[c] / regions.length)).padEnd(7)).join(''));
for (const c of classes) { const k = Object.entries(killers[c] || {}).sort((a, b) => b[1] - a[1]).slice(0, 4); if (k.length) console.log(`  ${c} killed by: ${k.map(([l, n]) => `${l} ×${n}`).join(', ')}`); }
