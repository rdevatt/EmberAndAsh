'use strict';

// =============================================================
// EMBER AND ASH — ENDLESS ADVENTURE
//   • The Rift: unbounded depths with stacking affixes (burning ground,
//     gloom, wards, hordes, mending, mana drain, quickened specials).
//   • Sagas: procedural multi-step adventures with validated objectives,
//     scaled to the character (newcomers get regional sagas; legends get
//     ascendant threats) and themed by the age the world is in.
//   • Crisis champions: answering the world's crises.
//   • Long-term development: titles, governing a realm, founding an
//     order, and training or study measured in months and years.
// No AI calls. No database calls. Pure game logic.
// =============================================================

const { REGIONS, GEAR_QUALITIES } = require('./constants');
const { getPlayerLevel, grantXP } = require('./character');
const { addCoin, addItem, spendCoin, formatCoin } = require('./economy');
const campaign = require('./campaign');
const chronicle = require('./chronicle');

function hashInt(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function tierFor(level) { let t = 0; for (const q of GEAR_QUALITIES) if (level >= q.levelReq) t = q.tier; return t; }

// ---------------------------------------------
// The Rift
// ---------------------------------------------
const RIFT_AFFIXES = [
  { id: 'burning',   min: 3,  label: 'Burning Ground', desc: 'the floor burns (you lose 3% HP each round)', env: { burnPct: 0.03 } },
  { id: 'warded',    min: 6,  label: 'Rift-Warded',    desc: 'it raises a ward at half health', phase: { at: 0.5, effect: 'ward', amount: 0.15, text: 'Rift-light hardens into a ward around it.' } },
  { id: 'horde',     min: 9,  label: 'Echo Horde',     desc: 'echoes join the fight early', phase: { at: 0.85, effect: 'summon', rounds: 3, text: 'More echoes step out of the dark.' } },
  { id: 'gloom',     min: 12, label: 'Gloom',          desc: 'your attacks are 10% less accurate', env: { hitPenalty: 0.1 } },
  { id: 'fury',      min: 15, label: 'Unending Fury',  desc: 'it enrages at a third of its health', phase: { at: 0.35, effect: 'enrage', text: 'The echo howls with borrowed fury.' } },
  { id: 'mending',   min: 18, label: 'Mending Void',   desc: 'it heals once when badly hurt', phase: { at: 0.25, effect: 'heal', amount: 0.12, text: 'The void stitches the echo back together.' } },
  { id: 'drain',     min: 21, label: 'Mana Drain',     desc: 'you lose 5% mana each round', env: { manaDrainPct: 0.05 } },
  { id: 'quickened', min: 25, label: 'Quickened',      desc: 'its telegraphed attack comes every other turn', quickened: true }
];

function riftAffixes(depth) {
  const pool = RIFT_AFFIXES.filter(a => depth >= a.min);
  const count = Math.min(pool.length, 1 + Math.floor(depth / 15));
  const chosen = [];
  let h = hashInt(`rift${depth}`);
  const list = [...pool];
  while (chosen.length < count && list.length) {
    const i = h % list.length;
    chosen.push(list.splice(i, 1)[0]);
    h = Math.imul(h ^ 0x9e3779b9, 16777619) >>> 0;
  }
  // The newest affix unlocked at this depth is always present.
  // While depths still unlock new affixes, the newest one is always in play.
  const newest = pool[pool.length - 1];
  if (depth <= 30 && newest && !chosen.includes(newest)) chosen[chosen.length - 1] = newest;
  return chosen;
}

function riftLevel(depth) { return 92 + depth * 2; }

// Beyond level 200, one-time accomplishments (a new rift depth, a saga, a
// crisis) are worth more and more, so a level costs a campaign's worth of
// meaningful deeds rather than a hundred campaigns of repetition.
// Repeatable kills are not scaled, so nothing here can be farmed.
function deedFactor(level) { return level <= 200 ? 1 : Math.pow(level / 200, 2.2); }

const RIFT_MIN_LEVEL = 90;

function startRift(state) {
  const c = campaign.ensureCampaign(state);
  if (!c || !c.postgame) return { success: false, message: 'There is no rift here. Not yet.' };
  if (state.character.region !== 'shattered_throne') return { success: false, message: 'The rift opens only at the Shattered Throne.' };
  if (getPlayerLevel(state.totalXP || 0) < RIFT_MIN_LEVEL) return { success: false, message: `The rift would unmake you. (Level ${RIFT_MIN_LEVEL}+.)` };
  const depth = (c.riftDepth || 0) + 1;
  const echoes = ['varrick', 'ulric', 'rubble_maw', 'morwen', 'sun_warden', 'seneschal', 'living_gate', 'kharzul', 'cantor', 'sovereign'];
  const key = echoes[(depth - 1) % echoes.length];
  const enemy = campaign.buildBossEnemy(key, riftLevel(depth), `Echo of ${campaign.BOSSES[key].label} (Rift ${depth})`);
  const affixes = riftAffixes(depth);
  enemy.environment = {};
  for (const a of affixes) {
    if (a.env) Object.assign(enemy.environment, a.env);
    if (a.phase) enemy.phases.push({ ...a.phase, done: false });
    if (a.quickened && enemy.special) enemy.special = { ...enemy.special, every: 2 };
  }
  // Each ten depths adds one more phase of the echo's own power (at most
  // five: deeper echoes get harder affixes, not endless stacked wards).
  for (let extra = 0; extra < Math.min(5, Math.floor(depth / 10)); extra++) enemy.phases.push({ at: 0.9 - extra * 0.07, effect: extra % 2 ? 'summon' : 'ward', rounds: 2, amount: 0.08, text: 'The echo remembers more of what it was.', done: false });
  enemy.phases.sort((a, b) => b.at - a.at);
  // Echoes fight with mechanics, not bloated health: long slogs are not challenge.
  enemy.maxHP = enemy.currentHP = Math.round(enemy.maxHP * 0.8);
  enemy.effectiveStr = Math.round(enemy.effectiveStr * 0.9);
  enemy.affixes = affixes.map(a => a.label);
  enemy.meta = { rift: depth };
  return { success: true, enemy, depth, affixes };
}

// Called when a rift echo dies. Rewards each depth once.
function onRiftCleared(state, depth) {
  const msg = campaign.onRiftCleared(state, depth);
  if (!msg) return null;
  const lines = [msg];
  const lvl = getPlayerLevel(state.totalXP || 0);
  const bonus = Math.round(8 * riftLevel(depth) * deedFactor(lvl));
  const lu = grantXP(state, bonus);
  lines.push(`A new depth conquered: +${bonus.toLocaleString('en-US')} XP.${lu ? ` Level ${lu.newLevel}!` : ''}`);
  if (depth % 5 === 0) {
    const level = Math.min(getPlayerLevel(state.totalXP || 0), riftLevel(depth));
    const tier = tierFor(level);
    const kinds = ['blade', 'greatsword', 'warstaff', 'longbow', 'plate'];
    const kind = kinds[(depth / 5) % kinds.length];
    const isArmor = kind === 'plate';
    const item = { name: `Riftforged ${kind} of depth ${depth}`, tier, type: isArmor ? 'armor' : 'weapon', statMods: { [['str', 'dex', 'int', 'vit', 'wis'][(depth / 5) % 5]]: 2 + Math.floor(depth / 10) }, unique: true };
    addItem(state, item);
    lines.push(`The rift yields ${item.name} (${GEAR_QUALITIES[tier].label}). "equip ${item.name}"`);
  }
  return lines.join('\n');
}

// ---------------------------------------------
// Sagas — procedural adventures
// ---------------------------------------------
const SAGA_THEMES = {
  default:  [{ title: 'The Hollow Choir', foe: 'Choir Remnant', boss: 'Cantor', place: 'a burned chapel' },
             { title: 'The Ash Wolves', foe: 'Ash-Wolf', boss: 'Pack-Mother', place: 'the den under the cairns' },
             { title: 'The Drowned Bell', foe: 'Bell-Drowned', boss: 'Bell-Ringer', place: 'a flooded belltower' },
             { title: 'The Glass Thieves', foe: 'Glass Thief', boss: 'Fence-Queen', place: 'a smugglers\' cache' },
             { title: 'The Red Harvest', foe: 'Harvest-Thrall', boss: 'Scarecrow King', place: 'a field of red wheat' }],
  rekindle: [{ title: 'Embers in the Dark', foe: 'Ash-Cultist', boss: 'Last Cantor', place: 'a hidden ash-shrine' }],
  imperium: [{ title: 'The Free Towns Rise', foe: 'Compact Rebel', boss: 'Rebel Captain', place: 'a rebel waystation' },
             { title: 'The Legion\'s Shame', foe: 'Deserter Legionnaire', boss: 'Fallen Tribune', place: 'an abandoned fort' }],
  ascend:   [{ title: 'The Warden Insurgency', foe: 'Warden Insurgent', boss: 'Insurgent Flamekeeper', place: 'a secret Warden fire' },
             { title: 'The Sovereign\'s Hounds', foe: 'Ash-Hound', boss: 'Kennel-Master of the Throne', place: 'the Dominion kennels' }],
  shatter:  [{ title: 'The Last Spellbooks', foe: 'Relic Hunter', boss: 'Relic Baron', place: 'a looted archive' },
             { title: 'The Unbound Beasts', foe: 'Unbound Beast', boss: 'Beast-Without-Leash', place: 'a cracked ward-stone' }]
};

const ASCENDANT_PREFIX = ['Ascendant', 'Starborn', 'Unmade', 'World-Eater', 'Primordial'];

function sagaRegionFor(level, here) {
  const keys = Object.keys(REGIONS).filter(k => k !== 'shattered_throne' && REGIONS[k].settlement);
  if (level > 100) return keys.filter(k => REGIONS[k].tier >= 8).concat(keys.filter(k => REGIONS[k].tier === 7))[hashInt(here + level) % 6] || 'the_crucible';
  const fitting = keys.filter(k => REGIONS[k].levelRange[0] <= level + 1 && REGIONS[k].levelRange[1] >= level - 3);
  const list = fitting.length ? fitting : keys.filter(k => REGIONS[k].levelRange[0] <= level + 1);
  return list.sort((a, b) => (a === here ? -1 : 0) - (b === here ? -1 : 0))[hashInt(here + level + list.length) % Math.max(1, list.length)] || here;
}

function generateSaga(state, world, { patron = null, starter = false } = {}) {
  const level = getPlayerLevel(state.totalXP || 0);
  const here = state.character.region;
  const ending = world && world.ending;
  const themes = [...SAGA_THEMES.default, ...((ending && SAGA_THEMES[ending]) || [])];
  const n = (state.sagasCompleted || 0) + (state.actionCount || 0);
  const theme = themes[hashInt(`${state.characterId}:${n}`) % themes.length];
  // A newcomer's first saga starts at home, like the first chapter once did.
  const region = starter ? here : sagaRegionFor(level, here);
  const r = REGIONS[region];
  const sagaLevel = level > 100 ? level : Math.max(r.levelRange[0], Math.min(r.levelRange[1] + 2, level + 1));
  const prefix = level > 100 ? `${ASCENDANT_PREFIX[hashInt(theme.title + level) % ASCENDANT_PREFIX.length]} ` : '';
  const foe = `${prefix}${theme.foe}`;
  const bossName = `${prefix}${theme.boss}`;
  const steps = [
    { type: 'travel', region, objective: `Travel to ${r.label}` },
    { type: 'investigate', region, site: theme.place, objective: `Investigate ${theme.place} in ${r.label} (type "investigate ${theme.place}")` },
    { type: 'foe', region, foe, count: level > 100 ? 3 : 2, done: 0, objective: `Defeat ${level > 100 ? 3 : 2} × ${foe} (type "hunt ${theme.foe.toLowerCase()}")` },
    { type: 'boss', region, boss: bossName, objective: `Defeat the ${bossName} (type "confront the ${theme.boss.toLowerCase()}")` }
  ];
  if (here === region) steps.shift();
  if (starter) { const foe = steps.find(x => x.type === 'foe'); if (foe) { foe.count = 2; } }
  return {
    id: `saga_${state.characterId}_${n}`,
    title: starter ? `First Steps: ${theme.title}` : `${theme.title}${level > 100 ? ' (Ascendant)' : ''}`,
    patron: patron ? patron.name : null, starter,
    region, level: starter ? Math.min(sagaLevel, Math.max(1, level + 1)) : sagaLevel, step: 0, steps,
    reward: starter ? { xp: 350, coin: 150 } : { xp: Math.round(12 * Math.max(level, sagaLevel) * (steps.length / 3) * deedFactor(level)), coin: 150 * sagaLevel },
    startedHour: chronicle.nowHour(world)
  };
}

function currentSaga(state) { return state.saga && state.saga.step < state.saga.steps.length ? state.saga : null; }

function sagaObjective(state) {
  const s = currentSaga(state);
  return s ? `${s.title}: ${s.steps[s.step].objective}` : null;
}

function buildSagaFoe(saga, step, boss = false) {
  const lvl = saga.level;
  const effectiveStr = 5 + 3 + Math.floor(lvl * 0.57);
  const effectiveDex = 5 + 2 + Math.floor(lvl * 0.3);
  const effectiveVit = 5 + 3 + Math.floor(lvl * 0.4);
  const depth = Math.min(2.5, 1 + Math.max(0, lvl - 10) / 60);
  const base = Math.round((40 * 0.6 + effectiveVit * 3 + lvl * 2) * depth);
  // Newcomers' sagas are adventures, not walls.
  const novice = lvl < 10;
  const bossMult = novice ? 1.4 : lvl < 30 ? 1.9 : 2.4;
  const enemy = {
    key: `saga__${boss ? 'boss' : 'foe'}`, label: boss ? step.boss : step.foe, level: lvl, behavior: boss ? 'tactical' : 'aggressive',
    desc: boss ? `The heart of "${saga.title}".` : `One of the threats in "${saga.title}".`,
    xpMod: boss ? 3 : 1.4, currentHP: Math.round(base * (boss ? bossMult : 1.2)), maxHP: Math.round(base * (boss ? bossMult : 1.2)),
    effectiveStr, effectiveDex, effectiveVit, isRare: true, isBoss: !!boss,
    special: boss ? { every: novice ? 4 : 3, name: 'Saga Strike', telegraph: `${step.boss} gathers itself for a crushing blow`, mult: novice ? 1.5 : 2.2 } : null,
    phases: boss ? [{ at: 0.5, effect: lvl > 100 ? 'ward' : 'enrage', amount: 0.12, text: `${step.boss} refuses to fall.`, done: false }] : [],
    meta: { saga: saga.id, sagaStep: saga.step }
  };
  if (lvl > 100 && boss) enemy.phases.push({ at: 0.25, effect: 'summon', rounds: 3, text: 'Its servants rally to it.', done: false });
  if (lvl > 150) enemy.environment = { hitPenalty: 0.05 };
  return enemy;
}

// Handles saga commands. Returns null when the input isn't one.
function handleSagaCommand(state, world, input) {
  const t = String(input || '').trim().toLowerCase().replace(/[.!?]+$/, '');
  if (/^(?:sagas?|adventure|seek (?:an? )?(?:adventure|commission|saga)|find work|ask for a commission)$/.test(t)) {
    const s = currentSaga(state);
    if (s) return { info: true, message: `Your saga: ${s.title}\n► ${s.steps[s.step].objective}\nReward: +${s.reward.xp} XP, ${formatCoin(s.reward.coin)}. ("abandon saga" to give it up.)` };
    const r = REGIONS[state.character.region];
    if (!r.settlement) return { info: true, message: 'There is no one here to offer you work. Find a settlement.' };
    if (getPlayerLevel(state.totalXP || 0) < 3) return { info: true, message: 'Nobody trusts a stranger with real work yet. Take a few bounties from the board first (level 3).' };
    state.saga = generateSaga(state, world);
    return { started: true, message: `A new saga: ${state.saga.title}.\n${state.saga.steps.map((x, i) => `  ${i + 1}. ${x.objective}`).join('\n')}\nReward: +${state.saga.reward.xp} XP, ${formatCoin(state.saga.reward.coin)}.` };
  }
  if (/^abandon (?:the )?saga$/.test(t)) {
    if (!currentSaga(state)) return { info: true, message: 'You have no saga to abandon.' };
    const title = state.saga.title; state.saga = null;
    return { info: true, message: `You walk away from "${title}".` };
  }
  const s = currentSaga(state);
  if (!s) return null;
  const step = s.steps[s.step];
  if (step.region && state.character.region !== step.region) {
    if (/^(?:investigate|hunt|confront)\b/.test(t) && (t.includes((step.site || '').split(' ').pop() || '@') || t.includes(((step.foe || step.boss || '').split(' ').pop() || '@').toLowerCase()))) {
      return { info: true, message: `That is in ${REGIONS[step.region].label}.` };
    }
    return null;
  }
  if (step.type === 'investigate' && /^(?:investigate|search|explore|examine)\b/.test(t) && step.site.split(' ').some(w => w.length > 3 && t.includes(w.toLowerCase()))) {
    return { advance: true, hours: 4, message: `You search ${step.site} and find the trail: tracks, ash, a name scratched on a wall. It leads to the ${step.foe ? step.foe : s.steps[s.step + 1] && (s.steps[s.step + 1].foe || s.steps[s.step + 1].boss)}.` };
  }
  if (step.type === 'foe' && /^(?:hunt|track|fight|attack|seek)\b/.test(t) && step.foe.toLowerCase().split(' ').some(w => w.length > 3 && t.includes(w))) {
    return { spawn: buildSagaFoe(s, step, false), message: `You find a ${step.foe}.` };
  }
  if (step.type === 'boss' && /^(?:confront|face|challenge|fight|attack)\b/.test(t) && step.boss.toLowerCase().split(' ').some(w => w.length > 3 && t.includes(w))) {
    return { spawn: buildSagaFoe(s, step, true), boss: true, message: `${step.boss} awaits.` };
  }
  return null;
}

// Validated progress: arrival, investigation, kills of the saga's own foes.
function onSagaEvent(state, world, evt) {
  const s = currentSaga(state);
  if (!s) return null;
  const step = s.steps[s.step];
  let advanced = false;
  if (evt.type === 'arrived' && step.type === 'travel' && evt.region === step.region) advanced = true;
  if (evt.type === 'investigated' && step.type === 'investigate') advanced = true;
  if (evt.type === 'kill' && evt.meta && evt.meta.saga === s.id && evt.meta.sagaStep === s.step) {
    if (step.type === 'foe') { step.done = (step.done || 0) + 1; advanced = step.done >= step.count; if (!advanced) return { message: `${step.foe}: ${step.done}/${step.count}` }; }
    if (step.type === 'boss') advanced = true;
  }
  if (!advanced) return null;
  s.step++;
  if (s.step < s.steps.length) return { message: `Saga — next: ${s.steps[s.step].objective}` };
  // Complete: reward exactly once.
  state.sagasCompleted = (state.sagasCompleted || 0) + 1;
  const levelUp = grantXP(state, s.reward.xp);
  addCoin(state, s.reward.coin);
  chronicle.addEvent(world, { type: 'saga', importance: s.level > 100 ? 3 : 2, title: `${state.character.name} ends "${s.title}"`, region: s.region, actor: chronicle.actorOf(state) }, `saga:${s.id}`);
  const done = s;
  state.saga = null;
  return { complete: true, levelUp, message: `SAGA COMPLETE — ${done.title}. +${done.reward.xp} XP, ${formatCoin(done.reward.coin)}.` };
}

// ---------------------------------------------
// Crises
// ---------------------------------------------
function activeCrises(world) { return (world && world.crises || []).filter(c => c.status === 'active'); }

function crisisText(world) {
  const list = activeCrises(world);
  if (!list.length) return 'No crisis grips the world right now. ("chronicle" shows its history.)';
  const today = chronicle.nowDay(world);
  return ['CRISES', ...list.map(c => `  ${c.title} — ${c.text} Danger Lv${c.level}. ${Math.max(0, c.deadlineDay - today)} days remain. (Go there and "answer the call".)`)].join('\n');
}

function startCrisisFight(state, world) {
  const c = activeCrises(world).find(x => x.region === state.character.region);
  if (!c) return { success: false, message: 'No crisis threatens this region. ("crises" lists them.)' };
  const lvl = c.level;
  const effectiveStr = 5 + 4 + Math.floor(lvl * 0.57);
  const effectiveDex = 5 + 1 + Math.floor(lvl * 0.3);
  const effectiveVit = 5 + 4 + Math.floor(lvl * 0.4);
  const hp = Math.round((60 * 0.6 + effectiveVit * 3 + lvl * 2) * Math.min(2.5, 1 + Math.max(0, lvl - 10) / 60) * 2.2);
  return {
    success: true,
    enemy: {
      key: 'crisis', label: c.enemy, level: lvl, behavior: 'aggressive', desc: c.text, xpMod: 4, currentHP: hp, maxHP: hp,
      effectiveStr, effectiveDex, effectiveVit, isRare: true, isBoss: true,
      special: { every: 3, name: 'Cataclysm', telegraph: `${c.enemy} rears up, and the ground shakes`, mult: 2 },
      phases: [{ at: 0.5, effect: 'summon', rounds: 2, text: 'Its spawn swarm around you.', done: false }],
      meta: { crisis: c.id }
    }
  };
}

function onCrisisWon(state, world, crisisId) {
  const c = (world.crises || []).find(x => x.id === crisisId && x.status === 'active');
  if (!c) return null;
  chronicle.resolveCrisis(world, c, state);
  require('./morality').shift(state, 5, 'ended a crisis');
  const coin = 120 * c.level;
  addCoin(state, coin);
  const lvl = getPlayerLevel(state.totalXP || 0);
  // Crises are sized to the world, not the hero; legends earn little from small ones.
  grantXP(state, Math.round(40 * c.level * (c.level >= lvl - 10 ? deedFactor(lvl) : 0.1)));
  const owner = (REGIONS[c.region].npcs[0] || {}).faction || 'compact';
  world.factionPower[owner] = Math.min(100, (world.factionPower[owner] || 50) + 5);
  state.crisesResolved = (state.crisesResolved || 0) + 1;
  return `CRISIS ENDED — ${c.title}. The people of ${REGIONS[c.region].label} will remember. +${formatCoin(coin)}.`;
}

// ---------------------------------------------
// Titles & long-term development
// ---------------------------------------------
function titlesFor(state, world) {
  const out = [];
  const level = getPlayerLevel(state.totalXP || 0);
  const cl = state.classLevel || 0;
  if (world && world.realm && world.realm.rulerId === state.characterId) out.push(world.realm.title.split(', ').slice(1).join(', ') || 'Ruler');
  const fig = world && world.figures.find(f => f.characterId === state.characterId);
  if (fig && fig.title && !out.includes(fig.title)) out.push(fig.title);
  if (['wizard', 'sorcerer', 'warlock'].includes(state.combatClass) && cl >= 5 && level >= 120) out.push('Archmage');
  if (['fighter', 'barbarian', 'monk', 'paladin'].includes(state.combatClass) && cl >= 5 && level >= 120) out.push('Master of Arms');
  if (state.campaign && (state.campaign.riftDepth || 0) >= 10) out.push(`Rift-walker of the ${state.campaign.riftDepth}th Depth`);
  if ((state.crisesResolved || 0) >= 3) out.push('Champion of the Realm');
  for (const org of (world && world.organizations || []).filter(o => o.founderId === state.characterId)) out.push(`Founder of ${org.name}`);
  if (state.longevity && state.longevity.immortal) out.push('the Undying');
  if ((state.corruption || 0) >= 40) out.push('the Cruel');
  if ((state.infamy || 0) >= 40) out.push('the Reviled');
  return out;
}

const POLICIES = {
  prosperity: { label: 'prosperity', text: 'You open the granaries and cut the tolls.', power: { compact: 6 }, settlements: true, coin: 0.5 },
  order:      { label: 'order',      text: 'You raise patrols and hang the bandits.', power: { wardens: 3, remnant: 3 }, settlements: false, coin: 1 },
  might:      { label: 'might',      text: 'You levy soldiers and build fortresses.', power: { remnant: 5, choir: 2 }, settlements: false, coin: 0.7 }
};

// A ruler spends a season governing. Rewards scale with the realm, not spam:
// each act of governance costs 90 days of the ruler's life.
function govern(state, world, policyText) {
  if (!world.realm || world.realm.rulerId !== state.characterId) return { success: false, message: 'You do not rule a realm.' };
  const key = Object.keys(POLICIES).find(k => String(policyText || '').toLowerCase().includes(k));
  if (!key) return { success: false, message: 'Govern how? "govern for prosperity", "govern for order", or "govern for might".' };
  const p = POLICIES[key];
  for (const [f, d] of Object.entries(p.power)) world.factionPower[f] = Math.min(100, (world.factionPower[f] || 50) + d);
  let restored = 0;
  if (p.settlements) for (const s of Object.values(world.settlements)) if (s.status !== 'thriving') { s.status = s.status === 'ruined' ? 'rebuilding' : 'thriving'; s.since = chronicle.nowDay(world); restored++; }
  // The ruler's choice is law across the realm's lands for a few years.
  const wl = require('./world-life');
  const L = wl.ensure(world);
  const faction = require('./politics').ENDING_FACTION[world.ending];
  const decree = { prosperity: { text: 'the tolls are cut and the granaries opened', price: 0.9, fund: true }, order: { text: 'the roads are patrolled and the bandits hanged', price: 0.97 }, might: { text: 'a war levy is raised for fortresses', price: 1.12 } }[key];
  L.decrees.push({ by: state.character.name, faction, text: decree.text, price: decree.price, fund: !!decree.fund, from: chronicle.nowDay(world), until: chronicle.nowDay(world) + 3 * 360 });
  if (decree.fund) for (const d of L.disasters.filter(x => x.progress < 100 && chronicle.dominionOf(world, x.region) === faction)) d.progress = Math.min(99, d.progress + 30);
  const taxes = Math.round(2000 * getPlayerLevel(state.totalXP || 0) * p.coin);
  addCoin(state, taxes);
  chronicle.addEvent(world, { type: 'governance', title: `${state.character.name} governs ${world.realm.name} for ${p.label}`, text: p.text, actor: chronicle.actorOf(state) });
  return { success: true, hours: 90 * 24, message: `${p.text} A season passes in council and court.${restored ? ` ${restored} settlement(s) recover.` : ''} Your decree: ${decree.text} (prices ${decree.price < 1 ? 'down' : 'up'} ${Math.round(Math.abs(1 - decree.price) * 100)}% in your lands for three years). Taxes: ${formatCoin(taxes)}.` };
}

function foundOrder(state, world, name) {
  const level = getPlayerLevel(state.totalXP || 0);
  const clean = String(name || '').replace(/[^\w' -]/g, '').trim().slice(0, 40);
  if (!clean) return { success: false, message: 'Found what? "found the Order of the Dawn".' };
  if (level < 100) return { success: false, message: 'People follow legends. (Level 100+ to found an order.)' };
  if ((world.organizations || []).some(o => o.founderId === state.characterId)) return { success: false, message: 'You have already founded an order.' };
  const cost = 500000;
  if (!spendCoin(state, cost)) return { success: false, message: `Founding an order takes ${formatCoin(cost)} for halls, arms and stipends.` };
  const org = { name: clean, founderId: state.characterId, founder: state.character.name, seat: state.character.region, foundedDay: chronicle.nowDay(world), members: 12 };
  world.organizations.push(org);
  chronicle.addEvent(world, { type: 'founding', importance: 4, title: `${state.character.name} founds ${clean}`, text: `Its hall stands in ${REGIONS[org.seat].label}.`, actor: chronicle.actorOf(state), region: org.seat }, `found:${state.characterId}`);
  return { success: true, hours: 30 * 24, message: `${clean} is founded, with its hall in ${REGIONS[org.seat].label}. Its members will carry your name.` };
}

// "train strength for a year", "study magic for 6 months": real time for
// slow, capped growth (at most +1 to an attribute per year, 10 per lifetime).
const STAT_WORDS = { str: /strength|str\b|might|arms/, dex: /dex|agility|speed|reflex/, vit: /vit|endurance|stamina|toughness/, int: /int|magic|arcane|study|lore/, wis: /wis|meditat|faith|insight/, cha: /cha|charm|speech|leadership/ };

function train(state, world, text) {
  const t = String(text || '').toLowerCase();
  const m = t.match(/(\d+)\s*(day|week|month|year|season)s?/);
  if (!m) return { success: false, message: 'Train for how long? e.g. "train strength for a year", "study magic for 6 months".' };
  const n = Math.max(1, Math.min(20, parseInt(m[1], 10)));
  const unitDays = { day: 1, week: 7, month: 30, season: 90, year: 360 }[m[2]];
  const days = n * unitDays;
  const stat = Object.keys(STAT_WORDS).find(k => STAT_WORDS[k].test(t));
  if (!stat) return { success: false, message: 'Train what? strength, agility, endurance, magic, wisdom or leadership.' };
  if (state.inCombat) return { success: false, message: 'Not now.' };
  state.training = state.training || { total: 0, days: {} };
  // Training under the masters of a standing institution goes faster.
  const school = world && (world.organizations || []).find(o => o.seat === state.character.region && o.status !== 'closed' && (o.members || 0) >= 20);
  state.training.days[stat] = (state.training.days[stat] || 0) + Math.round(days * (school ? 1.25 : 1));
  let gained = 0;
  while (state.training.days[stat] >= 360 && state.training.total < 10) {
    state.training.days[stat] -= 360; state.training.total++; state.stats[stat] = (state.stats[stat] || 10) + 1; gained++;
  }
  // Modest XP: time in the yard is no substitute for real deeds.
  const xp = days * 2;
  const lu = grantXP(state, xp);
  return {
    success: true, hours: days * 24, levelUp: lu,
    message: `You spend ${n} ${m[2]}${n > 1 ? 's' : ''} in training${school ? ` under the masters of ${school.name}` : ''}.${gained ? ` ${stat.toUpperCase()} +${gained}.` : ` Progress toward ${stat.toUpperCase()}: ${state.training.days[stat]}/360 days.`}${state.training.total >= 10 ? ' (You have reached the limit of what training alone can give.)' : ''} +${xp} XP.`
  };
}

module.exports = {
  RIFT_AFFIXES, RIFT_MIN_LEVEL, deedFactor, riftAffixes, riftLevel, startRift, onRiftCleared,
  generateSaga, currentSaga, sagaObjective, handleSagaCommand, onSagaEvent, buildSagaFoe,
  activeCrises, crisisText, startCrisisFight, onCrisisWon,
  titlesFor, govern, foundOrder, train
};
