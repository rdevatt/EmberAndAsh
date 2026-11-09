'use strict';

// =============================================================
// High-level playtest over the real API (isolated temp DB).
// Controlled fixtures put a character at level 150 / 200 / 300 / 500
// (XP, stats, class, gear and a finished campaign — setup only); from
// there everything is played through /api/action: rift dives, ascendant
// sagas and crises. Reports win rates, rounds, deaths, XP per action,
// the real number of actions one level costs, enemy mechanics seen, and
// a save/restart integrity check.
//
// Usage: node scripts/high-level-playtest.js [--levels 150,200,300,500] [--class fighter] [--dives 8] [--sagas 2]
// =============================================================

const path = require('path');
const h = require(path.join(__dirname, '..', 'tests', 'helpers'));
const G = p => require(path.join(__dirname, '..', 'game', p));
const ch = G('character'); const XP = G('character/xp'); const T = G('combat-tactics');
const chronicle = G('chronicle'); const endless = G('endless');
const { CLASSES, GEAR_QUALITIES, REGIONS } = G('constants');
const { BUILDS } = require('./lib/builds');

const argv = process.argv.slice(2); const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const LEVELS = arg('--levels', '150,200,300,500').split(',').map(Number);
const CLS = arg('--class', 'fighter');
const DIVES = parseInt(arg('--dives', '8'), 10);
const SAGAS = parseInt(arg('--sagas', '2'), 10);
h.seedRandom(parseInt(arg('--seed', '31'), 10));

function tierFor(level) { let t = 0; for (const q of GEAR_QUALITIES) if (level >= q.levelReq) t = q.tier; return t; }

// Fixture: a finished campaign hero at `level`, built like a player of CLS would.
function fixture(s, level) {
  const b = BUILDS[CLS];
  s.totalXP = ch.getXPForLevel(level);
  s.stats = ch.calculateStats(25, b.bg, 'average');
  for (let i = 1; i < level; i++) s.stats[b.stats[i % b.stats.length]]++;
  s.combatClass = CLS; s.classLevel = 5;
  for (let l = 1; l < 5; l++) for (const [k, v] of Object.entries(CLASSES[CLS].statPerLevel || {})) s.stats[k] += v;
  const t = tierFor(level);
  s.gear = { weapon: ch.buildGearItem({ name: b.weapon, tier: t }, false), armor: ch.buildGearItem({ name: b.armor, tier: t }, true) };
  s.maxHp = s.maxMana = s.maxStamina = 0; ch.recalculateResources(s);
  s.hp = s.maxHp; s.mana = s.maxMana; s.stamina = s.maxStamina;
  s.coin = 50000000;
  s.inventory = Array.from({ length: 6 }, () => ({ name: 'healing potion', type: 'potion', heal: 0.4 }));
  Object.assign(s.campaign, { chapter: null, step: 0, completed: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], ending: 'rekindle', postgame: true, afterEnding: 'continue', unlocked: ['shattered_throne'], riftDepth: Math.max(0, Math.round((level - 92) / 2) - 3) });
  const w = chronicle.worldOf(s);
  if (!w.ending) chronicle.applyEnding(w, s, 'rekindle');
}

async function main() {
  const { base, sessions } = await h.startServer();
  const results = [];
  for (const L of LEVELS) {
    const c = h.client(base);
    const g = await c.post('/auth/guest', {}); c.sessionId = g.sessionId;
    await h.createCharacter(c, { name: `Legend${L}` });
    const s = () => sessions.get(c.sessionId).state;
    fixture(s(), L);
    s().character.region = 'shattered_throne';
    let actions = 0, deaths = 0;
    const xp0 = XP.toBig(s().totalXP);
    const mech = { telegraph: 0, special: 0, phase: 0, affixLines: 0, wards: 0 };
    const act = async (input) => {
      actions++;
      const r = await c.act(input);
      const out = r.output || '';
      if (/— DARKNESS —/.test(out)) deaths++;
      if (/defend to blunt/.test(out)) mech.telegraph++;
      if (/unleashes/.test(out)) mech.special++;
      if (/^⚠ (?!.*defend)/m.test(out)) mech.phase++;
      if (/The ground burns|drinks \d+ of your mana/.test(out)) mech.affixLines++;
      if (/absorbed by its ward/.test(out)) mech.wards++;
      return r;
    };
    // After a death the legend walks back and picks up their gear, as a player would.
    const afterDeath = async () => {
      const st = s();
      if (st.savedGear || (st.deathLocation && st.deathLocation !== st.character.region)) {
        st.character.region = st.deathLocation || st.character.region; st.inCombat = false;
        await act('recover my gear');
      }
    };
    const fight = async () => {
      const d0 = deaths;
      const r = await fightInner();
      if (deaths > d0) await afterDeath();
      return r;
    };
    const fightInner = async () => {
      let last = '', rounds = 0;
      while (s().inCombat && rounds < 150) {
        const st = s();
        let input = 'I feint left and slash at its torso with a quick, precise strike';
        const ready = T.buildAbilityList(st).filter(a => a.ready && a.id !== 'power_attack' && (a.cost.mana || 0) <= st.mana && (a.cost.stamina || 0) <= st.stamina);
        if (/defend to blunt/.test(last)) input = 'I raise my guard and defend';
        else if (st.hp < st.maxHp * 0.35 && st.inventory.some(i => /healing potion/.test(i.name || i))) input = 'drink healing potion';
        else {
          const heal = ready.find(a => /heal|second wind|lay on|inner peace|regrowth/i.test(a.label));
          const strike = ready.find(a => !/heal|second wind|lay on|inner peace|regrowth|blood|ward|sanctuary|divine shield/i.test(a.label));
          if (heal && st.hp < st.maxHp * 0.5) input = `I use ${heal.label}`;
          else if (strike) input = `I use ${strike.label}`;
        }
        const r = await act(input); last = r.output || ''; rounds++;
      }
      return rounds;
    };
    // Rift dives
    const dive = { tried: 0, won: 0, rounds: 0, xp: 0n, startDepth: s().campaign.riftDepth + 1, levels: [] };
    for (let d = 0; d < DIVES; d++) {
      const st = s(); st.hp = st.maxHp; st.mana = st.maxMana; st.stamina = st.maxStamina;   // the hero rests between dives (camp at the Throne)
      st.character.region = 'shattered_throne'; st.inCombat = false;                       // and walks back after a death
      while (st.inventory.filter(i => /healing potion/.test(i.name || i)).length < 4) st.inventory.push({ name: 'healing potion', type: 'potion', heal: 0.4 });
      const before = XP.toBig(st.totalXP);
      const r = await act('enter the rift');
      if (!s().inCombat) { dive.note = (r.output || '').slice(0, 80); break; }
      dive.levels.push(s().currentEnemy.level);
      dive.tried++;
      const d0 = deaths;
      dive.rounds += await fight();
      if (deaths === d0) dive.won++;
      dive.xp += XP.toBig(s().totalXP) - before;
    }
    // Ascendant sagas
    const saga = { done: 0, actions: 0, xp: 0n };
    s().character.region = 'the_core_wastes';
    for (let k = 0; k < SAGAS; k++) {
      const a0 = actions; const x0 = XP.toBig(s().totalXP);
      const start = await act('sagas');
      for (let guard = 0; guard < 40 && s().saga; guard++) {
        const sg = s().saga; const step = sg.steps[sg.step];
        if (s().character.region !== step.region) { s().character.region = step.region; await act('look around'); endless.onSagaEvent(s(), chronicle.worldOf(s()), { type: 'arrived', region: step.region }); continue; }
        const typed = (step.objective.match(/type "([^"]+)"/) || [])[1];
        const st = s(); st.hp = st.maxHp; st.mana = st.maxMana; st.stamina = st.maxStamina;   // a careful player rests between steps
        await act(typed);
        if (s().inCombat) await fight();
      }
      if (!s().saga) { saga.done++; saga.actions += actions - a0; saga.xp += XP.toBig(s().totalXP) - x0; }
      if (!start) break;
    }
    // Save / restart integrity
    const before = { xp: String(s().totalXP), lvl: ch.getPlayerLevel(s().totalXP), hour: chronicle.nowHour(chronicle.worldOf(s())), depth: s().campaign.riftDepth, gearTier: s().gear.weapon && s().gear.weapon.tier };
    await c.act('map');
    sessions.clear();
    const st2 = await c.get('/state');
    const after = { xp: String(sessions.get(c.sessionId).state.totalXP), lvl: st2.character.level, hour: chronicle.nowHour(chronicle.worldOf(sessions.get(c.sessionId).state)), depth: sessions.get(c.sessionId).state.campaign.riftDepth, gearTier: sessions.get(c.sessionId).state.gear.weapon && sessions.get(c.sessionId).state.gear.weapon.tier };
    const gained = XP.toBig(s().totalXP) - xp0;
    const perAction = actions ? Number(gained) / actions : 0;
    const cost = XP.levelCost(L);
    results.push({
      level: L, class: CLS, gear: GEAR_QUALITIES[tierFor(L)].label, hp: s().maxHp,
      rift: { depths: `${dive.startDepth}–${dive.startDepth + dive.tried - 1}`, echoLevels: dive.levels.length ? `${Math.min(...dive.levels)}–${Math.max(...dive.levels)}` : '-', won: `${dive.won}/${dive.tried}`, roundsPerFight: dive.tried ? +(dive.rounds / dive.tried).toFixed(1) : 0, xpPerDive: dive.tried ? Number(dive.xp / BigInt(dive.tried)) : 0, note: dive.note },
      sagas: { done: saga.done, actionsEach: saga.done ? Math.round(saga.actions / saga.done) : 0, xpEach: saga.done ? Number(saga.xp / BigInt(saga.done)) : 0 },
      deaths, actions, xpPerAction: Math.round(perAction), levelCost: String(cost), actionsPerLevel: perAction ? Math.round(Number(cost) / perAction) : null,
      mechanics: mech,
      saveRestart: JSON.stringify(before) === JSON.stringify(after) ? 'identical' : { before, after },
      numbersFinite: Number.isFinite(s().hp) && Number.isFinite(s().maxHp) && /^\d+$/.test(String(s().totalXP))
    });
    console.log(JSON.stringify(results[results.length - 1]));
  }
  await h.stopServer();
}

main().catch(e => { console.error(e); process.exit(1); });
