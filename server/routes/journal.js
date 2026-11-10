'use strict';

// =============================================================
// THE JOURNAL
// One read-only endpoint per tab, built from the session's own state:
// map, quests, skills, trade, companions, politics, chronicle, crafting
// and the narrator's status. Buttons in the client send ordinary game
// commands through /api/action — the journal never changes state itself.
// Nothing secret is ever included (no keys, no other players' data).
// =============================================================

const { REGIONS } = require('../../game/constants');
const chronicle = require('../../game/chronicle');

const TABS = ['map', 'quests', 'skills', 'trade', 'companions', 'politics', 'chronicle', 'crafting', 'ai'];

function mapTab(state) {
  const w = chronicle.worldOf(state);
  const travel = require('../../game/travel');
  const here = state.character.region;
  const visited = new Set([...(state.visitedRegions || []), here]);
  const wl = w ? require('../../game/world-life') : null;
  const regionInfo = (k) => {
    const r = REGIONS[k];
    return {
      key: k, label: r.label, levels: r.levelRange, settlement: !!r.settlement,
      holder: w ? chronicle.dominionOf(w, k) : null,
      occupied: wl ? !!wl.occupiedBy(w, k) : false,
      status: w && w.settlements[k] ? w.settlements[k].status : null,
      visited: visited.has(k)
    };
  };
  const roads = travel.getConnectedRegionKeys(here).map(k => {
    const access = travel.canEnterRegion(state, k);
    return { ...regionInfo(k), open: access.ok !== false, reason: access.ok === false ? access.reason : null, cmd: `travel to ${REGIONS[k].label}` };
  });
  const ports = require('../../game/trade-work').PORTS;
  return {
    here: regionInfo(here), roads,
    ports: ports.includes(here) ? ports.filter(p => p !== here).map(p => ({ key: p, label: REGIONS[p].label, cmd: `sign on for a voyage to ${REGIONS[p].label}` })) : [],
    known: [...visited].filter(k => REGIONS[k]).map(regionInfo)
  };
}

function questsTab(state) {
  const w = chronicle.worldOf(state);
  const campaign = require('../../game/campaign');
  const adv = require('../../game/adventures');
  const cq = require('../../game/companion-quests');
  const endless = require('../../game/endless');
  const a = adv.current(state);
  const saga = endless.currentSaga(state);
  return {
    story: campaign.buildStoryPanel(state),
    bounties: (state.activeQuests || []).map((q, i) => ({ label: q.label, progress: q.progress || 0, total: q.targetCount || 1, cmd: `abandon quest ${i + 1}` })),
    adventure: a ? { title: a.title, kind: a.kind, step: a.step, steps: a.steps.map(s => s.text || (s.kind === 'go' ? `Go to ${REGIONS[s.region].label}` : s.kind)), daysLeft: w ? a.deadlineDay - chronicle.nowDay(w) : null } : null,
    saga: saga ? { title: saga.title, objective: saga.steps[saga.step].objective } : null,
    companionStories: Object.entries(cq.ensure(state)).map(([id, st]) => ({ id, title: cq.ARCS[id].title, done: !!st.done, outcome: st.outcome || null, next: !st.done && cq.ARCS[id].stages[st.stage] ? cq.ARCS[id].stages[st.stage].text : null })),
    pendingChoice: !!(state.pendingCompanionChoice || state.pendingAdventureChoice),
    actions: [{ label: 'Look for work', cmd: 'adventures' }, { label: 'Bounty board', cmd: 'check board' }, { label: 'Sagas', cmd: 'sagas' }]
  };
}

function skillsTab(state) {
  const tactics = require('../../game/combat-tactics');
  const specs = require('../../game/specializations');
  const available = specs.available(state);
  return {
    stats: state.stats, freePoints: state.freePoints || 0,
    combatClass: state.combatClass || null, classLevel: state.classLevel || 0,
    abilities: tactics.buildAbilityList(state).map(a => ({ label: a.label, desc: a.desc, ready: a.ready, cd: a.cd })),
    paths: available ? Object.entries(available).map(([k, s]) => ({ key: k, label: s.label, desc: s.desc, chosen: state.specialization === k, cmd: `specialize in ${s.label}` })) : [],
    pathLevel: specs.SPEC_LEVEL,
    spend: (state.freePoints || 0) > 0 ? ['str', 'dex', 'vit', 'int', 'wis', 'cha'].map(k => ({ stat: k, cmd: `spend point on ${k}` })) : []
  };
}

function tradeTab(state) {
  const w = chronicle.worldOf(state);
  const tw = require('../../game/trade-work');
  const perks = require('../../game/profession-perks');
  const p = state.profession ? perks.PERKS[state.profession] : null;
  return {
    profession: state.profession || null, level: state.professionLevel || 0,
    edge: p ? p.edge : null, work: p ? p.work.what : null, skill: p ? p.skill : null,
    commission: state.profession ? tw.commissionFor(state) : null,
    inn: state.inn ? { region: REGIONS[state.inn.region].label, takings: tw.innTakings(state, w).coin } : null,
    contract: state.contract && !state.contract.done ? { target: state.contract.target, region: REGIONS[state.contract.region].label, fee: state.contract.fee } : null,
    masterworks: state.masterworks || 0, smithRank: tw.smithRank(state),
    actions: [
      { label: 'Opportunities', cmd: 'opportunities' }, { label: 'Work a shift', cmd: 'work' },
      ...(state.profession ? [{ label: 'Take the commission', cmd: 'take the commission' }] : []),
      ...(state.inn ? [{ label: 'Collect from the inn', cmd: 'collect from the inn' }] : [])
    ]
  };
}

function companionsTab(state) {
  const cq = require('../../game/companion-quests');
  return {
    party: (state.companions || []).map(c => ({ name: c.name, role: c.role, loyalty: c.loyalty, hired: !!c.hired, ability: c.storyAbility ? c.storyAbility.name : null, story: c.rosterId && cq.ARCS[c.rosterId] ? cq.ARCS[c.rosterId].title : null, cmd: `dismiss ${c.name}` })),
    lost: Object.keys(state.killedCompanions || {}), estranged: Object.keys(state.estrangedCompanions || {}),
    actions: [{ label: 'Companions', cmd: 'companions' }, { label: 'Their stories', cmd: 'companion stories' }]
  };
}

function politicsTab(state) {
  const w = chronicle.worldOf(state);
  const factions = require('../../game/factions');
  const politics = require('../../game/politics');
  const wl = require('../../game/world-life');
  const rel = politics.ensure(w);
  return {
    standings: factions.buildFactionPanel(state),
    relations: Object.entries(rel).map(([k, r]) => { const [a, b] = k.split('|'); return { a: politics.NAMES[a], b: politics.NAMES[b], state: r.state, years: r.years || 0 }; }),
    seats: Object.entries(wl.ensure(w).dynasties).map(([f, d]) => ({ faction: politics.NAMES[f], title: wl.SEATS[f].title, ruler: d.ruler.name, regent: d.regent ? d.regent.name : null, disputedBy: d.dispute ? d.dispute.claimant.name : null })),
    here: wl.regionFacts(w, state.character.region, state),
    actions: [{ label: 'News', cmd: 'news' }, { label: 'Politics', cmd: 'politics' }, { label: 'Factions', cmd: 'factions' }]
  };
}

function chronicleTab(state) {
  const w = chronicle.worldOf(state);
  const ledger = (w && w.canon && w.canon.ledger) || [];
  return {
    world: w ? w.name : null, era: w ? w.era.name : null, date: w ? chronicle.formatDate(chronicle.nowHour(w)) : null,
    entries: ledger.filter(r => r.t !== 'summary').slice(-40).reverse().map(r => ({ year: r.y, type: r.t, text: r.s })),
    legends: (w ? w.figures : []).map(f => ({ name: f.name, title: f.title, status: f.status })),
    actions: [{ label: 'Full chronicle', cmd: 'chronicle' }, { label: 'Legends', cmd: 'legends' }, { label: 'My deeds', cmd: 'deeds' }]
  };
}

function craftingTab(state) {
  const crafting = require('../../game/crafting-recipes');
  const counts = require('../../game/world').getMaterialCounts(state);
  const prof = state.profession;
  return {
    materials: Object.entries(counts).map(([name, qty]) => ({ name, qty })),
    recipes: Object.entries(crafting.RECIPES).map(([key, r]) => {
      const allowed = !r.prof || r.prof.includes(prof);
      const needs = Object.entries(r.needs).map(([k, q]) => ({ material: k, qty: q }));
      return { key, label: r.label, allowed, needs, trades: r.prof || null, cmd: `craft ${r.label}` };
    })
  };
}

function aiTab(state) {
  const core = require('../../game/narrative/core');
  const status = core.getNarrationStatus();
  const stats = state.narrationStats || {};
  return {
    mode: status.mode, reason: status.reason || null, retryInSeconds: status.retryInSeconds || null,
    keyConfigured: !!process.env.GROQ_API_KEY,                         // a yes/no, never the key
    turns: stats.turns || 0, removedSentences: stats.removedSentences || 0, regenerations: stats.regenerations || 0,
    fallbacks: stats.fallbacks || 0, repeats: stats.repeats || 0,
    memory: { notes: Object.keys((state.memory && state.memory.entities) || {}).length, chapters: ((state.memory && state.memory.chapters) || []).length }
  };
}

const BUILDERS = { map: mapTab, quests: questsTab, skills: skillsTab, trade: tradeTab, companions: companionsTab, politics: politicsTab, chronicle: chronicleTab, crafting: craftingTab, ai: aiTab };

module.exports = function registerJournalRoutes(app, { requireSession, isInCreation }) {
  app.get('/api/journal/:tab', requireSession, (req, res) => {
    const tab = String(req.params.tab || '');
    if (!TABS.includes(tab)) return res.status(404).json({ success: false, error: 'No such page in the journal.' });
    const state = req.session.state;
    if (!state || !state.character || !state.character.region || isInCreation(state)) return res.status(409).json({ success: false, error: 'Finish making your character first.' });
    try { res.json({ success: true, tab, data: BUILDERS[tab](state) }); }
    catch (e) { console.error('[Journal]', tab, e.message); res.status(500).json({ success: false, error: 'The journal could not be read.' }); }
  });
};
module.exports.TABS = TABS;
