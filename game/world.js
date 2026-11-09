'use strict';

// =============================================================
// EMBER AND ASH — WORLD
// Exploring landmarks, gathering materials, environmental hazards,
// and talking to the named people of each region.
// All rewards here are one-time and engine-granted.
// No AI calls. No database calls. Pure game logic.
// =============================================================

const { REGIONS, MATERIALS } = require('./constants');
const { getPlayerLevel, grantXP } = require('./character');
const { addCoin, addItem, hasItem, formatCoin } = require('./economy');

const GATHER_LIMIT  = 3;   // gathers per region...
const GATHER_WINDOW = 12;  // ...per this many actions

// ---------------------------------------------
// Inventory helpers for stackless material items
// ---------------------------------------------
function itemName(i) { return typeof i === 'string' ? i : (i && i.name) || ''; }

function countMaterial(state, material) {
  const m = material.toLowerCase();
  return (state.inventory || []).filter(i => itemName(i).toLowerCase() === m).length;
}

function addMaterial(state, material, qty = 1) {
  const meta = MATERIALS[material] || { tier: 1, kind: 'misc' };
  for (let n = 0; n < qty; n++) addItem(state, { name: material, type: 'material', materialTier: meta.tier });
}

// Removes exactly qty units; returns false (and removes nothing) if short.
function consumeMaterial(state, material, qty = 1) {
  if (countMaterial(state, material) < qty) return false;
  let left = qty;
  for (let i = state.inventory.length - 1; i >= 0 && left > 0; i--) {
    if (itemName(state.inventory[i]).toLowerCase() === material.toLowerCase()) { state.inventory.splice(i, 1); left--; }
  }
  return true;
}

function getMaterialCounts(state) {
  const counts = {};
  for (const i of state.inventory || []) {
    const n = itemName(i).toLowerCase();
    if (MATERIALS[n]) counts[n] = (counts[n] || 0) + 1;
  }
  return counts;
}

// ---------------------------------------------
// Hazards
// ---------------------------------------------
function getRegion(state) {
  return state.character ? REGIONS[state.character.region] : null;
}

function isWarded(state, hazard) {
  return !!(hazard && hazard.ward && hasItem(state, hazard.ward));
}

// Exposure to the region's hazard. Never lethal on its own (leaves 1 HP).
function applyHazard(state) {
  const r = getRegion(state);
  const h = r && r.hazard;
  if (!h) return null;
  if (isWarded(state, h)) return { warded: true, message: `Your ${h.ward} keeps the ${h.label.toLowerCase()} at bay.` };
  // Scouts read the land and avoid the worst of it.
  const scoutCut = state.profession === 'scout' ? 0.5 : 1;
  // The age matters: the Long Fire beats back the Ash; the Sovereign's reign feeds it.
  const ch = require('./chronicle');
  const W = ch.worldOf(state);
  const era = W ? ch.eraEffects(W).hazardMult || 1 : 1;
  const dmg = Math.max(1, Math.round(state.maxHp * h.damage * scoutCut * era));
  const before = state.hp;
  state.hp = Math.max(1, state.hp - dmg);
  return {
    warded: false,
    damage: before - state.hp,
    message: `${h.label}: ${h.desc} You lose ${before - state.hp} HP. (A ${h.ward} would protect you — merchants sell them.)`
  };
}

// ---------------------------------------------
// Exploration
// ---------------------------------------------
const EXPLORE_PATTERN = /^(?:i\s+)?(?:explore|investigate|search|visit|enter|go to|head to|delve into|venture into)\s+(?:the\s+)?(.+?)[.!?]*$/i;
const EXPLORE_LIST    = /^(?:explore|landmarks|look for landmarks|points of interest|explore the area|explore the region|explore around|scout the area)[.!?]*$/i;

function discovered(state) {
  if (!state.discoveredLandmarks || typeof state.discoveredLandmarks !== 'object') state.discoveredLandmarks = {};
  return state.discoveredLandmarks;
}

function landmarkKey(regionKey, id) { return `${regionKey}:${id}`; }

function findLandmark(state, text) {
  const r = getRegion(state);
  if (!r) return null;
  const t = String(text || '').toLowerCase().replace(/^the\s+/, '');
  if (t.length < 3) return null;
  return (r.landmarks || []).find(l => {
    const name = l.name.toLowerCase().replace(/^the\s+/, '');
    if (name === t || name.includes(t) || t.includes(name)) return true;
    const words = name.split(/[\s']+/).filter(w => w.length > 3 && !['under', 'with', 'from'].includes(w));
    return words.length && words.filter(w => t.includes(w)).length >= Math.min(2, words.length);
  }) || null;
}

function buildLandmarkList(state) {
  const r = getRegion(state);
  if (!r) return 'There is nothing here.';
  const d = discovered(state);
  const lines = [`PLACES IN ${r.label.toUpperCase()}`];
  if (r.settlement) lines.push(`  Settlement: ${r.settlement.name} (${r.settlement.kind}) — inn: ${r.settlement.inn}`);
  if (r.hazard) lines.push(`  Hazard: ${r.hazard.label} — ward: ${r.hazard.ward}${isWarded(state, r.hazard) ? ' (you have one)' : ''}`);
  if (r.resources && r.resources.length) lines.push(`  Resources: ${r.resources.join(', ')}${r.reagent ? ` · rare: ${r.reagent}` : ''}`);
  lines.push('');
  for (const l of r.landmarks || []) {
    const done = d[landmarkKey(state.character.region, l.id)];
    lines.push(`  ${done ? '✓' : '•'} ${l.name}${l.guarded && !done ? ' (guarded)' : ''}${done ? ' — explored' : ''}`);
  }
  if (r.npcs && r.npcs.length) {
    lines.push('', 'People here:');
    for (const n of r.npcs) lines.push(`  ${n.name}, ${n.role}`);
  }
  lines.push('', 'Type "explore <place>", "gather", or "talk to <name>".');
  return lines.join('\n');
}

/**
 * Starts exploring a landmark. Returns:
 *   { notFound } | { already, message }
 *   { guardian: true, landmark } — caller spawns the guardian fight
 *   { success, message, rewardText, lore } — discovered immediately
 */
function exploreLandmark(state, text) {
  const landmark = findLandmark(state, text);
  if (!landmark) return { notFound: true };
  const key = landmarkKey(state.character.region, landmark.id);
  if (discovered(state)[key]) return { already: true, landmark, message: `You have already explored ${landmark.name}. Nothing new remains.` };
  if (landmark.guarded) return { guardian: true, landmark };
  return completeLandmark(state, state.character.region, landmark.id);
}

// Grants a landmark's one-time reward.
function completeLandmark(state, regionKey, landmarkId) {
  const r = REGIONS[regionKey];
  const landmark = r && (r.landmarks || []).find(l => l.id === landmarkId);
  if (!landmark) return { notFound: true };
  const key = landmarkKey(regionKey, landmark.id);
  if (discovered(state)[key]) return { already: true, landmark, message: `${landmark.name} has nothing more to give.` };
  discovered(state)[key] = { at: state.actionCount || 0 };

  const rw = landmark.reward || {};
  const parts = [];
  let levelUp = null;
  // Scholars learn more from what they find.
  const xp = Math.round((rw.xp || 0) * (state.profession === 'scholar' ? 1.10 : 1));   // scholars learn a little more from every task
  if (xp) { levelUp = grantXP(state, xp); parts.push(`+${xp} XP`); }
  if (rw.coin) { addCoin(state, rw.coin); parts.push(formatCoin(rw.coin)); }
  if (rw.material) { addMaterial(state, rw.material, 2); parts.push(`2 × ${rw.material}`); }
  if (rw.item) { addItem(state, { name: rw.item, type: 'trinket' }); parts.push(rw.item); }
  if (rw.lore) {
    if (!Array.isArray(state.loreDiscovered)) state.loreDiscovered = [];
    if (!state.loreDiscovered.includes(rw.lore)) state.loreDiscovered.push(rw.lore);
  }
  return {
    success: true,
    landmark,
    levelUp,
    lore: rw.lore || null,
    rewardText: parts.join(', '),
    message: `You explore ${landmark.name}. ${landmark.desc}${rw.lore ? `\n\n${rw.lore}` : ''}${parts.length ? `\n\nFound: ${parts.join(', ')}.` : ''}`
  };
}

function detectExploreIntent(state, input) {
  const text = String(input || '').trim();
  if (EXPLORE_LIST.test(text)) return { type: 'list' };
  const m = text.match(EXPLORE_PATTERN);
  if (!m) return null;
  const landmark = findLandmark(state, m[1]);
  return landmark ? { type: 'landmark', text: m[1], landmark } : null;
}

// ---------------------------------------------
// Gathering
// ---------------------------------------------
const GATHER_PATTERN = /^(?:i\s+)?(?:gather|forage|harvest|mine|chop|collect|scavenge|cut)(?:\s+(?:for\s+|some\s+)?(?:the\s+)?(.+?))?[.!?]*$/i;

const PROFESSION_YIELD = {
  woodsman: 'timber', blacksmith: 'ore', hunter: 'hide', alchemist: 'herbs', cook: 'herbs', scout: null, merchant: null, scholar: null
};

const GATHER_TARGETS = /^(?:materials?|resources?|supplies|ore|iron|silver|mithril|metal|stone|wood|timber|logs?|firewood|branches|herbs?|plants?|flowers?|mushrooms?|roots?|hides?|pelts?|skins?|bones?|crystals?|shards?|reagents?|moonpetal|emberglass|sunstone|ash-silk|star-iron|[a-z -]*(?:ore|herbs|timber|hide|bone|shards?|crystals?))$/;

function detectGatherIntent(input) {
  const m = String(input || '').trim().match(GATHER_PATTERN);
  if (!m) return null;
  const target = (m[1] || '').toLowerCase().replace(/^(?:some|any|the|a few)\s+/, '').trim();
  // "gather my courage", "collect my thoughts" are not gathering.
  if (target && !GATHER_TARGETS.test(target)) return null;
  return { type: 'gather', target };
}

function gather(state, target = '') {
  const r = getRegion(state);
  if (!r || !(r.resources || []).length) return { success: false, message: 'There is nothing worth gathering here.' };
  if (state.inCombat) return { success: false, message: 'Not in the middle of a fight.' };

  if (!state.gatherLog || typeof state.gatherLog !== 'object') state.gatherLog = {};
  const now = state.actionCount || 0;
  const log = state.gatherLog[state.character.region] || { n: 0, since: now };
  if (now - log.since >= GATHER_WINDOW) { log.n = 0; log.since = now; }
  if (log.n >= GATHER_LIMIT) {
    return { success: false, message: `You have picked this area clean for now. Explore, fight or travel, and come back later (resources recover after ${GATHER_WINDOW - (now - log.since)} more actions).` };
  }
  const cost = Math.round(state.maxStamina * 0.12);
  if (state.stamina < cost) return { success: false, message: 'You are too exhausted to gather. Rest first.' };

  // Pick a resource: the one named, else random from the region.
  let pool = r.resources.filter(x => !MATERIALS[x] || !MATERIALS[x].rare);
  if (!pool.length) pool = r.resources;
  let material = r.resources.find(x => target && (target.includes(x) || x.includes(target) || (target.includes('ore') && x.includes('ore')) || (/wood|log/.test(target) && x === 'timber') || (/plant|herb|flower/.test(target) && x === 'herbs') || (/pelt|skin|hide/.test(target) && x === 'hide')));
  if (!material) material = pool[Math.floor(Math.random() * pool.length)];

  state.stamina -= cost;
  log.n++;
  state.gatherLog[state.character.region] = log;

  let qty = 1 + (Math.random() < 0.35 ? 1 : 0);
  const profYield = PROFESSION_YIELD[state.profession];
  if (profYield && material.includes(profYield)) qty += 1 + Math.floor((state.professionLevel || 1) / 2);

  addMaterial(state, material, qty);
  const found = [`${qty} × ${material}`];

  // Rare regional reagent.
  const reagentChance = 0.12 + (state.profession === 'scout' ? 0.1 : 0) + (state.professionLevel || 0) * 0.02;
  if (r.reagent && Math.random() < reagentChance) { addMaterial(state, r.reagent, 1); found.push(`1 × ${r.reagent} (rare)`); }

  return { success: true, material, qty, message: `You gather ${found.join(' and ')}.` };
}

// ---------------------------------------------
// Talking to named NPCs
// ---------------------------------------------
const TALK_PATTERN = /^(?:i\s+)?(?:talk|speak|chat)\s+(?:to|with)\s+(.+?)[.!?]*$|^(?:i\s+)?(?:ask|greet|approach|find|meet)\s+(.+?)(?:\s+(?:about|for|if|whether)\b.*)?[.!?]*$/i;

function npcMatches(npc, text) {
  const t = String(text || '').toLowerCase().replace(/^(the|lady|lord|old|sir|brother|captain)\s+/, '');
  const name = npc.name.toLowerCase();
  if (name.includes(t) && t.length >= 3) return true;
  const words = name.split(/[\s']+/).filter(w => w.length >= 3 && !['the', 'lady', 'lord', 'old', 'sir', 'of'].includes(w));
  const tWords = t.split(/[\s']+/);
  return words.some(w => tWords.includes(w)) || (npc.role && t === npc.role.toLowerCase());
}

function findNpcInRegion(regionKey, text) {
  const r = REGIONS[regionKey];
  return r ? (r.npcs || []).find(n => npcMatches(n, text)) || null : null;
}

function detectTalkIntent(input) {
  const m = String(input || '').trim().match(TALK_PATTERN);
  if (!m) return null;
  const target = (m[1] || m[2] || '').replace(/^(?:the\s+)/i, '').trim();
  return target ? { target } : null;
}

// Meeting someone counts once per NPC; repeated talking does not farm standing.
function recordMeeting(state, npcId) {
  if (!state.npcRelationships || typeof state.npcRelationships !== 'object') state.npcRelationships = {};
  const rel = state.npcRelationships[npcId] || { rapport: 0, metBefore: false };
  const firstMeeting = !rel.metBefore;
  rel.metBefore = true;
  state.npcRelationships[npcId] = rel;
  return firstMeeting;
}

module.exports = {
  countMaterial,
  addMaterial,
  consumeMaterial,
  getMaterialCounts,
  applyHazard,
  isWarded,
  buildLandmarkList,
  exploreLandmark,
  completeLandmark,
  detectExploreIntent,
  findLandmark,
  detectGatherIntent,
  gather,
  detectTalkIntent,
  findNpcInRegion,
  npcMatches,
  recordMeeting,
  GATHER_LIMIT,
  GATHER_WINDOW
};
