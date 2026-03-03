'use strict';

const ITEM_GRANT_PATTERNS = [
  /(?:hands?|gives?|offers?|passes?|tosses?|throws?|presents?)\s+(?:you|him|her|them)\s+(?:a|an|the|some|her|his)?\s*([a-z\s\-']+?)(?:\.|,|;|\s+and\s|\s+before|\s+then|\s+as|\s+with|\s+"|\s+—)/gi,
  /(?:hands?|gives?|offers?|passes?|tosses?)\s+(?:over|across)?\s*(?:a|an|the)?\s*([a-z\s\-']+?)(?:\s+to\s+you|\.|,)/gi,
  /(?:you\s+)?(?:receive|accept|take|grab|catch)\s+(?:a|an|the|some)?\s*([a-z\s\-']+?)(?:\s+from|\.|,)/gi,
  /(?:here(?:'s| is)|take this|have this)\s+([a-z\s\-']+?)(?:"|'|\.|,)/gi,
  /(?:sets?|places?|lays?|puts?)\s+(?:a|an|the)?\s*([a-z\s\-']+?)\s+(?:in(?:to)?|on|beside|before|next to)\s+(?:your|his|her|their)\s+(?:hands?|lap|pack|bag)/gi,
  /(?:you\s+)?(?:find|discover|spot|notice)\s+(?:a|an|the)?\s*([a-z\s\-']+?)\s+(?:on the|lying|resting|hidden)/gi,
  /(?:pick(?:s)?\s+up|collect(?:s)?|gather(?:s)?)\s+(?:a|an|the)?\s*([a-z\s\-']+?)(?:\.|,|\s+and|\s+from)/gi,
];

const EQUIPMENT_INDICATORS = [
  'sword', 'blade', 'dagger', 'knife', 'axe', 'mace', 'hammer', 'club', 'spear',
  'staff', 'bow', 'crossbow', 'weapon', 'pitchfork', 'scythe', 'hatchet', 'cutlass',
  'armor', 'armour', 'leather', 'chainmail', 'plate', 'tunic', 'vest', 'helmet',
  'helm', 'shield', 'gauntlets', 'boots', 'greaves', 'cuirass', 'breastplate',
  'mail', 'padded', 'cloak', 'robe', 'jerkin', 'bracers'
];

const ITEM_EXCLUSIONS = [
  'hand', 'hands', 'look', 'glance', 'smile', 'nod', 'moment', 'breath', 'word',
  'words', 'silence', 'pause', 'gesture', 'thought', 'feeling', 'sense', 'sound',
  'nothing', 'something', 'everything', 'anything', 'way', 'time', 'place',
  'you', 'your', 'him', 'her', 'them', 'their', 'it', 'its', 'this', 'that'
];

function detectItemsInNarrative(narrativeText) {
  const detectedItems = [];
  const seen = new Set();

  for (const pattern of ITEM_GRANT_PATTERNS) {
    pattern.lastIndex = 0;

    let match;
    while ((match = pattern.exec(narrativeText)) !== null) {
      let itemName = match[1].trim().toLowerCase();

      itemName = itemName
        .replace(/^(a|an|the|some|her|his|your)\s+/i, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (itemName.length < 3 || itemName.length > 40) continue;
      if (ITEM_EXCLUSIONS.some(ex => itemName === ex || itemName.startsWith(ex + ' '))) continue;
      if (seen.has(itemName)) continue;

      const isEquipment = EQUIPMENT_INDICATORS.some(ind => itemName.includes(ind));
      const isWeapon = ['sword', 'blade', 'dagger', 'knife', 'axe', 'mace', 'hammer',
                        'club', 'spear', 'staff', 'bow', 'crossbow', 'weapon', 'pitchfork',
                        'scythe', 'hatchet', 'cutlass'].some(w => itemName.includes(w));
      const isArmor = ['armor', 'armour', 'leather', 'chainmail', 'plate', 'tunic',
                       'vest', 'helmet', 'helm', 'shield', 'gauntlets', 'boots',
                       'greaves', 'cuirass', 'breastplate', 'mail', 'cloak', 'robe',
                       'jerkin', 'bracers'].some(a => itemName.includes(a));

      seen.add(itemName);
      detectedItems.push({
        name: itemName,
        isEquipment,
        isWeapon,
        isArmor,
        rawMatch: match[0]
      });
    }
  }

  return detectedItems;
}

const COMPANION_JOIN_PATTERNS = [
  /([A-Z][a-z]+)\s+(?:agrees?|decides?|chooses?|offers?)\s+to\s+(?:join|accompany|travel|come|follow|go)\s+(?:with\s+)?(?:you|along|together)/gi,
  /([A-Z][a-z]+)\s+(?:will|shall|'ll)\s+(?:join|accompany|travel|come|follow)\s+(?:with\s+)?(?:you|along)/gi,
  /"[^"]*(?:I'll|I will|I shall)\s+(?:come|go|travel|join|accompany)[^"]*"\s*(?:says?|replies?|answers?)?\s*([A-Z][a-z]+)?/gi,
  /([A-Z][a-z]+)\s+(?:says?|replies?|answers?)[^.]*"[^"]*(?:I'll|I will)\s+(?:come|go|travel|join)[^"]*"/gi,
  /([A-Z][a-z]+)\s+(?:falls?\s+in(?:to\s+step)?|walks?|moves?|steps?)\s+(?:beside|alongside|with)\s+(?:you|the\s+player)/gi,
  /([A-Z][a-z]+)\s+(?:is\s+ready|stands?\s+ready|prepares?)\s+to\s+(?:leave|travel|go|depart)\s+(?:with\s+)?(?:you)?/gi,
];

const COMPANION_LEAVE_PATTERNS = [
  /([A-Z][a-z]+)\s+(?:leaves?|departs?|parts?\s+ways?|says?\s+(?:goodbye|farewell)|turns?\s+(?:away|back)|walks?\s+away)/gi,
  /([A-Z][a-z]+)\s+(?:must|has\s+to|needs?\s+to)\s+(?:leave|go|depart|part)/gi,
  /([A-Z][a-z]+)\s+(?:stays?|remains?)\s+(?:behind|here)/gi,
];

function detectCompanionChangesInNarrative(narrativeText, state) {
  const changes = {
    joining: [],
    leaving: []
  };

  const currentCompanions = (state.companions || []).map(c => c.name.toLowerCase());

  for (const pattern of COMPANION_JOIN_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(narrativeText)) !== null) {
      let name = null;
      for (let i = 1; i < match.length; i++) {
        if (match[i] && /^[A-Z][a-z]+$/.test(match[i])) {
          name = match[i];
          break;
        }
      }

      if (name && name.length >= 3 && name.length <= 20) {
        if (!currentCompanions.includes(name.toLowerCase())) {
          if (!changes.joining.find(j => j.name.toLowerCase() === name.toLowerCase())) {
            changes.joining.push({ name, rawMatch: match[0] });
          }
        }
      }
    }
  }

  for (const pattern of COMPANION_LEAVE_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(narrativeText)) !== null) {
      let name = match[1];
      if (name && name.length >= 3 && name.length <= 20) {
        if (currentCompanions.includes(name.toLowerCase())) {
          if (!changes.leaving.find(l => l.name.toLowerCase() === name.toLowerCase())) {
            changes.leaving.push({ name, rawMatch: match[0] });
          }
        }
      }
    }
  }

  return changes;
}

function applyDetectedChanges(state, items, companionChanges, deps) {
  const { addItem, addCompanion, removeCompanion, equipWeapon, equipArmor } = deps;
  const events = [];

  for (const item of items) {
    const displayName = item.name.split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    if (item.isWeapon && !state.gear.weapon) {
      const result = equipWeapon(state, { name: displayName, tier: 1 });
      if (result.success) {
        events.push({
          type: 'itemEquipped',
          item: result.item,
          slot: 'weapon',
          auto: true,
          message: `Equipped: ${displayName}`
        });
      }
    } else if (item.isArmor && !state.gear.armor) {
      const result = equipArmor(state, { name: displayName, tier: 1 });
      if (result.success) {
        events.push({
          type: 'itemEquipped',
          item: result.item,
          slot: 'armor',
          auto: true,
          message: `Equipped: ${displayName}`
        });
      }
    } else {
      addItem(state, displayName);
      events.push({
        type: 'itemReceived',
        name: displayName,
        isEquipment: item.isEquipment
      });
    }
  }

  for (const joiner of companionChanges.joining) {
    const result = addCompanion(state, {
      name: joiner.name,
      description: 'A companion who joined your journey.',
      role: 'ally'
    });

    if (result.success) {
      events.push({
        type: 'companionJoined',
        companion: result.companion,
        auto: true
      });
    }
  }

  for (const leaver of companionChanges.leaving) {
    const result = removeCompanion(state, leaver.name);
    if (result.success) {
      events.push({
        type: 'companionLeft',
        companion: result.companion,
        auto: true
      });
    }
  }

  return events;
}

function extractCurrentNPC(narrativeText, state) {
  const dialoguePatterns = [
    /([A-Z][a-z]+)\s+(?:says?|asks?|replies?|answers?|murmurs?|whispers?|shouts?|calls?|speaks?)/g,
    /(?:says?|asks?|replies?)\s+([A-Z][a-z]+)/g,
    /"[^"]+"\s+([A-Z][a-z]+)\s+(?:says?|asks?|replies?)/g
  ];

  const names = new Set();

  for (const pattern of dialoguePatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(narrativeText)) !== null) {
      const name = match[1];
      if (name && name.length >= 3 && name.length <= 20) {
        if (!['The', 'You', 'Your', 'This', 'That', 'Then', 'There', 'Here'].includes(name)) {
          names.add(name);
        }
      }
    }
  }

  const nameArray = Array.from(names);
  if (nameArray.length > 0) {
    return nameArray[nameArray.length - 1];
  }

  return state.currentNPC;
}

module.exports = {
  detectItemsInNarrative,
  detectCompanionChangesInNarrative,
  applyDetectedChanges,
  extractCurrentNPC
};
