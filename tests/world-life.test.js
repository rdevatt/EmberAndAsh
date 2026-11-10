'use strict';

// The yearly life of the world: seats of power and their succession
// (heirs, regencies, disputed claims), population and prosperity, prices
// and why, faiths and schools of magic, disasters and rebuilding,
// institutions, rivalries of legends, decrees of former heroes who rule,
// and what occupation looks like on the ground. Plus: a newcomer in an
// ancient world is not thrown to monsters beyond their level.
const { seedRandom, startServer, stopServer, client, createCharacter } = require('./helpers');
const test   = require('node:test');
const assert = require('node:assert/strict');
const { createFreshState } = require('../game/state');
const ch = require('../game/character');
const chronicle = require('../game/chronicle');
const wl = require('../game/world-life');
const politics = require('../game/politics');
const shop = require('../game/shop');
const { spawnEnemy } = require('../game/combat');
const { REGIONS } = require('../game/constants');

function hero(name = 'Wren', level = 10) {
  const s = createFreshState();
  s.creation.phase = 5;
  s.character = { name, age: 30, gender: 'female', background: 'farmer', region: 'thornwick' };
  s.stats = ch.calculateStats(25, 'farmer', 'average');
  s.totalXP = ch.getXPForLevel(level);
  ch.recalculateResources(s); s.hp = s.maxHp;
  s.coin = 5000;
  s.characterId = `c_${name.toLowerCase()}`;
  s.campaign = { flags: {}, choices: {}, completed: [], startRegion: 'thornwick' };
  chronicle.bindCharacter(s, chronicle.createWorld({}));
  return { s, w: chronicle.worldOf(s) };
}
const years = (s, n) => chronicle.advanceTime(s, n * 360 * 24);
const potion = (s) => shop.getShopStock(s).find(x => x.key === 'potion').price;

test('three centuries of rulers: every seat passes on; heirs, regencies and disputed claims happen', () => {
  let regencies = 0, disputes = 0;
  for (const name of ['Ansel', 'Brisa', 'Cato', 'Dovi']) {
    const { s, w } = hero(name);
    const start = Object.fromEntries(Object.entries(wl.ensure(w).dynasties).map(([f, d]) => [f, d.ruler.name]));
    assert.equal(start.remnant, 'Aurelian Aurel', 'the Sun Throne begins with Seraphine\'s cousin');
    years(s, 300);
    const L = wl.ensure(w);
    for (const [f, d] of Object.entries(L.dynasties)) {
      assert.ok(d.line.length >= 4, `${f}: ${d.line.length} holders in 300 years`);
      const age = Math.floor((chronicle.nowDay(w) - d.ruler.born) / 360);
      assert.ok(age >= 0 && age < 100, `${f}: a living ruler (${age})`);
      assert.match(politics.leaderOf(w, f).name, new RegExp(d.ruler.name), 'the power is led by a named person, not a faceless council');
    }
    const ledger = w.canon.ledger;
    regencies += ledger.filter(r => /rules as regent/.test(r.x || '')).length;
    disputes += ledger.filter(r => /disputes .* right to the/.test(r.s)).length;
    assert.ok(w.canon.reigns.filter(r => r.how === 'succession').length >= 16, 'reigns recorded in the canon');
    assert.ok(w.canon.reigns.every(r => r.ruler !== 'unknown'), 'only real changes of ruler are reigns');
    assert.ok(ledger.some(r => /Speakership of the Free Towns passes to/.test(r.s)), 'the Free Towns elect');
  }
  assert.ok(regencies >= 1, `a child on a throne, with a regent (${regencies})`);
  assert.ok(disputes >= 1, `a contested succession (${disputes})`);
});

test('a ruler set by a story is honoured by the dynasty', () => {
  const { s, w } = hero('Corra');
  wl.ensure(w);
  w.factionLeaders = { remnant: 'Seraphine Aurel' };
  years(s, 1);
  assert.equal(wl.rulerOf(w, 'remnant').name, 'Seraphine Aurel');
});

test('people: places grow and dwindle, within what the land can feed', () => {
  const { s, w } = hero('Dace');
  years(s, 200);
  const towns = Object.keys(REGIONS).filter(k => REGIONS[k].settlement);
  for (const k of towns) {
    const e = wl.econ(w, k);
    assert.ok(e.pop >= 10 && e.pop <= e.cap, `${k}: ${e.pop}/${e.cap}`);
  }
  const sizes = new Set(towns.map(k => wl.sizeOf(wl.econ(w, k).pop)));
  assert.ok(sizes.size >= 3, `hamlets to cities (${[...sizes]})`);
  assert.ok(w.canon.ledger.some(r => /grows into a|dwindles to a/.test(r.s)), 'growth and decline are recorded');
});

test('prices answer to the world: ruin, occupation, decrees — and friends of the occupier pay no levy', () => {
  const { s, w } = hero('Ebba');
  const base = potion(s);
  w.settlements.thornwick = { status: 'ruined', since: chronicle.nowDay(w) };
  const ruined = potion(s);
  assert.ok(ruined >= base * 1.4, `ruin makes goods scarce (${base} → ${ruined})`);
  delete w.settlements.thornwick;
  const native = REGIONS.thornwick.npcs[0].faction;
  const occ = native === 'choir' ? 'remnant' : 'choir';
  chronicle.setDominion(w, 'thornwick', occ, 'test');
  assert.equal(wl.occupiedBy(w, 'thornwick'), occ);
  const levied = wl.priceIndex(w, 'thornwick', s);
  assert.ok(levied.mult >= 1.1 && levied.reasons.some(r => /levy/.test(r)), JSON.stringify(levied));
  s.factions = { ...(s.factions || {}), [occ]: 30 };
  assert.ok(!wl.priceIndex(w, 'thornwick', s).reasons.some(r => /levy/.test(r)), 'friends of the occupier are not levied');
  assert.match(wl.sceneLine(s), /held by .* not its own people/);
});

test('faiths and schools of magic rise, spread, are put down and fade', () => {
  let arose = 0, spread = 0, persecuted = 0, faded = 0;
  for (const name of ['Fen', 'Gale', 'Hob']) {
    const { s, w } = hero(name);
    years(s, 300);
    const L = w.canon.ledger.filter(r => r.t === 'movement');
    arose += L.filter(r => / arise in /.test(r.s)).length;
    spread += L.filter(r => / spread to /.test(r.s)).length;
    persecuted += L.filter(r => / put down /.test(r.s)).length;
    faded += L.filter(r => / fade from the world/.test(r.s)).length;
    for (const m of wl.ensure(w).movements) assert.ok(m.regions.length <= 8 && m.strength >= 0 && m.strength <= 100);
  }
  assert.ok(arose >= 3 && spread >= 5 && persecuted >= 1 && faded >= 1, JSON.stringify({ arose, spread, persecuted, faded }));
});

test('a disaster, and the player helping to rebuild: progress, honest pay, and a name in the record', () => {
  const { s, w } = hero('Ilse', 20);
  const out = [];
  const pop0 = wl.econ(w, 'thornwick').pop;
  const d = wl.strike(w, 'thornwick', wl.DISASTERS[0], out);
  assert.ok(wl.econ(w, 'thornwick').pop < pop0, 'people are lost');
  assert.equal(w.settlements.thornwick.status, 'struggling');
  assert.match(wl.sceneLine(s), /Great Flood of Thornwick Valley.*rebuilding 0% done/);
  const xp0 = ch.getPlayerLevel(s.totalXP);
  const road0 = require('../game/morality').value(s);
  const r1 = wl.helpRebuild(s, 'help rebuild');
  assert.ok(r1.success && d.progress > 0 && r1.hours === 8);
  assert.ok(require('../game/morality').value(s) > road0, 'a good deed');
  let xpAwards = 1;
  for (let i = 0; i < 30 && d.progress < 100; i++) { const r = wl.helpRebuild(s, 'help rebuild'); if (/XP/.test(r.message)) xpAwards++; }
  assert.ok(xpAwards <= 12, `pay is capped (${xpAwards})`);
  assert.equal(d.progress, 100);
  assert.ok(w.canon.ledger.some(r => /is rebuilt after/.test(r.s) && /Ilse/.test(r.x || '')), 'remembered for the rebuilding');
  assert.equal(w.settlements.thornwick.status, 'rebuilding');
  assert.ok(ch.getPlayerLevel(s.totalXP) >= xp0);
  assert.match(wl.helpRebuild(s, 'help rebuild').message, /Nothing in Thornwick Valley needs rebuilding/);
  // Coin helps too.
  const d2 = wl.strike(w, 'thornwick', wl.DISASTERS[1], out);
  const coin = s.coin;
  const r2 = wl.helpRebuild(s, 'donate 600 to rebuild');
  assert.ok(r2.success && s.coin === coin - 600 && d2.progress > 0);
  assert.match(wl.helpRebuild(s, 'donate 10 to rebuild').message, /at least 50/);
});

test('an order the player founds becomes a living institution that outlives them', () => {
  const { s, w } = hero('Jory', 120);
  s.coin = 600000;
  const r = require('../game/endless').foundOrder(s, w, 'the Order of the Ashen Lamp');
  assert.ok(r.success, r.message);
  const org = w.organizations[0];
  // It grows into a school within a lifetime, through good years and bad.
  let y = 0;
  while (org.members <= 60 && y < 80) { years(s, 5); y += 5; }
  assert.ok(org.members > 60, `it grows (${org.members} after ${y} years)`);
  assert.ok(['a school', 'a college', 'a great institution'].includes(org.rank), org.rank);
  assert.ok(w.canon.ledger.some(x => /Order of the Ashen Lamp grows into/.test(x.s)));
  // The founder dies; the order chooses a new master.
  chronicle.recordFigure(w, s, { status: 'deceased' });
  years(s, 1);
  assert.notEqual(org.master, 'Jory');
  assert.ok(w.canon.ledger.some(x => /becomes master of the Order of the Ashen Lamp after Jory/.test(x.s)));
  // Training under its masters is faster.
  s.character.region = org.seat;
  const t = require('../game/endless').train(s, w, 'train strength for 1 month');
  assert.match(t.message, /under the masters of the Order of the Ashen Lamp/);
  // Ruin empties it.
  w.settlements[org.seat] = { status: 'ruined', since: chronicle.nowDay(w) };
  for (let i = 0; i < 40 && org.status !== 'closed'; i++) { w.settlements[org.seat].status = 'ruined'; require('../game/world-life').yearly(w, null); }
  assert.equal(org.status, 'closed');
});

test('legends: rivalries between old heroes, and a former hero who rules makes law', () => {
  const { s, w } = hero('Kass', 150);
  s.campaign.flags.ownKey = true;
  chronicle.applyEnding(w, s, 'imperium');                     // Kass rules the Imperium
  const other = hero('Lorne', 140).s;
  other.characterId = 'c_lorne';
  chronicle.recordFigure(w, other, { title: 'the Wanderer', role: 'legend' });
  const third = hero('Mira', 130).s;
  third.characterId = 'c_mira';
  chronicle.recordFigure(w, third, { title: 'the Lantern', role: 'legend' });
  const next = hero('Newt').s;
  chronicle.attachWorld(next, w); next.characterId = 'c_newt';
  years(next, 60);
  const L = wl.ensure(w);
  assert.ok(L.rivalries.length >= 1, 'rivalries');
  assert.ok(w.canon.ledger.some(r => r.t === 'rivalry' && /outwits|shames|beats|outbids|turns the people/.test(r.s)), 'they clash');
  assert.ok(w.canon.ledger.some(r => /^Kass decrees that/.test(r.s)), 'the old hero rules');
  // A decree changes prices in the realm's lands.
  L.decrees.push({ by: 'Kass', faction: 'remnant', text: 'a war levy is raised', price: 1.15, from: chronicle.nowDay(w), until: chronicle.nowDay(w) + 360 });
  const k = Object.keys(REGIONS).find(x => chronicle.dominionOf(w, x) === 'remnant');
  assert.ok(wl.priceIndex(w, k, next).reasons.some(r => /Kass's decree/.test(r)));
});

test('a newcomer in an ancient world meets foes of their own level near home', () => {
  seedRandom(77);
  const { s, w } = hero('Old', 200);
  years(s, 300);
  const n = createFreshState();
  n.creation.phase = 5;
  n.character = { name: 'Pip', age: 17, region: 'thornwick' };
  n.stats = ch.calculateStats(17, 'farmer', 'average');
  n.totalXP = 0; ch.recalculateResources(n);
  chronicle.attachWorld(n, w); n.characterId = 'c_pip';
  const [lo, hi] = REGIONS.thornwick.levelRange;
  for (let i = 0; i < 50; i++) {
    const e = spawnEnemy('thornwick', 1);
    assert.ok(e.level <= hi + 2, `level ${e.level} in a ${lo}-${hi} region`);
  }
  for (const c of w.crises.filter(x => x.status === 'active')) assert.ok(c.level <= REGIONS[c.region].levelRange[1] + 4);
  assert.ok(w.canon.ledger.length > 1000, 'and the world has a long history');
});

test('over the API: news, an occupation on arrival, the resistance on the board, rebuilding', async () => {
  seedRandom(5);
  const { base, sessions } = await startServer();
  try {
    const c = client(base);
    const g = await c.post('/auth/guest', {}); c.sessionId = g.sessionId;
    await createCharacter(c, { name: 'Quinn' });
    const st = () => sessions.get(c.sessionId).state;
    const w = chronicle.worldOf(st());
    const news = await c.act('news');
    assert.match(news.output, /HOW THINGS STAND[\s\S]*THE SEATS OF POWER[\s\S]*Sun-Monarch Aurelian Aurel/);
    // Occupy the next region on the road and travel there.
    const here = st().character.region;
    const dest = (REGIONS[here].adjacent || [])[0];
    const native = REGIONS[dest].npcs && REGIONS[dest].npcs[0] && REGIONS[dest].npcs[0].faction;
    assert.ok(native && REGIONS[dest].hasBountyBoard, 'setup: the next region has its own people and a board');
    {
      const occ = native === 'choir' ? 'wardens' : 'choir';
      chronicle.setDominion(w, dest, occ, 'test');
      st().character.region = dest;
      require('../game/quests').refreshBoard(st());
      const board = st().boardQuests || [];
      assert.ok(board.some(q => /^Resistance: watch the/.test(q.label) && q.factionReward), 'the resistance posts work');
      st().character.region = here;
      let r = await c.act(`travel to ${REGIONS[dest].label}`);
      let seen = r.output || '';
      for (let i = 0; i < 30 && st().character.region !== dest; i++) {
        if (st().inCombat) { st().inCombat = false; st().currentEnemy = null; }
        r = await c.act('continue');
        seen += r.output || '';
      }
      assert.equal(st().character.region, dest);
      assert.match(seen, new RegExp(`${REGIONS[dest].label} is held by .*not its own people`), 'the occupation is seen on arrival');
    }
    // A disaster here; help rebuild through the command.
    const out = [];
    wl.strike(w, st().character.region, wl.DISASTERS[2], out);
    if (st().inCombat) { st().inCombat = false; st().currentEnemy = null; }
    const h = await c.act('help rebuild');
    assert.match(h.output, /rebuilding is \d+% done/);
    const n2 = await c.act('news');
    assert.match(n2.output, /The Grey Cough/);
  } finally { await stopServer(); }
});

test('a player who rules: governing becomes law, with prices and rebuilding to show for it', () => {
  const { s, w } = hero('Rook', 150);
  s.campaign.flags.ownKey = true;
  chronicle.applyEnding(w, s, 'imperium');
  const k = Object.keys(REGIONS).find(x => chronicle.dominionOf(w, x) === 'remnant' && REGIONS[x].settlement);
  const d = wl.strike(w, k, wl.DISASTERS[3], []);
  const before = d.progress;
  const r = require('../game/endless').govern(s, w, 'for prosperity');
  assert.ok(r.success, r.message);
  assert.match(r.message, /Your decree: the tolls are cut/);
  assert.ok(d.progress >= before + 30, 'the crown funds the rebuilding');
  assert.ok(wl.priceIndex(w, k, s).reasons.some(x => /Rook's decree/.test(x)));
});
