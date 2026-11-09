'use strict';
// Shared class builds and a "competent player" combat policy for the
// balance tools. Stats are spent the way a player of that class would.
const path = require('path');
const G = p => require(path.join(__dirname, '..', '..', 'game', p));
const { createFreshState } = G('state');
const ch = G('character');
const T  = G('combat-tactics');
const { CLASSES, GEAR_QUALITIES } = G('constants');

const BUILDS = {
  fighter:   { stats: ['str', 'str', 'vit'], weapon: 'longsword',  armor: 'chain mail',    bg: 'soldier' },
  barbarian: { stats: ['str', 'vit', 'str'], weapon: 'war axe',    armor: 'leather armor', bg: 'soldier' },
  rogue:     { stats: ['dex', 'dex', 'vit'], weapon: 'dagger',     armor: 'leather armor', bg: 'streetthug' },
  ranger:    { stats: ['dex', 'dex', 'vit'], weapon: 'longbow',    armor: 'leather armor', bg: 'hunter' },
  monk:      { stats: ['dex', 'wis', 'vit'], weapon: 'quarterstaff', armor: 'robe',        bg: 'wanderer' },
  paladin:   { stats: ['str', 'wis', 'vit'], weapon: 'mace',       armor: 'chain mail',    bg: 'guard' },
  cleric:    { stats: ['wis', 'vit', 'wis'], weapon: 'mace',       armor: 'chain mail',    bg: 'acolyte' },
  druid:     { stats: ['wis', 'vit', 'wis'], weapon: 'oak staff',  armor: 'leather armor', bg: 'herbalist' },
  wizard:    { stats: ['int', 'int', 'vit'], weapon: 'oak staff',  armor: 'robe',          bg: 'mageapprentice' },
  sorcerer:  { stats: ['cha', 'int', 'vit'], weapon: 'oak staff',  armor: 'robe',          bg: 'mageapprentice' },
  warlock:   { stats: ['cha', 'int', 'vit'], weapon: 'oak staff',  armor: 'robe',          bg: 'mageapprentice' },
  bard:      { stats: ['cha', 'cha', 'vit'], weapon: 'shortsword', armor: 'leather armor', bg: 'innkeeper' },
  none:      { stats: ['str', 'dex', 'vit'], weapon: 'sword',      armor: 'leather armor', bg: 'farmer', cls: null }
};

function tierFor(level) { let t = 0; for (const q of GEAR_QUALITIES) if (level >= q.levelReq) t = q.tier; return t; }

function makePlayer(level, cls, { gearOffset = 0, region = 'thornwick', potions = 0 } = {}) {
  const b = BUILDS[cls];
  const s = createFreshState();
  s.creation.phase = 5;
  s.character = { name: 'Sim', age: 25, gender: 'female', background: b.bg, region, startingEnvironment: 'small_village' };
  s.stats = ch.calculateStats(25, b.bg, 'average');
  s.totalXP = ch.getXPForLevel(level);
  for (let i = 1; i < level; i++) s.stats[b.stats[i % b.stats.length]]++;
  const className = b.cls === null ? null : cls;
  if (className) {
    s.combatClass = className;
    s.classLevel = level >= 30 ? 5 : level >= 15 ? 3 : 1;
    const per = CLASSES[className].statPerLevel || {};
    for (let l = 1; l < s.classLevel; l++) for (const [k, v] of Object.entries(per)) s.stats[k] += v;
  }
  const tier = Math.max(0, tierFor(level) + gearOffset);
  s.gear = { weapon: ch.buildGearItem({ name: b.weapon, tier }, false), armor: ch.buildGearItem({ name: b.armor, tier }, true) };
  if (['wizard', 'sorcerer', 'warlock'].includes(className) || cls === 'none') s.spells = [];
  if (['wizard', 'sorcerer', 'warlock'].includes(className)) s.spells = [{ ...ch.getStartingSpell ? (G('constants').STARTING_SPELLS.mana_bolt) : {} }];
  if (['cleric', 'paladin'].includes(className)) s.spells = [{ ...G('constants').STARTING_SPELLS.divine_bolt }];
  s.maxHp = 0; s.maxMana = 0; s.maxStamina = 0; ch.recalculateResources(s);
  s.hp = s.maxHp; s.mana = s.maxMana; s.stamina = s.maxStamina;
  s.weaponDrawn = true;                 // the simulated player has drawn their weapon
  s.inventory = [];
  for (let p = 0; p < potions; p++) s.inventory.push({ name: 'healing potion', type: 'potion', heal: 0.4 });
  return s;
}

// What a careful player does: defend telegraphs, heal/ward when hurt,
// use the best ready ability whose element the foe doesn't resist.
function choose(s, lastLog) {
  if (lastLog && /defend to blunt/.test(lastLog)) return 'I raise my guard and defend';
  if (s.hp < s.maxHp * 0.35 && (s.inventory || []).some(i => /healing potion/.test(i.name || i))) return 'drink healing potion';
  const ready = T.buildAbilityList(s).filter(a => a.ready && a.id !== 'power_attack' && (a.cost.mana || 0) <= s.mana && (a.cost.stamina || 0) <= s.stamina);
  const ward = ready.find(a => /ward|sanctuary|divine shield/i.test(a.label));
  if (ward && s.hp < s.maxHp * 0.8 && !(s.statusEffects || []).some(e => e.type === 'ward')) return `use ${ward.label}`;
  const heal = ready.find(a => /heal|second wind|lay on|inner peace|regrowth/i.test(a.label));
  if (heal && s.hp < s.maxHp * 0.5) return `use ${heal.label}`;
  const enemy = s.currentEnemy;
  const strong = enemy ? T.describeTraits(enemy).strong : [];
  const weak = enemy ? T.describeTraits(enemy).weak : [];
  const attacks = ready.filter(a => !/heal|second wind|lay on|inner peace|regrowth|blood magic|ward|sanctuary|divine shield/i.test(a.label) && !strong.includes((T.ABILITIES[a.id] || {}).element));
  // Strongest first, with a bonus for hitting a weakness.
  const score = a => { const d = T.ABILITIES[a.id] || {}; const p = d.kind === 'spell' ? (d.power || 1) : (d.dmgMult || 1) * (d.hits || 1); return p * (weak.includes(d.element) ? 1.5 : 1); };
  attacks.sort((x, y) => score(y) - score(x));
  // Sustain when hurt; weaken a foe that isn't already weakened.
  const drain = attacks.find(a => (T.ABILITIES[a.id] || {}).lifesteal);
  if (drain && s.hp < s.maxHp * 0.7) return `I use ${drain.label} on it`;
  const weakened = (s.statusEffects || []).some(e => e.target === 'enemy' && e.type === 'weaken');
  const debuff = attacks.find(a => { const d = T.ABILITIES[a.id] || {}; return (d.status && d.status.type === 'weaken') || (d.status2 && d.status2.type === 'weaken'); });
  if (debuff && !weakened) return `I use ${debuff.label} on it`;
  if (attacks.length) return `I use ${attacks[0].label} on it`;
  const blood = ready.find(a => /blood magic/i.test(a.label));
  if (blood && s.mana < s.maxMana * 0.2 && s.hp > s.maxHp * 0.6) return 'use Blood Magic';
  if ((s.spells || []).length && s.spells[0].manaCost && s.mana >= s.spells[0].manaCost) return `cast ${s.spells[0].label}`;
  return 'I feint left and slash at its torso with a quick, precise strike';
}

function fight(s, enemy, maxRounds = 80) {
  const cb = G('combat');
  s.inCombat = true; s.currentEnemy = enemy; T.clearCombatEffects(s);
  let rounds = 0, log = '';
  while (s.inCombat && s.hp > 0 && rounds < maxRounds) { const r = cb.applyCombatRound(s, choose(s, log)); log = r.combatLog || ''; rounds++; }
  return { win: s.hp > 0 && !s.inCombat, rounds, hpLeft: s.hp / s.maxHp, label: enemy.label };
}

module.exports = { BUILDS, makePlayer, choose, fight, tierFor };
