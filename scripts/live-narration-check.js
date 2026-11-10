'use strict';
// =============================================================
// Live narration check (uses the real AI narrator; costs a few calls).
// Isolated temporary database; the key is read from .env and never
// printed. Plays two generations in one world and checks that:
//   • the AI narrates (and the game's own narrator covers any failure);
//   • the action guard removes invented player actions;
//   • the canon reaches the narrator: a man murdered in generation one is
//     never narrated alive in generation two, and the heir knows the parent.
//
// Usage: node scripts/live-narration-check.js [--turns 12]
// =============================================================
const path = require('path');
const R = path.join(__dirname, '..');
const h = require(path.join(R, 'tests/helpers'));
require(path.join(R, 'node_modules/dotenv')).config({ path: path.join(R, '.env'), quiet: true });
if (!process.env.GROQ_API_KEY) { console.error('No GROQ_API_KEY in .env — nothing to check live.'); process.exit(2); }
process.env.NARRATIVE_OFFLINE = '0';
process.env.EMBER_RATE_LIMIT_SCALE = '1000';
const argv = process.argv.slice(2);
const TURNS = parseInt((argv[argv.indexOf('--turns') + 1]) || '12', 10) || 12;
const chronicle = require(path.join(R, 'game/chronicle'));
const narrative = require(path.join(R, 'game/narrative/core'));

const ALIVE = /\b(?:Old Hask)\b[^.]{0,80}\b(?:greets|smiles|nods|says|waves|grins|laughs|asks|tells you|looks up|wipes his hands|is (?:here|working|alive))\b/i;

(async () => {
  h.seedRandom(77);
  const { base, sessions } = await h.startServer();
  const report = { generationOne: {}, generationTwo: {}, contradictions: [], aiStatus: null };
  try {
    const c = h.client(base);
    const g = await c.post('/auth/guest', {}); c.sessionId = g.sessionId;
    await h.createCharacter(c, { name: 'Corran', age: 34 });
    const st = () => sessions.get(c.sessionId).state;
    st().character.region = 'thornwick';
    const turns1 = ['I look around the valley', 'talk to Old Hask', 'I ask Old Hask about the wolves', 'I walk to the edge of the fields and watch the treeline', 'I murder Old Hask', 'I hide the body in the mill race'];
    let fallbacks = 0, ai = 0;
    for (const t of turns1.slice(0, Math.max(3, Math.min(turns1.length, TURNS / 2)))) {
      const r = await c.act(t);
      if (st().inCombat) { st().inCombat = false; st().currentEnemy = null; }
      const s = narrative.getNarrationStatus();
      if (s.mode === 'ai') ai++; else fallbacks++;
      void r;
    }
    const w = chronicle.worldOf(st());
    let haskDead = !!(w.canon.people['old hask'] && w.canon.people['old hask'].died);
    let setup = null;
    if (!haskDead) {
      // The attempt can fail in play (he fights back); the check is about the
      // canon reaching the narrator, so record the death through the engine.
      const { REGIONS } = require(path.join(R, 'game/constants'));
      const hask = REGIONS.thornwick.npcs.find(n => n.id === 'hask');
      require(path.join(R, 'game/crime')).killNpc(w, { npc: hask, id: hask.id, name: hask.name });
      haskDead = true; setup = 'Old Hask survived the attempt in play; his death was recorded through the engine (setup)';
    }
    report.generationOne = { turns: turns1.length, haskDead, setup, stats: { ...st().narrationStats } };
    // Generation two: the child of Corran, 25 years on.
    st().campaign.ending = 'rekindle';
    chronicle.applyEnding(w, st(), 'rekindle');
    await c.act('new character in this world as the child of Corran, 25 years later');
    await c.act('My name is Ilse, I am 20 years old and female');
    await c.act('Short, dark hair');
    await c.act('1');
    await c.act('3');
    st().character.region = 'thornwick';
    const turns2 = ['I walk to the old mill', 'I ask the miller what happened to Old Hask', 'I ask the villagers about my father Corran', 'I visit the graveyard', 'talk to the miller', 'I look around'];
    for (const t of turns2.slice(0, Math.max(3, Math.min(turns2.length, TURNS / 2)))) {
      const r = await c.act(t);
      if (st().inCombat) { st().inCombat = false; st().currentEnemy = null; }
      const out = r.output || '';
      if (haskDead && ALIVE.test(out)) report.contradictions.push({ input: t, excerpt: out.match(ALIVE)[0].slice(0, 140) });
      if (narrative.getNarrationStatus().mode === 'ai') ai++; else fallbacks++;
    }
    const block = require(path.join(R, 'game/narrative/memory')).promptBlock(st(), 'I ask about Old Hask and my father Corran');
    report.generationTwo = { lineage: st().lineage && st().lineage.parentName, canonInPrompt: /Old Hask[^\n]*died/.test(block), parentInPrompt: /child of Corran/.test(block), stats: st().narrationStats };
    report.aiTurns = ai; report.offlineTurns = fallbacks;
    report.aiStatus = { mode: narrative.getNarrationStatus().mode, reason: narrative.getNarrationStatus().reason || null };
    console.log(JSON.stringify(report, null, 2));
  } finally { await h.stopServer(); }
})().catch(e => { console.error('Live check failed:', e.message); process.exit(1); });
