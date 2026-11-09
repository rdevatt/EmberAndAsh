'use strict';

// =============================================================
// EMBER AND ASH — ROMANCE
// Relationships are earned and mutual. The engine checks every step:
//   - both people are adults (the character is 18+, the partner is not
//     a child, ever), and the player's preferences allow romance;
//   - the partner is someone you have actually met — a companion or a
//     named person here — and rapport/loyalty has been earned through
//     deeds, not words;
//   - willing partners may still say no, and their answer stands;
//   - a villain may instead use coercion or force — a crime handled by
//     game/infamy.js, with lasting consequences, never depicted sexually.
// What is *shown* depends on content preferences; what *happened*
// (a bond, a night's rest, loyalty) never does.
// =============================================================

const prefs = require('./content-prefs');
const chronicle = require('./chronicle');
const infamy = require('./infamy');
const { REGIONS } = require('./constants');

const FLIRT = /^(?:i\s+)?(?:flirt with|compliment|kiss|hold hands with|court|woo|romance)\s+(.+?)[.!?]*$/i;
const NIGHT = /^(?:i\s+)?(?:spend the night with|share a bed with|make love (?:to|with)|sleep with|go to bed with|take (.+?) to bed)\s*(.*?)[.!?]*$/i;
const END   = /^(?:i\s+)?(?:end things with|break up with|leave)\s+(.+?)[.!?]*$/i;

function rel(state, id) {
  if (!state.npcRelationships || typeof state.npcRelationships !== 'object') state.npcRelationships = {};
  if (!state.npcRelationships[id]) state.npcRelationships[id] = { rapport: 0, metBefore: false };
  return state.npcRelationships[id];
}

// Candidates: companions in the party, or named people in this region you have met.
function findPartner(state, text) {
  const t = String(text || '').toLowerCase().replace(/^(the|my)\s+/, '').trim();
  if (!t) return null;
  for (const c of state.companions || []) {
    const words = c.name.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !['the', 'sellsword', 'lieutenant', 'brother', 'sexton'].includes(w));
    if (words.some(w => t.includes(w))) return { id: c.rosterId || c.id, name: c.name, role: c.role, companion: c, age: c.age };
  }
  const r = REGIONS[state.character.region];
  const world = chronicle.worldOf(state);
  for (const npc of (r && r.npcs) || []) {
    const holder = world ? chronicle.currentHolder(world, npc) : npc;
    const words = holder.name.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !['the', 'old', 'lady', 'sir', 'brother'].includes(w));
    if (words.some(w => t.includes(w))) return { id: npc.id, name: holder.name, role: npc.role, npc: holder, age: holder.age };
  }
  return null;
}

function regard(state, partner) {
  if (partner.companion) return partner.companion.loyalty || 0;
  return rel(state, partner.id).rapport || 0;
}

function checkEligible(state, partner, input, { villainy = false } = {}) {
  const eff = prefs.effectivePrefs(state, 'narration');
  const el = prefs.eligibility(state);
  if (!el.characterAdult) return 'Romance is not part of this character\'s story.';
  if (!partner) return 'There is no one by that name here you know well enough.';
  // Absolute: children are never part of any of this, villain or not.
  if (prefs.isMinorNpc(partner.npc || partner)) return `${partner.name} is a child. That is not something that happens in this game.`;
  if (eff.romance === 'off') return 'Romance is switched off in your content settings (Settings → Mature Content).';
  if (villainy && !el.eligible) return 'That dark path needs an adult player (Settings → Mature Content → confirm you are 18+).';
  if (partner.npc && !rel(state, partner.id).metBefore) return `You have not met ${partner.name} properly. Talk to them first.`;
  if (!villainy && rel(state, partner.id).wronged) return `${partner.name} wants nothing to do with you. Not after what you did.`;
  return null;
}

/**
 * Handles romance commands. Returns null if not one, otherwise
 * { success, message, hours?, event?, hint? }.
 */
// The pose the player describes, for the artwork and the narrator. Only
// what the player says decides it.
const POSES = [
  ['oral', /\b(go(?:es)? down on|lick(?:s|ing)?|mouth (?:on|around)|oral|taste (?:him|her|them))\b/i],
  ['astride', /\b(on top|ride|rides|riding|straddle|straddles|straddling|astride|climb(?:s)? (?:onto|on top))\b/i],
  ['behind', /\b(from behind|behind (?:him|her|them)|bend(?:s)? (?:him|her|them) over|spoon(?:s|ing)?)\b/i],
  ['lying', /\b(make love|making love|fuck|fucks|fucking|have sex|having sex|inside (?:him|her|them)|lie (?:with|back|down)|lay (?:him|her|them) down|thrust|push(?:es)? into)\b/i],
  ['undress', /\b(undress(?:es|ing)?|strip(?:s|ping)?|take off (?:his|her|their|my) clothes|unlace|unbutton|disrobe)\b/i],
  ['embrace', /\b(hold(?:s)?|embrace(?:s)?|hug(?:s)?|cuddle(?:s)?|caress(?:es)?|touch(?:es)?|stroke(?:s)?|pull (?:him|her|them) close)\b/i],
  ['kiss', /\b(kiss(?:es|ing)?)\b/i]
];
function poseFrom(text, fallback = 'lying') {
  for (const [pose, re] of POSES) if (re.test(String(text || ''))) return pose;
  return fallback;
}
const INTIMATE_ACT = /\b(kiss|undress|strip|caress|touch|stroke|lick|ride|riding|straddle|on top|from behind|make love|fuck|have sex|thrust|go down on|moan|hold (?:him|her|them)|pull (?:him|her|them) close|embrace|cuddle|bite (?:his|her|their) (?:lip|neck)|whisper)\b/i;

function intimateHint(state, partner, style, pose) {
  return style === 'explicit'
    ? `[INTIMATE SCENE — ${partner} (an adult) and the player, both willing, now: ${pose}. The player's settings allow explicit sex: write it fully and frankly, following exactly what the player described and nothing they did not. Their words, if any, are theirs alone. If either says stop, it stops.]`
    : style === 'sensual'
      ? `[INTIMATE SCENE — ${partner} (an adult) and the player, both willing. Sensual, warm, not explicit.]`
      : `[INTIMATE SCENE — ${partner} and the player. Fade to black: a closed door, morning light.]`;
}

function styleFor(state) {
  const eff = prefs.effectivePrefs(state, 'narration');
  return eff.sexual === 'mature' ? 'explicit' : eff.sexual === 'mild' || eff.romance === 'mature' ? 'sensual' : 'fade';
}

function handle(state, input, helpers = {}) {
  const text = String(input || '').trim();
  // An intimate scene under way continues with whatever the player does next,
  // until either of them stops or the player turns to something else.
  if (state.intimate && !state.inCombat) {
    if (prefs.isStop(text)) {
      const who = state.intimate.name; state.intimate = null;
      return { success: true, message: `You stop. ${who} draws a breath, and the moment ends.`, event: { type: 'romance', stage: 'stopped', partner: who } };
    }
    if (INTIMATE_ACT.test(text) && !infamy.detectForce(text)) {
      const pose = poseFrom(text, state.intimate.pose || 'lying');
      if (pose !== 'kiss' && pose !== 'embrace') state.intimate.undressed = true;
      state.intimate.pose = pose;
      const style = styleFor(state);
      return { success: true, continued: true, message: '', event: { type: 'intimacy', partner: state.intimate.name, style, pose, undressed: !!state.intimate.undressed, continued: true }, hint: intimateHint(state, state.intimate.name, style, pose) };
    }
    state.intimate = null;                            // anything else: the scene is over
  }
  // Villainy: coercion or force. A crime with consequences, never shown.
  const forced = infamy.detectForce(text);
  const coerciveRomance = !forced && prefs.isCoercive(text) && (FLIRT.test(text) || NIGHT.test(text));
  if (forced || coerciveRomance) {
    if (state.inCombat) return { success: false, message: 'Not in the middle of a fight.' };
    const m = coerciveRomance ? (text.match(NIGHT) || text.match(FLIRT)) : null;
    const target = forced ? forced.target : (m[1] || m[2] || '');
    const partner = findPartner(state, target.replace(/\b(?:whether|against|into)\b.*$/i, ''));
    if (!partner && forced) return null;             // "take the keep by force" is a story action
    const reason = checkEligible(state, partner, text, { villainy: true });
    if (reason) return { success: false, message: reason, refused: true };
    const r = infamy.commitCoercion(state, partner, helpers);
    return { success: true, villainy: true, hours: 2, message: [r.message, ...r.consequences].join('\n'), hint: r.hint, event: { type: 'villainy', partner: partner.name, failed: r.failed, discovered: r.discovered } };
  }
  const end = text.match(END);
  if (end && state.partners) {
    const key = Object.keys(state.partners).find(k => state.partners[k].name.toLowerCase().includes(end[1].toLowerCase().split(' ')[0]));
    if (key) {
      const p = state.partners[key];
      delete state.partners[key];
      return { success: true, message: `You and ${p.name} part as lovers. What remains between you is yours to rebuild.`, event: { type: 'romance', stage: 'ended', partner: p.name } };
    }
  }
  const night = text.match(NIGHT);
  const flirt = !night && text.match(FLIRT);
  if (!night && !flirt) return null;
  if (state.inCombat) return { success: false, message: 'Not in the middle of a fight.' };
  const target = night ? (night[1] || night[2]) : flirt[1];
  const partner = findPartner(state, target);
  if (!partner) return null;                          // "compliment the stew" is a story action
  const reason = checkEligible(state, partner, text);
  if (reason) return { success: false, message: reason, refused: true };

  const world = chronicle.worldOf(state);
  const now = world ? chronicle.nowHour(world) : (state.actionCount || 0);
  const r = partner.companion ? null : rel(state, partner.id);
  const score = regard(state, partner);
  const cha = (state.stats && state.stats.cha) || 10;

  if (flirt) {
    // Warmth grows with real regard; a flirt counts at most once a day per person.
    const need = 20 - Math.max(0, cha - 10);
    if (score < need) return { success: false, refused: true, message: `${partner.name} smiles politely and changes the subject. (They don't know you well enough yet — earn their regard through deeds.)` };
    if (!state.romanceLast) state.romanceLast = {};
    const fresh = (now - (state.romanceLast[partner.id] || -1e9)) >= 24;
    if (fresh) { state.romanceLast[partner.id] = now; if (r) r.rapport = Math.min(100, r.rapport + 3); else partner.companion.loyalty = Math.min(100, partner.companion.loyalty + 2); }
    return {
      success: true,
      message: `${partner.name} returns the look.${fresh ? '' : ' (Nothing more comes of it today.)'}`,
      event: { type: 'romance', stage: 'flirt', partner: partner.name },
      hint: `[ROMANCE — a flirtation with ${partner.name}, ${partner.role}, who welcomes it. Keep it to this moment.]`
    };
  }

  // A night together: the partner must want it.
  const need = partner.companion ? 70 : 50;
  if (score < need) {
    return { success: false, refused: true, message: `${partner.name} gently says no. "Not yet." (They need to trust you more — ${score}/${need}.) Their answer is respected.` };
  }
  if (!state.partners) state.partners = {};
  const first = !state.partners[partner.id];
  state.partners[partner.id] = { name: partner.name, since: now };
  if (partner.companion) partner.companion.loyalty = Math.min(100, partner.companion.loyalty + (first ? 5 : 0));
  if (first && world) chronicle.addEvent(world, { type: 'bond', title: `${state.character.name} and ${partner.name} are bound to each other`, actor: chronicle.actorOf(state), region: state.character.region }, `bond:${state.characterId}:${partner.id}`);
  // A night of rest, in safety.
  state.hp = state.maxHp; state.stamina = state.maxStamina; state.mana = state.maxMana;
  const style = styleFor(state);
  const pose = poseFrom(text, 'lying');
  // The scene stays open: what happens next is the player's to describe.
  state.intimate = { id: partner.id, name: partner.name, pose, undressed: style !== 'fade' };
  return {
    success: true, hours: 10,
    message: `${partner.name} takes your hand.${first ? ' Something between you changes, and stays changed.' : ''} The night is yours; by morning you are rested.`,
    event: { type: 'intimacy', partner: partner.name, style, first, pose, undressed: style !== 'fade' },
    hint: intimateHint(state, partner.name, style, pose)
  };
}

module.exports = { handle, findPartner, checkEligible, poseFrom };
