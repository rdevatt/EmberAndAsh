'use strict';

const { REGIONS } = require('./regions');

const resolvedDataModules = {};

function requireFirst(label, candidates) {
  let lastError;
  for (const candidate of candidates) {
    try {
      resolvedDataModules[label] = candidate;
      return require(candidate);
    } catch (error) {
      const isDirectMissingModule =
        error &&
        error.code === 'MODULE_NOT_FOUND' &&
        typeof error.message === 'string' &&
        error.message.includes(`'${candidate}'`);
      if (!isDirectMissingModule) {
        throw error;
      }
      lastError = error;
    }
  }
  throw lastError;
}

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
} = requireFirst('character', ['./data/character.js', './data/character/index.js']);
const {
  WORLD_TIERS,
  ENEMIES,
  BODY_PARTS,
} = requireFirst('enemies', ['./data/enemies.js', './data/world/enemies.js']);
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
} = requireFirst('quests', ['./data/quests.js', './data/world/quests.js']);
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
} = requireFirst('progression', ['./data/progression.js', './data/progression/index.js']);

if (process.env.NODE_ENV === 'production') {
  console.info('[constants:data] resolved modules', resolvedDataModules);
}


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
