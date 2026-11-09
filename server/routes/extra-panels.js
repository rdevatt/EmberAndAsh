'use strict';

// Panels added with the campaign, factions, abilities and companions.
// Shared by every route that returns the full UI state.
const campaign = require('../../game/campaign');
const factions = require('../../game/factions');
const tactics  = require('../../game/combat-tactics');
const { getNarrationStatus } = require('../../game/narrative/core');
const chronicle  = require('../../game/chronicle');
const appearance = require('../../game/appearance');

function safePortrait(state) {
  try {
    const w = chronicle.worldOf(state);
    return appearance.portraitData(state, { ruler: !!(w && w.realm && w.realm.rulerId === state.characterId) });
  } catch (e) { return null; }
}

function worldPanel(state) {
  const w = chronicle.worldOf(state);
  if (!w) return null;
  const { titlesFor, activeCrises, sagaObjective } = require('../../game/endless');
  return {
    name: w.name, date: chronicle.formatDate(chronicle.nowHour(w)), year: chronicle.dateOf(chronicle.nowHour(w)).year,
    era: w.era.name, realm: w.realm ? w.realm.title : null,
    age: chronicle.ageOf(state, w), bodyAge: chronicle.bodyAge(state, w), ageBand: chronicle.ageBand(chronicle.bodyAge(state, w)),
    lifespan: Number.isFinite(chronicle.lifespan(state)) ? chronicle.lifespan(state) : null,
    titles: titlesFor(state, w), crises: activeCrises(w).length, saga: sagaObjective(state),
    afterEnding: state.campaign && state.campaign.afterEnding === 'pending', deceased: !!state.deceased,
    legends: w.figures.filter(f => f.characterId !== state.characterId).length
  };
}

function extraPanels(state, inCreation) {
  if (inCreation || !state.character || !state.character.region) {
    return { story: null, factions: null, abilities: [], party: [], narration: getNarrationStatus().mode };
  }
  return {
    story:     campaign.buildStoryPanel(state),
    factions:  factions.buildFactionPanel(state),
    abilities: tactics.buildAbilityList(state),
    party:     (state.companions || []).map(c => ({ name: c.name, role: c.role, loyalty: c.loyalty, hired: !!c.hired })),
    narration: getNarrationStatus().mode,
    world:     worldPanel(state),
    portrait:  safePortrait(state),
    potions:   (state.inventory || []).filter(i => /healing potion/.test(typeof i === 'string' ? i : i.name)).length,
    manaPotions: (state.inventory || []).filter(i => /mana potion/.test(typeof i === 'string' ? i : i.name)).length,
    // What is in the character's hand: the player draws it, the class does not.
    weapon:    state.gear && state.gear.weapon ? { name: String(state.gear.weapon.name).replace(/\s*\(.*\)$/, ''), drawn: !!state.weaponDrawn } : null
  };
}

module.exports = { extraPanels };
