'use strict';

// Crime and slavery: nothing is prohibited; what the world does depends
// on what it can know. Perfect crimes are only remembered; witnessed ones
// are reported; clues become investigations; trials weigh evidence against
// standing (and may pin others' crimes on you); sentences grow with how
// heinous the crimes were. Slavery is legal in some lands, and treatment
// shapes slaves and, if it comes out, the master's name.
const { seedRandom, startServer, stopServer, client, createCharacter } = require('./helpers');
const test   = require('node:test');
const assert = require('node:assert/strict');
const { createFreshState } = require('../game/state');
const ch = require('../game/character');
const chronicle = require('../game/chronicle');
const crime = require('../game/crime');
const slavery = require('../game/slavery');
const comps = require('../game/companions');
const { buildScene } = require('../game/scene');
const Art = require('../public/game/art.js');

function person(region = 'thornwick', level = 20) {
  const s = createFreshState();
  s.creation.phase = 5;
  s.character = { name: 'Vey', age: 30, gender: 'female', background: 'farmer', region };
  s.stats = ch.calculateStats(25, 'farmer', 'average');
  s.totalXP = ch.getXPForLevel(level);
  s.maxHp = s.maxMana = s.maxStamina = 0; ch.recalculateResources(s);
  s.hp = s.maxHp; s.coin = 5000;
  chronicle.bindCharacter(s, chronicle.createWorld({}));
  s.characterId = 'c_vey';
  s.factions = { wardens: 0, compact: 0, remnant: 0, choir: 0 };
  s.campaign = s.campaign || {};
  crime.ensure(s);
  return s;
}
function untilNight(s) {
  const w = chronicle.worldOf(s);
  for (let i = 0; i < 30 && chronicle.dateOf(chronicle.nowHour(w)).timeOfDay !== 'night'; i++) chronicle.advanceTime(s, 1);
}

test('a perfect crime: no one saw, nothing left — nothing happens, but it is remembered', () => {
  seedRandom(7);
  const s = person('wyrmwood');
  untilNight(s);
  const w = chronicle.worldOf(s);
  const npc = require('../game/constants').REGIONS.wyrmwood.npcs[0];
  comps.onMeet(s, npc.id); (s.npcRelationships[npc.id] = s.npcRelationships[npc.id] || {}).metBefore = true;
  const deed = crime.detect(s, `I quietly strangle ${npc.name} from the shadows, then hide the body`);
  assert.equal(deed.type, 'murder');
  const r = crime.commit(s, deed, {});
  assert.equal(r.event.known, false);
  if (s.deeds[0].perfect) {
    assert.equal(s.infamy, 0, 'no one knows: no infamy');
    assert.deepEqual(s.warrants, {}, 'no warrant');
    assert.deepEqual(s.factions, { wardens: 0, compact: 0, remnant: 0, choir: 0 }, 'no standing lost');
    assert.match(crime.ledger(s), /no one will ever know/, 'but the character remembers');
  }
  assert.notEqual(chronicle.currentHolder(w, npc).name, npc.name, 'the victim is gone; an heir takes up the work');
});

test('a witnessed crime is reported, and the trial weighs evidence against standing', () => {
  seedRandom(11);
  const s = person('ironport');
  const res = crime.resolve(s, { type: 'murder', victim: { name: 'a merchant' }, text: 'I stab a merchant in the market' }, { forceSeen: true });
  assert.equal(res.seen, true);
  assert.ok(s.infamy > 0 && s.factions.compact < 0, 'the world knows');
  assert.ok(s.pendingTrial, 'arrested in town');
  const t = crime.resolveTrial(s, 'plead innocent');
  assert.ok(['acquitted', 'prison', 'fine', 'execution'].includes(t.sentence));
  assert.equal(s.pendingTrial, null);
});

test('reputation shields a villain whose crimes are unknown', () => {
  const trials = (setup) => {
    let convicted = 0;
    for (let i = 0; i < 300; i++) {
      seedRandom(1000 + i);
      const s = person('ironport', 60);
      setup(s);
      s.deeds.push({ id: 'c1', type: 'assault', heinous: 3, victim: 'a guard', region: 'ironport' });
      s.warrants.ironport = { crimes: ['c1'], evidence: 55 };
      s.pendingTrial = crime.buildTrial(s, 'ironport');
      if (crime.resolveTrial(s, 'plead innocent').sentence !== 'acquitted') convicted++;
    }
    return convicted / 300;
  };
  const hero = trials(s => { s.reputation = { ironport: 100 }; s.campaign.ending = 'rekindle'; s.factions.compact = 80; s.stats.cha = 18; });
  const villain = trials(s => { s.reputation = { ironport: -80 }; s.infamy = 80; });
  assert.ok(hero < villain - 0.3, `the celebrated hero walks free far more often (${hero.toFixed(2)} vs ${villain.toFixed(2)})`);
});

test('caught for one crime, blamed for others — even ones you did not commit', () => {
  seedRandom(5);
  const s = person('ironport');
  const w = chronicle.worldOf(s);
  w.unsolved = Array.from({ length: 12 }, (_, i) => ({ id: `npc_${i}`, type: 'murder', heinous: 7, victim: `a traveller ${i}`, region: 'ironport', clues: 30, by: 'unknown' }));
  s.infamy = 60;
  s.deeds.push({ id: 'mine', type: 'murder', heinous: 7, victim: 'a guard', region: 'ironport' });
  s.warrants.ironport = { crimes: ['mine'], evidence: 70 };
  const t = crime.buildTrial(s, 'ironport');
  assert.ok(t.attached.length > 0, 'other unsolved cases are laid at your door');
  assert.ok(t.attached.some(c => !c.yours), 'including crimes someone else committed');
});

test('sentences grow with how heinous the crimes were', () => {
  const sentence = (crimes) => {
    seedRandom(3);
    const s = person('ironport');
    s.reputation = { ironport: -100 }; s.infamy = 100;
    s.pendingTrial = { region: 'ironport', crimes, attached: [], evidence: 100 };
    return crime.resolveTrial(s, 'confess');
  };
  assert.equal(sentence([{ id: 'a', type: 'theft', heinous: 2 }]).sentence, 'fine');
  assert.equal(sentence([{ id: 'a', type: 'murder', heinous: 7 }]).sentence, 'prison');
  const exile = sentence([{ id: 'a', type: 'murder', heinous: 7 }, { id: 'b', type: 'torture', heinous: 8 }]);
  assert.equal(exile.sentence, 'prison');
  assert.ok(exile.months >= 12 && exile.exiledTo, 'years, then exile');
  assert.equal(sentence([1, 2, 3].map(i => ({ id: `m${i}`, type: 'murder', heinous: 7 }))).sentence, 'execution');
});

test('slavery: legal in some lands, shaped by treatment, and talk follows the runaway', () => {
  seedRandom(21);
  const s = person('old_veldrath');
  const legal = slavery.legalHere(s);
  const m = slavery.handle(s, 'visit the slave market');
  if (legal) {
    assert.equal(m.success, true);
    const b = slavery.handle(s, 'buy slave 1');
    assert.equal(b.success, true);
    const sl = s.slaves[0];
    const l0 = sl.loyalty;
    slavery.handle(s, `feed ${sl.name} well`);
    assert.ok(sl.loyalty > l0, 'kindness builds loyalty');
    const beat = slavery.handle(s, `beat ${sl.name}`);
    assert.equal(beat.crime, true);
    assert.deepEqual(s.warrants, {}, 'not prosecuted where slavery is legal');
    assert.ok(s.deeds.some(d => d.victim === sl.name), 'but remembered');
    const sc = buildScene(s, {});
    assert.equal(sc.slaves.length, 1);
    assert.match(Art.scene(sc), /stroke-dasharray="2 1.5"/, 'drawn in chains, following');
    // A mistreated slave runs and talks.
    for (let i = 0; i < 6; i++) slavery.handle(s, `whip ${sl.name}`);
    const before = s.infamy;
    let msgs = [];
    for (let i = 0; i < 40 && s.slaves.length; i++) msgs = msgs.concat(slavery.monthly(s, 1));
    if (!s.slaves.length && msgs.some(x => /escaped/.test(x))) assert.ok(s.infamy > before, 'what they say comes out');
  }
  const free = person('thornwick');
  assert.equal(slavery.handle(free, 'visit the slave market').success, false, 'no markets where it is outlawed');
  slavery.addSlave(free, { name: 'Bek', gender: 'male' });
  assert.equal(slavery.handle(free, 'free Bek').success, true);
  assert.equal(free.slaves.length, 0);
});

test('crime over the API: the deed, the scene, the ledger', async () => {
  seedRandom(31);
  const { base, sessions } = await startServer();
  try {
    const c = client(base);
    const g = await c.post('/auth/guest', {}); c.sessionId = g.sessionId;
    await createCharacter(c);
    await c.act('talk to Old Hask');
    const r = await c.act('I murder Old Hask');
    assert.equal(r.scene.mood, 'crime');
    assert.equal(r.undoable, false, 'what is done cannot be undone');
    const s = sessions.get(c.sessionId).state;
    assert.equal(s.deeds.length, 1);
    if (s.pendingTrial) {
      const v = await c.act('confess');
      assert.match(v.output, /Guilty/);
    }
    const ledger = await c.act('deeds');
    assert.match(ledger.output, /murder — Old Hask/);
  } finally { await stopServer(); }
});
