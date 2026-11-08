'use strict';

// =============================================================
// EMBER AND ASH — FACTIONS
// Four powers contest the fate of the world. Standing changes only
// through validated game events (story choices, bounties completed,
// enemies defeated) — never because the player says so.
// No AI calls. No database calls. Pure game logic.
// =============================================================

const { REGIONS } = require('./constants');

const FACTIONS = {
  wardens: { label: 'Ember Wardens',      desc: 'An ancient order sworn to keep the Ember — the world\'s fire — burning, so the thing on the Throne stays asleep.' },
  compact: { label: 'Free Compact',       desc: 'The merchants, militias and common folk of the outer towns. They want to live, trade, and be left alone.' },
  remnant: { label: 'Veldrathi Remnant',  desc: 'Heirs of the old empire, who believe its monuments can bind the Throne\'s power — and rule with it.' },
  choir:   { label: 'Ashen Choir',        desc: 'A cult that sings to the Hollow Sovereign, feeding it souls so it will wake and unmake the world.' }
};

const STANDING_LABELS = [
  [-50, 'Hated'], [-20, 'Hostile'], [0, 'Distrusted'], [20, 'Neutral'], [50, 'Friendly'], [80, 'Honored'], [Infinity, 'Exalted']
];

function ensureFactions(state) {
  if (!state.factions || typeof state.factions !== 'object') state.factions = {};
  for (const k of Object.keys(FACTIONS)) if (typeof state.factions[k] !== 'number') state.factions[k] = 0;
  // The Choir starts hostile to everyone who is not one of them.
  if (!state.factionsInitialized) { state.factions.choir = -30; state.factionsInitialized = true; }
  return state.factions;
}

function getStanding(state, faction) {
  return ensureFactions(state)[faction] || 0;
}

function getStandingLabel(value) {
  for (const [max, label] of STANDING_LABELS) if (value < max) return label;
  return 'Exalted';
}

// Returns a list of { faction, label, delta, value } for the changes applied.
function changeStanding(state, changes, reason = '') {
  ensureFactions(state);
  const applied = [];
  for (const [faction, delta] of Object.entries(changes || {})) {
    if (!FACTIONS[faction] || !delta) continue;
    const before = state.factions[faction];
    state.factions[faction] = Math.max(-100, Math.min(100, before + delta));
    applied.push({ faction, label: FACTIONS[faction].label, delta: state.factions[faction] - before, value: state.factions[faction], reason });
  }
  return applied;
}

function formatStandingChanges(applied) {
  return applied.filter(a => a.delta).map(a => `${a.label} ${a.delta > 0 ? '+' : ''}${a.delta} (${getStandingLabel(a.value)})`).join(', ');
}

// The faction that holds sway in a region: its first named NPC's faction.
function getRegionFaction(regionKey) {
  const r = REGIONS[regionKey];
  const npc = r && (r.npcs || [])[0];
  return npc ? npc.faction : 'compact';
}

// Merchant price multiplier from Free Compact standing (they run the trade).
function getPriceModifier(state) {
  const s = getStanding(state, 'compact');
  if (s >= 80) return 0.85;
  if (s >= 50) return 0.90;
  if (s >= 20) return 0.95;
  if (s <= -50) return 1.4;
  if (s <= -20) return 1.2;
  return 1.0;
}

// Would an NPC of this faction refuse to deal with the player?
function isShunnedBy(state, faction) {
  return faction !== 'choir' && getStanding(state, faction) <= -50;
}

function buildFactionText(state) {
  ensureFactions(state);
  const lines = ['FACTIONS', ''];
  for (const [k, f] of Object.entries(FACTIONS)) {
    const v = state.factions[k];
    lines.push(`  ${f.label.padEnd(18)} ${String(v).padStart(4)}  ${getStandingLabel(v)}`);
    lines.push(`    ${f.desc}`);
  }
  lines.push('', 'Standing changes through your choices and deeds, not your words.');
  return lines.join('\n');
}

function buildFactionPanel(state) {
  ensureFactions(state);
  return Object.entries(FACTIONS).map(([key, f]) => ({ key, label: f.label, value: state.factions[key], standing: getStandingLabel(state.factions[key]) }));
}

module.exports = {
  FACTIONS,
  ensureFactions,
  getStanding,
  getStandingLabel,
  changeStanding,
  formatStandingChanges,
  getRegionFaction,
  getPriceModifier,
  isShunnedBy,
  buildFactionText,
  buildFactionPanel
};
