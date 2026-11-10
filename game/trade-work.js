'use strict';

// =============================================================
// TRADE WORK
// What a trade opens up in the world, beyond a shift's pay:
//   • every trade — commissions from the named people here, shaped by
//     what they want (npc-life goals), paying more and earning regard;
//   • sailors — sign on for voyages between the ports, with pay, storms
//     and pirates;
//   • innkeepers — buy the inn and live on it; takings follow the town's
//     size and fortunes (world-life), and the common room hears things;
//   • assassins — contracts on named, living people (rulers, at the top),
//     with the full weight of the law and the world behind every killing;
//   • smiths — masterworks from real materials, and a reputation that
//     rises from journeyman to grandmaster, written into the canon.
// No AI calls. No database calls. Pure game logic.
// =============================================================

const chronicle = require('./chronicle');
const { REGIONS } = require('./constants');

function hashInt(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const label = (k) => (REGIONS[k] ? REGIONS[k].label : k);
const lvlOf = (s) => require('./character').getPlayerLevel(s.totalXP || 0);
const tierOf = (k) => (REGIONS[k] && REGIONS[k].tier) || 1;
const profLvl = (s) => s.professionLevel || 1;

const PORTS = ['ironport', 'saltenbay', 'sunkenfen_edge', 'ember_coast', 'sunken_citadel'];
const SMITHS = new Set(['blacksmith', 'weaponsmith', 'armorer']);
const SMITH_RANKS = [[0, 'apprentice'], [1, 'journeyman'], [3, 'master'], [8, 'grandmaster']];

function smithRank(state) { let r = SMITH_RANKS[0][1]; for (const [n, l] of SMITH_RANKS) if ((state.masterworks || 0) >= n) r = l; return r; }

// ---------------------------------------------
// What is open to this character, here and now
// ---------------------------------------------
function opportunities(state) {
  const world = chronicle.worldOf(state);
  const here = state.character.region;
  const prof = state.profession;
  const lines = [`WORK FOR A ${prof ? prof.toUpperCase().replace('_', ' ') : 'PAIR OF HANDS'} IN ${label(here).toUpperCase()}`, '─'.repeat(30)];
  const c = commissionFor(state);
  if (c) lines.push(`• A commission: ${c.who} wants ${c.what} — ${c.pay} copper and their regard. ("take the commission")`);
  if (prof === 'sailor' || PORTS.includes(here)) {
    if (PORTS.includes(here)) lines.push(`• Ships leave for: ${PORTS.filter(p => p !== here).map(p => `${label(p)} (${voyageDays(here, p)} days)`).join(', ')}. ("sign on for a voyage to <port>"${prof === 'sailor' ? ', paid as crew' : ', paying passage'})`);
    else lines.push('• No ships here. The ports: ' + PORTS.map(label).join(', ') + '.');
  }
  if (prof === 'innkeeper' || state.inn) {
    if (state.inn) lines.push(`• Your inn in ${label(state.inn.region)}: ${innTakings(state, world).coin} copper waiting. ("collect from the inn")`);
    else if (REGIONS[here].settlement) lines.push(`• The inn here can be bought for ${innPrice(state, world, here)} copper. ("buy the inn")`);
  }
  if (prof === 'assassin') {
    const list = contractsFor(state, world);
    if (state.contract && !state.contract.done) lines.push(`• Your contract: ${state.contract.target} in ${label(state.contract.region)}, ${state.contract.fee} copper. ("carry out the contract" there)`);
    else lines.push(...list.map((x, i) => `• Contract ${i + 1}: ${x.target}, ${x.role} of ${label(x.region)} — ${x.fee} copper. ("take contract ${i + 1}")`));
  }
  if (SMITHS.has(prof)) lines.push(`• Masterworks: ${state.masterworks || 0} so far — you are a ${smithRank(state)}. A masterwork needs ${masterworkCost(state).ore} iron ore and ${masterworkCost(state).timber} timber at a forge. ("forge a masterwork weapon" or "… armour")`);
  if (lines.length === 2) lines.push('Nothing beyond ordinary work here. ("work" to put in a shift.)');
  return lines.join('\n');
}

// ---------------------------------------------
// Commissions (any trade)
// ---------------------------------------------
function commissionFor(state) {
  const world = chronicle.worldOf(state);
  const here = state.character.region;
  const npcs = (REGIONS[here].npcs || []);
  if (!world || !npcs.length || !state.profession) return null;
  const day = chronicle.nowDay(world);
  const npc = npcs[hashInt(`${state.characterId}${day >> 3}`) % npcs.length];
  const holder = chronicle.currentHolder(world, npc);
  const life = require('./npc-life').profile(world, state, here, npc);
  const p = require('./profession-perks').PERKS[state.profession];
  const pay = Math.round(require('./profession-perks').hourlyValue(state) * 8 * 2.2);
  return { npcId: npc.id, who: `${holder.name} (${npc.role})`, what: `you to ${p ? p.work.what : 'work'} for them — they want ${life.goal}`, pay, key: `${here}:${npc.id}:${day >> 3}` };
}

function takeCommission(state) {
  const c = commissionFor(state);
  if (!c) return { success: false, message: state.profession ? 'No one here has a commission for you.' : 'You need a trade first.' };
  state.commissionsDone = state.commissionsDone || {};
  if (state.commissionsDone[c.key]) return { success: false, message: 'You have done their work already; come back in a few days.' };
  state.commissionsDone[c.key] = true;
  const keys = Object.keys(state.commissionsDone); if (keys.length > 60) delete state.commissionsDone[keys[0]];
  state.coin = (state.coin || 0) + c.pay;
  state.profXP = (state.profXP || 0) + 40 + profLvl(state) * 8;
  state.npcRelationships = state.npcRelationships || {};
  const rel = state.npcRelationships[c.npcId] || (state.npcRelationships[c.npcId] = { rapport: 0, metBefore: true });
  rel.rapport = Math.min(100, (rel.rapport || 0) + 6);
  const xp = careerXP(state, 8);
  const lu = require('./character').grantXP(state, xp);
  return { success: true, hours: 8, levelUp: lu, message: `A long day's work for ${c.who}. ${c.pay} copper, +${xp} XP, and their regard (rapport ${rel.rapport}).` };
}

// Honest work moves a life forward too — slowly, and paid in time.
// Calibrated so a shift is worth about one fight at the same level (a kill
// pays roughly the foe's level): steady, never a shortcut.
function careerXP(state, hours) {
  const lvl = lvlOf(state);
  return Math.max(1, Math.round((hours / 8) * (1 + lvl * 1.1) * require('./endless').deedFactor(lvl)));
}

// ---------------------------------------------
// Sailors and voyages
// ---------------------------------------------
function voyageDays(a, b) { return 2 + Math.abs(PORTS.indexOf(a) - PORTS.indexOf(b)) * 2; }

function voyage(state, text, helpers = {}) {
  const here = state.character.region;
  if (!PORTS.includes(here)) return { success: false, message: `There is no harbour in ${label(here)}. The ports: ${PORTS.map(label).join(', ')}.` };
  if (state.inCombat) return { success: false, message: 'Not in the middle of a fight.' };
  const t = String(text).toLowerCase();
  const dest = PORTS.find(p => p !== here && (t.includes(p.replace(/_/g, ' ')) || t.includes(label(p).toLowerCase()) || label(p).toLowerCase().split(' ').some(w => w.length > 4 && t.includes(w))));
  if (!dest) return { success: false, message: `Sail where? ${PORTS.filter(p => p !== here).map(label).join(', ')}.` };
  const access = require('./travel').canEnterRegion ? require('./travel').canEnterRegion(state, dest) : { ok: true };
  if (access && access.ok === false) return { success: false, message: access.reason };
  const days = voyageDays(here, dest);
  const crew = state.profession === 'sailor';
  const lines = [];
  if (crew) {
    const pay = Math.round(require('./profession-perks').hourlyValue(state) * 10 * days);
    state.coin = (state.coin || 0) + pay;
    state.profXP = (state.profXP || 0) + days * (10 + profLvl(state) * 3);
    lines.push(`You sign on as crew: ${days} days of rope, salt and weather. ${pay} copper at the end of it.`);
  } else {
    const fare = 40 * days * tierOf(dest);
    if ((state.coin || 0) < fare) return { success: false, message: `Passage to ${label(dest)} costs ${fare} copper.` };
    state.coin -= fare;
    lines.push(`You pay ${fare} copper for passage: ${days} days at sea.`);
  }
  // The sea is not kind: storms and pirates.
  const roll = Math.random();
  let spawn = null;
  if (roll < 0.15) { lines.push('A storm tears at the rigging; you arrive bruised and soaked.'); state.hp = Math.max(1, Math.round(state.hp - state.maxHp * 0.15)); }
  else if (roll < 0.30 && helpers.spawnEnemy) {
    const r = REGIONS[dest];
    spawn = helpers.spawnEnemy(dest, Math.max(r.levelRange[0], Math.min(lvlOf(state), r.levelRange[1])));
    spawn.label = 'Pirate Captain'; spawn.meta = { ...(spawn.meta || {}), pirates: true };
    lines.push('Sails on the horizon — pirates, and they are coming alongside.');
  }
  const from = here;
  state.character.region = dest;
  state.currentLocation = null; state.currentNPC = null; state.boardQuests = []; state.shopOpen = false;
  state.visitedRegions = [...new Set([...(state.visitedRegions || []), from, dest])];
  if (REGIONS[dest].settlement) state.lastSettlement = dest;
  lines.push(`You come ashore at ${label(dest)}.`);
  return { success: true, hours: days * 24, from, to: dest, message: lines.join('\n'), spawn };
}

// ---------------------------------------------
// Innkeepers
// ---------------------------------------------
function innPrice(state, world, k) {
  const pop = world ? require('./world-life').econ(world, k).pop : 1000;
  return Math.round(300 * tierOf(k) * Math.sqrt(pop));
}

function buyInn(state) {
  const world = chronicle.worldOf(state);
  const k = state.character.region;
  if (!REGIONS[k].settlement) return { success: false, message: 'There is no inn out here.' };
  if (state.inn) return { success: false, message: `You already keep an inn in ${label(state.inn.region)}.` };
  const price = innPrice(state, world, k);
  if ((state.coin || 0) < price) return { success: false, message: `The inn here would cost ${price} copper.` };
  state.coin -= price;
  state.inn = { region: k, since: world ? chronicle.nowDay(world) : 0, lastCollected: world ? chronicle.nowDay(world) : 0, price };
  if (world) chronicle.addEvent(world, { type: 'founding', importance: 3, title: `${state.character.name} buys the inn at ${REGIONS[k].settlement.name || label(k)}`, region: k, actor: chronicle.actorOf(state) }, `inn:${state.characterId}:${k}`);
  return { success: true, hours: 4, message: `For ${price} copper the inn at ${REGIONS[k].settlement.name || label(k)} is yours: the beds, the barrels and the debts. Takings build up while you are away. ("collect from the inn")` };
}

// Takings: a share of what the town spends, by its size and fortunes.
function innTakings(state, world) {
  const inn = state.inn;
  if (!inn || !world) return { coin: 0, days: 0 };
  const days = Math.max(0, Math.min(360, chronicle.nowDay(world) - inn.lastCollected));
  const wl = require('./world-life');
  const pop = wl.econ(world, inn.region).pop;
  const st = (world.settlements[inn.region] || {}).status;
  const fortune = { thriving: 1.3, rebuilding: 0.8, struggling: 0.55, ruined: 0.1 }[st] ?? 1;
  const keeper = state.profession === 'innkeeper' ? 1 + 0.15 * profLvl(state) : 0.7;     // a real innkeeper runs it better
  const occ = wl.occupiedBy(world, inn.region) ? 0.85 : 1;
  const disaster = wl.ensure(world).disasters.some(d => d.region === inn.region && d.progress < 100) ? 0.5 : 1;
  const perDay = Math.sqrt(pop) * 0.6 * tierOf(inn.region) * fortune * keeper * occ * disaster;
  return { coin: Math.round(perDay * days), days, perDay };
}

function collectInn(state) {
  const world = chronicle.worldOf(state);
  if (!state.inn) return { success: false, message: 'You do not own an inn. ("buy the inn" in a town)' };
  if (state.character.region !== state.inn.region) return { success: false, message: `Your inn is in ${label(state.inn.region)}.` };
  const t = innTakings(state, world);
  state.inn.lastCollected = chronicle.nowDay(world);
  state.coin = (state.coin || 0) + t.coin;
  if (state.profession === 'innkeeper') state.profXP = (state.profXP || 0) + Math.round(t.days * 3);
  const rumor = require('./legacy').rumorFor ? require('./legacy').rumorFor(world, state.inn.region, state.actionCount || 0) : null;
  return { success: true, hours: 2, message: `${t.days} days of takings: ${t.coin} copper.${rumor ? `\nIn the common room: ${rumor}` : ''}` };
}

// ---------------------------------------------
// Assassins
// ---------------------------------------------
function contractsFor(state, world) {
  if (!world) return [];
  const here = state.character.region;
  const day = chronicle.nowDay(world);
  const seen = new Set([here]); let front = [here];
  for (let d = 0; d < 2; d++) { front = front.flatMap(k => REGIONS[k].adjacent || []).filter(k => REGIONS[k] && !seen.has(k)); front.forEach(k => seen.add(k)); }
  const roster = require('./companions').ROSTER;
  const spouse = state.spouse && state.spouse.name;
  const out = [];
  for (const k of [...seen].sort((a, b) => hashInt(a + day) - hashInt(b + day))) {
    const npc = (REGIONS[k].npcs || []).find(n => !roster[n.id] && !Object.values(roster).some(r => r.name === n.name));
    if (!npc) continue;
    const h = chronicle.currentHolder(world, npc);
    if (h.name === spouse) continue;
    out.push({ kind: 'npc', npcId: npc.id, target: h.name, role: npc.role, region: k, fee: Math.round(250 * tierOf(k) * (1 + profLvl(state) / 2)) });
    if (out.length >= 2) break;
  }
  // At the top of the trade: a ruler.
  if (lvlOf(state) >= 60) {
    const L = require('./world-life').ensure(world);
    const f = Object.keys(L.dynasties)[hashInt(state.characterId + (day >> 5)) % 4];
    const seat = Object.keys(REGIONS).find(k => chronicle.dominionOf(world, k) === f && REGIONS[k].settlement);
    if (seat && !(world.realm && world.realm.rulerId === state.characterId)) out.push({ kind: 'ruler', faction: f, target: L.dynasties[f].ruler.name, role: require('./world-life').SEATS[f].title, region: seat, fee: 40000 + 800 * lvlOf(state) });
  }
  return out;
}

function takeContract(state, n) {
  if (state.profession !== 'assassin') return { success: false, message: 'No one offers that work to someone who is not in the trade.' };
  if (state.contract && !state.contract.done) return { success: false, message: `You already hold a contract on ${state.contract.target}.` };
  const world = chronicle.worldOf(state);
  const c = contractsFor(state, world)[n - 1];
  if (!c) return { success: false, message: 'There is no such contract. ("opportunities")' };
  state.contract = { ...c, taken: chronicle.nowDay(world), deadlineDay: chronicle.nowDay(world) + 30 };
  return { success: true, message: `You accept the contract: ${c.target}, ${c.role} of ${label(c.region)}. ${c.fee} copper on proof. Thirty days.` };
}

function carryOut(state, helpers = {}) {
  const c = state.contract;
  const world = chronicle.worldOf(state);
  if (!c || c.done) return { success: false, message: 'You hold no contract.' };
  if (state.character.region !== c.region) return { success: false, message: `${c.target} is in ${label(c.region)}.` };
  if (chronicle.nowDay(world) > c.deadlineDay) { c.done = true; return { success: false, message: 'The contract has lapsed; the client found someone quicker.' } }
  const crime = require('./crime');
  // Skill keeps the clues down; a ruler is guarded.
  const dex = (state.stats && state.stats.dex) || 10;
  const clues = Math.max(0, Math.round((c.kind === 'ruler' ? 70 : 45) - profLvl(state) * 7 - (dex - 10)));
  const res = crime.resolve(state, { type: 'murder', victim: { name: c.target, id: c.npcId || null }, text: `assassinate ${c.target}` }, { heinous: c.kind === 'ruler' ? 10 : 8, clues, removeCompanion: helpers.removeCompanion });
  const lines = [`It is done: ${c.target} is dead.`, ...res.lines];
  if (c.kind === 'npc') {
    const npc = Object.values(REGIONS).flatMap(r => r.npcs || []).find(n => n.id === c.npcId);
    if (npc) crime.killNpc(world, { npc, id: npc.id, name: c.target });
  } else {
    require('./world-life').killRuler(world, c.faction, res.seen ? state.character.name : null);
    if (res.seen) { require('./factions').changeStanding(state, { [c.faction]: -60 }, `the murder of ${c.target}`); lines.push(`${require('./chronicle').FACTION_NAMES[c.faction]} will hunt you for this.`); }
  }
  const fee = res.seen ? Math.round(c.fee * 0.5) : c.fee;
  state.coin = (state.coin || 0) + fee;
  state.profXP = (state.profXP || 0) + 80 + profLvl(state) * 20;
  state.contractsDone = (state.contractsDone || 0) + 1;
  c.done = true;
  lines.push(`${fee} copper${res.seen ? ' — half; the client does not like witnesses' : ''}.`);
  return { success: true, hours: 6, message: lines.join('\n'), seen: res.seen };
}

// ---------------------------------------------
// Smiths: masterworks and reputation
// ---------------------------------------------
function masterworkCost(state) { const n = state.masterworks || 0; return { ore: 6 + n * 2, timber: 2 + Math.floor(n / 2) }; }

function forgeMasterwork(state, text) {
  if (!SMITHS.has(state.profession)) return { success: false, message: 'Masterworks are a smith\'s work.' };
  const k = state.character.region;
  if (!REGIONS[k].settlement) return { success: false, message: 'You need a forge — find a town.' };
  if (profLvl(state) < 2) return { success: false, message: 'You are not yet skilled enough for a masterwork (trade level 2).' };
  const cost = masterworkCost(state);
  const m = state.materials || {};
  if ((m['iron ore'] || 0) < cost.ore || (m.timber || 0) < cost.timber) return { success: false, message: `A masterwork needs ${cost.ore} iron ore and ${cost.timber} timber (you have ${m['iron ore'] || 0} and ${m.timber || 0}).` };
  m['iron ore'] -= cost.ore; m.timber -= cost.timber;
  const armour = /armou?r|plate|mail/i.test(text);
  const ch = require('./character');
  const lvl = lvlOf(state);
  const tierNow = (require('./constants').GEAR_QUALITIES.filter(q => lvl >= q.levelReq).pop() || { tier: 1 }).tier;
  const tier = Math.min(30, tierNow + 1 + Math.floor(profLvl(state) / 2));
  const before = smithRank(state);
  state.masterworks = (state.masterworks || 0) + 1;
  const rank = smithRank(state);
  const name = `${state.character.name}'s masterwork ${armour ? 'plate' : 'blade'}`;
  const item = { ...ch.buildGearItem({ name, tier }, armour), masterwork: true, type: armour ? 'armor' : 'weapon' };
  require('./economy').addItem(state, item);
  state.profXP = (state.profXP || 0) + 120 + profLvl(state) * 25;
  const lines = [`Days at the anvil: ${name} (tier ${tier}). ("equip ${name}")`];
  if (rank !== before) {
    lines.push(`Smiths speak of you now as a ${rank}.`);
    const world = chronicle.worldOf(state);
    if (world && (rank === 'master' || rank === 'grandmaster')) {
      chronicle.addEvent(world, { type: 'founding', importance: 4, title: `${state.character.name} is named ${rank} smith in ${label(k)}`, region: k, actor: chronicle.actorOf(state) }, `smith:${state.characterId}:${rank}`);
      require('./canon').person(world, state.character.name, { titles: [`${rank[0].toUpperCase() + rank.slice(1)} Smith`] });
    }
  }
  return { success: true, hours: 72, message: lines.join('\n') };
}

module.exports = { PORTS, opportunities, commissionFor, takeCommission, careerXP, voyage, voyageDays, buyInn, innTakings, collectInn, innPrice, contractsFor, takeContract, carryOut, forgeMasterwork, masterworkCost, smithRank };
