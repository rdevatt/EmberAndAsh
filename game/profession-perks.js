'use strict';

// =============================================================
// EMBER AND ASH — WHAT EACH PROFESSION GIVES
// Twelve trades, each with three things, balanced against each other the
// way classes are (measured in scripts/profession-sweep.js):
//   1. a combat edge, of equal worth on average but different in kind;
//   2. a living: "work" earns the same expected income per hour for every
//      trade at the same rank — paid in coin, in materials, or (for the
//      thief) in coin with the risk of being caught;
//   3. an active skill only that trade has.
// Everything scales with profession rank (1–5): 70% at rank 1, 110% at 5.
// No AI calls. No database calls. Pure game logic.
// =============================================================

const { REGIONS } = require('./constants');

const PERKS = {
  blacksmith: { edge: 'Your own steel: +10% weapon damage, 5% less damage taken.', combat: { weapon: 0.10, armor: 0.05 },
                work: { where: 'settlement', what: 'take commissions at the forge' }, skill: 'sharpen my blade', skillDesc: 'an honed edge: +15% weapon damage for the next fight' },
  alchemist:  { edge: 'Your potions heal 35% more, and your own tonics keep you sharp: +3% damage.', combat: { potion: 0.35, dmg: 0.03, hit: 0.01 },
                work: { where: 'settlement', what: 'brew remedies for the apothecary' }, skill: 'brew', skillDesc: 'potions, elixirs and draughts (see "recipes")' },
  scout:      { edge: 'You see blows coming and find the gap: +5% to hit, +4% dodge.', combat: { hit: 0.05, dodge: 0.04 },
                work: { where: 'any', what: 'guide travellers along the roads' }, skill: 'scout ahead', skillDesc: 'fewer ambushes, landmarks revealed, rare reagents' },
  merchant:   { edge: 'You read people: +6% damage, +30% coin from the fallen, and you can buy your way out of a fight with people.', combat: { loot: 0.30, dmg: 0.06, bribe: true },
                work: { where: 'settlement', what: 'trade at the market', variance: 0.6 }, skill: 'bribe it', skillDesc: 'pay a person to end a fight (coin)' },
  cook:       { edge: 'Well fed and steady: +4% damage and 2% less damage taken.', combat: { dmg: 0.04, armor: 0.02 },
                work: { where: 'settlement', what: 'work an inn kitchen' }, skill: 'cook a meal', skillDesc: 'hearty meals and travel feasts' },
  hunter:     { edge: 'You know where things are soft: +9% damage, and +20% more against beasts.', combat: { beast: 0.20, dmg: 0.09 },
                work: { where: 'wild', what: 'hunt for meat and pelts', material: 'hide' }, skill: 'set a snare', skillDesc: 'snares and tracking' },
  scholar:    { edge: 'You know what they fear: +5% damage, weaknesses hit 25% harder, and studying a foe reveals it.', combat: { weakness: 0.25, spell: 0.04, dmg: 0.05, study: true },
                work: { where: 'settlement', what: 'copy texts and tutor' }, skill: 'study it', skillDesc: 'in a fight: learn its weakness (+10% damage for the fight)' },
  woodsman:   { edge: 'Hardy from the work: +5% health, +8% damage with axes.', combat: { hp: 0.05, axe: 0.08, dmg: 0.02 },
                work: { where: 'wild', what: 'fell and split timber', material: 'timber' }, skill: 'build a shelter', skillDesc: 'camp without being ambushed' },
  miner:      { edge: 'Stone-hard: 3% less damage taken and +2% health.', combat: { armor: 0.03, hp: 0.02 },
                work: { where: 'wild', what: 'dig ore from the seams', material: 'iron ore' }, skill: 'prospect', skillDesc: 'find ore where others see rock' },
  physician:  { edge: 'You keep yourself standing: potions heal 25% more and you recover a little health each round.', combat: { potion: 0.25, regen: 0.004 },
                work: { where: 'settlement', what: 'treat the sick and wounded' }, skill: 'treat my wounds', skillDesc: 'heal 40% outside a fight, every few hours' },
  thief:      { edge: 'Quick hands, cruel timing: +10% critical chance, +5% damage, and you can rob people mid-fight.', combat: { crit: 0.10, dmg: 0.05, steal: true },
                work: { where: 'settlement', what: 'work the crowds', risk: 0.08, bonus: 0.6 }, skill: 'steal from it', skillDesc: 'in a fight with a person: take coin' },
  tailor:     { edge: 'Padded, layered, fitted: 4% less damage taken, and +3% dodge.', combat: { armor: 0.04, dodge: 0.03 },
                work: { where: 'settlement', what: 'take in tailoring' }, skill: 'mend my armour', skillDesc: 'restore armour and pad it: +10% armour for the next fight' }
};

function rankFactor(state) { return 0.6 + 0.1 * Math.max(1, Math.min(5, state.professionLevel || 1)); }

// The combat modifiers this character's trade gives against this enemy.
function combatMods(state, enemy) {
  const out = { dmg: 1, weapon: 1, armor: 1, hit: 0, dodge: 0, crit: 0, potion: 1, regen: 0, hp: 1, loot: 1, spell: 1, weakness: 1 };
  const p = state && state.profession && PERKS[state.profession];
  if (!p) return out;
  const f = rankFactor(state);
  const c = p.combat;
  const tags = (enemy && enemy.traits && enemy.traits.tags) || [];
  out.dmg += ((c.dmg || 0) + (c.beast && tags.includes('beast') ? c.beast : 0)) * f;
  const weaponName = (state.gear && state.gear.weapon && state.gear.weapon.name) || '';
  if (c.axe && /axe|hatchet/i.test(weaponName)) out.dmg += c.axe * f;
  if (state.buffs && state.buffs.sharpened) out.weapon += 0.15;
  if (state.buffs && state.buffs.studied && enemy && state.buffs.studied === enemy.label) out.dmg += 0.10;
  out.weapon += (c.weapon || 0) * f;
  out.armor -= (c.armor || 0) * f + (state.buffs && state.buffs.padded ? 0.10 : 0);
  out.hit += (c.hit || 0) * f;
  out.dodge += (c.dodge || 0) * f;
  out.crit += (c.crit || 0) * f;
  out.potion += (c.potion || 0) * f;
  out.regen += (c.regen || 0) * f;
  out.hp += (c.hp || 0) * f;
  out.loot += (c.loot || 0) * f;
  out.spell += (c.spell || 0) * f;
  out.weakness += (c.weakness || 0) * f;
  return out;
}

// ---------------------------------------------
// Working for a living
// ---------------------------------------------
const WORK_RE = /^(?:i\s+)?(?:work|ply my trade|take on work|look for work|find work|work at my trade|do some work|earn (?:a|my) living)(?:\s+as\s+an?\s+\w+)?(?:\s+for\s+(\d+)\s+hours?)?(?:\s+(?:here|today|tonight))?[.!]*$/i;

function detectWork(input) {
  const m = String(input || '').trim().match(WORK_RE);
  if (!m) return null;
  return { hours: Math.max(2, Math.min(12, parseInt(m[1] || '8', 10))) };
}

// Value of an hour's work: the same for every trade at the same rank.
function hourlyValue(state) {
  const tier = (REGIONS[state.character.region] || {}).tier || 1;
  return 3 * tier * (1 + 0.25 * ((state.professionLevel || 1) - 1));
}

const MATERIAL_VALUE = { hide: 6, timber: 5, 'iron ore': 7 };

function work(state, hours) {
  const key = state.profession;
  if (!key) return { success: false, message: 'You have no trade yet. Do the work of one, and a trade will find you.' };
  const p = PERKS[key];
  const r = REGIONS[state.character.region] || {};
  if (p.work.where === 'settlement' && !r.settlement) return { success: false, message: `There is no one here to ${p.work.what} for. Find a town.` };
  if (p.work.where === 'wild' && r.settlement && !r.resources) return { success: false, message: `You need open country to ${p.work.what}.` };
  const value = hourlyValue(state) * hours;
  const lines = [];
  let coin = 0;
  const gained = [];
  if (p.work.material) {
    // Paid in goods: the same value, as materials (plus a little coin).
    const tier = r.tier || 1;
    const unit = (MATERIAL_VALUE[p.work.material] || 6) * tier;
    const qty = Math.max(1, Math.round((value * 0.6) / unit));
    coin = Math.round(value * 0.4);
    if (!state.materials || typeof state.materials !== 'object') state.materials = {};
    state.materials[p.work.material] = (state.materials[p.work.material] || 0) + qty;
    gained.push(`${qty} ${p.work.material}`);
  } else if (p.work.risk) {
    // Higher pay, real risk: each shift may be seen.
    coin = Math.round(value * (1 + p.work.bonus) * (0.7 + Math.random() * 0.6));
    const sneak = (state.stats && state.stats.dex) || 10;
    if (Math.random() < p.work.risk * (1.2 - Math.min(0.6, (sneak - 10) / 50))) {
      const crime = require('./crime');
      const res = crime.resolve(state, { type: 'theft', victim: { name: 'a mark in the crowd' }, text: 'working the crowds' }, { forceSeen: true });
      lines.push('A shout — someone felt your hand.', ...res.lines);
      coin = Math.round(coin / 3);
    }
  } else {
    coin = Math.round(value * (1 - (p.work.variance || 0.2) / 2 + Math.random() * (p.work.variance || 0.2)));
  }
  state.coin = (state.coin || 0) + coin;
  const profXP = Math.round(hours * (4 + (state.professionLevel || 1)));
  state.profXP = (state.profXP || 0) + profXP;
  return {
    success: true, hours,
    message: [`You ${p.work.what} for ${hours} hours: ${coin} copper${gained.length ? ` and ${gained.join(', ')}` : ''}.`, ...lines].join('\n'),
    hint: `[WORK — the player spends ${hours} hours as a ${key}: they ${p.work.what}. Narrate the work and the people.]`,
    coin, gained, profXP
  };
}

// ---------------------------------------------
// Trade skills
// ---------------------------------------------
const SKILLS = [
  { prof: 'blacksmith', re: /^(?:i\s+)?(?:sharpen|hone|whet) my (?:blade|sword|axe|weapon|dagger|spear)/i },
  { prof: 'tailor', re: /^(?:i\s+)?(?:mend|pad|patch|reinforce) my (?:armou?r|clothes|coat|jerkin|leathers)/i },
  { prof: 'physician', re: /^(?:i\s+)?(?:treat|tend|bandage|stitch|dress) my (?:wounds?|injuries|cuts)/i },
  { prof: 'woodsman', re: /^(?:i\s+)?build a (?:shelter|lean-to|hut)/i },
  { prof: 'miner', re: /^(?:i\s+)?(?:prospect|look for ore|search for ore|find a seam)/i }
];

function detectSkill(state, input) {
  const t = String(input || '').trim();
  return SKILLS.find(s => s.re.test(t)) || null;
}

function useSkill(state, skill, helpers = {}) {
  if (state.profession !== skill.prof) return { success: false, message: `That takes a ${skill.prof}'s training.` };
  state.buffs = state.buffs || {};
  const f = rankFactor(state);
  if (skill.prof === 'blacksmith') { state.buffs.sharpened = true; return { success: true, hours: 1, message: 'The edge sings when you test it. (+15% weapon damage for your next fight.)' }; }
  if (skill.prof === 'tailor') {
    state.buffs.padded = true;
    const a = state.gear && state.gear.armor;
    if (a && typeof a.durability === 'number') a.durability = Math.min(100, a.durability + 40);
    return { success: true, hours: 2, message: 'Fresh stitches, new padding. (+10% armour for your next fight; armour mended.)' };
  }
  if (skill.prof === 'physician') {
    const now = state.actionCount || 0;
    if (now - (state.lastTreatAt || -99) < 4) return { success: false, message: 'Your hands need rest before you can do it properly again.' };
    state.lastTreatAt = now;
    const before = state.hp;
    state.hp = Math.min(state.maxHp, state.hp + Math.round(state.maxHp * 0.4 * f / 0.9));
    return { success: true, hours: 1, message: `You clean and stitch your wounds. (HP +${state.hp - before}.)` };
  }
  if (skill.prof === 'woodsman') { state.buffs.shelter = true; return { success: true, hours: 2, message: 'A shelter of cut boughs, hidden from the road. Your next camp here will not be disturbed.' }; }
  if (skill.prof === 'miner') {
    const r = REGIONS[state.character.region] || {};
    if (!state.materials || typeof state.materials !== 'object') state.materials = {};
    const qty = 1 + Math.floor((state.professionLevel || 1) / 2) + ((r.tier || 1) >= 5 ? 1 : 0);
    state.materials['iron ore'] = (state.materials['iron ore'] || 0) + qty;
    return { success: true, hours: 3, message: `You find a seam others missed: ${qty} iron ore.` };
  }
  return null;
}

// In-fight trade skills: study (scholar), bribe (merchant), steal (thief).
const FIGHT_SKILLS = {
  scholar: /\b(study it|study (?:the|its) (?:weak|movements)|look for (?:a|its) weakness)\b/i,
  merchant: /\b(bribe it|bribe (?:him|her|them)|pay (?:it|him|her|them) off|offer (?:it|him|her|them) coin)\b/i,
  thief: /\b(steal from (?:it|him|her|them)|rob (?:it|him|her|them)|cut (?:its|his|her|their) purse|pick (?:its|his|her|their) pocket)\b/i
};

function isPerson(enemy) {
  return /bandit|thug|cutthroat|raider|marauder|smuggler|watchman|soldier|guard|knight|captain|mercenary|cultist|acolyte|hunter|scout|deserter|reaver|skirmisher|ambusher|scavenger|brute|hexer|stalker|lord|warlord|witch|druid|shaman|magistrate|noble|orc|goblin|kobold/i.test(String(enemy && enemy.label || ''));
}

function detectFightSkill(state, input) {
  const re = state.profession && FIGHT_SKILLS[state.profession];
  return re && re.test(String(input || '')) ? state.profession : null;
}

function useFightSkill(state, prof) {
  const e = state.currentEnemy;
  if (!e) return null;
  const lvl = require('./character').getPlayerLevel(state.totalXP || 0);
  if (prof === 'scholar') {
    state.buffs = state.buffs || {}; state.buffs.studied = e.label;
    const T = require('./combat-tactics');
    const tr = e.traits || T.getEnemyTraits(e);
    const weak = Object.entries(tr.resist || {}).filter(([, v]) => v < 0).map(([k]) => k);
    return { success: true, message: `You watch how it moves. ${weak.length ? `It fears ${weak.join(' and ')}.` : 'It has no weakness you can name, but you know its rhythm now.'} (+10% damage for this fight.)`, endsFight: false };
  }
  if (!isPerson(e)) return { success: false, message: 'There is no reasoning with that.' };
  if (prof === 'merchant') {
    if (e.isBoss) return { success: false, message: `${e.label} cannot be bought.` };
    const price = Math.round((e.level || 1) * 12 * (1 - 0.05 * (state.professionLevel || 1)));
    if ((state.coin || 0) < price) return { success: false, message: `It wants ${price} copper. You have ${state.coin || 0}.` };
    state.coin -= price;
    return { success: true, message: `You pay ${price} copper. ${e.label} counts it, spits, and goes.`, endsFight: true };
  }
  if (prof === 'thief') {
    const take = Math.round((5 + Math.random() * 20) * Math.max(1, lvl / 5));
    const ok = Math.random() < 0.55 + 0.05 * (state.professionLevel || 1);
    if (ok) state.coin = (state.coin || 0) + take;
    return { success: true, message: ok ? `Your hand finds its purse mid-scuffle: ${take} copper.` : 'It twists away before your fingers close.', endsFight: false, usesTurn: true };
  }
  return null;
}

function describe(state) {
  const key = state.profession;
  if (!key) return null;
  const p = PERKS[key];
  return `${p.edge} Work: "${'work'}" — you ${p.work.what}${p.work.material ? ` (paid partly in ${p.work.material})` : ''}${p.work.risk ? ' (better pay, risk of being caught)' : ''}. Skill: "${p.skill}" — ${p.skillDesc}.`;
}

module.exports = { PERKS, combatMods, rankFactor, detectWork, work, hourlyValue, detectSkill, useSkill, detectFightSkill, useFightSkill, describe, isPerson };
