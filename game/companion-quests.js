'use strict';

// =============================================================
// COMPANION STORIES
// Each of the eight companions has a personal story told in stages the
// engine enforces — go somewhere with them, do something there, win a
// fight against a named foe, and make a choice whose consequences are
// real: loyalty, factions, the road the player walks, settlements,
// politics, gear or a new ability — and sometimes the companion leaves,
// or dies. Every resolution enters the world's permanent canon, so later
// generations can still find the grave, the monument or the legend.
//
// Companions also react to what the player does — in character: a
// smuggler shrugs at theft; a Warden does not; a Choir defector will not
// forgive an alliance with the Choir.
// No AI calls. No database calls. Pure game logic.
// =============================================================

const chronicle = require('./chronicle');
const factions = require('./factions');
const { REGIONS } = require('./constants');

// Values: how each companion feels about kinds of deed (−/+ loyalty).
const VALUES = {
  maren:     { crime: -2, cruelty: -3, mercy: 1, wardens: 1, choir: -2, slavery: -3 },
  brannoc:   { crime: -1, cruelty: -2, mercy: 1, compact: 1, slavery: -2, theft: -2 },
  tamsin:    { crime: -1, cruelty: -3, mercy: 2, slavery: -3, nature: 2 },
  sexton:    { crime: -2, cruelty: -3, mercy: 2, undead: 1, slavery: -2, murder: -3 },
  heron:     { crime: 0, theft: 1, cruelty: -1, slavery: -1, compact: 0 },
  seraphine: { crime: -1, cruelty: -1, remnant: 2, choir: -2, slavery: 0, ambition: 1 },
  aske:      { crime: -2, cruelty: -2, mercy: 1, wardens: 2, choir: -3, desertion: -3 },
  lucan:     { crime: -1, cruelty: -3, mercy: 3, choir: -4, slavery: -3 }
};

// Stage kinds: 'go' (be in region with them), 'act' (the player's words,
// there), 'fight' (a named foe appears there; win it), 'choice'.
const ARCS = {
  maren: {
    title: 'The Broken Oath', minLoyalty: 40,
    intro: 'Maren tells you, flatly, that her old squad died on the Greymere moors because someone sold their route. She has never found out who.',
    stages: [
      { kind: 'go', region: 'greymere', text: 'Go with Maren to the Greymere Moors.' },
      { kind: 'act', region: 'greymere', re: /\b(search|investigate|look through|examine|dig through)\b.*\b(camp|ruins|old warden|remains|site)\b/i, text: 'Search the old Warden camp ("search the old camp").', found: 'Under a rotted tent you find a ledger page: the route, the date, and a garrison seal from Ironport.' },
      { kind: 'fight', region: 'greymere', foe: { label: 'Barrow Deserter, the Seal-Bearer', level: 0 }, text: 'The man who carried the seal comes back for it. Defeat him.' },
      { kind: 'choice', region: 'ironport', text: 'Confront Captain Halloran in Ironport with Maren.', prompt: 'Halloran sold the route. Maren\'s hand is on her knife. What do you do?', options: [
        { label: 'Arrest him and hand him to the Wardens', effects: { loyalty: 15, standing: { wardens: 10 }, morality: 5, npcFate: { id: 'halloran', fate: 'imprisoned' }, ability: { bonus: 0.15, name: 'Volley of the Fallen' }, canon: 'Maren Holt and {player} bring Captain Halloran to Warden justice for the Greymere betrayal' } },
        { label: 'Let Maren take her vengeance', effects: { loyalty: 5, standing: { wardens: -10 }, morality: -10, npcFate: { id: 'halloran', fate: 'killed' }, ability: { bonus: 0.2, name: 'Cold Vengeance' }, canon: 'Maren Holt kills Captain Halloran for the Greymere betrayal, with {player} standing by' } },
        { label: 'Spare him for what he knows of the Choir', effects: { loyalty: -10, standing: { wardens: 5, choir: -5 }, coin: 400, morality: 0, canon: '{player} spares Captain Halloran in exchange for his secrets; Maren Holt does not forgive it easily' } }
      ] }
    ]
  },
  brannoc: {
    title: 'His Father\'s Ore', minLoyalty: 35,
    intro: 'Brannoc says his father died in the Blackstone mines chasing a seam of star-iron. He wants to finish what his father started.',
    stages: [
      { kind: 'go', region: 'blackstone_foothills', text: 'Go with Brannoc to the Blackstone Foothills.' },
      { kind: 'act', region: 'blackstone_foothills', re: /\b(dig|mine|search|follow|explore)\b.*\b(mine|seam|shaft|tunnel|old workings)\b/i, text: 'Find the old seam ("dig in the old mine").', found: 'Behind a collapse, the seam glitters: star-iron, just as his father said.' },
      { kind: 'fight', region: 'blackstone_foothills', foe: { label: 'Rubble Crawler, Guardian of the Seam', level: 2 }, text: 'Something lives in the seam. Kill it.' },
      { kind: 'choice', region: 'thornwick', text: 'Return to Brannoc\'s forge in Thornwick with the star-iron.', prompt: 'The star-iron glows on the anvil. What should he make of it?', options: [
        { label: 'A blade for you', effects: { loyalty: 5, item: 'star-iron blade', canon: 'Brannoc forges a star-iron blade for {player} from his father\'s ore' } },
        { label: 'Armour for himself', effects: { loyalty: 15, ability: { guard: 0.1, name: 'Star-Iron Plate' }, canon: 'Brannoc forges star-iron plate from his father\'s ore' } },
        { label: 'Sell it to the Compact for the village', effects: { loyalty: 10, standing: { compact: 10 }, settlement: { region: 'thornwick', status: 'thriving' }, morality: 5, canon: 'Brannoc sells his father\'s star-iron to the Compact; Thornwick prospers on it' } },
        { label: 'Sell it to the Choir\'s agents for a fortune', effects: { loyalty: -40, coin: 900, standing: { choir: 5, compact: -10 }, morality: -5, leaves: true, canon: '{player} sells Brannoc\'s father\'s star-iron to the Choir; Brannoc goes home to his forge alone' } }
      ] }
    ]
  },
  tamsin: {
    title: 'The Burning Wood', minLoyalty: 35,
    intro: 'Tamsin has seen the blight in the Deep Ashwood creeping toward the grove where she was raised. Her mentor has stopped answering.',
    stages: [
      { kind: 'go', region: 'ashwood_deep', text: 'Go with Tamsin into the Deep Ashwood.' },
      { kind: 'act', region: 'ashwood_deep', re: /\b(follow|track|search|find|trace)\b.*\b(blight|rot|source|grove|heart)\b/i, text: 'Find the blight\'s source ("track the blight to its source").', found: 'At the heart of the rot, the oldest tree in the wood has turned: its sap runs black.' },
      { kind: 'fight', region: 'ashwood_deep', foe: { label: 'Blight-Heart Treant', level: 3 }, text: 'The heart-tree wakes, and it is hungry. Survive it.' },
      { kind: 'choice', region: 'ashwood_deep', text: 'Decide the grove\'s fate with Tamsin.', prompt: 'The heart-tree is beaten but not dead. The blight can be burned out — with the grove — or Tamsin can try to heal it.', options: [
        { label: 'Burn the grove to stop the blight', effects: { loyalty: -10, morality: 0, settlement: { region: 'ashwood_deep', status: 'struggling' }, canon: 'Tamsin Reed and {player} burn the heart-grove of the Deep Ashwood to stop the blight' } },
        { label: 'Help her heal it (needs 5 herbs)', needs: { herbs: 5 }, effects: { loyalty: 20, morality: 8, consume: { herbs: 5 }, ability: { bonus: 0.15, name: 'Heartwood Arrows' }, canon: 'Tamsin Reed heals the heart-tree of the Deep Ashwood, with {player}\'s help' } },
        { label: 'Leave it — it is not your fight', effects: { loyalty: -40, leaves: true, canon: '{player} turns away from the dying grove; Tamsin Reed stays behind to fight it alone' } }
      ] }
    ]
  },
  sexton: {
    title: 'The Restless Grave', minLoyalty: 35,
    intro: 'Sexton Abel says his wife\'s grave in Oakhaven has been disturbed three nights running. He has a guess who is doing it, and it frightens him.',
    stages: [
      { kind: 'go', region: 'oakhaven', text: 'Go with Abel to the Oakhaven graveyard.' },
      { kind: 'act', region: 'oakhaven', re: /\b(watch|keep watch|guard|wait|hide)\b.*\b(grave|graveyard|cemetery|tomb|night)\b/i, text: 'Keep watch over the grave at night ("keep watch at the grave").', found: 'Past midnight, a figure in a grey hood kneels at the grave and begins to chant.' },
      { kind: 'fight', region: 'oakhaven', foe: { label: 'Grave-Robber Necromancer', level: 1 }, text: 'The necromancer raises what he can. Stop him.' },
      { kind: 'choice', region: 'oakhaven', text: 'The necromancer, beaten, offers Abel one night with his wife.', prompt: 'The necromancer, bleeding, says he can give Abel one night with her. Abel looks at you.', options: [
        { label: 'Destroy the necromancer', effects: { loyalty: 15, morality: 5, ability: { heal: 0.1, name: 'Hymn of the Quiet Dead' }, canon: 'Sexton Abel and {player} destroy the necromancer of Oakhaven' } },
        { label: 'Let him have his one night', effects: { loyalty: 5, morality: -8, ability: { element: 'shadow', name: 'Grief-Song' }, canon: 'Sexton Abel spends one night with his dead wife, raised by a necromancer {player} let live' } },
        { label: 'Sell the necromancer to the Choir', effects: { loyalty: -30, coin: 500, standing: { choir: 10, wardens: -5 }, morality: -10, leaves: true, canon: '{player} sells the necromancer of Oakhaven to the Choir; Sexton Abel walks away' } }
      ] }
    ]
  },
  heron: {
    title: 'Debts in the Fen', minLoyalty: 35,
    intro: 'Heron admits she owes the Silt King, the fen\'s smuggler-lord, more than she can ever pay. He has sent word: pay, or he collects.',
    stages: [
      { kind: 'go', region: 'sunkenfen_deep', text: 'Go with Heron to the Deep Fens.' },
      { kind: 'act', region: 'sunkenfen_deep', re: /\b(meet|find|go to|visit|confront)\b.*\b(silt king|smuggler|king)\b/i, text: 'Meet the Silt King ("meet the Silt King").', found: 'The Silt King receives you on a drowned barge, smiling. He names the debt.' },
      { kind: 'choice', region: 'sunkenfen_deep', text: 'Settle Heron\'s debt.', prompt: 'The Silt King wants Heron\'s debt paid — in coin, in blood, or in Heron.', options: [
        { label: 'Pay the debt (coin)', needs: { coin: 600 }, effects: { loyalty: 20, coin: -600, oath: { kind: 'debt', what: 'paid the Silt King what Heron owed' }, ability: { bonus: 0.1, name: 'Free Hands' }, canon: '{player} pays Heron\'s debt to the Silt King' } },
        { label: 'Fight the Silt King', effects: { fight: { label: 'The Silt King', level: 4 }, onWin: { loyalty: 25, coin: 300, standing: { compact: 5 }, ability: { bonus: 0.15, name: 'Fen-Knife' }, canon: '{player} and Heron kill the Silt King on his drowned barge' } } },
        { label: 'Hand Heron over to him', effects: { loyalty: -100, coin: 800, morality: -15, betrayal: true, dies: true, canon: '{player} hands Heron to the Silt King; she is never seen again' } }
      ] }
    ]
  },
  seraphine: {
    title: 'The Sun Throne', minLoyalty: 40,
    intro: 'Seraphine has news from the Sunspire court: her cousin Aurelian has claimed the throne of the Remnant. She believes it is hers.',
    stages: [
      { kind: 'go', region: 'old_veldrath', text: 'Go with Seraphine to Old Veldrath.' },
      { kind: 'act', region: 'old_veldrath', re: /\b(enter|go to|visit|attend|stand before)\b.*\b(court|throne|sunspire|palace|council)\b/i, text: 'Attend the Sunspire court ("go to the Sunspire court").', found: 'Aurelian sits the Sun Throne already, his guards at the doors. The court waits to see what Seraphine will do.' },
      { kind: 'choice', region: 'old_veldrath', text: 'Decide the succession.', prompt: 'Two claimants, one throne. Whom do you stand behind?', options: [
        { label: 'Back Seraphine\'s claim', effects: { loyalty: 20, standing: { remnant: 15 }, reign: { faction: 'remnant', ruler: 'Seraphine Aurel' }, ability: { bonus: 0.2, name: 'Sunfire Crown' }, canon: 'With {player} at her side, Seraphine Aurel takes the Sun Throne of the Remnant' } },
        { label: 'Let Aurelian keep it', effects: { loyalty: -15, standing: { remnant: 5 }, canon: 'Aurelian keeps the Sun Throne; Seraphine Aurel swallows her claim' } },
        { label: 'Expose them both to the Compact', effects: { loyalty: -60, standing: { remnant: -20, compact: 15 }, leaves: true, canon: '{player} exposes the Remnant\'s succession to the Compact; Seraphine Aurel leaves in fury' } }
      ] }
    ]
  },
  aske: {
    title: 'The Last Wall', minLoyalty: 40,
    intro: 'Aske asks you to come back with him to the Scar Vale wall, where his company died. Raiders are massing there again.',
    stages: [
      { kind: 'go', region: 'scar_vale', text: 'Go with Aske to the Scar Vale wall.' },
      { kind: 'choice', region: 'scar_vale', text: 'Decide how to meet the raiders.', prompt: 'The raiders will come at dawn. Evacuate the village behind the wall, or hold the wall?', options: [
        { label: 'Evacuate the village', effects: { loyalty: -5, settlement: { region: 'scar_vale', status: 'struggling' }, morality: 3, canon: 'Lieutenant Aske and {player} evacuate the Scar Vale village before the raiders come' } },
        { label: 'Hold the wall', effects: { fight: { label: 'Raider Warband at the Wall', level: 3 }, onWin: { loyalty: 25, standing: { wardens: 10 }, settlement: { region: 'scar_vale', status: 'thriving' }, ability: { guard: 0.15, name: 'Hold the Line' }, monument: 'Aske\'s Wall', canon: 'Lieutenant Aske and {player} hold the Scar Vale wall against the raiders' }, onLose: { dies: true, monument: 'Aske\'s Wall', canon: 'Lieutenant Aske falls holding the Scar Vale wall; {player} survives him' } } }
      ] }
    ]
  },
  lucan: {
    title: 'A Different Song', minLoyalty: 40,
    intro: 'Lucan has been hearing the Choir\'s hymn in his sleep. They are calling him back, and they will send someone to bring him.',
    stages: [
      { kind: 'go', region: 'pale_city', text: 'Go with Lucan to the Pale City.' },
      { kind: 'fight', region: 'pale_city', foe: { label: 'Choir Inquisitor', level: 3 }, text: 'The Choir\'s hunter finds you first. Defeat it.' },
      { kind: 'choice', region: 'pale_city', text: 'Decide what Lucan will do.', prompt: 'Lucan says he could sing the counter-hymn in the cathedral — it might break the Choir\'s hold here, and it might kill him.', options: [
        { label: 'Let him sing', effects: { gamble: 0.65, onWin: { loyalty: 25, standing: { choir: -15, wardens: 10 }, morality: 8, ability: { heal: 0.15, name: 'The Counter-Hymn' }, canon: 'Brother Lucan sings the counter-hymn in the Pale City and lives' }, onLose: { dies: true, standing: { choir: -10 }, canon: 'Brother Lucan dies singing the counter-hymn in the Pale City; the Choir\'s hold there cracks' } } },
        { label: 'Hand him back to the Choir', effects: { loyalty: -100, standing: { choir: 25 }, coin: 600, morality: -20, betrayal: true, dies: true, canon: '{player} hands Brother Lucan back to the Choir; he is executed in the Pale City' } },
        { label: 'Flee with him', effects: { loyalty: 10, standing: { choir: -10 }, canon: 'Brother Lucan and {player} flee the Pale City ahead of the Choir' } }
      ] }
    ]
  }
};

function ensure(state) { if (!state.companionStories || typeof state.companionStories !== 'object') state.companionStories = {}; return state.companionStories; }
function companionOf(state, id) { return (state.companions || []).find(c => c.rosterId === id) || null; }

function stageOf(state, id) {
  const st = ensure(state)[id];
  if (!st || st.done) return null;
  return ARCS[id].stages[st.stage] || null;
}

// A story begins once loyalty is high enough and they travel with you.
function offerStories(state) {
  const out = [];
  for (const [id, arc] of Object.entries(ARCS)) {
    const c = companionOf(state, id);
    const st = ensure(state)[id];
    if (!c || st || (c.loyalty || 0) < arc.minLoyalty) continue;
    ensure(state)[id] = { stage: 0, started: state.actionCount || 0 };
    out.push({ id, message: `${arc.intro}\n— ${c.name}: "${arc.title}" — ${arc.stages[0].text} ("companion stories" to see it.)` });
  }
  return out;
}

// Called whenever something happens: arrivals, inputs, fight results.
function advance(state, { type, region, input, won, foe } = {}) {
  const out = [];
  for (const id of Object.keys(ARCS)) {
    const s = stageOf(state, id);
    if (!s) continue;
    const c = companionOf(state, id);
    if (!c) continue;                                  // they must be with you
    const here = state.character && state.character.region;
    const st = ensure(state)[id];
    if (s.kind === 'go' && here === s.region) { st.stage++; out.push(next(state, id, `${c.name}: you have arrived.`)); }
    else if (s.kind === 'act' && type === 'input' && here === s.region && s.re.test(input || '')) { st.stage++; out.push(next(state, id, s.found)); }
    else if (s.kind === 'fight' && type === 'fightWon' && foe && st.foe === foe) { st.stage++; st.foe = null; out.push(next(state, id, `${c.name} lowers their weapon. It is done.`)); }
    else if (s.kind === 'choice' && type !== 'fightWon' && !st.pendingOutcome && here === s.region && !state.pendingCompanionChoice) {
      state.pendingCompanionChoice = { id, stage: st.stage };
      out.push({ id, message: `${ARCS[id].title} — ${s.prompt}\n${s.options.map((o, i) => `  ${i + 1}. ${o.label}`).join('\n')}\n(Answer with "decide 1", "decide 2"…${require('./campaign').getCurrentStep(state) && require('./campaign').getCurrentStep(state).step.type === 'choice' ? ' — or "companion decide 1", since the main story is also waiting on you' : ''})` });
    }
  }
  return out.filter(Boolean);
}

function next(state, id, lead) {
  const s = stageOf(state, id);
  if (!s) return { id, message: lead };
  return { id, message: `${lead}\nNext — ${s.text}` };
}

// A fight stage, ready to begin: the foe is built at the region's level.
function pendingFight(state, spawnEnemy) {
  for (const id of Object.keys(ARCS)) {
    const s = stageOf(state, id);
    const st = ensure(state)[id];
    if (!s || s.kind !== 'fight' || st.foe || !companionOf(state, id) || state.character.region !== s.region || state.inCombat) continue;
    return buildFoe(state, id, s.foe, spawnEnemy);
  }
  return null;
}

function buildFoe(state, id, foeSpec, spawnEnemy) {
  const lvl = require('./character').getPlayerLevel(state.totalXP || 0);
  const r = REGIONS[state.character.region] || {};
  const level = Math.max(r.levelRange ? r.levelRange[0] : 1, lvl) + (foeSpec.level || 0);
  const e = spawnEnemy(state.character.region, level);
  e.label = foeSpec.label;
  e.level = level;
  e.isRare = true;
  e.maxHP = e.currentHP = Math.round(e.maxHP * 1.6);
  e.meta = { ...(e.meta || {}), companionStory: id, storyFoe: foeSpec.label };
  ensure(state)[id].foe = foeSpec.label;
  return e;
}

// The player's choice in a story.
function decide(state, n, helpers = {}) {
  const p = state.pendingCompanionChoice;
  if (!p) return null;
  const arc = ARCS[p.id];
  const s = arc.stages[p.stage];
  const opt = s.options[n - 1];
  if (!opt) return { success: false, message: `Choose ${s.options.map((_, i) => i + 1).join(', ')}.` };
  if (opt.needs) {
    if (opt.needs.coin && (state.coin || 0) < opt.needs.coin) return { success: false, message: `You need ${opt.needs.coin} copper for that.` };
    for (const [m, q] of Object.entries(opt.needs)) if (m !== 'coin' && ((state.materials || {})[m] || 0) < q) return { success: false, message: `You need ${q} ${m} for that.` };
  }
  state.pendingCompanionChoice = null;
  const lines = [`You chose: ${opt.label}.`];
  const e = opt.effects;
  if (e.fight) {
    // The choice leads to a fight; its outcome settles the story.
    ensure(state)[p.id].pendingOutcome = { onWin: e.onWin, onLose: e.onLose };
    const foe = buildFoe(state, p.id, e.fight, helpers.spawnEnemy);
    return { success: true, message: lines.join('\n'), startFight: foe };
  }
  if (e.gamble !== undefined) {
    const ok = Math.random() < e.gamble;
    lines.push(...apply(state, p.id, ok ? e.onWin : e.onLose, helpers));
  } else lines.push(...apply(state, p.id, e, helpers));
  return { success: true, message: lines.join('\n'), done: true };
}

// After a story fight: settle the outcome waiting on it.
function onStoryFightEnd(state, id, won, helpers = {}) {
  const st = ensure(state)[id];
  if (!st || !st.pendingOutcome) return [];
  const o = won ? st.pendingOutcome.onWin : (st.pendingOutcome.onLose || { loyalty: -10, canon: null });
  st.pendingOutcome = null;
  return apply(state, id, o, helpers);
}

function apply(state, id, e = {}, helpers = {}) {
  const arc = ARCS[id];
  const c = companionOf(state, id);
  const world = chronicle.worldOf(state);
  const name = c ? c.name : require('./companions').ROSTER[id].name;
  const out = [];
  const st = ensure(state)[id];
  if (e.loyalty && c) { c.loyalty = Math.max(0, Math.min(100, (c.loyalty || 0) + e.loyalty)); out.push(`${name}: loyalty ${e.loyalty > 0 ? '+' : ''}${e.loyalty} (now ${c.loyalty}).`); }
  if (e.standing) out.push(factions.formatStandingChanges(factions.changeStanding(state, e.standing, arc.title)));
  if (e.morality) require('./morality').shift(state, e.morality, arc.title);
  if (e.coin) { state.coin = Math.max(0, (state.coin || 0) + e.coin); out.push(`${e.coin > 0 ? '+' : ''}${e.coin} copper.`); }
  if (e.consume) for (const [m, q] of Object.entries(e.consume)) state.materials[m] = Math.max(0, (state.materials[m] || 0) - q);
  if (e.item) {
    const ch = require('./character');
    const tier = Math.min(30, (state.gear && state.gear.weapon ? (state.gear.weapon.tier || 1) : 1) + 2);
    require('./economy').addItem(state, { ...ch.buildGearItem({ name: e.item, tier }, false), type: 'weapon' });
    out.push(`You receive a ${e.item}. ("equip ${e.item}")`);
  }
  if (e.ability && c) { c.storyAbility = e.ability; out.push(`${name} gains ${e.ability.name}.`); }
  if (e.settlement && world) {
    world.settlements[e.settlement.region] = { ...(world.settlements[e.settlement.region] || {}), status: e.settlement.status, since: chronicle.nowDay(world) };
  }
  if (e.npcFate && world) {
    const npc = Object.values(REGIONS).flatMap(r => r.npcs || []).find(n => n.id === e.npcFate.id);
    if (npc) require('./crime').killNpc(world, { npc, id: npc.id, name: npc.name }, e.npcFate.fate === 'imprisoned' ? 'disappears' : 'murdered');
  }
  if (e.reign && world) {
    require('./canon').ensure(world).reigns.push({ realm: e.reign.faction, ruler: e.reign.ruler, from: chronicle.dateOf(chronicle.nowHour(world)).year, how: arc.title });
    world.factionLeaders = { ...(world.factionLeaders || {}), [e.reign.faction]: e.reign.ruler };
  }
  if (e.oath && world) require('./canon').oath(world, { by: state.character.name, to: name, what: e.oath.what, kind: e.oath.kind });
  if (e.monument && world) chronicle.addEvent(world, { type: 'monument', importance: 4, title: `${e.monument} is raised in ${REGIONS[state.character.region].label}`, region: state.character.region }, `monument:${e.monument}`);
  const canonText = e.canon ? e.canon.replace(/\{player\}/g, state.character.name) : null;
  if (canonText && world) chronicle.addEvent(world, { type: 'companion', importance: 4, title: canonText, actor: chronicle.actorOf(state), region: state.character.region }, `companion-story:${state.characterId}:${id}`);
  if (e.betrayal && world) require('./canon').oath(world, { by: state.character.name, to: name, what: `betrayed ${name}`, kind: 'betrayal' });
  if (e.dies) {
    if (c && helpers.removeCompanion) helpers.removeCompanion(state, c.id);
    state.killedCompanions = { ...(state.killedCompanions || {}), [id]: true };
    if (world) chronicle.addEvent(world, { type: 'death', importance: 4, title: `${name} dies at ${Math.max(20, 30 + (id.length % 20))}`, text: canonText || '', region: state.character.region }, `companion-death:${id}:${state.characterId}`);
    out.push(`${name} is dead.`);
  } else if (e.leaves && c && helpers.removeCompanion) {
    helpers.removeCompanion(state, c.id);
    state.estrangedCompanions = { ...(state.estrangedCompanions || {}), [id]: true };
    out.push(`${name} leaves you.`);
  }
  if (st) { st.done = true; st.outcome = canonText; }
  if (canonText) out.push(`${canonText}.`, `(${arc.title} is over. It will be remembered.)`);
  return out.filter(Boolean);
}

// What companions think of what the player just did.
function react(state, kind, weight = 1) {
  const out = [];
  for (const c of state.companions || []) {
    const v = VALUES[c.rosterId];
    if (!v || v[kind] === undefined || v[kind] === 0) continue;
    const delta = Math.round(v[kind] * weight);
    if (!delta) continue;
    c.loyalty = Math.max(0, Math.min(100, (c.loyalty || 0) + delta));
    out.push(`${c.name} ${delta > 0 ? 'approves' : 'disapproves'} (loyalty ${c.loyalty}).`);
  }
  return out;
}

function listText(state) {
  const lines = ['COMPANION STORIES', '─────────────────'];
  let any = false;
  for (const [id, arc] of Object.entries(ARCS)) {
    const st = ensure(state)[id];
    const c = companionOf(state, id);
    if (!st && !c) continue;
    any = true;
    const name = require('./companions').ROSTER[id].name;
    if (!st) lines.push(`• ${name} — ${arc.title}: not yet (loyalty ${c ? c.loyalty : 0}/${arc.minLoyalty}).`);
    else if (st.done) lines.push(`• ${name} — ${arc.title}: ${st.outcome || 'over'}.`);
    else lines.push(`• ${name} — ${arc.title}: ${ARCS[id].stages[st.stage].text}`);
  }
  if (!any) lines.push('No companion has trusted you with their story yet.');
  return lines.join('\n');
}

module.exports = { ARCS, VALUES, offerStories, advance, pendingFight, decide, onStoryFightEnd, react, listText, ensure, stageOf };
