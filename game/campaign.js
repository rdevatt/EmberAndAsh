'use strict';

// =============================================================
// EMBER AND ASH — MAIN CAMPAIGN ENGINE
// Tracks chapter/step progress, story NPC conversations, boss
// encounters, choices and their consequences, the ending, and the
// postgame. The engine — never narration — decides when a step is
// complete and what it rewards. Every reward is granted exactly once.
// No AI calls. No database calls. Pure game logic.
// =============================================================

const { REGIONS } = require('./constants');
const { STORY_NPCS, BOSSES, CHAPTERS, ENDINGS } = require('./constants/data/world/campaign');
const { getPlayerLevel, grantXP, recalculateResources } = require('./character');
const { addCoin, addItem, formatCoin } = require('./economy');
const { changeStanding, formatStandingChanges, getStanding } = require('./factions');
const { npcMatches } = require('./world');
const chronicle = require('./chronicle');

const CONFRONT_PATTERN = /^(?:i\s+)?(?:confront|challenge|face|fight|attack|hunt|duel|engage|seek out|go after)\s+(?:the\s+)?(.+?)[.!?]*$/i;
const CHOICE_PATTERN   = /^(?:i\s+)?(?:choose|choice|pick|select|decide|option)\s*(?:option\s*)?#?(\d)\b/i;
const STORY_PATTERN    = /^(?:story|main quest|main story|campaign|story journal|chapter|objective|what now|what next)[.!?]*$/i;

// ---------------------------------------------
// State
// ---------------------------------------------
function ensureCampaign(state) {
  if (!state.character || !state.character.region) return null;
  const world = chronicle.worldOf(state);
  if ((!state.campaign || typeof state.campaign !== 'object') && world && world.ending) {
    // Born into a world whose great story is already history: the
    // Sovereign's tale is not replayed. This character's story is their own.
    state.campaign = {
      chapter: null, step: 0, startRegion: state.character.region, inherited: true,
      flags: {}, choices: {}, completed: [], bossesDefeated: [], unlocked: ['shattered_throne'],
      ending: world.ending, postgame: true, riftDepth: 0, started: state.actionCount || 0
    };
  }
  if (!state.campaign || typeof state.campaign !== 'object') {
    state.campaign = {
      chapter: 1, step: 0,
      startRegion: state.character.region,
      flags: {}, choices: {}, completed: [], bossesDefeated: [], unlocked: [],
      ending: null, postgame: false, riftDepth: 0, started: state.actionCount || 0
    };
    onChapterStart(state);
  }
  const c = state.campaign;
  for (const k of ['flags', 'choices']) if (!c[k] || typeof c[k] !== 'object') c[k] = {};
  for (const k of ['completed', 'bossesDefeated', 'unlocked']) if (!Array.isArray(c[k])) c[k] = [];
  return c;
}

function getChapter(state) {
  const c = ensureCampaign(state);
  if (!c || c.ending) return null;
  return CHAPTERS.find(ch => ch.id === c.chapter) || null;
}

function getCurrentStep(state) {
  const ch = getChapter(state);
  if (!ch) return null;
  const step = ch.steps[state.campaign.step];
  return step ? { chapter: ch, step, index: state.campaign.step } : null;
}

function stepRegion(state, step) {
  if (!step || !step.region) return null;
  return step.region === 'start' ? state.campaign.startRegion : step.region;
}

// Story NPCs (Maren) or a region's named NPC, by id.
function getNpc(id) {
  if (STORY_NPCS[id]) return { id, ...STORY_NPCS[id] };
  for (const r of Object.values(REGIONS)) {
    const n = (r.npcs || []).find(x => x.id === id);
    if (n) return n;
  }
  return null;
}

function isChapterUnlocked(state, chapter) {
  return getPlayerLevel(state.totalXP || 0) >= (chapter.minLevel || 1);
}

// When a chapter begins, its destinations are added to the map.
function onChapterStart(state) {
  const ch = CHAPTERS.find(x => x.id === state.campaign.chapter);
  if (!ch) return;
  if (!Array.isArray(state.knownRegions)) state.knownRegions = [];
  for (const s of ch.steps) {
    const r = stepRegion(state, s);
    if (r && REGIONS[r] && !state.knownRegions.includes(r) && !(ch.unlocks || []).includes(r) && r !== 'shattered_throne') state.knownRegions.push(r);
  }
}

function isRegionStoryLocked(state, regionKey) {
  const lockedBy = CHAPTERS.find(ch => (ch.unlocks || []).includes(regionKey));
  if (!lockedBy) return false;
  const c = state.campaign;
  return !(c && Array.isArray(c.unlocked) && c.unlocked.includes(regionKey));
}

// ---------------------------------------------
// Journal
// ---------------------------------------------
function describeObjective(state, step) {
  const region = stepRegion(state, step);
  const where = region && REGIONS[region] ? ` — ${REGIONS[region].label}` : '';
  return `${step.objective}${where}`;
}

function buildStoryText(state) {
  const c = ensureCampaign(state);
  if (!c) return 'Your story has not begun.';
  const lines = ['MAIN STORY — EMBER AND ASH', ''];
  for (const id of c.completed) {
    const ch = CHAPTERS.find(x => x.id === id);
    if (ch) lines.push(`  ✓ Chapter ${ch.id}: ${ch.title}${c.choices[ch.id] ? ` — you chose: ${c.choices[ch.id]}` : ''}`);
  }
  if (c.ending) {
    const e = ENDINGS[c.ending];
    lines.push('', `ENDING: ${e.title}`, e.epilogue, '', 'POSTGAME: the world goes on. Bounties continue everywhere; at the Shattered Throne you can "enter the rift" to face ever-stronger echoes.', `Deepest rift reached: ${c.riftDepth || 0}.`);
    return lines.join('\n');
  }
  const cur = getCurrentStep(state);
  if (!cur) return lines.join('\n');
  const { chapter, step, index } = cur;
  lines.push('', `Chapter ${chapter.id}: ${chapter.title}  (Tier ${chapter.tier})`, chapter.intro, '');
  if (!isChapterUnlocked(state, chapter)) {
    lines.push(`  ✕ You are not ready. Reach level ${chapter.minLevel} to begin this chapter (bounties, exploration and the wilds will get you there).`);
  } else {
    chapter.steps.forEach((s, i) => {
      const mark = i < index ? '✓' : i === index ? '►' : '·';
      lines.push(`  ${mark} ${i <= index ? describeObjective(state, s) : '???'}`);
    });
    if (step.type === 'choice') {
      lines.push('', step.prompt);
      lines.push(...formatChoiceOptions(state, step));
    }
  }
  return lines.join('\n');
}

function optionAvailable(state, opt) {
  const req = opt.requires;
  if (!req) return true;
  const f = state.campaign.flags;
  if (req.notFlag && f[req.notFlag]) return false;
  if (req.anyFlag && !req.anyFlag.some(k => f[k])) return false;
  return true;
}

function formatChoiceOptions(state, step) {
  return step.options.map((o, i) => `  ${i + 1}. ${o.label}${optionAvailable(state, o) ? '' : ' (closed to you by earlier choices)'}`)
    .concat(['', 'Type "choose 1", "choose 2", ...']);
}

function buildStoryPanel(state) {
  const c = ensureCampaign(state);
  if (!c) return null;
  if (c.ending) return { ended: true, ending: ENDINGS[c.ending].title, postgame: true, riftDepth: c.riftDepth || 0, completed: c.completed.length };
  const cur = getCurrentStep(state);
  if (!cur) return null;
  const locked = !isChapterUnlocked(state, cur.chapter);
  return {
    chapter: cur.chapter.id,
    title: cur.chapter.title,
    tier: cur.chapter.tier,
    objective: locked ? `Reach level ${cur.chapter.minLevel} to begin` : describeObjective(state, cur.step),
    locked,
    minLevel: cur.chapter.minLevel,
    stepType: cur.step.type,
    options: cur.step.type === 'choice' && !locked ? cur.step.options.map((o, i) => ({ n: i + 1, label: o.label, available: optionAvailable(state, o) })) : null,
    completed: c.completed.length
  };
}

// ---------------------------------------------
// Step progression
// ---------------------------------------------
// Completes the current step and advances. Returns messages/rewards.
function completeStep(state, extraText) {
  const out = { messages: extraText ? [extraText] : [], levelUps: [], chapterComplete: null };
  const cur = getCurrentStep(state);
  if (!cur) return out;
  state.campaign.step++;
  if (state.campaign.step >= cur.chapter.steps.length) {
    finishChapter(state, cur.chapter, out);
  } else {
    autoResolve(state, out);
    const next = getCurrentStep(state);
    if (next && next.chapter.id === cur.chapter.id) out.messages.push(`Next: ${describeObjective(state, next.step)}.`);
  }
  return out;
}

function finishChapter(state, chapter, out) {
  const c = state.campaign;
  if (c.completed.includes(chapter.id)) return;   // never twice
  c.completed.push(chapter.id);
  const rw = chapter.reward || {};
  const lines = [`CHAPTER ${chapter.id} COMPLETE — ${chapter.title}`];
  if (rw.xp) { const lu = grantXP(state, rw.xp); if (lu) out.levelUps.push(lu); }
  if (rw.coin) addCoin(state, rw.coin);
  lines.push(`Reward: +${rw.xp || 0} XP, ${formatCoin(rw.coin || 0)}.`);
  for (const r of chapter.unlocks || []) if (!c.unlocked.includes(r)) { c.unlocked.push(r); lines.push(`The way to ${REGIONS[r].label} is open.`); }
  if (chapter.outro) lines.push('', chapter.outro);
  out.chapterComplete = chapter.id;
  chronicle.addEvent(chronicle.worldOf(state), { type: 'chapter', importance: 2, title: `${state.character.name} completes "${chapter.title}"`, actor: chronicle.actorOf(state) }, `chapter:${state.characterId}:${chapter.id}`);

  const next = CHAPTERS.find(x => x.id === chapter.id + 1);
  if (next && !c.ending) {
    c.chapter = next.id;
    c.step = 0;
    onChapterStart(state);
    lines.push('', `Chapter ${next.id}: ${next.title} — ${next.intro}`,
      isChapterUnlocked(state, next) ? `Objective: ${describeObjective(state, next.steps[0])}.` : `(Reach level ${next.minLevel} to begin.)`);
    autoResolve(state, out);
  }
  out.messages.push(lines.join('\n'));
}

// Steps that resolve themselves: travel to where you already are, fates.
function autoResolve(state, out) {
  for (let guard = 0; guard < 5; guard++) {
    const cur = getCurrentStep(state);
    if (!cur || !isChapterUnlocked(state, cur.chapter)) return;
    const { step } = cur;
    if (step.type === 'travel' && state.character.region === stepRegion(state, step)) {
      const r = completeStep(state); merge(out, r); return;
    }
    if (step.type === 'fate') {
      const text = resolveFate(state, step.fate);
      const r = completeStep(state, text); merge(out, r); return;
    }
    return;
  }
}

function merge(out, r) {
  out.messages.push(...r.messages);
  out.levelUps.push(...r.levelUps);
  if (r.chapterComplete) out.chapterComplete = r.chapterComplete;
}

// Maren's fate rests on how the player has treated the Wardens.
function resolveFate(state, who) {
  if (who !== 'maren') return '';
  const f = state.campaign.flags;
  const withYou = (state.companions || []).find(c => c.rosterId === 'maren');
  if (withYou || getStanding(state, 'wardens') >= 30) {
    f.marenSurvived = true;
    if (!Array.isArray(state.storyCompanionsAvailable)) state.storyCompanionsAvailable = [];
    if (!state.storyCompanionsAvailable.includes('maren')) state.storyCompanionsAvailable.push('maren');
    return 'In the breach of the Gate, a Choir lance takes Maren in the side — the same wound as the day you met. This time you are there. You drag her clear. "You keep doing that," she says, and laughs, and coughs blood, and lives. She will fight beside you if you ask her ("recruit Maren").';
  }
  f.marenDied = true;
  return 'In the breach of the Gate, a Choir lance takes Maren in the side. The Wardens who might have reached her are too few — too few trusted you enough to follow you in. She dies on the iron, still holding her bow. Her flame-badge is yours now.';
}

// ---------------------------------------------
// Event hooks (called by the gameplay route)
// ---------------------------------------------
function onEvent(state, event) {
  const out = { messages: [], levelUps: [], chapterComplete: null };
  const cur = getCurrentStep(state);
  if (!cur || !isChapterUnlocked(state, cur.chapter)) return out;
  const { step } = cur;
  if (event.type === 'arrived' && step.type === 'travel' && event.region === stepRegion(state, step)) {
    merge(out, completeStep(state, `You have reached ${REGIONS[event.region].label}.`));
  }
  if (event.type === 'landmark' && step.type === 'explore' && event.region === stepRegion(state, step) && event.id === step.landmark) {
    merge(out, completeStep(state));
  }
  if (event.type === 'bossDefeated' && step.type === 'boss' && event.boss === step.boss) {
    if (!state.campaign.bossesDefeated.includes(event.boss)) state.campaign.bossesDefeated.push(event.boss);
    chronicle.addEvent(chronicle.worldOf(state), { type: 'victory', importance: 3, title: `${state.character.name} defeats ${BOSSES[event.boss].label}`, region: state.character.region, actor: chronicle.actorOf(state) }, `boss:${state.characterId}:${event.boss}`);
    merge(out, completeStep(state, `${BOSSES[event.boss].label} is defeated.`));
  }
  return out;
}

// "talk to <name>": story conversations. Returns null if not a story beat.
function handleTalk(state, target) {
  const cur = getCurrentStep(state);
  if (!cur || cur.step.type !== 'talk') return null;
  const npc = getNpc(cur.step.npc);
  if (!npc || !npcMatches(npc, target)) return null;
  const region = stepRegion(state, cur.step);
  if (state.character.region !== region) {
    return { notHere: true, npc, message: `${npc.name} is not here. You will find them in ${REGIONS[region].label}.` };
  }
  if (!isChapterUnlocked(state, cur.chapter)) {
    return { notReady: true, npc, message: `${npc.name} looks you over. "Not yet. Come back when you are stronger." (Reach level ${cur.chapter.minLevel}.)` };
  }
  const result = completeStep(state, `${npc.name}: ${cur.step.text}`);
  return { npc, ...result };
}

// Is the player trying to start the current story boss fight?
function detectConfront(state, input) {
  const m = String(input || '').trim().match(CONFRONT_PATTERN);
  if (!m) return null;
  const cur = getCurrentStep(state);
  if (!cur || cur.step.type !== 'boss') return null;
  const boss = BOSSES[cur.step.boss];
  const target = m[1].toLowerCase();
  const words = boss.label.toLowerCase().replace(/[,']/g, ' ').split(/[\s-]+/).filter(w => w.length >= 3 && w !== 'the');
  const named = words.some(w => target.includes(w)) || target.includes(boss.label.toLowerCase().split(',')[0]);
  if (!named) return null;
  return { chapter: cur.chapter, step: cur.step, boss, bossKey: cur.step.boss };
}

// Builds the live boss enemy, or explains why not.
function startBoss(state, confront) {
  const region = stepRegion(state, confront.step);
  if (state.character.region !== region) return { success: false, message: `${confront.boss.label} is not here. Seek it in ${REGIONS[region].label}.` };
  if (!isChapterUnlocked(state, confront.chapter)) return { success: false, message: `You are not ready for this. Reach level ${confront.chapter.minLevel}.` };
  return { success: true, enemy: buildBossEnemy(confront.bossKey) };
}

function buildBossEnemy(bossKey, levelOverride = null, labelOverride = null) {
  const b = BOSSES[bossKey];
  const level = levelOverride || b.level;
  const effectiveStr = 5 + (b.mods.str || 0) + Math.floor(level * 0.5);
  const effectiveDex = 5 + (b.mods.dex || 0) + Math.floor(level * 0.3);
  const effectiveVit = 5 + (b.mods.vit || 0) + Math.floor(level * 0.4);
  const baseHP = Math.round(45 * 0.6 + effectiveVit * 3 + level * 2 + level * 1.5);
  const maxHP = Math.round(baseHP * (b.hpMult || 3) * 0.6);
  return {
    key: `boss__${bossKey}`,
    label: labelOverride || b.label,
    level,
    behavior: b.behavior,
    desc: b.desc,
    xpMod: 6,
    currentHP: maxHP,
    maxHP,
    effectiveStr,
    effectiveDex,
    effectiveVit,
    isRare: true,
    isBoss: true,
    caster: !!b.caster,
    special: b.special || null,
    phases: (b.phases || []).map(p => ({ ...p, done: false })),
    meta: { boss: bossKey }
  };
}

// ---------------------------------------------
// Choices
// ---------------------------------------------
function detectChoice(input) {
  const m = String(input || '').trim().match(CHOICE_PATTERN);
  return m ? parseInt(m[1], 10) : null;
}

function makeChoice(state, n) {
  const cur = getCurrentStep(state);
  if (!cur || cur.step.type !== 'choice') return { success: false, message: 'There is no decision before you right now. Type "story" to see your objective.' };
  if (!isChapterUnlocked(state, cur.chapter)) return { success: false, message: 'You are not ready for this chapter yet.' };
  const opt = cur.step.options[n - 1];
  if (!opt) return { success: false, message: `Choose between 1 and ${cur.step.options.length}.` };
  if (!optionAvailable(state, opt)) return { success: false, message: 'That path was closed by choices you made earlier.' };

  const c = state.campaign;
  const lines = [opt.text];
  const changes = changeStanding(state, opt.factions || {}, `chapter ${cur.chapter.id}`);
  Object.assign(c.flags, opt.flags || {});
  c.choices[cur.chapter.id] = opt.label;
  if (opt.coin) { addCoin(state, opt.coin); lines.push(`+${formatCoin(opt.coin)}`); }
  if (opt.item) { addItem(state, { ...opt.item }); lines.push(`Received: ${opt.item.name}`); }
  if (opt.gear) { addItem(state, { name: opt.gear.name, tier: opt.gear.tier, statMods: opt.gear.statMods, type: opt.gear.slot, unique: true }); lines.push(`Received: ${opt.gear.name} — "equip ${opt.gear.name}"`); }
  if (opt.spell) {
    if (!Array.isArray(state.spells)) state.spells = [];
    if (!state.spells.some(s => s && s.id === opt.spell.id)) state.spells.push({ ...opt.spell });
    lines.push(`Spell learned: ${opt.spell.label} (${opt.spell.manaCost} mana) — "cast ${opt.spell.label}"`);
  }
  if (opt.weaponBonus) { state.bonusWeaponDamage = (state.bonusWeaponDamage || 0) + opt.weaponBonus; lines.push(`Your strikes carry +${opt.weaponBonus} damage, permanently.`); }
  if (opt.statBonus) {
    for (const [k, v] of Object.entries(opt.statBonus)) state.stats[k] = (state.stats[k] || 0) + v;
    recalculateResources(state);
    lines.push(`Permanent: ${Object.entries(opt.statBonus).map(([k, v]) => `${k.toUpperCase()} +${v}`).join(', ')}`);
  }
  const standing = formatStandingChanges(changes);
  if (standing) lines.push(`Standing: ${standing}`);

  chronicle.addEvent(chronicle.worldOf(state), { type: 'decision', importance: cur.step.final ? 5 : 2, title: `${state.character.name} chooses: ${opt.label}`, text: `Chapter ${cur.chapter.id}, "${cur.chapter.title}".`, actor: chronicle.actorOf(state) }, `choice:${state.characterId}:${cur.chapter.id}`);
  if (cur.step.final) c.ending = opt.id;
  const result = completeStep(state, lines.join('\n'));
  if (cur.step.final) {
    c.postgame = true;
    c.ending = opt.id;
    const e = ENDINGS[opt.id];
    result.messages.push(`\n═══ THE END — ${e.title} ═══\n${e.epilogue}\n\n${epilogueFor(state)}\n\nThe game continues: bounties remain across the world, and at the Shattered Throne you may "enter the rift" to face echoes of everything you defeated.`);
    result.ending = opt.id;
    const w = chronicle.worldOf(state);
    if (w) {
      const era = chronicle.applyEnding(w, state, opt.id);
      if (era) result.messages.push(`\n═══ A NEW AGE: ${era.name} ═══\n${era.threat}\n\nWhat now?\n  • "continue" — go on as ${state.character.name}, with everything you have won.\n  • "new character in this world" — begin someone new, years from now, in the world you changed.\n  • "new world" — start a fresh world. This one is kept, and you can return to it.`);
      c.afterEnding = 'pending';
    }
  }
  return { success: true, choice: opt, ...result };
}

// Closing notes that reflect what the player did along the way.
function epilogueFor(state) {
  const f = state.campaign.flags;
  const notes = [];
  if (f.marenSurvived) notes.push('Maren Holt lives to an old age and tells your story badly, on purpose, so people will ask her to tell it again.');
  if (f.marenDied) notes.push('Maren Holt\'s flame-badge hangs over the Warden hearth in Oakhaven.');
  if (f.soulsFreed) notes.push('Ruinwatch is resettled by the grandchildren of the people you freed.');
  if (f.soulsBound) notes.push('Your weapon still whispers sometimes, in the voices of a city.');
  if (f.cantorSpared) notes.push('Severin is never seen again. Some say he sings in the Core Wastes still, alone.');
  if (f.ulricOath) notes.push('On Greymere Moors, a crowned shade walks the barrows, keeping an oath to you.');
  if (f.towerRelit) notes.push('The Ember Coast towers burn on, tended by the Remnant.');
  if (getStanding(state, 'compact') >= 50) notes.push('The free towns name a road after you.');
  if (getStanding(state, 'wardens') <= -20) notes.push('The Wardens do not speak your name.');
  return notes.join(' ');
}

// ---------------------------------------------
// Postgame: the rift at the Shattered Throne
// ---------------------------------------------
const RIFT_PATTERN = /^(?:i\s+)?(?:enter|descend into|step into|go into|challenge)\s+(?:the\s+)?rift[.!?]*$/i;
const RIFT_ECHOES = ['varrick', 'ulric', 'rubble_maw', 'morwen', 'sun_warden', 'seneschal', 'living_gate', 'kharzul', 'cantor', 'sovereign'];

function detectRift(input) { return RIFT_PATTERN.test(String(input || '').trim()); }

function startRift(state) {
  const c = ensureCampaign(state);
  if (!c || !c.postgame) return { success: false, message: 'There is no rift here. Not yet.' };
  if (state.character.region !== 'shattered_throne') return { success: false, message: 'The rift opens only at the Shattered Throne.' };
  const depth = (c.riftDepth || 0) + 1;
  const key = RIFT_ECHOES[(depth - 1) % RIFT_ECHOES.length];
  const level = Math.min(140, 92 + depth * 2);
  const enemy = buildBossEnemy(key, level, `Echo of ${BOSSES[key].label} (Rift ${depth})`);
  enemy.meta = { rift: depth };
  return { success: true, enemy, depth };
}

function onRiftCleared(state, depth) {
  const c = state.campaign;
  if (depth <= (c.riftDepth || 0)) return null;   // each depth rewards once
  c.riftDepth = depth;
  if (depth % 10 === 0) chronicle.addAchievement(chronicle.worldOf(state), state, `reaches depth ${depth} of the rift`, `rift:${state.characterId}:${depth}`);
  const coin = 2000 + depth * 500;
  addCoin(state, coin);
  return `Rift ${depth} cleared. +${formatCoin(coin)}. The rift opens deeper.`;
}

module.exports = {
  CHAPTERS,
  BOSSES,
  ENDINGS,
  STORY_PATTERN,
  ensureCampaign,
  getChapter,
  getCurrentStep,
  isChapterUnlocked,
  isRegionStoryLocked,
  buildStoryText,
  buildStoryPanel,
  onEvent,
  handleTalk,
  detectConfront,
  startBoss,
  buildBossEnemy,
  detectChoice,
  makeChoice,
  detectRift,
  startRift,
  onRiftCleared,
  getNpc
};
