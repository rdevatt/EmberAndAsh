'use strict';

// =============================================================
// EMBER AND ASH — COMPANIONS
// Named companions with personalities, combat roles and loyalty.
// Recruitment is gated by validated game state — having met them,
// rapport earned through deeds (bounties in their home region,
// fighting at their side), faction standing and story progress —
// never by the player declaring that someone joins.
// Hired sellswords are the coin-for-service alternative.
// No AI calls. No database calls. Pure game logic.
// =============================================================

const { REGIONS, GEAR_QUALITIES } = require('./constants');
const { getPlayerLevel } = require('./character');
const { addCompanion, removeCompanion } = require('./economy');
const { getStanding } = require('./factions');
const { formatCoin, spendCoin } = require('./economy');

const ROLES = {
  striker:  'Deals steady damage each round.',
  guardian: 'Steps into blows meant for you, absorbing a share of the damage.',
  healer:   'Mends your wounds when you are hurt; otherwise attacks.',
  caster:   'Hurls magic that ignores armour and can weaken the enemy.'
};

const ROSTER = {
  maren:     { name: 'Maren Holt', region: null, role: 'striker', element: 'physical', faction: 'wardens',
               personality: 'Dry, watchful, and kinder than she lets on. Counts her arrows and your mistakes.',
               requires: { chapterDone: 2, standing: { wardens: 15 } }, where: 'wherever the story finds her (after Chapter 2)' },
  brannoc:   { name: 'Brannoc', region: 'thornwick', role: 'guardian', element: 'physical', faction: 'compact',
               personality: 'A blacksmith with a forge-scarred apron and no patience for heroes. Hits like a hammer because he is one.',
               requires: { rapport: 25 } },
  tamsin:    { name: 'Tamsin Reed', region: 'ashwood_shallow', role: 'striker', element: 'physical', faction: 'compact',
               personality: 'A huntress who talks to the forest and expects it to answer. Fast, quiet, lethal with a bow.',
               requires: { rapport: 25 } },
  sexton:    { name: 'Sexton Abel', region: 'oakhaven', role: 'healer', element: 'holy', faction: 'wardens',
               personality: 'A gravekeeper who has buried too many people to want to bury you. Hums hymns under his breath.',
               requires: { rapport: 25 } },
  heron:     { name: 'Heron', region: 'sunkenfen_deep', role: 'striker', element: 'physical', faction: 'compact',
               personality: 'A fen smuggler who counts everything and trusts nothing. Fights dirty, laughs about it later.',
               requires: { rapport: 30 } },
  seraphine: { name: 'Seraphine Aurel', region: 'old_veldrath', role: 'caster', element: 'fire', faction: 'remnant',
               personality: 'Imperial heir, scholar, and the most dangerous optimist you have ever met. Her sunfire burns cold.',
               requires: { chapterReached: 5, standing: { remnant: 30 } } },
  aske:      { name: 'Lieutenant Aske', region: 'scar_vale', role: 'guardian', element: 'physical', faction: 'wardens',
               personality: 'A Warden officer who has held a wall for nine years. Speaks in orders; means them as kindness.',
               requires: { standing: { wardens: 40 } } },
  lucan:     { name: 'Brother Lucan', region: 'pale_city', role: 'healer', element: 'shadow', faction: 'choir',
               personality: 'A Choir defector trying to sing a different song. Haunted, gentle, and very good at keeping people alive.',
               requires: { chapterDone: 6 } }
};

const SELLSWORD_NAMES = ['Garrick', 'Ysa', 'Dunmore', 'Kell', 'Rhosyn', 'Bastian', 'Mirelle', 'Oto'];
const SELLSWORD_TERM  = 60;  // actions of service per contract

// ---------------------------------------------
// Rapport (validated events only)
// ---------------------------------------------
function rel(state, id) {
  if (!state.npcRelationships || typeof state.npcRelationships !== 'object') state.npcRelationships = {};
  if (!state.npcRelationships[id]) state.npcRelationships[id] = { rapport: 0, metBefore: false };
  return state.npcRelationships[id];
}

function addRapport(state, id, amount) {
  const r = rel(state, id);
  r.rapport = Math.max(0, Math.min(100, (r.rapport || 0) + amount));
  return r.rapport;
}

// First conversation: +10 (charisma helps). Never repeatable.
function onMeet(state, id) {
  if (!ROSTER[id]) return null;
  const r = rel(state, id);
  if (r.metBefore) return null;
  r.metBefore = true;
  const cha = (state.stats && state.stats.cha) || 10;
  return addRapport(state, id, 10 + Math.max(0, Math.floor((cha - 10) / 2)));
}

// A bounty completed in a companion's home region earns their regard.
function onQuestCompleted(state, regionKey) {
  const out = [];
  for (const [id, c] of Object.entries(ROSTER)) {
    if (c.region === regionKey && rel(state, id).metBefore) out.push({ id, name: c.name, rapport: addRapport(state, id, 15) });
  }
  return out;
}

// ---------------------------------------------
// Recruitment
// ---------------------------------------------
function findRosterId(text) {
  const t = String(text || '').toLowerCase();
  for (const [id, c] of Object.entries(ROSTER)) {
    const words = c.name.toLowerCase().split(/\s+/).filter(w => w.length > 2 && w !== 'lieutenant' && w !== 'brother' && w !== 'sexton');
    if (t.includes(id) || words.some(w => new RegExp(`\\b${w}\\b`).test(t))) return id;
  }
  return null;
}

function checkRequirements(state, id) {
  const c = ROSTER[id];
  const req = c.requires || {};
  const camp = state.campaign || { completed: [], chapter: 1, flags: {} };
  const reasons = [];
  if (req.rapport && (rel(state, id).rapport || 0) < req.rapport) {
    reasons.push(rel(state, id).metBefore
      ? `${c.name} doesn't trust you enough yet (rapport ${rel(state, id).rapport}/${req.rapport}). Complete bounties in ${REGIONS[c.region].label} to earn it.`
      : `You haven't met ${c.name}. Find them in ${REGIONS[c.region].label} and "talk to ${c.name.split(' ')[0]}".`);
  }
  if (req.standing) for (const [f, v] of Object.entries(req.standing)) {
    if (getStanding(state, f) < v) reasons.push(`${c.name} would only follow someone the ${f === 'wardens' ? 'Ember Wardens' : f === 'remnant' ? 'Veldrathi Remnant' : f} trust (standing ${getStanding(state, f)}/${v}).`);
  }
  if (req.chapterDone && !(camp.completed || []).includes(req.chapterDone)) reasons.push(`${c.name} is not ready to join you yet (complete Chapter ${req.chapterDone} of the story).`);
  if (req.chapterReached && (camp.chapter || 1) < req.chapterReached && !(camp.completed || []).includes(req.chapterReached)) reasons.push(`${c.name} has no reason to join you yet (reach Chapter ${req.chapterReached}).`);
  if (id === 'maren' && camp.flags && camp.flags.marenDied) reasons.push('Maren Holt is dead.');
  if (c.region && state.character.region !== c.region) reasons.push(`${c.name} is in ${REGIONS[c.region].label}.`);
  return reasons;
}

function recruit(state, text) {
  const id = findRosterId(text);
  if (!id) return { success: false, unknown: true, message: 'Nobody by that name is willing to follow you. Companions are people you have earned — type "companions" to see who might join, or "hire a sellsword" at an inn.' };
  if ((state.companions || []).some(c => c.rosterId === id)) return { success: false, message: `${ROSTER[id].name} is already with you.` };
  const reasons = checkRequirements(state, id);
  if (reasons.length) return { success: false, message: reasons.join(' ') };
  const c = ROSTER[id];
  const result = addCompanion(state, { name: c.name, description: c.personality, role: c.role, loyalty: 60 });
  if (!result.success) return result;
  Object.assign(result.companion, { rosterId: id, element: c.element, faction: c.faction, level: getPlayerLevel(state.totalXP || 0), victories: 0 });
  return { success: true, companion: result.companion, message: `${c.name} joins you. ${c.personality}\nRole: ${c.role} — ${ROLES[c.role]}` };
}

function hireSellsword(state) {
  const r = REGIONS[state.character.region];
  if (!r || !r.settlement) return { success: false, message: 'There is nobody to hire out here. Try an inn in a settlement.' };
  const tier = r.tier || 1;
  const cost = 150 * tier * tier;
  if ((state.companions || []).some(c => c.hired)) return { success: false, message: 'You already have a sellsword under contract.' };
  if (!spendCoin(state, cost)) return { success: false, message: `A sellsword's contract here costs ${formatCoin(cost)}. You have ${formatCoin(state.coin || 0)}.` };
  const name = SELLSWORD_NAMES[(state.actionCount || 0) % SELLSWORD_NAMES.length] + ' the Sellsword';
  const result = addCompanion(state, { name, description: 'A hired blade. Loyal to the contract, not to you.', role: 'striker', loyalty: 50 });
  if (!result.success) { state.coin += cost; return result; }
  Object.assign(result.companion, { hired: true, element: 'physical', contractEnds: (state.actionCount || 0) + SELLSWORD_TERM, level: getPlayerLevel(state.totalXP || 0), victories: 0 });
  return { success: true, companion: result.companion, message: `${name} signs on for ${SELLSWORD_TERM} actions for ${formatCoin(cost)}.` };
}

function dismiss(state, text) {
  const comp = (state.companions || []).find(c => c.name.toLowerCase().includes(String(text || '').toLowerCase().trim()) || (c.rosterId && findRosterId(text) === c.rosterId));
  if (!comp) return { success: false, message: 'No companion by that name travels with you.' };
  removeCompanion(state, comp.id);
  return { success: true, companion: comp, message: `${comp.name} parts ways with you.${comp.rosterId ? ' You can ask them to rejoin later.' : ''}` };
}

// ---------------------------------------------
// Combat
// ---------------------------------------------
function levelGearBonus(level) {
  let b = 0; for (const q of GEAR_QUALITIES) if (level >= q.levelReq) b = q.weaponBonus; return b;
}

// Returns per-companion results and mutates enemy/state. Guardian
// interception is returned for the caller to apply to incoming damage.
function companionTurn(state, enemy, resistMultiplier) {
  const results = [];
  const level = getPlayerLevel(state.totalXP || 0);
  for (const c of state.companions || []) {
    c.level = level;
    const loyaltyMod = 0.85 + (c.loyalty || 50) / 300;
    const base = (6 + level * 0.55 + levelGearBonus(level) * 0.6) * loyaltyMod;
    const role = c.role === 'ally' ? 'striker' : c.role;
    if (role === 'healer' && state.hp < state.maxHp * 0.75) {
      const heal = Math.max(2, Math.round(state.maxHp * 0.07 * loyaltyMod));
      const before = state.hp;
      state.hp = Math.min(state.maxHp, state.hp + heal);
      results.push({ name: c.name, hit: true, damage: state.hp - before, heal: true, verb: 'mends your wounds' });
      continue;
    }
    if (enemy.currentHP <= 0) continue;
    const mult = role === 'striker' ? 1.0 : role === 'caster' ? 1.05 : 0.55;
    const hitChance = role === 'caster' ? 0.8 : Math.min(0.85, Math.max(0.35, 0.65 + (level * 0.3 - enemy.effectiveDex + 5) / 40));
    const hit = Math.random() < hitChance;
    const element = role === 'caster' || role === 'healer' ? (c.element || 'arcane') : 'physical';
    const dmg = hit ? Math.max(1, Math.round(base * mult * (0.8 + Math.random() * 0.4) * (resistMultiplier ? resistMultiplier(enemy, element) : 1))) : 0;
    if (dmg) enemy.currentHP = Math.max(0, enemy.currentHP - dmg);
    results.push({ name: c.name, hit, damage: dmg, verb: role === 'caster' ? 'casts' : role === 'guardian' ? 'bashes' : 'strikes' });
  }
  return results;
}

function guardianShare(state) {
  const g = (state.companions || []).filter(c => c.role === 'guardian').length;
  return Math.min(0.35, g * 0.22);
}

// After a victory: loyalty and shared experience.
function onVictory(state) {
  for (const c of state.companions || []) {
    c.victories = (c.victories || 0) + 1;
    if (!c.hired) c.loyalty = Math.min(100, (c.loyalty || 50) + 1);
  }
}

// Story choices move companion loyalty with their faction's reaction.
function onFactionChanges(state, applied) {
  const out = [];
  for (const c of [...(state.companions || [])]) {
    if (!c.faction || c.hired) continue;
    const change = (applied || []).find(a => a.faction === c.faction);
    if (!change || !change.delta) continue;
    c.loyalty = Math.max(0, Math.min(100, (c.loyalty || 50) + Math.round(change.delta * 0.8)));
    if (c.loyalty <= 10) {
      removeCompanion(state, c.id);
      out.push(`${c.name} cannot stand by what you have done, and leaves you.`);
    } else {
      out.push(`${c.name} ${change.delta > 0 ? 'approves' : 'disapproves'} (loyalty ${c.loyalty}).`);
    }
  }
  return out;
}

// Contracts expire; returns messages.
function tickContracts(state) {
  const out = [];
  for (const c of [...(state.companions || [])]) {
    if (c.hired && (state.actionCount || 0) >= (c.contractEnds || 0)) {
      removeCompanion(state, c.id);
      out.push(`${c.name}'s contract is up. They collect their pay and leave.`);
    }
  }
  return out;
}

function buildCompanionText(state) {
  const lines = ['COMPANIONS', ''];
  const party = state.companions || [];
  if (!party.length) lines.push('  You travel alone.');
  for (const c of party) {
    lines.push(`  ${c.name} — ${c.role} (loyalty ${c.loyalty}${c.hired ? `, contract ends in ${Math.max(0, (c.contractEnds || 0) - (state.actionCount || 0))} actions` : ''})`);
    if (c.description) lines.push(`    ${c.description}`);
  }
  lines.push('', 'People who might join you:');
  for (const [id, c] of Object.entries(ROSTER)) {
    if (party.some(p => p.rosterId === id)) continue;
    if (id === 'maren' && state.campaign && state.campaign.flags && state.campaign.flags.marenDied) continue;
    const r = rel(state, id);
    const reasons = checkRequirements(state, id).filter(x => !/ is in /.test(x));
    lines.push(`  ${reasons.length ? '·' : '✓'} ${c.name} (${c.role}) — ${c.region ? REGIONS[c.region].label : c.where}${r.metBefore ? `, rapport ${r.rapport}` : ', not yet met'}`);
  }
  lines.push('', 'Commands: "recruit <name>", "dismiss <name>", "hire a sellsword" (at an inn).');
  return lines.join('\n');
}

module.exports = {
  ROSTER,
  ROLES,
  onMeet,
  onQuestCompleted,
  addRapport,
  findRosterId,
  checkRequirements,
  recruit,
  hireSellsword,
  dismiss,
  companionTurn,
  guardianShare,
  onVictory,
  onFactionChanges,
  tickContracts,
  buildCompanionText
};
