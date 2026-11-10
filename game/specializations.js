'use strict';

// =============================================================
// SPECIALIZATIONS
// At level 20 a class splits into two paths. Each is a lasting edge sized
// to the same budget as a trade's edge (about +8–10% effective strength),
// so the choice is about how you fight, not whether you win. The edges
// flow through profession-perks.combatMods, like every other modifier.
// No AI calls. No database calls. Pure game logic.
// =============================================================

const SPEC_LEVEL = 20;

const SPECS = {
  fighter:   { champion: { label: 'Champion', desc: 'Heavy, decisive blows: +8% weapon damage, +5% critical chance.', mods: { weapon: 0.08, crit: 0.05 } },
               warden:   { label: 'Shieldwarden', desc: 'The wall that holds: 7% less damage taken, +3% health.', mods: { armor: 0.07, hp: 0.03 } } },
  barbarian: { berserker:{ label: 'Berserker', desc: 'More fury: +10% damage.', mods: { dmg: 0.10 } },
               totem:    { label: 'Totem Warrior', desc: 'The spirits endure for you: 5% less damage taken, small regeneration.', mods: { armor: 0.05, regen: 0.004 } } },
  rogue:     { assassin: { label: 'Assassin', desc: 'Kill before they know: +8% critical chance, +3% damage.', mods: { crit: 0.08, dmg: 0.03 } },
               trickster:{ label: 'Trickster', desc: 'Never where they strike: +6% dodge, +3% to hit.', mods: { dodge: 0.06, hit: 0.03 } } },
  ranger:    { marksman: { label: 'Marksman', desc: 'Every arrow placed: +5% to hit, +5% damage.', mods: { hit: 0.05, dmg: 0.05 } },
               beastmaster:{ label: 'Beastmaster', desc: 'At home among beasts: +12% against beasts, +3% dodge.', mods: { vs: { beast: 0.12 }, dodge: 0.03 } } },
  monk:      { open_hand:{ label: 'Way of the Open Hand', desc: 'Strikes that land: +5% to hit, +5% damage.', mods: { hit: 0.05, dmg: 0.05 } },
               iron_body:{ label: 'Way of the Iron Body', desc: 'A body like stone: 6% less damage taken, +3% dodge.', mods: { armor: 0.06, dodge: 0.03 } } },
  paladin:   { vengeance:{ label: 'Oath of Vengeance', desc: 'Righteous wrath: +9% damage.', mods: { dmg: 0.09 } },
               devotion: { label: 'Oath of Devotion', desc: 'Faith that shields: 5% less damage taken, potions +20%.', mods: { armor: 0.05, potion: 0.20 } } },
  cleric:    { war:      { label: 'War Domain', desc: 'The god of battle: +8% damage, +2% to hit.', mods: { dmg: 0.08, hit: 0.02 } },
               life:     { label: 'Life Domain', desc: 'Healing pours through you: regeneration, potions +25%.', mods: { regen: 0.006, potion: 0.25 } } },
  druid:     { moon:     { label: 'Circle of the Moon', desc: 'The beast within: +6% damage, 4% less damage taken.', mods: { dmg: 0.06, armor: 0.04 } },
               land:     { label: 'Circle of the Land', desc: 'The land answers: spells +8%, small regeneration.', mods: { spell: 0.08, regen: 0.003 } } },
  wizard:    { evoker:   { label: 'Evoker', desc: 'Raw destruction: spells +10%.', mods: { spell: 0.10 } },
               abjurer:  { label: 'Abjurer', desc: 'Wards woven in: 6% less damage taken, spells +3%.', mods: { armor: 0.06, spell: 0.03 } } },
  sorcerer:  { wild:     { label: 'Wild Magic', desc: 'Chaos favours you: spells +8%, +3% critical chance.', mods: { spell: 0.08, crit: 0.03 } },
               draconic: { label: 'Draconic Bloodline', desc: 'Scales beneath the skin: 5% less damage taken, +3% health.', mods: { armor: 0.05, hp: 0.03 } } },
  warlock:   { fiend:    { label: 'The Fiend', desc: 'Hungry power: spells +8%, small regeneration.', mods: { spell: 0.08, regen: 0.002 } },
               archfey:  { label: 'The Archfey', desc: 'Glamour and misdirection: +6% dodge, spells +3%.', mods: { dodge: 0.06, spell: 0.03 } } },
  bard:      { valor:    { label: 'College of Valor', desc: 'Song and steel: +7% damage, 2% less damage taken.', mods: { dmg: 0.07, armor: 0.02 } },
               lore:     { label: 'College of Lore', desc: 'Every weakness known: weaknesses hit 20% harder, spells +5%.', mods: { weakness: 0.20, spell: 0.05 } } }
};

function available(state) {
  const cls = state.combatClass;
  return cls && SPECS[cls] ? SPECS[cls] : null;
}

function level(state) { return require('./character').getPlayerLevel(state.totalXP || 0); }

function listText(state) {
  const specs = available(state);
  if (!specs) return 'You have no class yet; a path comes after the class.';
  const lines = [`PATHS OF THE ${state.combatClass.toUpperCase()}`, '────────────────'];
  for (const [k, s] of Object.entries(specs)) lines.push(`${state.specialization === k ? '►' : '•'} ${s.label} — ${s.desc}`);
  if (state.specialization) lines.push('', `You walk the path of the ${specs[state.specialization].label}. It cannot be changed.`);
  else if (level(state) < SPEC_LEVEL) lines.push('', `At level ${SPEC_LEVEL} you may choose one ("specialize in <path>").`);
  else lines.push('', 'Choose one: "specialize in <path>". It is for life.');
  return lines.join('\n');
}

function choose(state, text) {
  const specs = available(state);
  if (!specs) return { success: false, message: 'You need a class first.' };
  if (state.specialization) return { success: false, message: `You already walk the path of the ${specs[state.specialization].label}.` };
  if (level(state) < SPEC_LEVEL) return { success: false, message: `A path opens at level ${SPEC_LEVEL}.` };
  const t = String(text || '').toLowerCase();
  const key = Object.keys(specs).find(k => t.includes(k.replace('_', ' ')) || specs[k].label.toLowerCase().split(/\s+/).some(w => w.length > 3 && !['circle', 'college', 'oath', 'domain', 'way', 'the'].includes(w) && t.includes(w)));
  if (!key) return { success: false, message: `Which path? ${Object.values(specs).map(s => s.label).join(' or ')}.` };
  state.specialization = key;
  return { success: true, message: `You take the path of the ${specs[key].label}. ${specs[key].desc}` };
}

// Folded into combatMods.
function apply(state, out, enemy, isPerson) {
  const specs = available(state);
  const s = specs && state.specialization && specs[state.specialization];
  if (!s) return out;
  const m = s.mods;
  out.dmg += m.dmg || 0;
  out.weapon += m.weapon || 0;
  out.armor -= m.armor || 0;
  out.hit += m.hit || 0;
  out.dodge += m.dodge || 0;
  out.crit += m.crit || 0;
  out.potion += m.potion || 0;
  out.regen += m.regen || 0;
  out.hp += m.hp || 0;
  out.spell += m.spell || 0;
  out.weakness += m.weakness || 0;
  const tags = (enemy && enemy.traits && enemy.traits.tags) || [];
  for (const [tag, v] of Object.entries(m.vs || {})) if (tag === 'person' ? (enemy && isPerson(enemy)) : tags.includes(tag)) out.dmg += v;
  return out;
}

module.exports = { SPECS, SPEC_LEVEL, listText, choose, apply, available };
