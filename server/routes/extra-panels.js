'use strict';

// Panels added with the campaign, factions, abilities and companions.
// Shared by every route that returns the full UI state.
const campaign = require('../../game/campaign');
const factions = require('../../game/factions');
const tactics  = require('../../game/combat-tactics');

function extraPanels(state, inCreation) {
  if (inCreation || !state.character || !state.character.region) {
    return { story: null, factions: null, abilities: [], party: [] };
  }
  return {
    story:     campaign.buildStoryPanel(state),
    factions:  factions.buildFactionPanel(state),
    abilities: tactics.buildAbilityList(state),
    party:     (state.companions || []).map(c => ({ name: c.name, role: c.role, loyalty: c.loyalty, hired: !!c.hired }))
  };
}

module.exports = { extraPanels };
