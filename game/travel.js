'use strict';

// =============================================================
// EMBER AND ASH — TRAVEL
// Moving between regions along REGIONS[*].connections.
// No AI calls. No database calls. Pure game logic.
//
// Rules:
//   - same-tier and previous-tier neighbours are always open
//   - next-tier neighbours open when the player is within one level
//     of the region's minimum, or has learned the way (advance quest)
//   - you can't travel mid-combat; the road costs stamina and may
//     bring an encounter on arrival
// =============================================================

const { REGIONS } = require('./constants');
const { getPlayerLevel } = require('./character');

const TRAVEL_PATTERN = /^(?:i\s+)?(?:travel|go|head|journey|walk|ride|set out|leave|depart|move on)\s+(?:to|for|towards?|into)\s+(?:the\s+)?(.+?)[.!?]*$/i;
const MAP_PATTERN    = /^(?:map|world map|regions|travel|where can i (?:go|travel)|show map|check map|open map)[.!?]*$/i;

function getConnectedRegionKeys(regionKey) {
  const r = REGIONS[regionKey];
  if (!r) return [];
  if (Array.isArray(r.adjacent)) return r.adjacent.filter(k => k !== regionKey && REGIONS[k]);
  const { same = [], prev = [], next = [] } = r.connections || {};
  return [...new Set([...same, ...prev, ...next])].filter(k => k !== regionKey && REGIONS[k]);
}

function canEnterRegion(state, regionKey) {
  const r = REGIONS[regionKey];
  if (!r) return { ok: false, reason: 'Unknown region.' };
  const level   = getPlayerLevel(state.totalXP || 0);
  const known   = (state.knownRegions || []).includes(regionKey);
  const visited = (state.visitedRegions || []).includes(regionKey);
  const minLvl  = (r.levelRange || [1])[0];
  const hereTier = (REGIONS[state.character && state.character.region] || {}).tier || 1;
  if (require('./campaign').isRegionStoryLocked(state, regionKey)) {
    return { ok: false, reason: `${r.label} is sealed. A wall of unmaking bars the road — only the end of the Ashen Choir will open it (main story, Chapter 9).` };
  }
  // Same-or-lower tier neighbours are always open.
  if ((r.tier || 1) <= hereTier || known || visited || level >= minLvl - 1) return { ok: true };
  return {
    ok: false,
    reason: `${r.label} is far too dangerous for you yet (Danger Lv${r.levelRange[0]}–${r.levelRange[1]}). ` +
            `Reach level ${minLvl - 1}, or take an advance quest from a bounty board to learn the way.`
  };
}

// Regions with a town or bounty-board camp: inns, merchants, revival.
function isSettlement(regionKey) {
  const r = REGIONS[regionKey];
  return !!(r && (r.cityPresent || r.hasBountyBoard));
}

// Where a fallen player wakes: here if it's settled, else the last
// settlement they passed through (so a death doesn't loop in a hostile wild).
function getRevivalRegion(state) {
  const here = state.character && state.character.region;
  if (isSettlement(here)) return here;
  if (state.lastSettlement && REGIONS[state.lastSettlement]) return state.lastSettlement;
  const visited = (state.visitedRegions || []).filter(isSettlement);
  return visited.length ? visited[visited.length - 1] : here;
}

function getTravelOptions(state) {
  const here = state.character && state.character.region;
  return getConnectedRegionKeys(here).map(key => {
    const r      = REGIONS[key];
    const access = canEnterRegion(state, key);
    return {
      key,
      label:      r.label,
      tier:       r.tier,
      levelRange: r.levelRange,
      open:       access.ok,
      reason:     access.ok ? null : access.reason
    };
  });
}

function detectTravelIntent(input) {
  const text = String(input || '').trim();
  if (MAP_PATTERN.test(text)) return { type: 'map' };
  const m = text.match(TRAVEL_PATTERN);
  if (!m) return null;
  const destination = resolveRegion(m[1]);
  // Only claim the input when it names a real region — "go to the inn"
  // stays a normal narrative action.
  if (!destination) return null;
  return { type: 'travel', destination };
}

function resolveRegion(text) {
  const t = String(text || '').toLowerCase().replace(/[.!?]+$/, '').replace(/^the\s+/, '').trim();
  if (!t) return null;
  if (REGIONS[t]) return t;
  const underscored = t.replace(/\s+/g, '_');
  if (REGIONS[underscored]) return underscored;
  let best = null;
  for (const [key, r] of Object.entries(REGIONS)) {
    const label = r.label.toLowerCase().replace(/^the\s+/, '');
    if (label === t) return key;
    // "greymere" -> "Greymere Moors"; "ashwood fringe" -> "Ashwood Fringe"
    if (label.startsWith(t) || t.startsWith(label) || label.split(/\s+/)[0] === t) {
      if (!best) best = key;
    }
  }
  return best;
}

function buildMapText(state) {
  const here = state.character && REGIONS[state.character.region];
  const opts = getTravelOptions(state);
  const lines = [
    'MAP',
    `You are in: ${here ? `${here.label} (Tier ${here.tier}, Danger Lv${here.levelRange[0]}–${here.levelRange[1]})` : 'unknown lands'}`,
    ''
  ];
  if (!opts.length) {
    lines.push('No roads lead onward from here.');
  } else {
    lines.push('Roads from here:');
    for (const o of opts) {
      lines.push(`  ${o.open ? '•' : '✕'} ${o.label} — Tier ${o.tier}, Danger Lv${o.levelRange[0]}–${o.levelRange[1]}${o.open ? '' : ' (not yet)'}`);
    }
    lines.push('', 'Type "travel to <region>" to set out.');
  }
  return lines.join('\n');
}

/**
 * Moves the player to a connected region. Returns
 * { success, message, from, to, hint } — caller handles encounters,
 * quest arrival events, and persistence.
 */
function travelTo(state, destinationKey) {
  if (state.inCombat) return { success: false, message: "You can't leave in the middle of a fight. Flee first." };

  const fromKey = state.character && state.character.region;
  const dest    = REGIONS[destinationKey];
  if (!dest) return { success: false, message: 'There is no such place on any map you know.' };
  if (destinationKey === fromKey) return { success: false, message: `You are already in ${dest.label}.` };

  const connected = getConnectedRegionKeys(fromKey);
  if (!connected.includes(destinationKey)) {
    const names = connected.map(k => REGIONS[k].label).join(', ');
    return { success: false, message: `No road leads directly from here to ${dest.label}. From here you can reach: ${names || 'nowhere'}.` };
  }

  const access = canEnterRegion(state, destinationKey);
  if (!access.ok) return { success: false, message: access.reason };

  const from = REGIONS[fromKey];
  state.character.region = destinationKey;
  state.currentLocation  = null;
  state.currentNPC       = null;
  state.sceneContext     = 'travel';
  state.shopOpen         = false;
  state.boardQuests      = [];       // new region, new postings
  state.lastDefeatedEnemyLoot = null;
  state.stamina          = Math.max(0, Math.round((state.stamina || 0) - (state.maxStamina || 0) * 0.3));
  if (!state.visitedRegions) state.visitedRegions = [];
  if (fromKey && !state.visitedRegions.includes(fromKey)) state.visitedRegions.push(fromKey);
  if (!state.visitedRegions.includes(destinationKey)) state.visitedRegions.push(destinationKey);
  if (isSettlement(destinationKey)) state.lastSettlement = destinationKey;

  return {
    success: true,
    from:    fromKey,
    to:      destinationKey,
    message: `You travel from ${from ? from.label : 'the road'} to ${dest.label}.`,
    hint:    `[TRAVEL — the player journeyed from ${from ? from.label : 'their previous region'} to ${dest.label}. ` +
             `Describe the road and arrival: ${dest.flavor}. ${dest.desc} Do not narrate player decisions.]`
  };
}

module.exports = {
  isSettlement,
  getRevivalRegion,
  getConnectedRegionKeys,
  canEnterRegion,
  getTravelOptions,
  detectTravelIntent,
  resolveRegion,
  buildMapText,
  travelTo
};
