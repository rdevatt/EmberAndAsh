'use strict';

// =============================================================
// EMBER AND ASH — POLITICS: WARS, ALLIANCES AND PEACE
// The four powers (Ember Wardens, Free Compact, Veldrathi Remnant, Ashen
// Choir) hold territory on the dominion map. Each year their leaders — a
// legendary past hero where one leads, otherwise a council — act on their
// personalities, histories and resources: declaring wars, forging
// alliances against rising threats, suing for peace when exhausted.
// Wars move borders, besiege settlements, raise prices, and kill people
// who are then succeeded. The player can enlist and fight (battles are
// scaled to the region, never to the legends), broker peace, or stay out
// of it entirely. Everything advances with the calendar and is recorded
// in the chronicle.
// =============================================================

const { REGIONS } = require('./constants');
const chronicle = require('./chronicle');
const { getPlayerLevel } = require('./character');

const POWERS = ['wardens', 'compact', 'remnant', 'choir'];
const NAMES = { wardens: 'the Ember Wardens', compact: 'the Free Compact', remnant: 'the Veldrathi Remnant', choir: 'the Ashen Choir' };
const COUNCILS = { wardens: 'the High Warden\'s council', compact: 'the Council of Free Towns', remnant: 'the Sunspire court', choir: 'the Choir\'s cantors' };
const ENDING_FACTION = { rekindle: 'wardens', imperium: 'remnant', ascend: 'choir', shatter: 'compact' };

function hashInt(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function key(a, b) { return [a, b].sort().join('|'); }

function ensure(world) {
  if (!world.relations || typeof world.relations !== 'object') {
    world.relations = {};
    for (let i = 0; i < POWERS.length; i++) for (let j = i + 1; j < POWERS.length; j++) {
      const a = POWERS[i], b = POWERS[j];
      // The Choir starts at war with everyone who keeps the fire lit.
      world.relations[key(a, b)] = { state: (a === 'choir' || b === 'choir') ? 'war' : 'peace', since: 0, score: 0, years: 0 };
    }
  }
  chronicle.ensureDominion(world);
  return world.relations;
}

function relation(world, a, b) { return ensure(world)[key(a, b)]; }

function setRelation(world, a, b, state, why, actor) {
  const r = relation(world, a, b);
  if (r.state === state) return null;
  const from = r.state;
  Object.assign(r, { state, since: chronicle.nowDay(world), score: 0, years: 0 });
  const verb = { war: 'declares war on', peace: 'makes peace with', alliance: 'allies with', truce: 'agrees a truce with' }[state];
  return chronicle.addEvent(world, { type: 'politics', importance: state === 'war' || from === 'war' ? 4 : 3, title: `${cap(NAMES[a])} ${verb} ${NAMES[b]}`, text: why || '', actor: actor || null });
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// A power's leader: a living legend who leads it, or its council.
function leaderOf(world, faction) {
  const legend = (world.figures || []).find(f => f.status !== 'deceased' && (f.faction === faction || (world.realm && world.realm.rulerId === f.characterId && ENDING_FACTION[world.ending] === faction)));
  if (legend) return { name: legend.name, title: legend.title, traits: legend.personality || [], legend, level: (legend.snapshot && legend.snapshot.level) || 1 };
  return { name: COUNCILS[faction], traits: faction === 'choir' ? ['ruthless'] : faction === 'compact' ? ['merciful'] : ['dutiful'], legend: null, level: 0 };
}

function territory(world, faction) { return Object.values(chronicle.ensureDominion(world)).filter(h => h === faction).length; }

function strength(world, faction) {
  const leader = leaderOf(world, faction);
  // Legends lend real weight, but a hero alone does not win a war.
  return (world.factionPower[faction] || 0) + territory(world, faction) * 2 + Math.min(40, Math.sqrt(leader.level || 0) * 2);
}

function allies(world, faction) {
  return POWERS.filter(p => p !== faction && relation(world, faction, p).state === 'alliance');
}

// Regions where a and b meet.
function fronts(world, a, b) {
  const d = chronicle.ensureDominion(world);
  const out = new Set();
  for (const [k, holder] of Object.entries(d)) {
    if (holder !== a && holder !== b) continue;
    for (const n of REGIONS[k].adjacent || []) if (d[n] === (holder === a ? b : a)) { out.add(k); out.add(n); }
  }
  return [...out];
}

// ---------------------------------------------
// The yearly turn
// ---------------------------------------------
function yearlyTurn(world) {
  ensure(world);
  const events = [];
  const year = chronicle.dateOf(chronicle.nowHour(world)).year;

  // 1) Ongoing wars grind on.
  for (let i = 0; i < POWERS.length; i++) for (let j = i + 1; j < POWERS.length; j++) {
    const a = POWERS[i], b = POWERS[j];
    const r = relation(world, a, b);
    if (r.state !== 'war') continue;
    r.years++;
    const sa = strength(world, a) + allies(world, a).reduce((s, p) => s + strength(world, p) * 0.5, 0) + (r.score || 0);
    const sb = strength(world, b) + allies(world, b).reduce((s, p) => s + strength(world, p) * 0.5, 0) - (r.score || 0);
    const roll = (hashInt(`${world.id}${a}${b}${year}`) % 41) - 20;
    const winner = sa + roll >= sb ? a : b, loser = winner === a ? b : a;
    // A power already holding twenty regions can win battles but not hold more land.
    const front = territory(world, winner) >= 20 ? [] : fronts(world, a, b).filter(k => world.dominion[k] === loser && k !== 'shattered_throne');
    if (front.length) {
      const target = front[hashInt(`${world.id}${year}${a}${b}front`) % front.length];
      const e = chronicle.setDominion(world, target, winner, `${cap(NAMES[winner])} take it by force in the war with ${NAMES[loser]}.`);
      if (e) events.push(e);
      // War is ruinous for the people in its path.
      const s = world.settlements[target] || { status: 'thriving' };
      s.status = s.status === 'thriving' ? 'struggling' : 'ruined'; s.since = chronicle.nowDay(world);
      world.settlements[target] = s;
      const npc = (REGIONS[target].npcs || [])[hashInt(`${year}${target}`) % Math.max(1, (REGIONS[target].npcs || []).length)];
      if (npc && hashInt(`${year}${npc.id}war`) % 3 === 0) {
        const rec = chronicle.npcRecord(world, npc);
        events.push(chronicle.addEvent(world, { type: 'death', importance: 3, title: `${rec.name} is killed in the fighting at ${REGIONS[target].label}`, region: target }));
        rec.born = chronicle.nowDay(world) - 999 * chronicle.DAYS_PER_YEAR;   // succession at the next reckoning
      }
    }
    world.factionPower[loser] = Math.max(5, (world.factionPower[loser] || 50) - 4);
    world.factionPower[winner] = Math.max(5, (world.factionPower[winner] || 50) - 1);
    // Exhaustion, or a merciful leader, brings peace.
    const la = leaderOf(world, a), lb = leaderOf(world, b);
    const merciful = [la, lb].some(l => l.traits.includes('merciful') || l.traits.includes('dutiful'));
    const unforgiving = [la, lb].some(l => l.traits.includes('unforgiving') || l.traits.includes('cruel'));
    if (r.years >= (unforgiving ? 8 : merciful ? 3 : 5) && !(a === 'choir' || b === 'choir') || (world.factionPower[loser] <= 10)) {
      events.push(setRelation(world, a, b, 'truce', `After ${r.years} years of war, ${loser === a ? la.name : lb.name} sues for peace.`));
    }
  }

  // 1b) Overreach: every region held beyond a fair share drains strength,
  // and far-flung holdings rise up against an overstretched power.
  for (const f of POWERS) {
    const held = territory(world, f);
    if (held > 15) world.factionPower[f] = Math.max(10, (world.factionPower[f] || 50) - (held - 15) * 0.6);
    else world.factionPower[f] = Math.min(90, (world.factionPower[f] || 50) + 1);   // small powers rebuild
    if (held > 15 && hashInt(`${world.id}${f}${year}revolt`) % 3 === 0) {
      const mine = Object.keys(world.dominion).filter(k => world.dominion[k] === f && k !== 'shattered_throne');
      const target = mine[hashInt(`${year}${f}r`) % mine.length];
      const rebels = f === 'compact' ? 'lawless' : 'compact';
      const e = chronicle.setDominion(world, target, rebels, `${REGIONS[target].label} rises against ${NAMES[f]}, too far from their seat to hold.`);
      if (e) events.push(e);
    }
  }

  // 2) Leaders choose: ambition, fear of a rising power, or friendship.
  for (const f of POWERS) {
    const leader = leaderOf(world, f);
    const t = leader.traits;
    const myStr = strength(world, f);
    const neighbours = POWERS.filter(p => p !== f && fronts(world, f, p).length);
    const roll = hashInt(`${world.id}${f}${year}choice`) % 10;
    if ((t.includes('ambitious') || t.includes('ruthless') || t.includes('cruel')) && roll < 5) {
      const prey = neighbours.filter(p => relation(world, f, p).state === 'peace' && strength(world, p) < myStr * 0.85).sort((x, y) => strength(world, x) - strength(world, y))[0];
      if (prey) { events.push(setRelation(world, f, prey, 'war', `${leader.name} sees weakness, and moves.`, leader.legend ? { id: leader.legend.characterId, name: leader.name } : null)); continue; }
    }
    // A power grown too strong frightens the rest into alliance.
    const giant = POWERS.filter(p => p !== f).sort((x, y) => strength(world, y) - strength(world, x))[0];
    if (giant && strength(world, giant) > myStr * 1.6 && (t.includes('dutiful') || t.includes('merciful') || roll < 3)) {
      const partner = POWERS.find(p => p !== f && p !== giant && relation(world, f, p).state === 'peace' && relation(world, p, giant).state !== 'alliance');
      if (partner) { events.push(setRelation(world, f, partner, 'alliance', `Fear of ${NAMES[giant]} makes friends of old rivals.`, leader.legend ? { id: leader.legend.characterId, name: leader.name } : null)); continue; }
    }
    // Truces settle into peace with time.
    for (const p of POWERS) if (p !== f) { const r = relation(world, f, p); if (r.state === 'truce' && chronicle.nowDay(world) - r.since > 3 * chronicle.DAYS_PER_YEAR) events.push(setRelation(world, f, p, 'peace', 'The truce has held long enough to be called peace.')); }
  }
  return events.filter(Boolean);
}

// Prices in regions where a war is being fought.
function warPriceMult(world, regionKey) {
  if (!world || !world.relations) return 1;
  const holder = world.dominion && world.dominion[regionKey];
  for (const p of POWERS) {
    if (p === holder) continue;
    const r = world.relations[key(holder, p)];
    if (r && r.state === 'war' && fronts(world, holder, p).includes(regionKey)) return 1.2;
  }
  return 1;
}

function activeWars(world) {
  ensure(world);
  const out = [];
  for (const [k, r] of Object.entries(world.relations)) if (r.state === 'war') out.push({ a: k.split('|')[0], b: k.split('|')[1], years: r.years, score: r.score });
  return out;
}

// ---------------------------------------------
// The player
// ---------------------------------------------
function resolveFaction(text) {
  const t = String(text || '').toLowerCase();
  if (/warden/.test(t)) return 'wardens';
  if (/compact|free town|free compact/.test(t)) return 'compact';
  if (/remnant|veldrath|imperium|empire/.test(t)) return 'remnant';
  if (/choir|ash|dominion|sovereign/.test(t)) return 'choir';
  return null;
}

function enlist(state, world, text) {
  const f = resolveFaction(text);
  if (!f) return { success: false, message: 'Enlist with whom? The Wardens, the Compact, the Remnant or the Choir.' };
  const stand = (state.factions && state.factions[f]) || 0;
  if (stand <= -20) return { success: false, message: `${cap(NAMES[f])} will not have you.` };
  const old = state.allegiance;
  state.allegiance = f;
  const changes = { [f]: 10 };
  for (const p of POWERS) if (p !== f && relation(world, f, p).state === 'war') changes[p] = -10;
  require('./factions').changeStanding(state, changes, 'allegiance');
  return { success: true, message: `You take ${NAMES[f]}'s colours${old && old !== f ? `, leaving ${NAMES[old]}'s` : ''}. ${activeWars(world).filter(w => w.a === f || w.b === f).length ? 'They are at war: "fight in the war" in a contested region.' : 'They are at peace — for now.'}` };
}

function renounce(state) {
  if (!state.allegiance) return { success: false, message: 'You serve no one.' };
  const f = state.allegiance; state.allegiance = null;
  return { success: true, message: `You set aside ${NAMES[f]}'s colours. You stand apart from their wars.` };
}

// A battle in a contested region: foes are soldiers of the region's own level.
function startBattle(state, world) {
  const f = state.allegiance;
  if (!f) return { success: false, message: 'You fight for no one. ("enlist with <faction>", or stay out of it.)' };
  const here = state.character.region;
  const war = activeWars(world).find(w => (w.a === f || w.b === f) && fronts(world, w.a, w.b).includes(here));
  if (!war) return { success: false, message: 'There is no front here for your side. ("politics" shows the wars and where they are fought.)' };
  const enemyFaction = war.a === f ? war.b : war.a;
  const r = REGIONS[here];
  // Soldiers are of this region's calibre — wars never send legend-level foes after newcomers.
  const lvl = Math.max(r.levelRange[0], Math.min(r.levelRange[1], getPlayerLevel(state.totalXP || 0)));
  const soldier = { wardens: 'Warden Flamekeeper', compact: 'Compact Militia Captain', remnant: 'Imperial Legionnaire', choir: 'Choir Zealot' }[enemyFaction];
  const effectiveStr = 5 + 2 + Math.floor(lvl * 0.57), effectiveDex = 5 + 1 + Math.floor(lvl * 0.3), effectiveVit = 5 + 2 + Math.floor(lvl * 0.4);
  const hp = Math.round((40 * 0.6 + effectiveVit * 3 + lvl * 2) * Math.min(2.5, 1 + Math.max(0, lvl - 10) / 60) * 1.3);
  return {
    success: true, enemyFaction,
    enemy: { key: 'war', label: soldier, level: lvl, behavior: 'tactical', desc: `A soldier of ${NAMES[enemyFaction]}.`, xpMod: 1.5, currentHP: hp, maxHP: hp, effectiveStr, effectiveDex, effectiveVit, meta: { war: { side: f, against: enemyFaction } } }
  };
}

function onBattleWon(state, world, meta) {
  const r = relation(world, meta.side, meta.against);
  if (!r || r.state !== 'war') return null;
  // Each victory pushes the war score toward your side.
  const sign = [meta.side, meta.against].sort()[0] === meta.side ? 1 : -1;
  r.score = Math.max(-40, Math.min(40, (r.score || 0) + 2 * sign));
  require('./factions').changeStanding(state, { [meta.side]: 2, [meta.against]: -2 }, 'battle');
  state.battlesWon = (state.battlesWon || 0) + 1;
  if (state.battlesWon % 10 === 0) chronicle.addEvent(world, { type: 'war', title: `${state.character.name} wins renown in the war for ${NAMES[meta.side]}`, actor: chronicle.actorOf(state) }, `war:${state.characterId}:${state.battlesWon}`);
  return `Your side gains ground (${state.battlesWon} battles won).`;
}

// Broker peace: needs the trust of both sides, or real authority.
function negotiate(state, world, text) {
  const t = String(text || '').toLowerCase();
  const named = POWERS.filter(p => resolveFaction(t.split(/\band\b|\bwith\b|,/).find(x => resolveFaction(x) === p) || '') === p || t.includes(p));
  let pair = named.length >= 2 ? named.slice(0, 2) : null;
  if (!pair) { const w = activeWars(world)[0]; if (w) pair = [w.a, w.b]; }
  if (!pair) return { success: false, message: 'There is no war to end.' };
  const [a, b] = pair;
  if (relation(world, a, b).state !== 'war') return { success: false, message: `${cap(NAMES[a])} and ${NAMES[b]} are not at war.` };
  const fac = state.factions || {};
  const ruler = world.realm && world.realm.rulerId === state.characterId;
  const authority = ruler || (fac[a] || 0) >= 40 && (fac[b] || 0) >= 40;
  if (!authority) return { success: false, message: `Neither side will hear you yet. You need real standing with both (40+ with ${NAMES[a]} and ${NAMES[b]}), or a crown.` };
  if (a === 'choir' || b === 'choir') {
    const choirLeader = leaderOf(world, 'choir');
    if (choirLeader.traits.includes('ruthless') && !ruler) return { success: false, message: `${choirLeader.name} laughs at the idea of peace.` };
  }
  const event = setRelation(world, a, b, 'truce', `${state.character.name} brokers the truce.`, chronicle.actorOf(state));
  require('./factions').changeStanding(state, { [a]: 5, [b]: 5 }, 'peace');
  return { success: true, hours: 14 * 24, message: `After two weeks of talks, ${NAMES[a]} and ${NAMES[b]} lay down their arms.`, event };
}

// Rulers act directly.
function declare(state, world, text, stance) {
  if (!world.realm || world.realm.rulerId !== state.characterId) return { success: false, message: 'Only a ruler can commit a nation to that.' };
  const mine = ENDING_FACTION[world.ending];
  const other = resolveFaction(text);
  if (!other || other === mine) return { success: false, message: 'With whom?' };
  const e = setRelation(world, mine, other, stance, `By the word of ${state.character.name}.`, chronicle.actorOf(state));
  return e ? { success: true, message: e.title + '.' } : { success: false, message: 'That is already so.' };
}

function buildPoliticsText(world, state) {
  ensure(world);
  const lines = ['THE POWERS OF THE WORLD', ''];
  for (const f of POWERS) {
    const l = leaderOf(world, f);
    lines.push(`  ${cap(NAMES[f])} — led by ${l.name}${l.title ? `, ${l.title}` : ''}; ${territory(world, f)} regions, strength ${Math.round(strength(world, f))}`);
  }
  lines.push('', 'RELATIONS');
  for (const [k, r] of Object.entries(world.relations)) {
    const [a, b] = k.split('|');
    lines.push(`  ${cap(NAMES[a])} ↔ ${NAMES[b]}: ${r.state}${r.state === 'war' ? ` (year ${r.years + 1}; fronts: ${fronts(world, a, b).slice(0, 4).map(x => REGIONS[x].label).join(', ') || 'none'})` : ''}`);
  }
  lines.push('', state.allegiance ? `You serve ${NAMES[state.allegiance]}. "fight in the war" at a front, or "renounce allegiance".` : 'You serve no one. "enlist with <faction>", "negotiate peace between <a> and <b>", or stay out of it.');
  if (world.realm && world.realm.rulerId === state.characterId) lines.push('As ruler: "declare war on <faction>", "make peace with <faction>", "ally with <faction>".');
  return lines.join('\n');
}

module.exports = { POWERS, NAMES, ensure, relation, setRelation, leaderOf, strength, fronts, yearlyTurn, warPriceMult, activeWars, enlist, renounce, startBattle, onBattleWon, negotiate, declare, buildPoliticsText, ENDING_FACTION };
