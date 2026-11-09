'use strict';

// =============================================================
// EMBER AND ASH — THE ROAD YOU WALK
// A character's moral road, from −100 (monstrous) to +100 (saintly). It
// moves with what the character actually does — known or not, because it
// is about who they are becoming, not what the world knows:
//   - crimes and cruelty pull it down, by how heinous they are;
//   - mercy, freeing slaves, ending crises, helping people lift it;
//   - the great choices of the story weigh on it too.
// It shows: a meter on the character panel, a portrait that brightens on
// the good road and darkens to red and black — with horns growing — on the
// evil one, and the same marks on the figure in scenes.
// No AI calls. No database calls. Pure game logic.
// =============================================================

// The story's great choices (campaign flags) and how they weigh.
const STORY = {
  shardReturned: 6, shardSold: -4, ulricOath: 4, ulricBurned: -4, towerRelit: 4,
  phylacteryShattered: 6, tookPhylactery: -10, soulsFreed: 12, soulsBound: -15,
  emberRekindled: 8, emberTaken: -6, cantorSpared: 8, cantorExecuted: -4
};

function storyWeight(state) {
  const f = (state.campaign && state.campaign.flags) || {};
  let w = 0;
  for (const [k, v] of Object.entries(STORY)) if (f[k]) w += v;
  return w;
}

function clamp(n) { return Math.max(-100, Math.min(100, Math.round(n))); }

// The character's road right now.
function value(state) {
  return clamp((typeof state.alignment === 'number' ? state.alignment : 0) + storyWeight(state));
}

// Moves the road. reason is kept so the character can see what moved it.
function shift(state, delta, reason) {
  if (!delta) return value(state);
  state.alignment = clamp((typeof state.alignment === 'number' ? state.alignment : 0) + delta);
  if (!Array.isArray(state.alignmentLog)) state.alignmentLog = [];
  state.alignmentLog.push({ delta: Math.round(delta), reason: reason || '' });
  if (state.alignmentLog.length > 12) state.alignmentLog = state.alignmentLog.slice(-12);
  return value(state);
}

function label(v) {
  if (v >= 70) return 'Saintly';
  if (v >= 30) return 'Good';
  if (v >= 10) return 'Decent';
  if (v > -10) return 'Neither good nor evil';
  if (v > -30) return 'Grey';
  if (v > -70) return 'Wicked';
  return 'Monstrous';
}

// For the portrait and the scene figure: how the road marks the face.
function marks(state) {
  const v = value(state);
  return {
    value: v, label: label(v),
    tone: v >= 30 ? 'light' : v <= -30 ? 'dark' : 'neutral',
    glow: v >= 70,
    horns: v <= -70 ? 2 : v <= -40 ? 1 : 0,
    redEyes: v <= -40
  };
}

function panel(state) {
  const m = marks(state);
  return { value: m.value, label: m.label, recent: (state.alignmentLog || []).slice(-3).map(x => `${x.delta > 0 ? '+' : ''}${x.delta} ${x.reason}`) };
}

module.exports = { value, shift, label, marks, panel, storyWeight, STORY };
