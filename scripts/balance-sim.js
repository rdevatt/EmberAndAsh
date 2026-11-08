'use strict';
// Repeatable combat balance simulation using the real game modules.
// Usage: node scripts/balance-sim.js [--seed N] [--fights N]
// Reports win rate / rounds / HP left for each tier against regular
// enemies and every campaign boss, for several builds.
process.env.NARRATIVE_OFFLINE = '1';
const path = require('path');
const G = p => require(path.join(__dirname, '..', 'game', p));
const { createFreshState } = G('state');
const ch = G('character');
const cb = G('combat');
const T  = G('combat-tactics');
const campaign = G('campaign');
const { REGIONS, GEAR_QUALITIES } = G('constants');

const args = process.argv.slice(2);
const seedArg = args.indexOf('--seed');
let seed = seedArg >= 0 ? parseInt(args[seedArg + 1], 10) : 1234;
Math.random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const fightsArg = args.indexOf('--fights');
const N = fightsArg >= 0 ? parseInt(args[fightsArg + 1], 10) : 200;

const BUILDS = {
  fighter: { cls: 'fighter', stats: ['str', 'str', 'vit'], weapon: 'longsword', bg: 'soldier' },
  rogue:   { cls: 'rogue',   stats: ['dex', 'dex', 'vit'], weapon: 'dagger',    bg: 'streetthug' },
  ranger:  { cls: 'ranger',  stats: ['dex', 'dex', 'vit'], weapon: 'longbow',   bg: 'hunter' },
  wizard:  { cls: 'wizard',  stats: ['int', 'int', 'vit'], weapon: 'oak staff', bg: 'mageapprentice' },
  cleric:  { cls: 'cleric',  stats: ['wis', 'vit', 'wis'], weapon: 'mace',      bg: 'acolyte' },
  none:    { cls: null,      stats: ['str', 'dex', 'vit'], weapon: 'sword',     bg: 'farmer' }
};

function tierFor(level) { let t = 0; for (const q of GEAR_QUALITIES) if (level >= q.levelReq) t = q.tier; return t; }

function makePlayer(level, build, gearTierOffset = 0) {
  const s = createFreshState();
  s.creation.phase = 5;
  s.character = { name: 'Sim', age: 25, gender: 'female', background: build.bg, region: 'thornwick', startingEnvironment: 'small_village' };
  s.stats = ch.calculateStats(25, build.bg, 'average');
  s.totalXP = ch.getXPForLevel(level);
  for (let i = 1; i < level; i++) s.stats[build.stats[i % build.stats.length]]++;
  if (build.cls) { s.combatClass = build.cls; s.classLevel = level >= 30 ? 5 : level >= 15 ? 3 : 1;
    const per = require(path.join(__dirname, '..', 'game', 'constants')).CLASSES[build.cls].statPerLevel || {};
    for (let l = 1; l < s.classLevel; l++) for (const [k, v] of Object.entries(per)) s.stats[k] += v; }
  const tier = Math.max(0, tierFor(level) + gearTierOffset);
  s.gear = { weapon: ch.buildGearItem({ name: build.weapon, tier }, false), armor: ch.buildGearItem({ name: 'leather armor', tier }, true) };
  s.maxHp = 0; s.maxMana = 0; s.maxStamina = 0; ch.recalculateResources(s);
  s.hp = s.maxHp; s.mana = s.maxMana; s.stamina = s.maxStamina;
  s.inventory = [];
  return s;
}

// A reasonable player: defends against telegraphs, heals when low, uses abilities.
function choose(s, lastLog) {
  if (lastLog && /defend to blunt/.test(lastLog)) return 'I raise my guard and defend';
  if (s.hp < s.maxHp * 0.35 && s.inventory.some(i => /healing potion/.test(i.name || i))) return 'drink healing potion';
  const abilities = T.buildAbilityList(s).filter(a => a.ready && a.id !== 'power_attack');
  const ward = abilities.find(a => /ward|sanctuary|divine shield/i.test(a.label) && (a.cost.mana || 0) <= s.mana);
  if (ward && s.hp < s.maxHp * 0.8 && !(s.statusEffects || []).some(e => e.type === 'ward')) return `use ${ward.label}`;
  const heal = abilities.find(a => /heal|second wind|lay on|inner peace|regrowth/i.test(a.label));
  if (heal && s.hp < s.maxHp * 0.5) return `use ${heal.label}`;
  const enemy = s.currentEnemy;
  const traits = enemy ? T.describeTraits(enemy) : { strong: [] };
  const attack = abilities.find(a => !traits.strong.includes((T.ABILITIES[a.id] || {}).element) && !/heal|second wind|lay on|inner peace|regrowth|blood magic|ward|sanctuary/i.test(a.label) && ((a.cost.mana || 0) <= s.mana && (a.cost.stamina || 0) <= s.stamina));
  if (attack) return `I use ${attack.label} on it`;
  if ((s.spells || []).length && s.mana >= s.spells[0].manaCost) return `cast ${s.spells[0].label}`;
  return 'I feint left and slash at its torso with a quick, precise strike';
}

function fight(s, enemy, maxRounds = 80) {
  s.inCombat = true; s.currentEnemy = enemy; s.statusEffects = []; s.abilityCooldowns = {}; s.combatRound = 0;
  let rounds = 0, log = '';
  while (s.inCombat && s.hp > 0 && rounds < maxRounds) { const r = cb.applyCombatRound(s, choose(s, log)); log = r.combatLog || ''; rounds++; }
  return { win: s.hp > 0 && !s.inCombat, rounds, hpLeft: s.hp / s.maxHp };
}

function summarize(results) {
  const wins = results.filter(r => r.win);
  return {
    win: Math.round(wins.length / results.length * 100),
    rounds: +(results.reduce((a, r) => a + r.rounds, 0) / results.length).toFixed(1),
    hpLeft: wins.length ? Math.round(wins.reduce((a, r) => a + r.hpLeft, 0) / wins.length * 100) : 0
  };
}

const tierRegion = {};
for (const [k, r] of Object.entries(REGIONS)) if (!tierRegion[r.tier]) tierRegion[r.tier] = k;

console.log(`Regular enemies (${N} fights each, seed ${seedArg >= 0 ? args[seedArg + 1] : 1234}) — win% / avg rounds / HP left on win`);
console.log('tier level ' + Object.keys(BUILDS).map(b => b.padEnd(16)).join(''));
for (let tier = 1; tier <= 10; tier++) {
  const region = tierRegion[tier];
  const [mn, mx] = REGIONS[region].levelRange;
  const level = Math.round((mn + mx) / 2);
  const row = [];
  for (const [name, build] of Object.entries(BUILDS)) {
    const res = [];
    for (let i = 0; i < N; i++) { const s = makePlayer(level, build); const e = cb.spawnEnemy(region, level); res.push(fight(s, e)); }
    const r = summarize(res); row.push(`${r.win}%/${r.rounds}/${r.hpLeft}%`.padEnd(16));
  }
  console.log(`${String(tier).padEnd(5)}${String(level).padEnd(6)}${row.join('')}`);
}

console.log('\nBosses at chapter level (minLevel+5, 3 potions) — win% / rounds / HP left');
for (const chap of campaign.CHAPTERS) {
  const bossStep = chap.steps.find(st => st.type === 'boss');
  const level = Math.min(100, chap.minLevel + 6);
  const row = [];
  for (const [name, build] of Object.entries(BUILDS)) {
    const res = [];
    for (let i = 0; i < Math.ceil(N / 2); i++) {
      const s = makePlayer(level, build);
      for (let p = 0; p < 3; p++) s.inventory.push({ name: 'healing potion', type: 'potion', heal: 0.4 });
      res.push(fight(s, campaign.buildBossEnemy(bossStep.boss)));
    }
    const r = summarize(res); row.push(`${r.win}%/${r.rounds}/${r.hpLeft}%`.padEnd(16));
  }
  console.log(`${String(chap.id).padEnd(3)}${campaign.BOSSES[bossStep.boss].label.slice(0, 22).padEnd(23)}L${level} ${row.join('')}`);
}

console.log('\nUnder-geared check: boss vs player 10 levels under with gear 2 tiers low');
for (const id of [3, 6, 9, 10]) {
  const chap = campaign.CHAPTERS[id - 1];
  const bossStep = chap.steps.find(st => st.type === 'boss');
  const level = chap.minLevel - 10;
  const res = [];
  for (let i = 0; i < 60; i++) { const s = makePlayer(level, BUILDS.fighter, -2); res.push(fight(s, campaign.buildBossEnemy(bossStep.boss))); }
  const r = summarize(res);
  console.log(`  ch${id} L${level} fighter: win ${r.win}%`);
}
