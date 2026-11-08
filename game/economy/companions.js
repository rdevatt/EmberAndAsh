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
  'join me', 'travel with me', 'come with me', 'follow me', 'accompany me',
  'party up', 'team up', 'hire', 'recruit', 'bring along', 'join my party',
  'join us', 'come with us', 'travel together'
];

// Leaving must be explicit — "leave the tavern" or "fire an arrow" must
// never dismiss a companion.
const COMPANION_LEAVE_PATTERNS = [
  /\bdismiss\s+(\w+)/i,
  /\bpart ways with\s+(\w+)/i,
  /\bsend\s+(\w+)\s+away\b/i,
  /\blet\s+(\w+)\s+go\b/i,
  /\btell\s+(\w+)\s+to\s+(?:leave|go home|go away)\b/i,
  /\b(\w+)\s*,?\s+(?:you(?:'re| are) dismissed|leave the party)\b/i
];

const NON_NAMES = new Set(['you','me','us','him','her','them','it','my','the','a','an','i','we','they','this','that','with','to','along','together','someone','anyone']);

function cleanName(word) {
  const w = String(word || '').replace(/[^a-z'-]/gi, '');
  return w && !NON_NAMES.has(w.toLowerCase()) ? w : null;
}

function detectCompanionIntent(text, state) {
  const t = String(text || '');
  const lower = t.toLowerCase();

  for (const pattern of COMPANION_LEAVE_PATTERNS) {
    const m = t.match(pattern);
    const name = m && cleanName(m[1]);
    if (name && (state.companions || []).some(c => c.name.toLowerCase().startsWith(name.toLowerCase()))) {
      return { intent: 'leave', npcName: name };
    }
  }

  if (!COMPANION_JOIN_KEYWORDS.some(kw => lower.includes(kw))) return null;

  let npcName = null;
  const namePatterns = [
    /(?:ask|tell|invite|hire|recruit)\s+(\w+)\s+(?:to|if)/i,
    /(?:hire|recruit)\s+(\w+)/i,
    /(\w+)\s*,\s*(?:will|would|do|can)\s+you\s+(?:join|come|travel|accompany)/i
  ];
  for (const pattern of namePatterns) {
    const match = t.match(pattern);
    const name  = match && cleanName(match[1]);
    if (name) { npcName = name; break; }
  }
  if (!npcName && state.currentNPC) npcName = state.currentNPC;

  return { intent: 'join', npcName };
}

// Social interaction with the NPC currently in the scene builds rapport.
const SOCIAL_PATTERN = /\b(talk|ask|tell|say|chat|thank|help|give|share|drink|laugh|compliment|listen|offer|buy (?:him|her|them) a|smile|joke|comfort|apologi[sz]e|greet|introduce|trade stories|toast)\b/i;

function applySocialRapport(state, input) {
  if (!state.currentNPC || state.inCombat) return null;
  if (!SOCIAL_PATTERN.test(String(input || ''))) return null;
  const key = state.currentNPC.toLowerCase().replace(/\s+/g, '_');
  if (!state.npcRelationships) state.npcRelationships = {};
  const rel = state.npcRelationships[key] || { rapport: 10, metBefore: true };
  const cha = (state.stats && state.stats.cha) || 10;
  const gain = Math.max(2, 4 + Math.floor((cha - 10) / 3));
  rel.rapport   = Math.min(100, (rel.rapport || 0) + gain);
  rel.metBefore = true;
  state.npcRelationships[key] = rel;
  return { npc: state.currentNPC, rapport: rel.rapport, gain };
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
  applySocialRapport,
  getCompanionsDisplay,
  getLoyaltyLabel
};
