'use strict';

// =============================================================
// PLAYER AGENCY
// The player decides everything their character does and says. The
// narrator describes the world around those choices and never adds to
// them:
//   - Quoted speech is the character's dialogue, word for word: nothing
//     added before or after it, and no other lines.
//   - Speech described without quotes ("asking for a drink") may be voiced
//     as one short line that says exactly that and nothing more.
//   - No speech described means the character says nothing.
//   - A general action ("I fight back") leaves the manner to the narrator,
//     but only with what the player has in hand. Weapons stay sheathed
//     until the player draws or names one, and abilities are used only
//     when named. A class never decides what the character does.
// No AI calls. No database calls. Pure game logic.
// =============================================================

const QUOTE_RE = /"([^"]+)"|“([^”]+)”/g;

function quotesIn(text) {
  const out = [];
  let m;
  const re = new RegExp(QUOTE_RE.source, 'g');
  while ((m = re.exec(String(text || '')))) out.push((m[1] || m[2]).trim());
  return out.filter(Boolean);
}

function stripQuotes(text) { return String(text || '').replace(new RegExp(QUOTE_RE.source, 'g'), ' '); }

const SPEECH_VERB = /\b(ask(?:s|ed|ing)?|tell(?:s|ing)?|told|say(?:s|ing)?|said|shout(?:s|ed|ing)?|yell(?:s|ed|ing)?|call(?:s|ed|ing)? out|greet(?:s|ed|ing)?|thank(?:s|ed|ing)?|order(?:s|ed|ing)?|request(?:s|ed|ing)?|whisper(?:s|ed|ing)?|beg(?:s|ged|ging)?|demand(?:s|ed|ing)?|insult(?:s|ed|ing)?|threaten(?:s|ed|ing)?|apologi[sz](?:e|es|ed|ing)|introduce(?:s|d)? myself|introducing myself|offer(?:s|ed|ing)? to|reply|replies|replied|replying|answer(?:s|ed|ing)?)\b/i;

// What the player wants their character to say, if anything.
function extractSpeech(input) {
  const text = String(input || '');
  const quoted = quotesIn(text);
  if (quoted.length) return { quoted, described: null };
  const m = stripQuotes(text).match(SPEECH_VERB);
  if (!m) return { quoted: [], described: null };
  return { quoted: [], described: text.slice(m.index).trim().replace(/[.!]+$/, '') };
}

function capFirst(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function article(np) { return np.replace(/^(?:a|an|the|some|another|one more)\s+/i, m => m.toLowerCase()); }

// Voices described speech as one short line that says exactly what was
// described: "asking for a drink" becomes "A drink, please." When the
// request is too open to voice without inventing words, returns null and
// the speech is narrated indirectly instead.
function voiceDescribed(described) {
  const d = String(described || '').trim();
  if (!d) return null;
  let m;
  if ((m = d.match(/^(?:ask(?:s|ed|ing)?|order(?:s|ed|ing)?|request(?:s|ed|ing)?|beg(?:s|ged|ging)?)\s+(?:(?:the|a|an|my|him|her|them|it)\s+)?(?:[a-z'-]+\s+){0,2}?for\s+(.+)$/i)))
    return `${capFirst(article(m[1].trim()))}, please.`;
  if ((m = d.match(/^(?:order(?:s|ed|ing)?|request(?:s|ed|ing)?)\s+(.+)$/i))) return `${capFirst(article(m[1].trim()))}, please.`;
  if ((m = d.match(/^ask(?:s|ed|ing)?\s+(?:(?:the|a|an|my|him|her|them)\s+)?(?:[a-z'-]+\s+){0,2}?about\s+(.+)$/i))) return `What can you tell me about ${m[1].trim()}?`;
  if ((m = d.match(/^ask(?:s|ed|ing)?\s+(?:(?:the|a|an|my|him|her|them)\s+)?(?:[a-z'-]+\s+){0,2}?(?:if|whether)\s+(.+)$/i))) return `${capFirst(m[1].trim())}?`;
  if ((m = d.match(/^ask(?:s|ed|ing)?\s+(?:(?:the|a|an|my|him|her|them)\s+)?(?:[a-z'-]+\s+){0,2}?(who|what|where|when|why|how)\s+(.+)$/i))) return `${capFirst(m[1])} ${m[2].trim()}?`;
  if ((m = d.match(/^(?:tell(?:s|ing)?|told|say(?:s|ing)?|said|whisper(?:s|ed|ing)?|shout(?:s|ed|ing)?|yell(?:s|ed|ing)?|reply|replies|replied|replying|answer(?:s|ed|ing)?)\s+(?:(?:to\s+)?(?:the|a|an|my|him|her|them)\s+(?:[a-z'-]+\s+)?)?(?:that\s+)(.+)$/i))) return `${capFirst(m[1].trim())}.`;
  if (/^greet/i.test(d)) return 'Hello.';
  if (/^thank/i.test(d)) return 'Thank you.';
  if (/^apologi/i.test(d)) return 'I\'m sorry.';
  return null;
}

// "I walk to the bar, asking for a drink" → "You walk to the bar, asking for
// a drink." Quoted speech is left exactly as written.
const PRONOUNS = [
  [/\bI'm\b/g, 'you\'re'], [/\bI've\b/g, 'you\'ve'], [/\bI'll\b/g, 'you\'ll'], [/\bI'd\b/g, 'you\'d'],
  [/\bI am\b/g, 'you are'], [/\bI was\b/g, 'you were'], [/\bI\b/g, 'you'],
  [/\bmyself\b/gi, 'yourself'], [/\bmine\b/gi, 'yours'], [/\bmy\b/gi, 'your'], [/\bme\b/gi, 'you'],
  [/\bwe're\b/gi, 'you\'re'], [/\bours\b/gi, 'yours'], [/\bour\b/gi, 'your'], [/\bus\b/g, 'you']
];
function toSecondPerson(input) {
  const text = String(input || '').trim();
  const parts = text.split(/("[^"]*"|“[^”]*”)/);
  const out = parts.map(p => {
    if (/^["“]/.test(p)) return p;
    let s = p;
    for (const [re, rep] of PRONOUNS) s = s.replace(re, rep);
    return s;
  }).join('');
  let r = out.trim();
  if (!/^you\b/i.test(r) && !/^["“]/.test(r)) r = `You ${r.charAt(0).toLowerCase()}${r.slice(1)}`;
  r = capFirst(r);
  if (!/[.!?"”]$/.test(r)) r += '.';
  return r;
}

// The character's own line, ready for narration, or null.
function playerLine(input) {
  const sp = extractSpeech(input);
  if (sp.quoted.length) return { exact: true, lines: sp.quoted };
  if (sp.described) { const v = voiceDescribed(sp.described); return v ? { exact: false, lines: [v] } : null; }
  return null;
}

// ---------------------------------------------
// Weapons in hand
// ---------------------------------------------
const WEAPON_WORDS = /\b(sword|swords|blade|longsword|greatsword|shortsword|rapier|sabre|saber|scimitar|katana|axe|hatchet|mace|hammer|warhammer|maul|club|flail|dagger|daggers|knife|knives|stiletto|dirk|bow|longbow|shortbow|crossbow|arrows?|bolt from my crossbow|sling|staff|quarterstaff|wand|rod|spear|pike|javelin|halberd|pitchfork|polearm|tome|grimoire|spellbook|weapon|weapons|steel)\b/i;
const WEAPON_VERBS = /\b(slash(?:es|ed|ing)?|stab(?:s|bed|bing)?|cleave(?:s|d)?|cleaving|shoot(?:s|ing)?|shot|nock(?:s|ed|ing)?|loose an arrow|fire an arrow|impale(?:s|d)?|skewer(?:s|ed)?|behead(?:s|ed)?|unsheathe(?:s|d)?|draw(?:s|ing)? (?:my|a|the) (?:\w+ )?(?:blade|sword|steel|weapon|axe|dagger|knife|bow|staff|spear|mace|wand))\b/i;
const SHEATHE = /\b(sheathe?|sheath(?:e|es|ed|ing)?|put away my|holster|lower my weapon|stow my)\b/i;

// Did the player put a weapon in their hand with these words?
function weaponIntent(state, input) {
  const text = stripQuotes(input);
  const w = state && state.gear && state.gear.weapon;
  const own = w && w.name ? w.name.toLowerCase().split(/\s+/).filter(x => x.length > 3 && !/^(common|crude|simple|decent|quality|fine|superior|exceptional|masterwork|legendary|mythic|worn|rusty|old)$/.test(x)) : [];
  const namesOwn = own.some(x => new RegExp(`\\b${x.replace(/[^a-z]/g, '')}\\b`, 'i').test(text));
  if (SHEATHE.test(text) && !WEAPON_VERBS.test(text.replace(SHEATHE, ''))) return { sheathe: true, draw: false };
  return { sheathe: false, draw: !!w && (WEAPON_WORDS.test(text) || WEAPON_VERBS.test(text) || namesOwn) };
}

// Updates the drawn/sheathed state from the player's words. Returns true when
// the weapon is in hand for this action.
function updateWeaponInHand(state, input, ability) {
  const intent = weaponIntent(state, input);
  if (intent.sheathe) { state.weaponDrawn = false; return false; }
  if (intent.draw || (ability && ability.kind === 'weapon')) state.weaponDrawn = true;
  return !!state.weaponDrawn && !!(state.gear && state.gear.weapon);
}

// ---------------------------------------------
// Enforcing the player's voice in AI narration
// ---------------------------------------------
const SAY = '(?:say|says|said|ask|asks|asked|call|calls|called|shout|shouts|shouted|reply|replies|replied|whisper|whispers|whispered|mutter|mutters|muttered|tell|tells|told|add|adds|added|answer|answers|answered|growl|growls|growled|yell|yells|yelled|murmur|murmurs|murmured|declare|declares|declared|demand|demands|demanded|offer|offers|offered|venture|ventures|ventured|snap|snaps|snapped|begin|begins|began|manage|manages|managed|grunt|grunts|grunted)';
const SAY_AFTER  = new RegExp(`^,?\\s*you\\s+(?:\\w+ly\\s+)?${SAY}\\b[^.!?"“]*[.!?]?`, 'i');
const SAY_BEFORE = new RegExp(`\\byou\\s+(?:\\w+ly\\s+)?${SAY}\\b[^"“.!?]*$`, 'i');
const sentenceCount = q => q.split(/[.!?]+/).filter(x => x.trim()).length;

// Finds each quoted line and decides whose it is from its own clause:
// "you say, '…'" or "'…' you say." mark the player's lines; anything else
// (an NPC's line, even one that mentions you) is left alone.
function playerQuotes(text) {
  const quotes = [];
  const re = /"([^"]*)"|“([^”]*)”/g;
  let m;
  while ((m = re.exec(text))) quotes.push({ start: m.index, end: m.index + m[0].length, content: m[1] !== undefined ? m[1] : m[2] });
  const out = [];
  quotes.forEach((q, i) => {
    const prevEnd = i ? quotes[i - 1].end : 0;
    const before = text.slice(prevEnd, q.start);
    const cut = Math.max(before.lastIndexOf('. '), before.lastIndexOf('! '), before.lastIndexOf('? '));
    const clause = before.slice(cut + 1);
    const nextStart = i < quotes.length - 1 ? quotes[i + 1].start : text.length;
    const after = text.slice(q.end, nextStart);
    const bm = clause.match(SAY_BEFORE);
    const am = after.match(SAY_AFTER);
    // "…," you add, "…" — the attribution introduces the next quote, not this one.
    const introducesNext = am && i < quotes.length - 1 && after.slice(am[0].length).trim() === '' && /[,:]\s*$/.test(am[0]);
    if (bm) out.push({ ...q, cutStart: prevEnd + cut + 1 + bm.index, cutEnd: q.end });
    else if (am && !introducesNext) out.push({ ...q, cutStart: q.start, cutEnd: q.end + am[0].length });
  });
  return out;
}

// Makes the narration's lines for the player match what the player gave:
// exact quotes replaced verbatim, extra or invented lines removed.
function enforcePlayerVoice(narrative, input) {
  let text = String(narrative || '');
  const given = playerLine(input);
  const allowed = given ? given.lines.slice() : [];
  const exact = !!(given && given.exact);
  const edits = [];
  let used = 0;
  for (const q of playerQuotes(text)) {
    if (used < allowed.length) {
      const line = allowed[used++];
      // Exact speech is always the player's words. A voiced described line may
      // keep the narrator's phrasing only if it is one short sentence.
      if (exact || sentenceCount(q.content) > 1 || q.content.length > 120) edits.push({ start: q.start + 1, end: q.end - 1, rep: line });
    } else {
      edits.push({ start: q.cutStart, end: q.cutEnd, rep: '' });
    }
  }
  for (const e of edits.sort((a, b) => b.start - a.start)) text = text.slice(0, e.start) + e.rep + text.slice(e.end);
  // Exact speech the model reworded slightly (capitals, punctuation) is put
  // back word for word where it stands; speech it left out entirely is added.
  if (exact) {
    const norm = x => x.toLowerCase().replace(/[^a-z0-9' ]+/g, '').replace(/\s+/g, ' ').trim();
    for (const q of allowed) {
      if (text.includes(q)) continue;
      const re = /"([^"]*)"|“([^”]*)”/g;
      let m, fixed = false;
      while ((m = re.exec(text))) {
        const inner = m[1] !== undefined ? m[1] : m[2];
        if (norm(inner) === norm(q)) { text = text.slice(0, m.index) + `"${q}"` + text.slice(m.index + m[0].length); fixed = true; break; }
      }
      if (!fixed) text = `"${q}" ${text}`.trim();
    }
  }
  return text.replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,!?])/g, '$1').replace(/^[\s,.]+/, '').trim();
}

// Clothing is the player's to change too: "I undress", "I get dressed".
const UNDRESS = /\b(undress(?:es|ing)?|strip(?:s|ping)?(?: naked| off)?|take off (?:all )?my clothes|get(?:ting)? naked|disrob(?:e|es|ing)|shed my clothes|bathe|bathing|skinny[- ]dip)\b/i;
const DRESS = /\b(get(?:ting)? dressed|put (?:my )?clothes (?:back )?on|put on my clothes|dress myself|put my (?:armou?r|clothes) (?:back )?on|pull on my|don my)\b/i;
function updateDress(state, input) {
  const t = stripQuotes(input);
  if (DRESS.test(t)) { state.undressed = false; return 'dressed'; }
  if (UNDRESS.test(t)) { state.undressed = true; return 'undressed'; }
  return null;
}

const PROMPT_RULES = `PLAYER AGENCY — ABSOLUTE:
- The player alone decides what their character does and says. You narrate the world around those choices and never add to them.
- You MAY narrate the player's stated action, in the second person ("You walk to the bar…").
- SPEECH, quoted: if the player's input contains quoted words, those are the character's ONLY words this turn. Use them verbatim. Add nothing before or after them, and write no other dialogue for the character.
- SPEECH, described: if the player describes speaking without quotes (e.g. "asking for a drink"), you may voice it as ONE short line that says exactly that (e.g. "A drink, please."), nothing more.
- SPEECH, none: if the player describes no speech, the character says nothing.
- MANNER: for a general action ("I fight back"), you choose the manner, but only with what is in hand. If the facts say the character is unarmed, they fight with fists, feet, elbows and teeth. Never draw a weapon, cast a spell or use an ability the player did not name; the engine facts list exactly what was used.
- The character's class or profession never decides what they do. Never write their thoughts, feelings or next decision.`;

module.exports = {
  extractSpeech, voiceDescribed, toSecondPerson, playerLine, quotesIn,
  weaponIntent, updateWeaponInHand, enforcePlayerVoice, updateDress, PROMPT_RULES
};
