'use strict';
// Per-region combat sweep: a fighter at each region's mid level, tier-appropriate gear.
// Usage: node scripts/region-sweep.js [--fights N]
process.env.NARRATIVE_OFFLINE = '1';
const path = require('path');
const G = p => require(path.join(__dirname, '..', 'game', p));
const T = G('combat-tactics');
const { createFreshState } = G('state'); const ch = G('character'); const cb = G('combat');
const { REGIONS, GEAR_QUALITIES, CLASSES } = G('constants');
let seed = 99; Math.random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const USE_ABILITIES = !process.argv.includes('--attack-only');
const N = parseInt((process.argv.slice(2)[process.argv.slice(2).indexOf('--fights') + 1]) || '150', 10) || 150;
const tierFor = l => { let t = 0; for (const q of GEAR_QUALITIES) if (l >= q.levelReq) t = q.tier; return t; };
function player(level, region) {
  const s = createFreshState(); s.creation.phase = 5;
  s.character = { name: 'S', region }; s.stats = ch.calculateStats(25, 'soldier', 'average');
  s.totalXP = ch.getXPForLevel(level);
  for (let i = 1; i < level; i++) s.stats[['str', 'str', 'vit'][i % 3]]++;
  s.combatClass = 'fighter'; s.classLevel = level >= 30 ? 5 : level >= 15 ? 3 : 1;
  for (let l = 1; l < s.classLevel; l++) { s.stats.str++; s.stats.vit++; }
  const t = tierFor(level);
  s.gear = { weapon: ch.buildGearItem({ name: 'longsword', tier: t }, false), armor: ch.buildGearItem({ name: 'leather armor', tier: t }, true) };
  s.maxHp = 0; ch.recalculateResources(s); s.hp = s.maxHp; s.stamina = s.maxStamina; s.mana = s.maxMana;
  return s;
}
const rows = [];
for (const [key, r] of Object.entries(REGIONS)) {
  const level = Math.round((r.levelRange[0] + r.levelRange[1]) / 2);
  let wins = 0, rounds = 0, hp = 0;
  for (let i = 0; i < N; i++) {
    const s = player(level, key); const e = cb.spawnEnemy(key, level);
    s.inCombat = true; s.currentEnemy = e; let n = 0, last = '';
    while (s.inCombat && s.hp > 0 && n < 60) { const ready = T.buildAbilityList(s).filter(a => a.ready && a.id !== 'power_attack' && (a.cost.stamina || 0) <= s.stamina);
      const heal = ready.find(a => a.id === 'second_wind');
      const strike = ready.find(a => a.id !== 'second_wind');
      const input = /defend to blunt/.test(last) ? 'I defend' : (heal && s.hp < s.maxHp * 0.5) ? 'second wind' : (USE_ABILITIES && strike) ? `I use ${strike.label}` : 'I feint and slash at its torso with a precise strike';
      const res = cb.applyCombatRound(s, input); last = res.combatLog || ''; n++; }
    rounds += n; if (s.hp > 0) { wins++; hp += s.hp / s.maxHp; }
  }
  rows.push([key, r.tier, level, Math.round(wins / N * 100), (rounds / N).toFixed(1), wins ? Math.round(hp / wins * 100) : 0]);
}
console.log('region                 tier lvl  win%  rounds  hpLeft%');
for (const r of rows) console.log(`${r[0].padEnd(22)} ${String(r[1]).padEnd(4)} ${String(r[2]).padEnd(4)} ${String(r[3]).padEnd(5)} ${String(r[4]).padEnd(7)} ${r[5]}`);
const worst = rows.slice().sort((a, b) => a[3] - b[3]).slice(0, 5);
console.log('\nhardest:', worst.map(r => `${r[0]} ${r[3]}%`).join(', '));
