'use strict';

// =============================================================
// ACTION GUARD — the narrator may not act for the player
//
// Each turn has four layers, kept apart:
//   1. submitted  — the player's own words;
//   2. accepted   — what the engine understood them to do;
//   3. outcome    — what the engine decided happened (authoritative);
//   4. narration  — prose describing 1–3 and the world's reaction.
//
// The narration is checked sentence by sentence. A sentence in which the
// player character ("you", "your hand", "your blade") performs an act is
// classified — movement, gesture, combat, drawing a weapon, casting,
// speech, commerce, crime, intimacy, decision — and must be licensed by
// the player's words or by the engine's outcome. Perception ("you see",
// "you hear") and things done TO the player ("you are thrown back", "you
// stagger" when the engine says they were hit) are the world, not choices,
// and pass. Words inside quotation marks belong to whoever is speaking
// and are never checked as the player's acts.
//
// Unlicensed sentences are removed. If too much would be removed, the
// caller regenerates once with the violations named, and falls back to the
// engine's own narration if the narrator still will not comply.
// No AI calls. No database calls. Pure logic.
// =============================================================

// Acts, by kind. Each pattern matches the verb as it follows "you".
const KINDS = {
  draw:     /^(draw|draws|drew|drawing|unsheathe|unsheath|pull out your (?:sword|blade|axe|dagger|knife|weapon)|ready your (?:sword|blade|bow|weapon)|brandish|nock)\b/,
  cast:     /^(cast|casts|casting|conjure|summon|invoke|channel|weave a spell|chant)\b/,
  combat:   /^(attack|attacks|strike|strikes|struck|swing|swings|swung|slash|slashes|stab|stabs|punch|punches|kick|kicks|lunge|lunges|hit|hits|smash|cleave|thrust|shoot|shoots|fire|fires|parry|parries|block|blocks|dodge|dodges|charge|charges|tackle|grapple|headbutt|bite|elbow|knee|shove|shoves|push|pushes|drive|drives|bring your|slam|slams)\b/,
  kill:     /^(kill|kills|killed|murder|murders|slay|slays|slew|finish (?:it|him|her|them) off|execute)\b/,
  speech:   /^(say|says|said|tell|tells|told|ask|asks|asked|reply|replies|replied|answer|answers|shout|shouts|whisper|whispers|call out|mutter|mutters|murmur|demand|demands|threaten|threatens|insult|insults|lie|lies|promise|promises|agree|agrees|refuse|refuses|offer|offers|accept|accepts|greet|greets|thank|thanks|apologi[sz]e|explain|explains|introduce|insist|insists|growl|growls|snap|snaps|laugh|laughs)\b/,
  commerce: /^(buy|buys|bought|pay|pays|paid|purchase|purchases|sell|sells|sold|haggle|haggles|toss (?:a|the|some)? ?coins?|hand over|slide (?:a|the|some)? ?coins?|count out)\b/,
  crime:    /^(steal|steals|stole|pocket|pockets|rob|robs|pick (?:his|her|their) pocket|break in|burn|set fire)\b/,
  intimacy: /^(kiss|kisses|kissed|embrace|embraces|caress|caresses|touch (?:her|his|their)|take (?:her|his|their) hand|hold (?:her|him|them)|pull (?:her|him|them) close|undress|strip)\b/,
  leave:    /^(leave|leaves|left|exit|exits|walk away|walks away|walk out|turn to leave|turn away|back away|backs away|retreat|retreats|run(?! your)|runs(?! your)|ran|flee|flees|fled|storm out|slip away|slip out|head out|head for the door|depart|departs|bolt|bolts)\b/,
  posture:  /^(sit|sits|sat|settle|settles|take a seat|kneel|kneels|lie down|lay down|lie back|climb|climbs|jump|jumps|ride|rides|mount|mounts|crouch|crouches)\b/,
  move:     /^(walk|walks|walked|step|steps|stepped|stride|strides|head|heads|enter|enters|cross|crosses|approach|approaches|follow|follows|make your way|move|moves|wander|wanders|sneak|sneaks)\b/,
  gesture:  /^(nod|nods|nodded|smile|smiles|smiled|grin|grins|shrug|shrugs|wink|winks|frown|frowns|sigh|sighs|wave|waves|point|points|clench|clenches|grip|grips|tighten|tightens|reach for|reach|reaches|rest your hand|lean|leans|cross your arms|turn|turns|raise your|lower your|tap|taps|crack your knuckles|spit|spits|roll your eyes|narrow your eyes|square your shoulders|straighten|straightens|stretch|stretches|wipe your|tip your|bow|bows)\b/,
  decide:   /^(decide|decides|decided|choose|chooses|resolve|resolves|consider|considers|realize|realise|realizes|wonder|wonders|plan|plans|think|thinks|feel a surge|feel (?:proud|ashamed|guilty|angry|afraid|sure))\b/
};
// Body parts and gear acting on their own count as the player acting.
const YOUR_PART = /\byour\s+(hand|hands|fist|fists|fingers|arm|arms|blade|sword|axe|dagger|knife|staff|bow|weapon|spear|mace|feet|foot|legs|knee|eyes|gaze|jaw|lips|mouth|voice|grip)\s+(?:\w+ly\s+)?(\w+(?:\s+\w+)?)/i;

// Which kinds the player's words license (verbs in the input, by kind).
const LICENSE = {
  draw: /\b(draw|unsheathe|ready|nock|pull out|brandish)\b/i,
  cast: /\b(cast|spell|conjure|summon|invoke|channel|chant|incantation|bolt|fireball|use)\b/i,
  combat: /\b(attack|strike|swing|slash|stab|punch|kick|lunge|hit|smash|cleave|thrust|shoot|fire|parry|block|dodge|defend|charge|tackle|grapple|fight|fight back|headbutt|bite|elbow|knee|shove|push|drive|slam|use|guard|raise my guard)\b/i,
  kill: /\b(kill|murder|slay|finish|execute|strangle|smother|poison|behead)\b/i,
  speech: /["“]|\b(say|tell|ask|asking|reply|answer|shout|whisper|call|mutter|demand|threaten|insult|lie|promise|agree|refuse|offer|accept|greet|thank|apologi[sz]e|explain|introduce|talk|speak|order|haggle|bargain|negotiate|plead|confess|beg|flirt|compliment|taunt|laugh)\b/i,
  commerce: /\b(buy|pay|purchase|sell|haggle|order|rent|hire|trade|barter|bribe|shop|coin)\b/i,
  crime: /\b(steal|pocket|rob|pickpocket|burn|set fire|break in|loot|kidnap|torture|murder|kill)\b/i,
  intimacy: /\b(kiss|embrace|caress|touch|hold|undress|strip|make love|spend the night|bed|climb on top|ride|lie with|night with|flirt)\b/i,
  leave: /\b(leave|exit|walk away|walk out|go away|back away|retreat|run|flee|escape|depart|head out|get out|slip away|storm out)\b/i,
  posture: /\b(sit|seat|settle|kneel|lie|lay|climb|jump|ride|mount|crouch|rest|sleep|camp|bed|on top|stool|chair|bench)\b/i,
  move: /\b(walk|step|go|head|enter|cross|approach|follow|travel|wander|sneak|move|return|come|visit|explore|search|to the|into the|toward|onto|climb|ride|sit)\b/i,
  gesture: /\b(nod|smile|grin|shrug|wink|frown|sigh|wave|point|clench|grip|lean|cross my arms|turn|raise|lower|tap|spit|stretch|reach|bow|wipe|tip my)\b/i,
  decide: /\b(decide|choose|think|consider|plan|wonder)\b/i
};

// Verbs that only describe the world reaching the player, never choices.
const PASSIVE = /^(look|looks|looked|glance|glances|glanced|scan|scans|peer|peers|survey|surveys|study|studies|watch|watches|run your (?:eye|eyes|gaze|fingers|hand)|are|were|is|was|feel|feels|felt|see|sees|saw|hear|hears|heard|smell|smells|taste|tastes|notice|notices|sense|senses|catch sight|spot|spots|find yourself|realise you are|stagger|staggers|reel|reels|stumble|stumbles|fall|falls|fell|wince|winces|gasp|gasps|bleed|bleeds|take|takes|took|suffer|suffers|wake|wakes|awake|have|has|had|can|could|cannot|can't|would|will|might|must|need|know|knows|recognise|recognize|remember|still|now|already|stand|stands|wait|waits|keep|keeps|hold your breath|breathe|land|lands|connect|connects|miss|misses|missed|manage|manages|try|tries|tried)\b/;

function sentencesOf(text) {
  // Split prose into sentences, keeping quotations intact.
  const out = [];
  let buf = '', inQuote = false;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    buf += ch;
    if (ch === '"' || ch === '“' || ch === '”') inQuote = ch === '“' ? true : ch === '”' ? false : !inQuote;
    if (!inQuote && /[.!?]/.test(ch) && (i + 1 >= s.length || /\s/.test(s[i + 1]))) { out.push(buf); buf = ''; }
    else if (!inQuote && ch === '\n' && s[i + 1] === '\n') { out.push(buf); buf = ''; }
  }
  if (buf.trim()) out.push(buf);
  return out;
}

function stripQuoted(s) { return String(s).replace(/"[^"]*"|“[^”]*”/g, ' '); }

// What the engine decided this turn: it can license acts the player
// described in general terms ("I fight back" → a blow was struck).
function outcomeLicenses(outcome = {}) {
  const lic = new Set();
  if (outcome.attacked) lic.add('combat');
  if (outcome.weaponDrawn) lic.add('draw');
  if (outcome.spellCast) lic.add('cast');
  if (outcome.killed) lic.add('kill');
  if (outcome.moved) lic.add('move');
  if (outcome.fled) lic.add('leave');
  if (outcome.spoke) lic.add('speech');
  if (outcome.bought) lic.add('commerce');
  if (outcome.crime) lic.add('crime');
  if (outcome.intimate) { lic.add('intimacy'); lic.add('move'); lic.add('posture'); }
  if (outcome.rested) lic.add('posture');
  return lic;
}

// The kinds of act a sentence attributes to the player (outside quotes).
function actsIn(sentence) {
  const bare = stripQuoted(sentence);
  const acts = [];
  const re = /\byou\s+(?:(?:quickly|slowly|carefully|finally|then|suddenly|gently|calmly|silently|quietly|instinctively|immediately|almost|just|also|simply|barely|still|now|again|already|never|don't|do not|can't|cannot)\s+)*([a-z']+(?:\s+[a-z']+){0,3})/gi;
  let m;
  while ((m = re.exec(bare))) {
    const phrase = m[1].toLowerCase();
    if (PASSIVE.test(phrase)) continue;
    for (const [kind, kre] of Object.entries(KINDS)) if (kre.test(phrase)) { acts.push({ kind, phrase: phrase.split(' ').slice(0, 3).join(' ') }); break; }
  }
  const p = bare.match(YOUR_PART);
  if (p) {
    const verb = p[2].toLowerCase();
    if (/^(tighten|tightens|clench|clenches|drift|drifts|move|moves|go|goes|find|finds|close|closes|curl|curls|reach|reaches|fall|falls|drop|drops|rise|rises|flick|flicks|dart|darts|narrow|narrows|grip|grips|twitch|twitches)\b/.test(verb)) acts.push({ kind: p[1].match(/blade|sword|axe|dagger|knife|staff|bow|weapon|spear|mace/i) ? 'draw' : 'gesture', phrase: `your ${p[1]} ${verb}` });
  }
  return acts;
}

/**
 * Checks narration against the player's words and the engine's outcome.
 * Returns { text, removed: [{sentence, kind, phrase}], ratio }.
 */
function guard(narration, input, outcome = {}) {
  const lic = outcomeLicenses(outcome);
  const words = String(input || '');
  for (const [kind, re] of Object.entries(LICENSE)) if (re.test(words)) lic.add(kind);
  // Drawing is never licensed by a general verb: the weapon must be in hand.
  if (!outcome.weaponDrawn && !LICENSE.draw.test(words)) lic.delete('draw');
  // Killing is decided by the engine, never by prose.
  if (outcome.combat && !outcome.killed) lic.delete('kill');
  const kept = [], removed = [];
  for (const s of sentencesOf(narration)) {
    const bad = actsIn(s).find(a => !lic.has(a.kind));
    if (bad) removed.push({ sentence: s.trim(), kind: bad.kind, phrase: bad.phrase });
    else kept.push(s);
  }
  const text = kept.join('').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const total = String(narration || '').length || 1;
  return { text, removed, ratio: 1 - text.length / total };
}

function correction(removed) {
  const list = removed.slice(0, 6).map(r => `"${r.sentence.slice(0, 120)}" (${r.kind})`).join('; ');
  return `[YOUR LAST DRAFT ACTED FOR THE PLAYER: ${list}. Rewrite it. Describe the player doing ONLY what they wrote; everything else must be the world, the people in it and the engine's outcome.]`;
}

// ---------------------------------------------
// Repetition across recent replies
// ---------------------------------------------
function shingles(text, n = 3) {
  const w = String(text || '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
  const out = new Set();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
}
function similarity(a, b) {
  const A = shingles(a), B = shingles(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / Math.min(A.size, B.size);
}

// Is this reply a rerun of a recent one? Also strips paragraphs repeated
// word for word from recent replies.
function repetition(reply, recent = []) {
  const paras = String(reply || '').split(/\n{2,}/);
  const seen = new Set();
  for (const r of recent) for (const p of String(r).split(/\n{2,}/)) if (p.trim().length > 60) seen.add(p.trim().toLowerCase());
  const fresh = paras.filter(p => !seen.has(p.trim().toLowerCase()));
  const maxSim = recent.reduce((m, r) => Math.max(m, similarity(reply, r)), 0);
  return { repeated: maxSim >= 0.6 || fresh.join('').trim().length < 0.35 * String(reply || '').trim().length, similarity: maxSim, text: fresh.join('\n\n').trim(), droppedParagraphs: paras.length - fresh.length };
}

module.exports = { guard, actsIn, correction, repetition, similarity, sentencesOf, KINDS, LICENSE };
