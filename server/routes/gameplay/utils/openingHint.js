'use strict';

function buildOpeningHint(state) {
  const c        = state.character || {};
  const envKey   = c.startingEnvironment || '';
  const bgKey    = c.background || '';
  const charName = c.name || null;
  const region   = c.region || '';

  const envLabels = {
    deep_forest: 'Deep Forest — dense woodland, sparse population, beast-heavy',
    open_plains: 'Open Plains — vast grasslands, visible horizon, traveler roads',
    small_village: 'Small Village — a settlement of a few hundred people, community life',
    bustling_city: 'Bustling City — a metropolis of millions, wealth and rot in equal measure'
  };

  const regionFlavors = {
    thornwick: 'rolling farmland, muddy roads, and treelines that feel closer every year',
    ironport: 'salt-stained cobblestones, crowded markets, and shadows that watch you back',
    ashwood: 'silver bark trees, eerie silence, and light that bends at wrong angles',
    dustfall: 'amber grass, open sky, and the wind carrying the smell of something dead'
  };

  const beastOpenings = {
    thornwick: 'A road wolf the size of a pony crashes into the mud at your feet — brought down by someone else\'s arrow before it could reach you',
    ironport: 'A bloated harbour beast — part eel, part nightmare — stops thrashing as the man beside you wrenches his blade free from its skull',
    ashwood: 'A corrupted stag — its antlers fused into bone blades, its eyes black and burning — drops mid-charge at the hand of a stranger who doesn\'t stay to explain',
    dustfall: 'An orc raider twice your size crumples face-first into the dust — the crossbow bolt through its eye placed by a hooded figure already disappearing into the grass'
  };

  return [
    '[OPENING SCENE — character creation just completed. Write the very first moment of this character\'s story in vivid prose.]',
    charName ? `[Character name: ${charName}]` : '[Character has no name — do not give them one]',
    bgKey ? `[Background: ${bgKey}]` : '',
    envKey ? `[Starting environment: ${envLabels[envKey] || envKey}]` : '',
    region ? `[Region feel: ${regionFlavors[region] || region}]` : '',
    beastOpenings[region] ? `[Opening beat: ${beastOpenings[region]}]` : '',
    '[Write ONLY prose. No stats, no mechanics, no system text. Establish the world as dangerous, real, and indifferent.]',
    '[End on an open beat — something just changed, now what?]'
  ].filter(Boolean).join('\n');
}

module.exports = {
  buildOpeningHint
};
