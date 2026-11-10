'use strict';

// The artwork: weather that follows the land, the season and the day;
// who holds a place (and whether it is occupied); disasters and the work
// of rebuilding; voyages, forges and inns drawn when they happen; clean
// SVG in every combination; and nothing left moving under reduced motion
// or the "Still" toggle.
const { seedRandom, startServer, stopServer, client, createCharacter } = require('./helpers');
const test   = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createFreshState } = require('../game/state');
const ch = require('../game/character');
const chronicle = require('../game/chronicle');
const scene = require('../game/scene');
const art = require('../public/game/art.js');
const { REGIONS } = require('../game/constants');

function hero(region = 'thornwick') {
  const s = createFreshState();
  s.creation.phase = 5;
  s.character = { name: 'Brush', age: 30, gender: 'female', region, appearance: 'tall, dark hair' };
  s.stats = ch.calculateStats(25, 'farmer', 'average');
  s.totalXP = ch.getXPForLevel(10); ch.recalculateResources(s); s.hp = s.maxHp;
  s.characterId = 'c_brush';
  chronicle.bindCharacter(s, chronicle.createWorld({}));
  return s;
}

test('weather follows the land and the season, and is the same for everyone that day', () => {
  const tally = {};
  for (const [k, biome] of Object.entries(scene.BIOMES)) {
    for (const season of ['spring', 'summer', 'autumn', 'winter']) for (let d = 0; d < 120; d++) {
      const w = scene.weatherOf(k, biome, season, d);
      assert.equal(scene.weatherOf(k, biome, season, d), w, 'deterministic');
      const key = `${biome}:${season}:${w}`; tally[key] = (tally[key] || 0) + 1;
      if (['void', 'throne', 'volcanic'].includes(biome)) assert.ok(![ 'rain', 'snow', 'storm'].includes(w), `${biome} never rains`);
      if (['desert', 'saltflat'].includes(biome)) assert.ok(!['rain', 'snow', 'storm'].includes(w), `${biome} stays dry`);
      if (season === 'summer' && w === 'snow') assert.ok(['snow'].includes(biome), `no summer snow in ${biome}`);
    }
  }
  const count = (re) => Object.entries(tally).filter(([k]) => re.test(k)).reduce((t, [, v]) => t + v, 0);
  assert.ok(count(/^farmland:autumn:rain/) > 0 && count(/^snow:winter:snow/) > 0 && count(/^desert:summer:dust/) > 0 && count(/storm/) > 0, 'rain, snow, dust and storms all happen');
  assert.ok(count(/^farmland:autumn:(rain|storm)/) > count(/^farmland:summer:(rain|storm)/), 'autumn is wetter than summer');
});

test('scene descriptors show who holds a place, disasters, and the new kinds of event', () => {
  const s = hero('thornwick');
  const w = chronicle.worldOf(s);
  const native = REGIONS.thornwick.npcs[0].faction;
  const occ = native === 'choir' ? 'wardens' : 'choir';
  chronicle.setDominion(w, 'thornwick', occ, 'test');
  const wl = require('../game/world-life');
  wl.strike(w, 'thornwick', wl.DISASTERS[1], []);
  s.inn = { region: 'thornwick', since: 0, lastCollected: 0 };
  const sc = scene.buildScene(s, { events: [{ type: 'rebuild' }, { type: 'masterwork' }, { type: 'voyage', storm: true, pirates: true }] });
  assert.deepEqual(sc.banner, { faction: occ, occupied: true });
  assert.equal(sc.disaster.kind, 'fire');
  assert.ok(sc.rebuilding && sc.forge && sc.ownInn && sc.voyage.storm && sc.voyage.pirates);
  assert.ok(['rebuild', 'craft', 'voyage'].every(t => sc.events.some(e => e.type === t)));
  const svg = art.scene(sc);
  assert.match(svg, /class="ea-sea"/); assert.match(svg, /ea-pirates/); assert.match(svg, /data-weather="storm"/);
  const land = art.scene({ ...sc, voyage: null });
  assert.match(land, new RegExp(`class="ea-banner" data-faction="${occ}" data-occupied="1"`));
  assert.equal((land.match(/class="ea-banner"/g) || []).length, 2, 'an occupier\'s banner at every gate');
  assert.match(land, /class="ea-disaster" data-kind="fire"/);
  assert.match(land, /ea-scaffold/); assert.match(land, /ea-forge/); assert.match(land, /ea-inn-sign/);
  // A native power flies one banner; a lawless place none.
  chronicle.setDominion(w, 'thornwick', native, 'test');
  assert.equal((art.scene(scene.buildScene(s, {})).match(/class="ea-banner"/g) || []).length, 1);
});

test('every biome, weather, season, time, disaster and mood draws clean SVG', () => {
  const s = hero();
  const base = scene.buildScene(s, {});
  const weathers = [null, 'overcast', 'rain', 'storm', 'snow', 'dust', 'fog', 'cold', 'heat', 'void', 'blight', 'miasma'];
  let n = 0;
  for (const biome of new Set(Object.values(scene.BIOMES))) for (const weather of weathers) for (const timeOfDay of ['dawn', 'afternoon', 'dusk', 'night']) {
    const sc = { ...base, biome, weather, timeOfDay, season: ['spring', 'summer', 'autumn', 'winter'][n % 4], disaster: n % 5 === 0 ? { kind: ['flood', 'fire', 'plague', 'quake', 'famine'][n % 5 === 0 ? (n / 5) % 5 : 0], progress: n % 100 } : null, banner: n % 3 ? { faction: ['wardens', 'compact', 'remnant', 'choir'][n % 4], occupied: n % 2 === 0 } : null, mood: ['calm', 'combat', 'death', 'grim'][n % 4] };
    const svg = art.scene(sc);
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), `${biome}/${weather}`);
    assert.doesNotMatch(svg, /undefined|NaN|Infinity|\[object Object\]/, `${biome}/${weather}/${timeOfDay}`);
    n++;
  }
  assert.ok(n > 500, `${n} combinations`);
});

test('nothing keeps moving under reduced motion or the Still toggle', () => {
  const css = fs.readFileSync(path.join(__dirname, '../public/styles/utilities.css'), 'utf8');
  // Every selector that animates, as the list of classes it names.
  const animated = [...css.matchAll(/^([^@{}\n]*\.ea-[^{}\n]*)\{[^}]*animation:\s*(?!none)/gm)]
    .flatMap(m => m[1].split(',').map(sel => (sel.match(/\.(ea-[\w-]+)/g) || []).map(c => c.slice(1)))).filter(l => l.length);
  assert.ok(animated.length >= 10, `animated classes found (${animated.length})`);
  const reduced = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\}\s*\}?/g)].map(m => m[1]).join(' ');
  const still = (css.match(/^\.ea-still-mode[^{]*\{/m) || [''])[0];
  for (const classes of animated) {
    assert.ok(classes.some(c => new RegExp(`\\.${c}\\b`).test(reduced)), `${classes.join('.')} stops under prefers-reduced-motion`);
    assert.ok(classes.some(c => still.includes(`.ea-still-mode .${c},`) || still.includes(`.ea-still-mode .${c} `)), `${classes.join('.')} stops under the Still toggle`);
  }
  const view = fs.readFileSync(path.join(__dirname, '../public/game/scene-view.js'), 'utf8');
  assert.match(view, /classList\.toggle\('ea-still-mode', still\)/, 'the view applies Still mode to the scene');
});

test('over the API: a voyage and a rebuilding are drawn as they happen', async () => {
  seedRandom(8);
  const { base, sessions } = await startServer();
  try {
    const c = client(base);
    const g = await c.post('/auth/guest', {}); c.sessionId = g.sessionId;
    await createCharacter(c, { name: 'Prow' });
    const st = () => sessions.get(c.sessionId).state;
    Object.assign(st(), { profession: 'sailor', professionLevel: 2 });
    st().totalXP = ch.getXPForLevel(15); ch.recalculateResources(st());
    st().character.region = 'ironport';
    const v = await c.act('sign on for a voyage to Salten Bay');
    assert.ok(v.scene && v.scene.voyage, 'the scene is at sea');
    assert.ok(v.scene.events.some(e => e.type === 'voyage'));
    if (st().inCombat) { st().inCombat = false; st().currentEnemy = null; }
    const wl = require('../game/world-life');
    wl.strike(chronicle.worldOf(st()), 'saltenbay', wl.DISASTERS[0], []);
    const r = await c.act('help rebuild');
    assert.ok(r.scene && r.scene.rebuilding && r.scene.disaster && r.scene.disaster.kind === 'flood', JSON.stringify(r.scene && { reb: r.scene.rebuilding, d: r.scene.disaster }));
  } finally { await stopServer(); }
});
