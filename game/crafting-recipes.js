'use strict';

// =============================================================
// EMBER AND ASH — RECIPE CRAFTING
// Crafting consumes real materials from the backpack and produces
// valid, level-capped items. Professions decide which recipes you
// can make and how good the result is; rare reagents raise quality
// and add enchantments. Nothing is created from words alone.
// No AI calls. No database calls. Pure game logic.
// =============================================================

const { GEAR_QUALITIES, MATERIALS } = require('./constants');
const { getPlayerLevel, getProfessionLevel } = require('./character');
const { addItem, formatCoin } = require('./economy');
const { countMaterial, consumeMaterial, getMaterialCounts } = require('./world');

// Best ore you hold sets the metal; reagents add enchantments.
const ORE_CAP = { 'iron ore': 3, 'silver ore': 5, 'mithril ore': 7, 'star-iron': 9 };
const REAGENT_ENCHANT = {
  'emberglass':    { label: 'emberforged',  statMods: { str: 2 } },
  'sunstone':      { label: 'sunlit',       statMods: { wis: 2 } },
  'wyrm scale':    { label: 'wyrmscale',    statMods: { vit: 2 } },
  'moonpetal':     { label: 'moonblessed',  statMods: { int: 2 } },
  'frost crystal': { label: 'rimebound',    statMods: { dex: 2 } },
  'ash-silk':      { label: 'ashwoven',     statMods: { dex: 1, cha: 1 } },
  'void shard':    { label: 'voidtouched',  statMods: { int: 2, wis: 1 } },
  'star-iron':     { label: 'starforged',   statMods: { str: 2, vit: 2 } }
};

// slot: weapon | armor | consumable | ward
const RECIPES = {
  // --- blacksmith ---
  sword:      { label: 'sword',        prof: ['blacksmith'], slot: 'weapon', needs: { ore: 3 }, names: ['sword', 'blade', 'longsword'] },
  axe:        { label: 'war axe',      prof: ['blacksmith', 'woodsman'], slot: 'weapon', needs: { ore: 2, timber: 1 }, names: ['axe', 'war axe', 'hatchet'] },
  mace:       { label: 'mace',         prof: ['blacksmith'], slot: 'weapon', needs: { ore: 3 }, names: ['mace', 'hammer', 'warhammer', 'maul'] },
  dagger:     { label: 'dagger',       prof: ['blacksmith', 'hunter', 'scout'], slot: 'weapon', needs: { ore: 1, hide: 1 }, names: ['dagger', 'knife', 'stiletto'] },
  mail:       { label: 'chain mail',   prof: ['blacksmith'], slot: 'armor',  needs: { ore: 4 }, names: ['chain mail', 'chainmail', 'mail', 'plate', 'breastplate', 'armor', 'armour'] },
  // --- woodsman / hunter ---
  bow:        { label: 'longbow',      prof: ['woodsman', 'hunter', 'scout'], slot: 'weapon', needs: { timber: 2, hide: 1 }, names: ['bow', 'longbow', 'shortbow'] },
  spear:      { label: 'spear',        prof: ['woodsman', 'hunter'], slot: 'weapon', needs: { timber: 2, ore: 1 }, names: ['spear', 'javelin', 'pike'] },
  staff:      { label: 'oak staff',    prof: ['woodsman', 'scholar', 'alchemist'], slot: 'weapon', needs: { timber: 2, herbs: 1 }, names: ['staff', 'quarterstaff', 'wand', 'rod'] },
  leather:    { label: 'leather armor', prof: ['hunter', 'woodsman', 'scout'], slot: 'armor', needs: { hide: 3 }, names: ['leather armor', 'leather armour', 'leathers', 'jerkin', 'hide armor', 'leather'] },
  // --- scholar ---
  tome:       { label: 'spell tome',   prof: ['scholar'], slot: 'weapon', needs: { hide: 1, herbs: 2 }, names: ['tome', 'grimoire', 'focus', 'spellbook'] },
  // --- alchemist / cook (consumables) ---
  healing:    { label: 'healing potion', prof: ['alchemist', 'cook'], slot: 'consumable', needs: { herbs: 2 }, yields: 2, item: { name: 'healing potion', type: 'potion', heal: 0.4 }, names: ['healing potion', 'healing potions', 'potion', 'potions', 'healing draught'] },
  mana:       { label: 'mana potion',  prof: ['alchemist', 'scholar'], slot: 'consumable', needs: { herbs: 2, moonpetal: 1 }, yields: 2, item: { name: 'mana potion', type: 'potion', mana: 0.4 }, names: ['mana potion', 'mana potions'] },
  meal:       { label: 'hearty meal',  prof: ['cook', 'hunter'], slot: 'consumable', needs: { hide: 1, herbs: 1 }, yields: 2, item: { name: 'healing potion', label: 'hearty meal', type: 'potion', heal: 0.3 }, names: ['meal', 'hearty meal', 'stew', 'food', 'rations'] },
  // --- profession unlocks (minimum profession level) ---
  might:      { label: 'elixir of might',   prof: ['alchemist'], minProf: 3, slot: 'consumable', needs: { herbs: 2, emberglass: 1 }, yields: 2, item: { name: 'elixir of might', type: 'potion', buff: 'rage' }, names: ['elixir of might', 'might elixir', 'elixirs of might'] },
  warding:    { label: 'warding draught',   prof: ['alchemist'], minProf: 5, slot: 'consumable', needs: { herbs: 2, sunstone: 1 }, yields: 2, item: { name: 'warding draught', type: 'potion', ward: 0.3 }, names: ['warding draught', 'warding draughts', 'ward draught'] },
  feast:      { label: 'travel feast',      prof: ['cook'], minProf: 2, slot: 'consumable', needs: { hide: 2, herbs: 2 }, yields: 2, item: { name: 'hearty meal', label: 'travel feast', type: 'potion', heal: 0.6 }, names: ['feast', 'travel feast'] },
  scroll:     { label: 'spell scroll',      prof: ['scholar'], minProf: 3, slot: 'consumable', needs: { hide: 1, herbs: 1, moonpetal: 1 }, yields: 1, item: { name: 'spell scroll', type: 'scroll' }, names: ['spell scroll', 'scroll', 'scroll of mana bolt'] },
  trap_kit:   { label: 'hunter\'s snare',   prof: ['hunter', 'scout'], minProf: 2, slot: 'consumable', needs: { timber: 1, hide: 1 }, yields: 2, item: { name: 'snare', type: 'potion', snare: true }, names: ['snare', 'snares', 'trap', 'traps'] },

  // --- wards (anyone can make these) ---
  fur_cloak:  { label: 'fur-lined cloak',   prof: null, slot: 'ward', needs: { hide: 3 },                    item: { name: 'fur-lined cloak', type: 'ward' },   names: ['fur-lined cloak', 'fur cloak', 'warm cloak'] },
  fog_lantern:{ label: 'fog lantern',       prof: null, slot: 'ward', needs: { timber: 1, 'iron ore': 1 },  item: { name: 'fog lantern', type: 'ward' },       names: ['fog lantern', 'lantern'] },
  fen_salt:   { label: 'fen-salt pouch',    prof: null, slot: 'ward', needs: { herbs: 2, bone: 1 },          item: { name: 'fen-salt pouch', type: 'ward' },    names: ['fen-salt pouch', 'fen salt', 'salt pouch'] },
  salve:      { label: 'cinderproof salve', prof: null, slot: 'ward', needs: { herbs: 3 },                   item: { name: 'cinderproof salve', type: 'ward' }, names: ['cinderproof salve', 'salve', 'burn salve'] },
  mask:       { label: 'blight mask',       prof: null, slot: 'ward', needs: { hide: 2, herbs: 2 },          item: { name: 'blight mask', type: 'ward' },       names: ['blight mask', 'mask'] },
  anchor:     { label: 'void anchor',       prof: null, slot: 'ward', needs: { 'void shard': 1, 'silver ore': 2 }, item: { name: 'void anchor', type: 'ward' }, names: ['void anchor', 'anchor'] },
  charm:      { label: 'ember charm',       prof: null, slot: 'ward', needs: { emberglass: 1, herbs: 1 },    item: { name: 'ember charm', type: 'ward' },       names: ['ember charm', 'charm'] }
};

const CRAFT_VERBS = /^(?:i\s+)?(?:craft|forge|make|smith|brew|cook|build|fletch|carve|sew|stitch|bind|mix|prepare|fashion|scribe|create)\s+(?:a\s+|an\s+|some\s+|me\s+a\s+|myself\s+a\s+|\d+\s+)?(.+?)[.!?]*$/i;

function profTierCap(profLevel) {
  return [1, 2, 4, 6, 8, 9][Math.max(0, Math.min(5, profLevel || 0))];
}

function levelTier(level) {
  let t = 0; for (const q of GEAR_QUALITIES) if (level >= q.levelReq) t = q.tier; return t;
}

function bestOre(state) {
  let best = null;
  for (const ore of Object.keys(ORE_CAP)) if (countMaterial(state, ore) > 0 && (!best || ORE_CAP[ore] > ORE_CAP[best])) best = ore;
  return best;
}

function bestReagent(state, exclude = []) {
  let best = null;
  for (const [name, m] of Object.entries(MATERIALS)) {
    if (!REAGENT_ENCHANT[name] || exclude.includes(name)) continue;
    if (countMaterial(state, name) > 0 && (!best || m.tier > MATERIALS[best].tier)) best = name;
  }
  return best;
}

// Resolves generic needs ("ore") to concrete materials the player holds.
function resolveNeeds(state, recipe, oreKind) {
  const out = {};
  for (const [k, qty] of Object.entries(recipe.needs)) {
    const name = k === 'ore' ? oreKind : k;
    out[name] = (out[name] || 0) + qty;
  }
  return out;
}

function detectCraft(state, input) {
  const m = String(input || '').trim().match(CRAFT_VERBS);
  if (!m) return null;
  const target = m[1].toLowerCase().replace(/^(?:new|fine|good|simple|sturdy)\s+/, '');
  if (/^(?:camp|a camp|my way|sure|peace|a deal|do|sense|it|time|ready|an escape)\b/.test(target)) return null;
  const qtyMatch = String(input).match(/\b(\d+)\b/);
  let best = null;
  for (const [id, r] of Object.entries(RECIPES)) {
    for (const n of r.names) {
      if (target === n || target.startsWith(n + ' ') || target.endsWith(' ' + n) || target.includes(n)) {
        if (!best || n.length > best.match.length) best = { id, recipe: r, match: n };
      }
    }
  }
  if (!best) return null;
  return { id: best.id, recipe: best.recipe, qty: Math.max(1, Math.min(5, qtyMatch ? parseInt(qtyMatch[1], 10) : 1)) };
}

function craft(state, { id, recipe, qty = 1 }) {
  const profLevel = state.profession ? getProfessionLevel(state.profXP || 0) : 0;
  if (recipe.prof && !recipe.prof.includes(state.profession)) {
    return { success: false, message: `Making a ${recipe.label} takes a ${recipe.prof.join(' or ')}'s training. ${state.profession ? `You are a ${state.profession}.` : 'You have no profession yet — do the work of a trade and one will be offered.'}` };
  }
  if (recipe.minProf && profLevel < recipe.minProf) {
    return { success: false, message: `A ${recipe.label} takes profession level ${recipe.minProf} (you are level ${profLevel}).` };
  }
  const oreKind = bestOre(state) || 'iron ore';
  const runs = recipe.slot === 'consumable' || recipe.slot === 'ward' ? qty : 1;
  const needs = resolveNeeds(state, recipe, oreKind);
  const missing = Object.entries(needs).filter(([n, q]) => countMaterial(state, n) < q * runs);
  if (missing.length) {
    return { success: false, message: `You need ${Object.entries(needs).map(([n, q]) => `${q * runs} × ${n}`).join(', ')} (you have ${Object.keys(needs).map(n => `${countMaterial(state, n)} ${n}`).join(', ')}). Gather materials with "gather", or loot and explore.` };
  }

  // Consumables and wards
  if (recipe.slot === 'consumable' || recipe.slot === 'ward') {
    for (const [n, q] of Object.entries(needs)) consumeMaterial(state, n, q * runs);
    const yields = (recipe.yields || 1) * runs + (recipe.slot === 'consumable' && profLevel >= 3 ? runs : 0);
    for (let i = 0; i < yields; i++) addItem(state, { ...recipe.item, crafted: true });
    const xp = recipe.prof ? awardProfXP(state, 6 * runs) : 0;
    const name = recipe.item.label || recipe.item.name;
    return { success: true, item: { name }, message: `You make ${yields} × ${name}.${xp ? ` (+${xp} profession XP)` : ''}` };
  }

  // Equipment: tier limited by your level, your skill, and your metal.
  const level = getPlayerLevel(state.totalXP || 0);
  const usesOre = Object.keys(recipe.needs).includes('ore');
  const materialCap = usesOre ? ORE_CAP[oreKind] : 4;
  let tier = Math.min(levelTier(level), profTierCap(profLevel), materialCap);
  const reagent = bestReagent(state, Object.keys(needs));
  let enchant = null;
  for (const [n, q] of Object.entries(needs)) consumeMaterial(state, n, q);
  if (reagent) {
    consumeMaterial(state, reagent, 1);
    enchant = REAGENT_ENCHANT[reagent];
    tier = Math.min(levelTier(level), tier + 1);
  }
  const quality = GEAR_QUALITIES[tier];
  const statMods = enchant ? { ...enchant.statMods } : null;
  if (statMods && profLevel >= 4) for (const k of Object.keys(statMods)) statMods[k] += 1;
  const name = `${enchant ? enchant.label + ' ' : ''}${usesOre ? oreKind.replace(' ore', '') + ' ' : ''}${recipe.label}`.replace('star-iron ', 'star-iron ');
  const item = {
    name, tier, type: recipe.slot, statMods, isCrafted: true,
    craftedBy: state.character ? state.character.name : null,
    sellBonus: 0.25 + profLevel * 0.05
  };
  addItem(state, item);
  const xp = awardProfXP(state, 15 + tier * 5);
  return {
    success: true, item,
    message: `You craft a ${quality.label.toLowerCase()} ${name}${statMods ? ` (${Object.entries(statMods).map(([k, v]) => `+${v} ${k.toUpperCase()}`).join(', ')})` : ''}. Consumed: ${Object.entries(needs).map(([n, q]) => `${q} ${n}`).join(', ')}${reagent ? `, 1 ${reagent}` : ''}. +${xp} profession XP.\nType "equip ${name}" to use it.` +
      (tier < levelTier(level) ? `\n(Quality was limited by your ${profTierCap(profLevel) <= materialCap ? 'skill' : 'materials'} — ${profTierCap(profLevel) <= materialCap ? 'raise your profession level' : 'use better ore'} for better work.)` : '')
  };
}

function awardProfXP(state, amount) {
  if (!state.profession) return 0;
  state.profXP = (state.profXP || 0) + amount;
  return amount;
}

function buildRecipeText(state) {
  const lines = ['RECIPES', ''];
  const prof = state.profession;
  for (const [, r] of Object.entries(RECIPES)) {
    const allowed = !r.prof || r.prof.includes(prof);
    const needs = Object.entries(r.needs).map(([k, q]) => `${q} ${k}`).join(' + ');
    lines.push(`  ${allowed ? '•' : '✕'} ${r.label.padEnd(18)} ${needs}${r.prof ? `  [${r.prof.join('/')}${r.minProf ? ` ${r.minProf}+` : ''}]` : ''}`);
  }
  lines.push('', '"ore" uses the best ore you carry (iron → silver → mithril → star-iron).',
    'A rare reagent in your pack (emberglass, sunstone, wyrm scale...) is used automatically to enchant gear.',
    'Type "craft <item>", e.g. "forge a sword", "brew 2 healing potions", "make a fur-lined cloak".');
  return lines.join('\n');
}

function buildMaterialText(state) {
  const counts = getMaterialCounts(state);
  const entries = Object.entries(counts);
  if (!entries.length) return 'You carry no crafting materials. "gather" in the wild, explore landmarks, or loot.';
  return 'MATERIALS\n' + entries.map(([n, q]) => `  ${n} × ${q}`).join('\n');
}

module.exports = { RECIPES, detectCraft, craft, buildRecipeText, buildMaterialText, profTierCap };
