'use strict';

function addCompanion(state, companionData) {
  if (!state.companions) state.companions = [];

  const existing = state.companions.find(c =>
    c.name.toLowerCase() === companionData.name.toLowerCase()
  );
  if (existing) {
    return { success: false, message: `${companionData.name} is already traveling with you.` };
  }

  if (state.companions.length >= 3) {
    return {
      success: false,
      message: 'You cannot travel with more than 3 companions.',
      hint: '[COMPANION LIMIT — player already has 3 companions. Someone would need to leave before a new companion can join.]'
    };
  }

  const companion = {
    id: `companion_${Date.now()}`,
    name: companionData.name,
    description: companionData.description || '',
    role: companionData.role || 'ally',
    loyalty: companionData.loyalty || 50,
    joinedAt: Date.now(),
    metInRegion: state.character ? state.character.region : null
  };

  state.companions.push(companion);

  return {
    success: true,
    companion,
    message: `${companion.name} has joined your party.`
  };
}

function removeCompanion(state, nameOrId) {
  if (!state.companions || state.companions.length === 0) {
    return { success: false, message: 'You have no companions to dismiss.' };
  }

  const idx = state.companions.findIndex(c =>
    c.name.toLowerCase().includes(nameOrId.toLowerCase()) ||
    c.id === nameOrId
  );

  if (idx === -1) {
    return { success: false, message: `No companion matching "${nameOrId}" found.` };
  }

  const removed = state.companions.splice(idx, 1)[0];
  return {
    success: true,
    companion: removed,
    message: `${removed.name} has left your party.`
  };
}

function getCompanion(state, name) {
  if (!state.companions) return null;
  return state.companions.find(c =>
    c.name.toLowerCase().includes(name.toLowerCase())
  );
}

function changeCompanionLoyalty(state, nameOrId, amount) {
  const companion = state.companions && state.companions.find(c =>
    c.name.toLowerCase().includes(nameOrId.toLowerCase()) || c.id === nameOrId
  );

  if (!companion) return { success: false, message: 'Companion not found.' };

  companion.loyalty = Math.max(0, Math.min(100, (companion.loyalty || 50) + amount));

  if (companion.loyalty <= 0) {
    removeCompanion(state, companion.id);
    return {
      success: true,
      departed: true,
      companion,
      message: `${companion.name} has abandoned you due to lack of trust.`
    };
  }

  return { success: true, companion, newLoyalty: companion.loyalty };
}

const COMPANION_JOIN_KEYWORDS = [
  'join me', 'travel with', 'come with', 'follow me', 'accompany',
  'party up', 'team up', 'hire', 'recruit', 'bring along'
];

const COMPANION_LEAVE_KEYWORDS = [
  'leave', 'dismiss', 'part ways', 'let go', 'send away', 'fire',
  'goodbye', 'farewell', 'stay here', 'wait here'
];

function detectCompanionIntent(text, state) {
  const t = text.toLowerCase();

  const isJoin = COMPANION_JOIN_KEYWORDS.some(kw => t.includes(kw));
  const isLeave = COMPANION_LEAVE_KEYWORDS.some(kw => t.includes(kw));

  if (!isJoin && !isLeave) return null;

  let npcName = null;
  if (state.currentNPC) {
    npcName = state.currentNPC;
  }

  const namePatterns = [
    /(?:ask|tell|invite)\s+(\w+)\s+to/i,
    /(\w+)\s+(?:join|come|travel|accompany)/i,
    /(?:with|dismiss|goodbye)\s+(\w+)/i,
    /(?:let|send)\s+(\w+)\s+(?:go|away)/i
  ];

  for (const pattern of namePatterns) {
    const match = t.match(pattern);
    if (match && match[1]) {
      npcName = match[1];
      break;
    }
  }

  return {
    intent: isLeave ? 'leave' : 'join',
    npcName
  };
}

function getLoyaltyLabel(loyalty) {
  if (loyalty >= 90) return 'Devoted';
  if (loyalty >= 70) return 'Loyal';
  if (loyalty >= 50) return 'Friendly';
  if (loyalty >= 30) return 'Uncertain';
  if (loyalty >= 10) return 'Reluctant';
  return 'Disloyal';
}

function getCompanionsDisplay(state) {
  if (!state.companions || state.companions.length === 0) {
    return { hasCompanions: false, list: [], display: 'None.' };
  }

  return {
    hasCompanions: true,
    list: state.companions.map(c => ({
      name: c.name,
      role: c.role,
      loyalty: c.loyalty,
      loyaltyLabel: getLoyaltyLabel(c.loyalty)
    })),
    display: state.companions.map(c => c.name).join(', ')
  };
}

module.exports = {
  addCompanion,
  removeCompanion,
  getCompanion,
  changeCompanionLoyalty,
  detectCompanionIntent,
  getCompanionsDisplay,
  getLoyaltyLabel
};
