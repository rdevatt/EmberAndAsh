'use strict';

// =============================================================
// Full-game playthrough bot.
// Plays Ember and Ash through the real HTTP API — creation, bounties,
// grinding, shopping, travel across the tiers, every story chapter,
// bosses, choices, the ending and a postgame rift — against an
// isolated temp database with offline narration. It never edits game
// state directly: everything it achieves, a player could.
//
// Usage: node scripts/playthrough.js [--seed N] [--style fighter|wizard|ranger]
//                                    [--path wardens|remnant|ascend|shatter] [--max N] [--quiet]
// =============================================================

const path = require('path');
const h = require(path.join(__dirname, '..', 'tests', 'helpers'));
const { REGIONS, GEAR_QUALITIES } = require(path.join(__dirname, '..', 'game', 'constants'));
const T = require(path.join(__dirname, '..', 'game', 'combat-tactics'));
const { CHAPTERS, BOSSES } = require(path.join(__dirname, '..', 'game', 'constants', 'data', 'world', 'campaign'));

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SEED  = parseInt(arg('--seed', '7'), 10);
const STYLE = arg('--style', 'fighter');
const PATH  = arg('--path', 'wardens');
const MAX   = parseInt(arg('--max', '60000'), 10);
const QUIET = argv.includes('--quiet');
h.seedRandom(SEED);

const STYLES = {
  fighter: { attack: 'I feint left and slash at its torso with a quick, precise strike of my sword', points: ['str', 'str', 'vit', 'dex'], craft: 'I work the metal at the forge, hammering the iron on the anvil', recipe: 'forge a sword', weapon: 'sword', bg: '1' },
  wizard:  { attack: 'I cast a spell, tracing an arcane rune and invoking a bolt of magic', points: ['int', 'int', 'vit', 'wis'], craft: 'I study the old scroll and research its lore', recipe: 'make a spell tome', weapon: 'staff', bg: 'I was an apprentice to a hedge mage, studying scrolls' },
  ranger:  { attack: 'I aim and shoot an arrow from my bow at its torso, tracking its movement', points: ['dex', 'dex', 'vit', 'wis'], craft: 'I hunt and track game through the wilderness, skinning the trail', recipe: 'make a longbow', weapon: 'bow', bg: '1' }
};
const style = STYLES[STYLE] || STYLES.fighter;

// Option index (1-based) per chapter for each story path.
const CHOICES = {
  wardens: { 1: 1, 2: 1, 3: 2, 4: 1, 5: 2, 6: 1, 8: 1, 9: 1, 10: 1 },
  remnant: { 1: 3, 2: 2, 3: 1, 4: 3, 5: 1, 6: 1, 8: 1, 9: 2, 10: 2 },
  ascend:  { 1: 3, 2: 2, 3: 1, 4: 2, 5: 3, 6: 2, 8: 2, 9: 2, 10: 3 },
  shatter: { 1: 2, 2: 1, 3: 2, 4: 1, 5: 3, 6: 1, 8: 1, 9: 1, 10: 4 }
};

const labelToKey = {};
for (const [k, r] of Object.entries(REGIONS)) labelToKey[r.label] = k;
const tierFor = lvl => { let t = 0; for (const q of GEAR_QUALITIES) if (lvl >= q.levelReq) t = q.tier; return t; };

const stats = { actions: 0, deaths: 0, kills: 0, bosses: [], chapters: [], regions: new Set(), crafted: 0, recruited: [], quests: 0, landmarks: 0, levelAt: {}, errors: [] };
let c, last = {};

function log(...a) { if (!QUIET) console.log(...a); }

async function act(input) {
  stats.actions++;
  const r = await c.act(input);
  if (r.status && r.status >= 500) stats.errors.push(`${input}: ${r.error} ${r.detail || ''}`);
  if (r.character) last = r;
  const out = r.output || '';
  if (/— DARKNESS —/.test(out)) { stats.deaths++; if (argv.includes("--trace")) log(`  died: "${input.slice(0, 40)}" L${level()} in ${region()} hp${last.character.maxHp} w=${last.economy && last.economy.weapon.label} a=${last.economy && last.economy.armor && last.economy.armor.label} coin=${last.character.coin} — ${(out.match(/◀ ([^\n]+)/g) || []).slice(-2).join(' | ')}`); }
  if (argv.includes('--trace') && /QUEST (ACCEPTED|COMPLETE)|abandon/i.test(out)) log('  quest:', (out.match(/QUEST [A-Z]+[^\n]*/) || [''])[0]);
  if (/\[Defeated /.test(out)) stats.kills++;
  if (/QUEST COMPLETE/.test(out)) stats.quests++;
  if (/You explore /.test(out)) stats.landmarks++;
  const m = out.match(/CHAPTER (\d+) COMPLETE/);
  if (m) { stats.chapters.push({ chapter: +m[1], actions: stats.actions, level: level() }); log(`  ✓ chapter ${m[1]} at action ${stats.actions}, level ${level()}`); }
  if (r.pendingClassOffer || (r.progression && r.progression.pendingClassOffer)) await c.act('yes');
  if (r.progression && r.progression.pendingProfOffer) await c.act('yes');
  return r;
}

const level  = () => (last.character && last.character.level) || 1;
const region = () => labelToKey[(last.character && last.character.region) || ''] || 'thornwick';
const hpPct  = () => last.character ? last.character.hp / last.character.maxHp : 1;
const inCombat = () => !!(last.rightPanel && last.rightPanel.inCombat);
const inv = () => (last.character && last.character.inventory) || [];
const count = name => inv().filter(i => (typeof i === 'string' ? i : i.name) === name).length;

// ---------- combat ----------
async function fightToEnd() {
  let lastOut = '';
  for (let round = 0; round < 120 && inCombat(); round++) {
    let input = style.attack;
    const abilities = (last.abilities || []).filter(a => a.ready);
    if (/defend to blunt/.test(lastOut)) input = 'I raise my guard and defend';
    else if (hpPct() < 0.35 && inv().some(i => /healing potion/.test(typeof i === 'string' ? i : i.name))) input = 'drink healing potion';
    else if (STYLE === 'wizard' && last.character.mana < 12 && inv().some(i => /mana potion/.test(typeof i === 'string' ? i : i.name))) input = 'drink mana potion';
    else {
      const heal = abilities.find(a => /heal|second wind|lay on|inner peace|regrowth/i.test(a.label));
      const ward = abilities.find(a => /ward|sanctuary|divine shield/i.test(a.label));
      // What "inspect" would tell a player: don't use elements the enemy resists.
      const foe = last.rightPanel && last.rightPanel.enemy;
      const resisted = foe ? T.describeTraits({ label: foe.label }).strong : [];
      const strike = abilities.find(a => !resisted.includes((T.ABILITIES[a.id] || {}).element) && !/heal|second wind|lay on|inner peace|regrowth|blood|ward|sanctuary|divine shield|power attack/i.test(a.label) && (a.cost.mana || 0) <= last.character.mana && (a.cost.stamina || 0) <= last.character.stamina);
      if (heal && hpPct() < 0.5) input = `I use ${heal.label}`;
      else if (ward && hpPct() < 0.8 && !/ward \d/.test(lastOut)) input = `I use ${ward.label}`;
      else if (strike) input = `I use ${strike.label}`;
    }
    const r = await act(input);
    lastOut = r.output || '';
    if (!r.rightPanel || !r.rightPanel.inCombat) break;
  }
  if (last.economy && last.economy.lastDefeatedEnemyLoot !== null) await act('loot the body');
}

async function recover() {
  if (hpPct() < 0.6 && !inCombat()) {
    const r = REGIONS[region()];
    await act(r.settlement && (last.character.coin || 0) > 40 * r.tier ? 'rent a room at the inn' : 'make camp');
    if (inCombat()) await fightToEnd();
  }
  if (last.economy && last.economy.hasDeadGear && !inCombat()) {
    const r = await act('recover my gear');
    if (!/Gear recovered/.test(r.output || '') && last.economy.deathLocation && last.economy.deathLocation !== region()) {
      // Too far to walk back: buy replacements instead.
      boughtTier = -1;
    }
  }
  if (last.economy && last.economy.weapon && !last.economy.weapon.equipped) boughtTier = -1;
}

// ---------- shopping ----------
let boughtTier = -1;
const wardsNeeded = new Set();
async function shop() {
  const r = REGIONS[region()];
  if (!r.settlement) return;
  const coin = () => (last.character && last.character.coin) || 0;
  const t = tierFor(level());
  const price = 150 * (t + 1) * (t + 1);
  if (t > boughtTier && coin() > price * 1.9 + 200) {
    const w = await act(`buy ${style.weapon === 'staff' ? 'oak staff' : style.weapon === 'bow' ? 'longbow' : 'sword'}`);
    const a = await act('buy leather armor');
    const wn = (w.output || '').match(/Bought (.+?) for/); const an = (a.output || '').match(/Bought (.+?) for/);
    let e1, e2;
    if (wn) e1 = await act(`equip ${wn[1]}`);
    if (an) e2 = await act(`equip ${an[1]}`);
    if (argv.includes('--trace')) log(`  shop t${t}: ${(w.output || '').slice(0, 60)} | ${(e1 && e1.output || '').slice(0, 60)} | ${(e2 && e2.output || '').slice(0, 60)}`);
    boughtTier = t;
  }
  for (const ward of wardsNeeded) if (!inv().some(i => (i.name || i) === ward) && coin() > 300 * r.tier) await act(`buy ${ward}`);
  const potions = count('healing potion');
  if (potions < 5 && coin() > 30 * r.tier * 6) await act(`buy ${5 - potions} healing potions`);
  if (STYLE === 'wizard' && count('mana potion') < 3 && coin() > 40 * r.tier * 6) await act(`buy ${3 - count('mana potion')} mana potions`);
}

// ---------- travel ----------
function route(from, to) {
  const prev = { [from]: null }; const q = [from];
  while (q.length) {
    const k = q.shift();
    if (k === to) break;
    for (const n of REGIONS[k].adjacent) if (!(n in prev)) { prev[n] = k; q.push(n); }
  }
  if (!(to in prev)) return null;
  const pathOut = []; for (let k = to; k !== from; k = prev[k]) pathOut.unshift(k);
  return pathOut;
}

async function goTo(dest) {
  for (let guard = 0; guard < 30 && region() !== dest; guard++) {
    const p = route(region(), dest);
    if (!p || !p.length) return false;
    await recover();
    const r = await act(`travel to ${REGIONS[p[0]].label}`);
    if (/too dangerous|sealed|No road/.test(r.output || '')) { log(`  blocked: ${r.output}`); return false; }
    const wardMsg = (r.output || '').match(/A (.+?) would protect you/);
    if (wardMsg) wardsNeeded.add(wardMsg[1]);
    stats.regions.add(region());
    if (inCombat()) await fightToEnd();
    await shop();
  }
  return region() === dest;
}

// The highest-tier region (by min level) the player can handle, nearest the target.
function grindRegion(target) {
  const lvl = level();
  let best = region(), bestScore = -Infinity;
  for (const [k, r] of Object.entries(REGIONS)) {
    if (k === 'shattered_throne' && !(last.story && last.story.chapter === 10)) continue;
    if (r.levelRange[0] > lvl - 1 || r.levelRange[1] < lvl - 4 || !r.settlement) continue;
    const dist = (route(target || region(), k) || []).length;
    const score = r.levelRange[0] * 2 - dist * 3;
    if (score > bestScore) { bestScore = score; best = k; }
  }
  return best;
}

let craftCounter = 0;
async function grindOnce(target) {
  const g = grindRegion(target);
  if (region() !== g) await goTo(g);
  await recover();
  const board = await act('check the bounty board');
  const quests = (board.board && board.board.quests) || [];
  const active = (board.board && board.board.activeQuests) || [];
  // Drop bounties from regions we've left behind.
  for (let i = active.length - 1; i >= 0; i--) if (active[i].region && active[i].region !== region()) await act(`abandon quest ${i + 1}`);
  const hunt = quests.findIndex(q => (q.type === 'hunt' || q.type === 'clear' || q.type === 'patrol') && !active.some(a => a.id === q.id));
  if (active.length < 3 && hunt >= 0) await act(`accept quest ${hunt + 1}`);
  for (let i = 0; i < 6; i++) {
    await recover();
    await act('I attack the nearest creature');
    if (inCombat()) await fightToEnd();
  }
  // Professions: work the trade, gather, craft.
  craftCounter++;
  if (craftCounter % 2 === 0) {
    await act(style.craft);
    await act('gather materials');
    if (inCombat()) await fightToEnd();
    const r = await act(style.recipe);
    if (/You craft/.test(r.output || '')) { stats.crafted++; const n = (r.output.match(/equip (.+?)"/) || [])[1]; if (n) await act(`equip ${n}`); }
    if (count('herbs') >= 4) { const b = await act('brew 2 healing potions'); if (/You make/.test(b.output || '')) stats.crafted++; }
  }
  await shop();
}

// ---------- story ----------
async function storyStep() {
  const s = last.story;
  if (!s || s.ended) return 'done';
  const ch = CHAPTERS.find(x => x.id === s.chapter);
  if (s.locked) { await grindOnce(ch.steps[0].region === 'start' ? null : ch.steps[0].region); return 'grind'; }
  const camp = await c.get('/state');
  const step = ch.steps[camp.story ? stepIndex(ch, camp.story.objective) : 0];
  if (!step) { await grindOnce(); return 'grind'; }
  const target = step.region === 'start' ? region() : step.region;
  if (step.region && region() !== target) {
    const ok = await goTo(target);
    if (!ok) { await grindOnce(target); return 'grind'; }
  }
  await recover();
  if (step.type === 'talk') {
    const npc = step.npc === 'maren' ? 'Maren' : findNpcName(step.npc);
    await act(`talk to ${npc}`);
  } else if (step.type === 'explore') {
    const lm = REGIONS[target].landmarks.find(l => l.id === step.landmark);
    await act(`explore ${lm.name}`);
    if (inCombat()) await fightToEnd();
  } else if (step.type === 'boss') {
    // Be ready: full health, potions, and a few levels over the chapter minimum.
    if (level() < Math.min(100, ch.minLevel + 4)) { await grindOnce(target); return 'grind'; }
    await shop();
    if (hpPct() < 0.95) await act(REGIONS[target].settlement ? 'rent a room at the inn' : 'make camp');
    if (inCombat()) await fightToEnd();
    const typed = (step.objective.match(/type "([^"]+)"/) || [])[1] || `confront ${BOSSES[step.boss].label}`;
    const r = await act(typed);
    if (!r.rightPanel || !r.rightPanel.enemy || !/BOSS:/.test(r.output || '')) { log(`  confront failed: ${(r.output || '').slice(0, 120)}`); if (inCombat()) await fightToEnd(); await grindOnce(target); return 'grind'; }
    if (!inCombat()) { log(`  confront failed: ${(r.output || r.error || '').slice(0, 160)}`); await grindOnce(target); return 'grind'; }
    const before = stats.deaths;
    await fightToEnd();
    stats.bosses.push({ boss: step.boss, level: level(), won: stats.deaths === before });
    log(`  boss ${step.boss}: ${stats.deaths === before ? 'won' : 'lost'} at level ${level()}`);
  } else if (step.type === 'choice') {
    const n = (CHOICES[PATH] || CHOICES.wardens)[ch.id] || 1;
    const r = await act(`choose ${n}`);
    if (!r.success || /closed to you|There is no decision/.test(r.output || '')) await act('choose 1');
  } else if (step.type === 'travel') {
    await goTo(step.region);
  }
  // Recruit companions when the story allows.
  if (ch.id >= 3 && !stats.recruited.includes('maren')) {
    const r = await act('recruit Maren');
    if (/joins you/.test(r.output || '')) { stats.recruited.push('maren'); log('  Maren joined'); }
  }
  return 'story';
}

function stepIndex(ch, objective) {
  const i = ch.steps.findIndex(st => objective && objective.startsWith(st.objective));
  return i >= 0 ? i : 0;
}
function findNpcName(id) {
  for (const r of Object.values(REGIONS)) { const n = (r.npcs || []).find(x => x.id === id); if (n) return n.name.split(' ').filter(w => !/^(the|lady|old|brother|captain)$/i.test(w))[0]; }
  return id;
}

(async () => {
  const t0 = Date.now();
  const { base } = await h.startServer();
  c = h.client(base);
  const g = await c.post('/auth/guest', {}); c.sessionId = g.sessionId;
  await act(`My name is Bot${STYLE}, I am 28 years old and female`);
  await act('Tall and broad-shouldered, a burn scar on one hand');
  const bg = await act(style.bg);
  if (bg.creationError) await act('1');
  await act('3');
  stats.regions.add(region());
  log(`Created: ${last.character.name}, ${last.character.background}, in ${last.character.region}`);

  let lastLevelLog = 0;
  while (stats.actions < MAX) {
    const res = await storyStep();
    if (res === 'done') break;
    const lv = level();
    if (lv >= lastLevelLog + 10) { lastLevelLog = lv - (lv % 10); stats.levelAt[lastLevelLog] = stats.actions; log(`  level ${lv} at action ${stats.actions} (deaths ${stats.deaths})`); }
    // Spend free points.
    if (last.character && last.character.freePoints > 0) {
      for (let i = 0; i < last.character.freePoints; i++) await act(`spend point on ${style.points[i % style.points.length]}`);
    }
  }

  // Postgame: one trip into the rift.
  let rift = null;
  if (last.story && last.story.ended) {
    await goTo('shattered_throne');
    await act('make camp'); if (inCombat()) await fightToEnd();
    const r = await act('enter the rift');
    if (inCombat()) { const d = stats.deaths; await fightToEnd(); rift = stats.deaths === d ? 'cleared' : 'died'; }
    else rift = (r.output || '').slice(0, 80);
  }

  const final = await c.get('/state');
  const report = {
    seed: SEED, style: STYLE, path: PATH,
    finished: !!(final.story && final.story.ended), ending: final.story && final.story.ending,
    actions: stats.actions, minutes: +((Date.now() - t0) / 60000).toFixed(1),
    finalLevel: final.character && final.character.level, deaths: stats.deaths, kills: stats.kills,
    bounties: stats.quests, landmarks: stats.landmarks, crafted: stats.crafted,
    regionsVisited: stats.regions.size, chapters: stats.chapters, bosses: stats.bosses,
    companions: (final.party || []).map(p => p.name), factions: final.factions,
    class: final.character && final.character.combatClass, profession: final.character && final.character.profession,
    rift, serverErrors: stats.errors.slice(0, 10)
  };
  console.log(JSON.stringify(report, null, 2));
  await h.stopServer();
  process.exit(report.finished ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
