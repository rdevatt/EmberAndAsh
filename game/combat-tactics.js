'use strict';

// =============================================================
// EMBER AND ASH — COMBAT TACTICS
// The layer on top of the basic hit/damage roll:
//   - player actions: attack, defend, class abilities, spells, items
//   - damage types and enemy resistances / weaknesses
//   - status effects on both sides (bleed, poison, burn, stun,
//     weaken, vulnerable, rage, inspire, regen, ward)
//   - enemy behaviours and telegraphed heavy attacks
//   - boss phases (enrage, summon, ward, heal)
// No AI calls. No database calls. Pure game logic.
// =============================================================

const { GEAR_QUALITIES } = require('./constants');

// ---------------------------------------------
// Enemy traits from their names
// ---------------------------------------------
// Region names are proper nouns, not descriptions: "Thornwick Brute" is a
// man, not a thorn bush, and "Veldrath Marauder" is not a rat. They are
// removed before the name is read for traits.
const PLACE_NAMES = /\b(thornwick|dustfall|ironport|greymere|ashwood|oakhaven|salten|blackstone|sunken ?fen|wyrmwood|ruinwatch|coldsnap|veldrath|veldrathi|frozen ?north|deepmark)\b/gi;
function traitName(label) { return String(label || '').replace(PLACE_NAMES, ' ').replace(/\s+/g, ' ').trim(); }

const TRAIT_RULES = [
  { tag: 'undead',    re: /skeleton|zomb|vampire|ghoul|wraith|lich|shade|spectre|specter|revenant|barrow|bone|dead|grave|tomb|drowned|husk|mummy|ghost|haunt|thrall|deathless|undying|corpse|seneschal|cantor/i,
    resist: { holy: -0.5, fire: -0.2, shadow: 0.5 }, immune: ['bleed', 'poison'] },
  { tag: 'spirit',    re: /wraith|shade|spectre|specter|ghost|phantom|wisp|spirit|sprite|banshee/i,
    resist: { physical: 0.35, holy: -0.3, arcane: -0.2 }, immune: ['bleed'] },
  { tag: 'construct', re: /golem|construct|colossus|gate|monument|automaton|sentinel|statue|animated|warden of|maw/i,
    resist: { physical: 0.25, arcane: -0.25, poison: 1 }, immune: ['bleed', 'poison'] },
  { tag: 'fiery',     re: /ember|cinder|flame|magma|fire|salamander|lava|forge|molten|kharzul|sun /i,
    resist: { fire: 0.6, frost: -0.4 } },
  { tag: 'frost',     re: /frost|ice|snow|winter|rime|frozen|tundra|yeti|glacial/i,
    resist: { frost: 0.6, fire: -0.4 } },
  { tag: 'void',      re: /void|rift|null|unmade|breach|aberr|sovereign|hollow/i,
    resist: { arcane: 0.3, void: 0.5, holy: -0.25 } },
  { tag: 'plant',     re: /dryad|treant|thorn|vine|root|fung|bloom|sprout/i,
    resist: { fire: -0.5, nature: 0.5 } },
  { tag: 'beast',     re: /wolf|boar|bear|hound|hyena|\brats?\b|scorpion|spider|serpent|drake|wyvern|wyrm|basilisk|\bcats?\b|deer|\bbats?\b|crab|\beels?\b|beast|stag|lion/i,
    resist: { poison: -0.25 } },
  { tag: 'caster',    re: /shaman|cultist|lich|witch|mage|sorcer|druid|priest|cantor|seer|\bimps?\b|sprite|necromancer|warlock|hierophant|choir/i,
    resist: {} }
];

function getEnemyTraits(enemy) {
  const label = traitName(enemy.label);
  const tags = [];
  const resist = {};
  const immune = new Set();
  for (const rule of TRAIT_RULES) {
    if (!rule.re.test(label)) continue;
    tags.push(rule.tag);
    for (const [k, v] of Object.entries(rule.resist)) resist[k] = Math.max(-0.6, Math.min(0.9, (resist[k] || 0) + v));
    for (const i of rule.immune || []) immune.add(i);
  }
  if (enemy.caster && !tags.includes('caster')) tags.push('caster');
  if (enemy.behavior === 'territorial') resist.physical = Math.min(0.9, (resist.physical || 0) + 0.15);
  return { tags, resist, immune: [...immune] };
}

function resistMultiplier(enemy, element) {
  const traits = enemy.traits || getEnemyTraits(enemy);
  const r = traits.resist[element || 'physical'] || 0;
  return Math.max(0.1, 1 - r);
}

function describeTraits(enemy) {
  const traits = enemy.traits || getEnemyTraits(enemy);
  const weak = Object.entries(traits.resist).filter(([, v]) => v < 0).map(([k]) => k);
  const strong = Object.entries(traits.resist).filter(([, v]) => v > 0).map(([k]) => k);
  return { tags: traits.tags, weak, strong, immune: traits.immune };
}

// ---------------------------------------------
// Class abilities
// cost: { stamina | mana | hp (fraction) }  cd: rounds before reuse
// kind 'weapon' scales from the weapon attack; 'spell' from spell power.
// ---------------------------------------------
const ABILITIES = {
  power_attack:  { cls: null, lvl: 0, label: 'Power Attack', names: ['power attack', 'heavy strike', 'all-out attack', 'mighty blow', 'full force'], kind: 'weapon', cost: { stamina: 10 }, dmgMult: 1.6, hitMod: -0.1, cd: 2 },

  shield_bash:   { cls: 'fighter', lvl: 1, label: 'Shield Bash', names: ['shield bash', 'bash'], kind: 'weapon', cost: { stamina: 12 }, dmgMult: 0.8, status: { type: 'stun', remaining: 1 }, cd: 3 },
  second_wind:   { cls: 'fighter', lvl: 3, label: 'Second Wind', names: ['second wind'], kind: 'support', cost: { stamina: 10 }, heal: 0.25, cd: 6 },
  executioner:   { cls: 'fighter', lvl: 5, label: "Executioner's Cut", names: ["executioner's cut", 'executioners cut', 'executioner'], kind: 'weapon', cost: { stamina: 20 }, dmgMult: 2.0, execute: 0.35, cd: 4 },

  rage:          { cls: 'barbarian', lvl: 1, label: 'Rage', names: ['rage', 'berserk', 'fly into a'], kind: 'weapon', cost: { stamina: 10 }, dmgMult: 1.0, buff: { type: 'rage', remaining: 4 }, cd: 6 },
  reckless:      { cls: 'barbarian', lvl: 3, label: 'Reckless Swing', names: ['reckless swing', 'reckless'], kind: 'weapon', cost: { stamina: 14 }, dmgMult: 2.2, exposed: 1.3, cd: 3 },
  unstoppable:   { cls: 'barbarian', lvl: 5, label: 'Unstoppable', names: ['unstoppable'], kind: 'weapon', cost: { stamina: 15 }, dmgMult: 1.0, heal: 0.2, cleanse: true, cd: 6 },

  backstab:      { cls: 'rogue', lvl: 1, label: 'Backstab', names: ['backstab', 'sneak attack'], kind: 'weapon', stat: 'dex', cost: { stamina: 12 }, dmgMult: 1.7, critBonus: 0.2, cd: 4 },
  poison_blade:  { cls: 'rogue', lvl: 3, label: 'Poison Blade', names: ['poison blade', 'envenom', 'poison my blade'], kind: 'weapon', stat: 'dex', cost: { stamina: 10 }, dmgMult: 1.0, status: { type: 'poison', remaining: 4, pct: 0.05 }, cd: 5 },
  shadowstep:    { cls: 'rogue', lvl: 5, label: 'Shadowstep', names: ['shadowstep', 'shadow step', 'vanish'], kind: 'weapon', stat: 'dex', cost: { stamina: 15 }, dmgMult: 1.4, autoCrit: true, evade: true, cd: 5 },

  aimed_shot:    { cls: 'ranger', lvl: 1, label: 'Aimed Shot', names: ['aimed shot', 'take aim', 'aim carefully'], kind: 'weapon', stat: 'dex', cost: { stamina: 10 }, dmgMult: 1.7, hitMod: 0.2, cd: 2 },
  hunters_mark:  { cls: 'ranger', lvl: 3, label: "Hunter's Mark", names: ["hunter's mark", 'hunters mark', 'mark my prey', 'mark the'], kind: 'weapon', stat: 'dex', cost: { stamina: 8 }, dmgMult: 0.8, status: { type: 'vulnerable', remaining: 4 }, cd: 6 },
  volley:        { cls: 'ranger', lvl: 5, label: 'Volley', names: ['volley', 'rain of arrows'], kind: 'weapon', stat: 'dex', cost: { stamina: 18 }, hits: 3, dmgMult: 0.75, aoe: true, cd: 4 },

  flurry:        { cls: 'monk', lvl: 1, label: 'Flurry of Blows', names: ['flurry'], kind: 'weapon', stat: 'dex', cost: { stamina: 12 }, hits: 2, dmgMult: 0.85, cd: 2 },
  stunning_palm: { cls: 'monk', lvl: 3, label: 'Stunning Palm', names: ['stunning palm', 'stunning strike'], kind: 'weapon', stat: 'dex', cost: { stamina: 14 }, dmgMult: 1.0, status: { type: 'stun', remaining: 1 }, cd: 4 },
  inner_peace:   { cls: 'monk', lvl: 5, label: 'Inner Peace', names: ['inner peace'], kind: 'support', cost: { stamina: 10 }, heal: 0.25, cleanse: true, cd: 6 },

  smite:         { cls: 'paladin', lvl: 1, label: 'Smite', names: ['smite'], kind: 'weapon', cost: { mana: 10 }, dmgMult: 1.5, element: 'holy', cd: 2 },
  lay_on_hands:  { cls: 'paladin', lvl: 3, label: 'Lay on Hands', names: ['lay on hands'], kind: 'support', cost: { mana: 15 }, heal: 0.35, cd: 6 },
  divine_shield: { cls: 'paladin', lvl: 5, label: 'Divine Shield', names: ['divine shield'], kind: 'weapon', cost: { mana: 20 }, dmgMult: 1.0, ward: 0.3, cd: 6 },

  sacred_flame:  { cls: 'cleric', lvl: 1, label: 'Sacred Flame', names: ['sacred flame', 'holy fire'], kind: 'spell', cost: { mana: 10 }, power: 1.4, element: 'holy', cd: 0 },
  healing_word:  { cls: 'cleric', lvl: 1, label: 'Healing Word', names: ['healing word', 'heal myself', 'heal'], kind: 'support', cost: { mana: 12 }, heal: 0.3, cd: 3 },
  sanctuary:     { cls: 'cleric', lvl: 3, label: 'Sanctuary', names: ['sanctuary'], kind: 'support', cost: { mana: 15 }, ward: 0.3, cd: 6 },
  turn_undead:   { cls: 'cleric', lvl: 5, label: 'Turn Undead', names: ['turn undead', 'banish'], kind: 'spell', cost: { mana: 20 }, power: 2.0, element: 'holy', cd: 4 },

  thorn_whip:    { cls: 'druid', lvl: 1, label: 'Thorn Whip', names: ['thorn whip', 'thorns'], kind: 'spell', cost: { mana: 9 }, power: 1.2, element: 'nature', cd: 0 },
  entangle:      { cls: 'druid', lvl: 1, label: 'Entangle', names: ['entangle', 'grasping roots'], kind: 'spell', cost: { mana: 10 }, power: 0.8, element: 'nature', status: { type: 'stun', remaining: 1 }, cd: 4 },
  regrowth:      { cls: 'druid', lvl: 3, label: 'Regrowth', names: ['regrowth'], kind: 'support', cost: { mana: 14 }, heal: 0.15, selfStatus: { type: 'regen', remaining: 3, pct: 0.08 }, cd: 5 },
  wild_shape:    { cls: 'druid', lvl: 5, label: 'Wild Shape', names: ['wild shape', 'shapeshift', 'beast form'], kind: 'weapon', cost: { mana: 20 }, dmgMult: 1.2, heal: 0.15, buff: { type: 'rage', remaining: 4 }, cd: 7 },

  firebolt:      { cls: 'wizard', lvl: 1, label: 'Firebolt', names: ['firebolt', 'fire bolt', 'fireball'], kind: 'spell', cost: { mana: 12 }, power: 1.3, element: 'fire', status: { type: 'burn', remaining: 2, pct: 0.04 }, cd: 0 },
  frost_lance:   { cls: 'wizard', lvl: 3, label: 'Frost Lance', names: ['frost lance', 'ice lance'], kind: 'spell', cost: { mana: 15 }, power: 1.2, element: 'frost', status: { type: 'weaken', remaining: 2 }, cd: 2 },
  arcane_ward:   { cls: 'wizard', lvl: 5, label: 'Arcane Ward', names: ['arcane ward'], kind: 'support', cost: { mana: 18 }, ward: 0.35, cd: 6 },

  chaos_surge:   { cls: 'sorcerer', lvl: 1, label: 'Chaos Surge', names: ['chaos surge', 'surge'], kind: 'spell', cost: { mana: 12 }, power: 1.2, wild: true, element: 'chaos', cd: 0 },
  wild_ward:     { cls: 'sorcerer', lvl: 3, label: 'Wild Ward', names: ['wild ward'], kind: 'support', cost: { mana: 14 }, ward: 0.3, cd: 5 },
  blood_magic:   { cls: 'sorcerer', lvl: 3, label: 'Blood Magic', names: ['blood magic'], kind: 'support', cost: { hp: 0.12 }, restoreMana: 0.45, cd: 5 },
  overload:      { cls: 'sorcerer', lvl: 5, label: 'Overload', names: ['overload'], kind: 'spell', cost: { mana: 30 }, power: 2.8, element: 'raw', cd: 5 },

  eldritch_blast:{ cls: 'warlock', lvl: 1, label: 'Eldritch Blast', names: ['eldritch blast'], kind: 'spell', cost: { mana: 10 }, power: 1.25, element: 'eldritch', cd: 0 },
  drain_life:    { cls: 'warlock', lvl: 3, label: 'Drain Life', names: ['drain life', 'drain'], kind: 'spell', cost: { mana: 14 }, power: 1.0, lifesteal: 0.9, element: 'eldritch', cd: 1 },
  hex:           { cls: 'warlock', lvl: 5, label: 'Hex', names: ['hex', 'curse'], kind: 'spell', cost: { mana: 16 }, power: 0.6, element: 'shadow', status: { type: 'vulnerable', remaining: 3 }, status2: { type: 'weaken', remaining: 3 }, cd: 5 },

  mockery:       { cls: 'bard', lvl: 1, label: 'Vicious Mockery', names: ['vicious mockery', 'mockery', 'mock'], kind: 'spell', cost: { mana: 8 }, power: 1.35, element: 'sonic', status: { type: 'weaken', remaining: 2 }, cd: 1 },
  inspire:       { cls: 'bard', lvl: 3, label: 'Inspire', names: ['inspire', 'rally'], kind: 'support', cost: { mana: 12 }, heal: 0.1, buff: { type: 'inspire', remaining: 4 }, cd: 6 },
  discord:       { cls: 'bard', lvl: 5, label: 'Discord', names: ['discord', 'dissonance'], kind: 'spell', cost: { mana: 18 }, power: 1.0, element: 'sonic', status: { type: 'stun', remaining: 2 }, cd: 6 }
};

const CAST_STAT = { wizard: 'int', sorcerer: 'cha', warlock: 'cha', cleric: 'wis', druid: 'wis', paladin: 'wis', bard: 'cha' };

function getKnownAbilities(state) {
  const cls = state.combatClass;
  const lvl = state.classLevel || 0;
  return Object.entries(ABILITIES)
    .filter(([, a]) => a.cls === null || (a.cls === cls && lvl >= a.lvl))
    .map(([id, a]) => ({ id, ...a }));
}

function detectAbility(state, input) {
  const t = String(input || '').toLowerCase();
  const known = getKnownAbilities(state);
  // Longest name first so "healing word" beats "heal".
  const candidates = [];
  for (const a of known) for (const n of a.names) candidates.push([n, a]);
  candidates.sort((x, y) => y[0].length - x[0].length);
  for (const [n, a] of candidates) {
    const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\']/g, m => m === "'" ? "'?" : `\\${m}`)}\\b`, 'i');
    if (re.test(t)) return a;
  }
  return null;
}

const DEFEND_RE = /\b(defend|block|parry|brace|raise my shield|shield up|guard myself|take cover|dodge|evade|sidestep|hold my ground|go defensive|defensive stance|duck)\b/i;
const ATTACK_VERBS = /\b(slash|stab|strike|hit|attack|swing|thrust|cut|shoot|smash|riposte|counter|lunge|punch|kick|cleave|fire)\b/i;
const ITEM_RE = /\b(drink|quaff|down|use|throw|set)\b.*\b(potion|draught|elixir|tonic|snare|trap)\b/i;

function detectDefend(input) {
  const t = String(input || '');
  return DEFEND_RE.test(t) && !ATTACK_VERBS.test(t);
}

function detectCombatItem(input) {
  const t = String(input || '');
  if (!ITEM_RE.test(t)) return null;
  if (/\bmana\b/i.test(t)) return 'mana potion';
  if (/\bmight\b/i.test(t)) return 'elixir of might';
  if (/\bwarding\b/i.test(t)) return 'warding draught';
  if (/\b(snare|trap)\b/i.test(t)) return 'snare';
  return 'healing potion';
}

// ---------------------------------------------
// Power
// ---------------------------------------------
function levelGearBonus(level) {
  let bonus = 0;
  for (const q of GEAR_QUALITIES) if (level >= q.levelReq) bonus = q.weaponBonus;
  return bonus;
}

// Weapon attack stat: bows and finesse weapons use DEX.
const RANGED_RE  = /\b(bow|crossbow|sling|javelin|throwing)\b/i;
const FINESSE_RE = /\b(dagger|knife|rapier|shortsword|short sword|stiletto|sabre|saber|kris|dirk|claws?|fist|knuckle|whip)\b/i;
const FOCUS_RE   = /\b(staff|wand|rod|tome|focus|orb|grimoire|scepter|sceptre|totem|holy symbol|lute)\b/i;

function weaponProfile(weapon) {
  const name = (weapon && weapon.name) || '';
  return {
    ranged:  RANGED_RE.test(name),
    finesse: FINESSE_RE.test(name),
    focus:   FOCUS_RE.test(name)
  };
}

function attackStat(stats, weapon, ability) {
  const p = weaponProfile(weapon);
  // DEX already drives hit, crit and dodge, so it converts to damage at a discount.
  const dexDmg = Math.round(stats.dex * 0.75);
  // Paladins fight with conviction as much as muscle: STR and WIS together.
  if (stats.__paladin) return Math.max(stats.str, Math.round((stats.str + stats.wis) * 0.6));
  if (ability && ability.stat === 'dex') return Math.max(stats.str, dexDmg);
  if (p.ranged) return Math.max(Math.round(stats.str * 0.5), Math.round(stats.dex * 0.9));
  if (p.finesse) return Math.max(stats.str, dexDmg);
  return stats.str;
}

// Spell power keeps casters level with weapon users without needing a blade.
function spellPower(state, stats, level, weapon, castStatKey) {
  const key  = castStatKey || CAST_STAT[state.combatClass] || (stats.int >= stats.wis ? 'int' : 'wis');
  let stat = Math.max(stats[key] || 10, key === 'cha' ? Math.round(((stats.cha || 10) + (stats.int || 10)) / 2) : 0);
  // Sorcerers' power is innate AND studied: the stronger of INT and CHA, plus a share of the other.
  if (state.combatClass === 'sorcerer') stat = Math.max(stats.int || 10, stats.cha || 10) + Math.round(Math.min(stats.int || 10, stats.cha || 10) * 0.25);
  const focus = weapon && weaponProfile(weapon).focus ? Math.round((weapon.weaponBonus || 0) * 0.5) : 0;
  return Math.max(3, (stat - 7) + levelGearBonus(level) + Math.floor(level / 2) + focus);
}

// ---------------------------------------------
// Status effects
// ---------------------------------------------
function effects(state) {
  if (!Array.isArray(state.statusEffects)) state.statusEffects = [];
  return state.statusEffects;
}

function hasEffect(state, target, type) {
  return effects(state).some(e => e.target === target && e.type === type && e.remaining > 0);
}

function addEffect(state, enemy, target, spec, sourceDamage = 0) {
  if (target === 'enemy' && enemy) {
    const traits = enemy.traits || getEnemyTraits(enemy);
    if (traits.immune.includes(spec.type)) return { immune: true, type: spec.type };
    // Bosses shrug off long stuns.
    if (spec.type === 'stun' && enemy.isBoss) {
      if (enemy.stunImmuneUntil && enemy.stunImmuneUntil > (enemy.turn || 0)) return { immune: true, type: 'stun' };
      enemy.stunImmuneUntil = (enemy.turn || 0) + 3;
    }
  }
  const list = effects(state);
  const existing = list.find(e => e.target === target && e.type === spec.type);
  let damage = 0;
  if (['bleed', 'poison', 'burn'].includes(spec.type)) {
    const base = target === 'enemy' && enemy ? enemy.maxHP : state.maxHp;
    damage = Math.max(1, Math.round(spec.pct ? base * spec.pct : sourceDamage * 0.3));
    if (target === 'enemy' && enemy && enemy.isBoss) damage = Math.max(1, Math.round(damage * 0.5));
  }
  if (spec.type === 'regen') damage = Math.max(1, Math.round(state.maxHp * (spec.pct || 0.08)));
  if (existing) {
    existing.remaining = Math.max(existing.remaining, spec.remaining);
    existing.damage = Math.max(existing.damage || 0, damage);
  } else {
    list.push({ type: spec.type, target, remaining: spec.remaining, damage, source: spec.source || null });
  }
  return { type: spec.type, target };
}

// Damage-over-time and regeneration at the start of a round.
function tickEffects(state, enemy) {
  const lines = [];
  const results = [];
  for (const e of effects(state)) {
    if (e.remaining <= 0) continue;
    if (['bleed', 'poison', 'burn'].includes(e.type)) {
      if (e.target === 'enemy' && enemy) {
        enemy.currentHP = Math.max(0, enemy.currentHP - e.damage);
        lines.push(`${e.type === 'bleed' ? '🩸' : e.type === 'poison' ? '☠' : '🔥'} ${enemy.label} suffers ${e.type} — ${e.damage} damage`);
        results.push({ type: e.type, target: 'enemy', damage: e.damage });
      } else if (e.target === 'player') {
        state.hp = Math.max(0, state.hp - e.damage);
        lines.push(`${e.type === 'bleed' ? '🩸' : e.type === 'poison' ? '☠' : '🔥'} You suffer ${e.type} — ${e.damage} damage`);
        results.push({ type: e.type, target: 'player', damage: e.damage });
      }
    }
    if (e.type === 'regen' && e.target === 'player') {
      const before = state.hp;
      state.hp = Math.min(state.maxHp, state.hp + e.damage);
      if (state.hp > before) lines.push(`✚ You regenerate ${state.hp - before} HP`);
    }
  }
  return { lines, results };
}

function decayEffects(state) {
  const list = effects(state);
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].type === 'ward') { if (list[i].amount <= 0) list.splice(i, 1); continue; }
    list[i].remaining--;
    if (list[i].remaining <= 0) list.splice(i, 1);
  }
}

function clearCombatEffects(state) {
  state.statusEffects = [];
  state.abilityCooldowns = {};
  state.combatRound = 0;
}

function cleansePlayer(state) {
  state.statusEffects = effects(state).filter(e => !(e.target === 'player' && ['bleed', 'poison', 'burn', 'weaken'].includes(e.type)));
}

function addPlayerWard(state, amount) {
  const list = effects(state);
  const w = list.find(e => e.target === 'player' && e.type === 'ward');
  if (w) w.amount = Math.max(w.amount, amount); else list.push({ type: 'ward', target: 'player', amount, remaining: 99 });
}

// Absorbs damage with the player's ward; returns damage left over.
function absorbWithWard(state, dmg) {
  const w = effects(state).find(e => e.target === 'player' && e.type === 'ward');
  if (!w || dmg <= 0) return { dmg, absorbed: 0 };
  const absorbed = Math.min(w.amount, dmg);
  w.amount -= absorbed;
  return { dmg: dmg - absorbed, absorbed };
}

function playerDamageMultiplier(state, enemy) {
  let m = 1;
  if (hasEffect(state, 'player', 'rage')) m *= 1.3;
  if (hasEffect(state, 'player', 'inspire')) m *= 1.25;
  if (hasEffect(state, 'player', 'weaken')) m *= 0.7;
  if (hasEffect(state, 'enemy', 'vulnerable')) m *= 1.25;
  return m;
}

function enemyDamageMultiplier(state, enemy) {
  let m = 1;
  if (enemy.enraged) m *= 1.3;
  if (hasEffect(state, 'enemy', 'weaken')) m *= 0.7;
  // Rage: the barbarian shrugs off blows (druids' Wild Shape uses it too).
  if (hasEffect(state, 'player', 'rage')) m *= 0.85;
  // Paladin's Aura of Protection: conviction turns some of every blow.
  if (state.combatClass === 'paladin') m *= 0.85;
  return m;
}

// ---------------------------------------------
// Boss phases
// ---------------------------------------------
function checkPhases(enemy) {
  const lines = [];
  if (!Array.isArray(enemy.phases)) return lines;
  const pct = enemy.currentHP / enemy.maxHP;
  for (const p of enemy.phases) {
    if (p.done || pct > p.at || enemy.currentHP <= 0) continue;
    p.done = true;
    lines.push(`⚠ ${p.text}`);
    if (p.effect === 'enrage') enemy.enraged = true;
    if (p.effect === 'summon') enemy.summonRounds = (enemy.summonRounds || 0) + (p.rounds || 3);
    if (p.effect === 'ward') enemy.ward = (enemy.ward || 0) + Math.round(enemy.maxHP * (p.amount || 0.15));
    if (p.effect === 'heal') enemy.currentHP = Math.min(enemy.maxHP, enemy.currentHP + Math.round(enemy.maxHP * (p.amount || 0.15)));
  }
  return lines;
}

// Applies player damage through the enemy's ward. Spells break wards twice as fast.
function damageEnemy(enemy, dmg, element, crit = false) {
  if (dmg <= 0) return { dealt: 0, absorbed: 0 };
  let absorbed = 0;
  // A weapon crit finds the seam in a ward and shatters it outright.
  if (crit && enemy.ward > 0 && (!element || element === 'physical')) { enemy.ward = 0; enemy.wardShattered = true; }
  if (enemy.ward > 0) {
    const eff = element && element !== 'physical' ? dmg * 2 : dmg;
    absorbed = Math.min(enemy.ward, eff);
    enemy.ward -= absorbed;
    dmg = Math.max(0, Math.round(dmg - (element && element !== 'physical' ? absorbed / 2 : absorbed)));
  }
  enemy.currentHP = Math.max(0, enemy.currentHP - dmg);
  return { dealt: dmg, absorbed: Math.round(absorbed) };
}

// ---------------------------------------------
// Enemy turn planning
// Returns { mult, element, status, extraHits, ignoreArmor, lines, special }
// ---------------------------------------------
function planEnemyTurn(state, enemy) {
  enemy.turn = (enemy.turn || 0) + 1;
  const plan = { mult: 1, element: 'physical', status: null, extraHits: 0, ignoreArmor: false, lines: [], special: false };
  const traits = enemy.traits || getEnemyTraits(enemy);

  // A telegraphed heavy attack lands the turn after its wind-up.
  if (enemy.windup) {
    const sp = enemy.windup;
    enemy.windup = null;
    plan.mult = sp.mult || 2;
    plan.element = sp.element || 'physical';
    plan.status = sp.status || null;
    plan.special = sp.name || 'Heavy Blow';
    plan.hitBonus = 0.15;
    plan.lines.push(`💥 ${enemy.label} unleashes ${plan.special}!`);
    return plan;
  }

  // Newcomer grace: ordinary enemies below level 5 fight plainly.
  const seasoned = (enemy.level || 1) >= 5 || enemy.isBoss;
  const special = enemy.special || (enemy.behavior === 'aggressive' && seasoned ? { every: 4, name: 'Heavy Blow', telegraph: `${enemy.label} draws back for a crushing blow`, mult: 1.7 } : null);
  if (special && enemy.turn % special.every === 0) {
    enemy.windup = special;
    plan.windingUp = true;
    plan.mult = 0;
    plan.lines.push(`⚠ ${special.telegraph}… (defend to blunt the coming ${special.name})`);
    return plan;
  }

  if (traits.tags.includes('caster') && Math.random() < (seasoned ? 0.3 : 0.15)) {
    plan.element = traits.tags.includes('undead') ? 'shadow' : traits.tags.includes('frost') ? 'frost' : traits.tags.includes('fiery') ? 'fire' : 'arcane';
    plan.ignoreArmor = true;
    plan.mult = 0.9;
    plan.status = plan.element === 'fire' ? 'burn' : plan.element === 'shadow' ? 'weaken' : null;
    plan.lines.push(`✧ ${enemy.label} hurls ${plan.element === 'physical' ? 'a curse' : `${plan.element} magic`} at you`);
  }
  if (enemy.behavior === 'pack' && seasoned && Math.random() < 0.25) plan.extraHits = 1;
  if (enemy.behavior === 'ambush' && enemy.turn === 1) { plan.mult *= seasoned ? 1.5 : 1.2; plan.lines.push(`${enemy.label} strikes from cover!`); }
  if (enemy.behavior === 'predator' && seasoned && Math.random() < 0.25) plan.status = 'bleed';
  if (enemy.behavior === 'tactical' && seasoned && !plan.status && Math.random() < 0.2) plan.status = 'weaken';
  return plan;
}

const ENEMY_STATUS_SPECS = {
  bleed:  { type: 'bleed',  remaining: 3 },
  poison: { type: 'poison', remaining: 3, pct: 0.04 },
  burn:   { type: 'burn',   remaining: 2, pct: 0.05 },
  weaken: { type: 'weaken', remaining: 2 }
};

// ---------------------------------------------
// Cooldowns & costs
// ---------------------------------------------
function getCooldowns(state) {
  if (!state.abilityCooldowns || typeof state.abilityCooldowns !== 'object') state.abilityCooldowns = {};
  return state.abilityCooldowns;
}

function tickCooldowns(state) {
  const cds = getCooldowns(state);
  for (const k of Object.keys(cds)) { cds[k]--; if (cds[k] <= 0) delete cds[k]; }
}

// Validates and pays an ability's cost. Returns null if paid, or a reason.
function payAbilityCost(state, ability) {
  const cds = getCooldowns(state);
  if (cds[ability.id]) return `${ability.label} is not ready (${cds[ability.id]} more round${cds[ability.id] > 1 ? 's' : ''})`;
  const base = ability.cost || {};
  // In the Ordinary Age magic is thin: mana costs more.
  const ch = require('./chronicle');
  const W = ch.worldOf(state);
  const manaMult = W ? ch.eraEffects(W).manaCostMult || 1 : 1;
  const c = { ...base, mana: base.mana ? Math.ceil(base.mana * manaMult) : base.mana };
  if (c.stamina && (state.stamina || 0) < c.stamina) return `Not enough stamina for ${ability.label}`;
  if (c.mana && (state.mana || 0) < c.mana) return `Not enough mana for ${ability.label}`;
  if (c.hp && state.hp <= Math.ceil(state.maxHp * c.hp) + 1) return `Too wounded for ${ability.label}`;
  if (c.stamina) state.stamina -= c.stamina;
  if (c.mana) state.mana -= c.mana;
  if (c.hp) state.hp -= Math.ceil(state.maxHp * c.hp);
  if (ability.cd) cds[ability.id] = ability.cd + 1;
  return null;
}

function buildAbilityList(state) {
  const known = getKnownAbilities(state);
  const cds = getCooldowns(state);
  return known.map(a => ({
    id: a.id, label: a.label, cost: a.cost, cd: a.cd || 0, ready: !cds[a.id],
    desc: describeAbility(a)
  }));
}

function describeAbility(a) {
  const parts = [];
  if (a.kind === 'spell') parts.push(`${a.element} spell ×${a.power}`);
  if (a.kind === 'weapon' && a.dmgMult) parts.push(`${a.hits ? `${a.hits} hits ×${a.dmgMult}` : `×${a.dmgMult} damage`}${a.element ? ` (${a.element})` : ''}`);
  if (a.heal) parts.push(`heal ${Math.round(a.heal * 100)}%`);
  if (a.ward) parts.push(`ward ${Math.round(a.ward * 100)}% HP`);
  if (a.status) parts.push(a.status.type);
  if (a.status2) parts.push(a.status2.type);
  if (a.buff) parts.push(a.buff.type);
  if (a.restoreMana) parts.push(`restore ${Math.round(a.restoreMana * 100)}% mana`);
  const c = a.cost || {};
  const cost = c.stamina ? `${c.stamina} stamina` : c.mana ? `${c.mana} mana` : c.hp ? `${Math.round(c.hp * 100)}% HP` : 'free';
  return `${parts.join(', ')} · ${cost}${a.cd ? ` · cooldown ${a.cd}` : ''}`;
}

module.exports = {
  ABILITIES,
  getEnemyTraits,
  traitName,
  resistMultiplier,
  describeTraits,
  getKnownAbilities,
  detectAbility,
  detectDefend,
  detectCombatItem,
  weaponProfile,
  attackStat,
  spellPower,
  levelGearBonus,
  effects,
  hasEffect,
  addEffect,
  tickEffects,
  decayEffects,
  clearCombatEffects,
  cleansePlayer,
  addPlayerWard,
  absorbWithWard,
  playerDamageMultiplier,
  enemyDamageMultiplier,
  checkPhases,
  damageEnemy,
  planEnemyTurn,
  ENEMY_STATUS_SPECS,
  getCooldowns,
  tickCooldowns,
  payAbilityCost,
  buildAbilityList
};
