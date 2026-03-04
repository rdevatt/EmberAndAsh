'use strict';

const { REGIONS } = require('./regions');
const {
  BACKGROUNDS,
  MAGICAL_BACKGROUNDS,
  STARTING_GEAR,
  BUILD_MODS,
  BUILD_KEYWORDS,
  AGE_BANDS,
  NSFW_KEYWORDS,
  BACKGROUND_KEYWORDS,
  STARTING_ENVIRONMENTS,
  STARTING_SPELLS,
  FREEFORM_SKILL_CONFIG,
} = require('./data/character/index.js');
const {
  WORLD_TIERS,
  ENEMIES,
  BODY_PARTS,
} = require('./data/world/enemies');
const {
  QUEST_TYPES,
  QUEST_REWARD_BASE,
  QUEST_DIFFICULTY,
  HUNT_TEMPLATES,
  PATROL_TEMPLATES,
  ESCORT_TEMPLATES,
  RETRIEVE_TEMPLATES,
  SCOUT_TEMPLATES,
  ADVANCE_QUESTS,
} = require('./data/world/quests');
const {
  GEAR_QUALITIES,
  CLASSES,
  PROFESSIONS,
  PROF_LEVEL_XP,
  PROFESSION_TASKS,
  SCENE_CONTEXTS,
  INTIMACY_CONDITIONS,
  MAX_LEVEL,
  CLASS_LEVEL_XP,
} = require('./data/progression/index.js');


// ============================================
// WORLD MAP CONNECTIONS SUMMARY
// Helper structure for generating travel/scout quests.
// Maps region key -> neighboring region keys
// =============================================
function getRegionConnections(regionKey) {
  const r = REGIONS[regionKey];
  if (!r || !r.connections) return [];
  const all = [
    ...(r.connections.same || []),
    ...(r.connections.prev || []),
    ...(r.connections.next || [])
  ];
  return [...new Set(all)].filter(k => REGIONS[k]);
}

function getNextTierRegions(regionKey) {
  const r = REGIONS[regionKey];
  if (!r || !r.connections) return [];
  return (r.connections.next || []).filter(k => REGIONS[k]);
}


module.exports = {
  BACKGROUNDS,
  MAGICAL_BACKGROUNDS,
  REGIONS,
  WORLD_TIERS,
  STARTING_ENVIRONMENTS,
  ENEMIES,
  BODY_PARTS,
  GEAR_QUALITIES,
  STARTING_GEAR,
  CLASSES,
  PROFESSIONS,
  PROF_LEVEL_XP,
  PROFESSION_TASKS,
  SCENE_CONTEXTS,
  INTIMACY_CONDITIONS,
  MAX_LEVEL,
  CLASS_LEVEL_XP,
  BUILD_MODS,
  BUILD_KEYWORDS,
  AGE_BANDS,
  NSFW_KEYWORDS,
  BACKGROUND_KEYWORDS,
  STARTING_SPELLS,
  FREEFORM_SKILL_CONFIG,
  QUEST_TYPES,
  QUEST_REWARD_BASE,
  QUEST_DIFFICULTY,
  HUNT_TEMPLATES,
  PATROL_TEMPLATES,
  ESCORT_TEMPLATES,
  RETRIEVE_TEMPLATES,
  SCOUT_TEMPLATES,
  ADVANCE_QUESTS,
  getRegionConnections,
  getNextTierRegions,
};
