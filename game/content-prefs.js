'use strict';

// =============================================================
// EMBER AND ASH — CONTENT PREFERENCES
// Six independent categories, each Off / Mild / Mature:
//   violence · horror · language · nudity · romance · sexual
//
// What the player *asks for* is stored as-is; what the game *uses*
// (the effective level) is computed server-side every time from:
//   - eligibility: sexual content, mature romance and any nudity need
//     the player's adult self-attestation AND a character aged 18+.
//     A self-attestation checkbox is not verified age assurance; we say
//     so in the UI and docs.
//   - capability: what the renderer / narrator can actually produce.
//     The built-in SVG renderer draws injuries, blood and dark imagery,
//     and implied intimacy (silhouettes, bare shoulders); it does not
//     draw explicit nudity or sexual acts.
//
// Preferences change presentation only. Game outcomes never depend on
// them: a wound is a wound whether or not it is described in detail.
// =============================================================

const CATEGORIES = ['violence', 'horror', 'language', 'nudity', 'romance', 'sexual'];
const LEVELS = ['off', 'mild', 'mature'];
const RANK = { off: 0, mild: 1, mature: 2 };

const LABELS = {
  violence: 'Violence & gore', horror: 'Horror & disturbing imagery', language: 'Profanity & adult language',
  nudity: 'Nudity in artwork', romance: 'Romance & intimacy', sexual: 'Sexual themes'
};

// The game is made for adults: everything starts at Mature. Adult-gated
// categories only take effect once the player declares they are an adult
// (and the character is 18+); anyone can turn any category down.
const DEFAULTS = { violence: 'mature', horror: 'mature', language: 'mature', nudity: 'mature', romance: 'mature', sexual: 'mature' };

// Categories that need an eligible adult, and the minimum level that does.
const ADULT_GATED = { nudity: 'mild', sexual: 'mild', romance: 'mature' };

// The most the built-in renderers can show for each category.
const RENDERER_CAPS = {
  art:     { violence: 'mature', horror: 'mature', language: 'mature', nudity: 'mature', romance: 'mature', sexual: 'mature' },
  offline: { violence: 'mature', horror: 'mature', language: 'mature', nudity: 'mature', romance: 'mature', sexual: 'mature' }
};

const CAPABILITY_NOTES = {
  nudity: 'At Mature the built-in artwork draws adult characters nude when the story has them undressed (in the game\'s simple illustrated style). Mild covers them to the waist; Off keeps them clothed.',
  sexual: 'At Mature, consensual sex between adults is narrated and drawn explicitly, in the pose the player describes. Coerced acts are always narrated as the crime they are and never drawn or described sexually. The AI narrator\'s provider may still decline; if it does, the game says so and its own narrator tells the scene.',
  romance: 'Romance needs a willing adult partner and earned rapport. "No" and "stop" always end a consensual scene.'
};

function clampLevel(v) { return LEVELS.includes(v) ? v : null; }

function ensurePrefs(state) {
  if (!state.contentPrefs || typeof state.contentPrefs !== 'object') {
    state.contentPrefs = { ...DEFAULTS };
    // Old saves: the single NSFW toggle maps onto romance + sexual themes.
    if (state.nsfwEnabled) { state.contentPrefs.romance = 'mature'; state.contentPrefs.sexual = 'mature'; }
  }
  for (const c of CATEGORIES) if (!clampLevel(state.contentPrefs[c])) state.contentPrefs[c] = DEFAULTS[c];
  return state.contentPrefs;
}

function characterAge(state) {
  const c = state.character || {};
  return Number(c.age || (state.creation && state.creation.age) || 0);
}

function eligibility(state) {
  const adultConfirmed = !!state.adultConfirmed;
  const age = characterAge(state);
  const characterAdult = age >= 18;
  return { adultConfirmed, characterAdult, eligible: adultConfirmed && characterAdult, age };
}

function minLevel(a, b) { return RANK[a] <= RANK[b] ? a : b; }

/**
 * Effective levels the game uses right now.
 * target: 'narration' (AI), 'offline', or 'art'.
 */
function effectivePrefs(state, target = 'narration') {
  const want = ensurePrefs(state);
  const el = eligibility(state);
  const out = {};
  for (const c of CATEGORIES) {
    let lvl = want[c];
    const gate = ADULT_GATED[c];
    if (gate && !el.eligible && RANK[lvl] >= RANK[gate]) lvl = gate === 'mature' ? 'mild' : 'off';
    // Sexual themes can never exceed romance (no sex without a relationship frame).
    if (c === 'sexual' && RANK[lvl] > RANK[out.romance || want.romance]) lvl = out.romance || want.romance;
    const cap = RENDERER_CAPS[target] && RENDERER_CAPS[target][c];
    if (cap) lvl = minLevel(lvl, cap);
    out[c] = lvl;
  }
  // Minors: no romance beyond mild friendship, no sexual themes, no nudity — ever.
  if (!el.characterAdult) { out.romance = 'off'; out.sexual = 'off'; out.nudity = 'off'; }
  return out;
}

/**
 * Applies a change request. Returns { prefs, effective, rejected[] }.
 * Requests beyond eligibility are stored (so they apply once eligible) but
 * reported as limited; invalid values are rejected.
 */
function updatePrefs(state, changes = {}) {
  const prefs = ensurePrefs(state);
  const rejected = [];
  for (const [k, v] of Object.entries(changes || {})) {
    if (!CATEGORIES.includes(k)) { rejected.push({ category: k, reason: 'unknown category' }); continue; }
    if (!clampLevel(v)) { rejected.push({ category: k, reason: 'level must be off, mild or mature' }); continue; }
    prefs[k] = v;
  }
  // Keep the legacy flag meaningful for older code paths.
  const eff = effectivePrefs(state);
  state.nsfwEnabled = eff.sexual === 'mature' || (eff.romance === 'mature' && eligibility(state).eligible);
  return { prefs: { ...prefs }, effective: eff, rejected };
}

function describe(state) {
  const eff = effectivePrefs(state, 'narration');
  const art = effectivePrefs(state, 'art');
  const el = eligibility(state);
  return {
    categories: CATEGORIES.map(c => ({
      key: c, label: LABELS[c], requested: ensurePrefs(state)[c], effective: eff[c], art: art[c],
      gated: !!ADULT_GATED[c], note: CAPABILITY_NOTES[c] || null,
      limited: eff[c] !== ensurePrefs(state)[c] ? (ADULT_GATED[c] && !el.eligible ? 'needs an adult player and an adult character' : 'limited by what the game can show') : null
    })),
    eligibility: { ...el, notice: 'Adult confirmation is a self-declaration, not verified age assurance.' }
  };
}

// ---------------------------------------------
// Narration directives (AI) — the engine's facts never change.
// ---------------------------------------------
const DIRECTIVES = {
  violence: {
    off: 'Violence: describe fights without blood or injury detail — outcomes are stated plainly (a blow lands, someone falls).',
    mild: 'Violence: restrained — impact, pain and blood may be mentioned briefly, no lingering gore.',
    mature: 'Violence: graphic is allowed — wounds, blood, broken bone and the ugliness of death may be described vividly when it serves the scene.'
  },
  horror: {
    off: 'Horror: keep the uncanny gentle; no disturbing body-horror or dread-heavy imagery.',
    mild: 'Horror: unsettling atmosphere is fine; keep disturbing imagery brief.',
    mature: 'Horror: disturbing imagery, body horror and existential dread are allowed when the setting calls for it.'
  },
  language: {
    off: 'Language: no profanity in narration or NPC dialogue.',
    mild: 'Language: mild oaths only (damn, hell, bloody).',
    mature: 'Language: NPCs may swear freely and speak like real adults, including strong profanity.'
  },
  nudity: {
    off: 'Nudity: do not describe nudity.',
    mild: 'Nudity: may be implied or mentioned non-sexually (bathing, undressing), without detail.',
    mature: 'Nudity: adult nudity is described plainly and fully whenever characters are undressed.'
  },
  romance: {
    off: 'Romance: no romantic or flirtatious content; keep relationships platonic.',
    mild: 'Romance: affection, attraction and kisses are fine; intimacy fades to black.',
    mature: 'Romance: adult romance and intimacy may be written with warmth and detail between consenting adults.'
  },
  sexual: {
    off: 'Sexual themes: none. Any intimate moment fades to black before it begins.',
    mild: 'Sexual themes: may be implied and sensual, never explicit; fade before explicit acts.',
    mature: 'Sexual themes: explicit sex between consenting adults (18+) is written fully and frankly — bodies, acts and sensation — following exactly what the player describes. It ends when either party stops.'
  }
};

function narrationDirective(state) {
  const eff = effectivePrefs(state, 'narration');
  const lines = ['[CONTENT PREFERENCES — the player chose these; follow them. They change description only, never what happened.]'];
  for (const c of CATEGORIES) lines.push(`[${DIRECTIVES[c][eff[c]]}]`);
  lines.push('[ABSOLUTE: never sexualise anyone under 18 or of unclear age. A coerced or forced act is narrated as the crime it is — that it happened, the threat, the victim\'s fear and pain, the aftermath — never with sexual detail. Every other act the player describes is narrated, however dark; nothing is refused.]');
  return lines.join('\n');
}

// ---------------------------------------------
// Consent & partners
// ---------------------------------------------
const COERCION = /\b(force|forced|forcing|against (?:her|his|their) will|rape|drug(?:ged)? (?:her|him|them)|non-?consensual|unconscious|asleep|coerce|blackmail (?:her|him|them) into|whether (?:she|he|they) want)/i;
const STOP = /\b(stop|no more|i stop|pull away|end (?:this|it)|not tonight|i decline)\b/i;

function isCoercive(text) { return COERCION.test(String(text || '')); }
function isStop(text) { return STOP.test(String(text || '')); }

// A role or name that marks someone as a child is never a romantic partner.
function isMinorNpc(npc) {
  if (!npc) return true;
  if (typeof npc.age === 'number' && npc.age < 18) return true;
  return /\b(child|kid|boy|girl|youth|urchin|scavenger child|orphan|apprentice child)\b/i.test(`${npc.role || ''} ${npc.name || ''}`);
}

// Account-level settings (players.settings JSON) → this character.
function applyAccountSettings(state, settings) {
  let s = settings;
  if (typeof s === 'string') { try { s = JSON.parse(s); } catch (e) { s = {}; } }
  if (!s || typeof s !== 'object') return state;
  if (s.contentPrefs && typeof s.contentPrefs === 'object') {
    ensurePrefs(state);
    for (const c of CATEGORIES) if (clampLevel(s.contentPrefs[c])) state.contentPrefs[c] = s.contentPrefs[c];
  }
  if (typeof s.adultConfirmed === 'boolean') state.adultConfirmed = s.adultConfirmed;
  updatePrefs(state, {});
  return state;
}

// Carries the player's choices to a new character (a new generation or world).
function inherit(fromState, toState) {
  if (!fromState) return toState;
  if (fromState.contentPrefs) toState.contentPrefs = { ...fromState.contentPrefs };
  if (typeof fromState.adultConfirmed === 'boolean') toState.adultConfirmed = fromState.adultConfirmed;
  return toState;
}

module.exports = {
  applyAccountSettings, inherit,
  CATEGORIES, LEVELS, LABELS, DEFAULTS, RANK, RENDERER_CAPS, CAPABILITY_NOTES,
  ensurePrefs, effectivePrefs, updatePrefs, eligibility, describe, narrationDirective,
  isCoercive, isStop, isMinorNpc
};
