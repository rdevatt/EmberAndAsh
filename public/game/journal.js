/* =============================================================
   EMBER AND ASH — JOURNAL
   Nine pages read from /api/journal/:tab. Every button sends an ordinary
   game command through the same path as typing it, so nothing here can
   do what the game would not allow. Built with DOM methods only (no HTML
   strings from the server), keyboard-navigable tabs (arrows, Home, End),
   Escape to close, focus returned to the opener.
   ============================================================= */
(function () {
  'use strict';

  const modal = document.getElementById('modal-journal');
  const body = document.getElementById('journal-body');
  const openBtn = document.getElementById('btn-journal');
  const closeBtn = document.getElementById('btn-close-journal');
  if (!modal || !body || !openBtn) return;
  const tabs = Array.from(modal.querySelectorAll('.journal-tab'));
  let current = 'map';
  let opener = null;

  function h(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v === true ? '' : String(v));
    }
    for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) n.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k);
    return n;
  }
  function section(title, ...kids) { return h('section', { class: 'journal-section' }, h('h3', { text: title }), ...kids); }
  function list(items, render) { return items && items.length ? h('ul', { class: 'journal-list' }, items.map(i => h('li', null, render(i)))) : h('p', { class: 'dim', text: 'Nothing yet.' }); }
  function cmdBtn(label, cmd, extra) { return h('button', { class: 'journal-cmd', 'data-cmd': cmd, type: 'button', title: cmd, ...(extra || {}) }, label); }
  function actions(list) { return list && list.length ? h('div', { class: 'journal-actions' }, list.map(a => cmdBtn(a.label, a.cmd))) : null; }
  const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

  const RENDER = {
    map(d) {
      const place = (r) => `${r.label} (Lv ${r.levels[0]}–${r.levels[1]})${r.holder && r.holder !== 'lawless' ? ` · ${r.holder}${r.occupied ? ', occupied' : ''}` : r.holder === 'lawless' ? ' · lawless' : ''}${r.status ? ` · ${r.status}` : ''}`;
      return [
        section('You are in', h('p', { text: place(d.here) })),
        section('Roads from here', list(d.roads, r => [h('span', { text: place(r) + (r.open ? '' : ` — ${r.reason}`) }), ' ', cmdBtn('Travel', r.cmd, { disabled: !r.open })])),
        d.ports.length ? section('Ships from here', list(d.ports, p => [h('span', { text: p.label }), ' ', cmdBtn('Sail', p.cmd)])) : null,
        section('Places you have been', list(d.known, r => h('span', { text: place(r) })))
      ];
    },
    quests(d) {
      return [
        d.story ? section('The story', h('p', { text: [d.story.title, typeof d.story.objective === 'string' ? d.story.objective : (d.story.objective && d.story.objective.text)].filter(Boolean).join(' — ') || 'The story goes on.' })) : null,
        d.adventure ? section(`Adventure: ${d.adventure.title}`, h('ol', { class: 'journal-steps' }, d.adventure.steps.map((s, i) => h('li', { class: i < d.adventure.step ? 'done' : i === d.adventure.step ? 'current' : '', text: s }))), h('p', { class: 'dim', text: `${d.adventure.daysLeft} days left` })) : null,
        d.saga ? section(`Saga: ${d.saga.title}`, h('p', { text: d.saga.objective })) : null,
        section('Bounties', list(d.bounties, q => [h('span', { text: `${q.label} (${q.progress}/${q.total})` }), ' ', cmdBtn('Abandon', q.cmd)])),
        section('Companion stories', list(d.companionStories, c => h('span', { text: `${c.title}: ${c.done ? (c.outcome || 'over') : c.next}` }))),
        d.pendingChoice ? h('p', { class: 'journal-note', text: 'A choice is waiting for you — answer "decide 1", "decide 2"…' }) : null,
        actions(d.actions)
      ];
    },
    skills(d) {
      return [
        section('Attributes', h('p', { text: Object.entries(d.stats || {}).map(([k, v]) => `${k.toUpperCase()} ${v}`).join(' · ') }),
          d.spend.length ? h('div', { class: 'journal-actions' }, h('span', { text: `${d.freePoints} point(s) to spend: ` }), d.spend.map(s => cmdBtn(`+${s.stat.toUpperCase()}`, s.cmd))) : null),
        section(d.combatClass ? `${cap(d.combatClass)} (class level ${d.classLevel})` : 'No class yet', list(d.abilities, a => h('span', { text: `${a.label}${a.ready ? '' : ' (recovering)'} — ${a.desc}` }))),
        d.paths.length ? section(`Paths (level ${d.pathLevel})`, list(d.paths, p => [h('span', { text: `${p.label}${p.chosen ? ' ✓' : ''} — ${p.desc}` }), ' ', p.chosen ? null : cmdBtn('Choose', p.cmd)])) : null
      ];
    },
    trade(d) {
      return [
        section(d.profession ? `${cap(d.profession.replace('_', ' '))} (level ${d.level})` : 'No trade yet',
          d.edge ? h('p', { text: d.edge }) : h('p', { class: 'dim', text: 'Do the work of a trade and it will find you.' }),
          d.work ? h('p', { class: 'dim', text: `Work: ${d.work}. Skill: ${d.skill}.` }) : null),
        d.commission ? section('A commission', h('p', { text: `${d.commission.who}: ${d.commission.pay} copper.` })) : null,
        d.inn ? section('Your inn', h('p', { text: `${d.inn.region}: ${d.inn.takings} copper waiting.` })) : null,
        d.contract ? section('Contract', h('p', { text: `${d.contract.target} in ${d.contract.region} — ${d.contract.fee} copper.` })) : null,
        d.masterworks ? section('Smithing', h('p', { text: `${d.masterworks} masterwork(s); ${d.smithRank}.` })) : null,
        actions(d.actions)
      ];
    },
    companions(d) {
      return [
        section('With you', list(d.party, c => [h('span', { text: `${c.name} — ${c.role}, loyalty ${c.loyalty}${c.ability ? `, ${c.ability}` : ''}${c.story ? ` (${c.story})` : ''}` }), ' ', cmdBtn('Dismiss', c.cmd)])),
        d.lost.length ? section('Dead', h('p', { text: d.lost.join(', ') })) : null,
        d.estranged.length ? section('Gone their own way', h('p', { text: d.estranged.join(', ') })) : null,
        actions(d.actions)
      ];
    },
    politics(d) {
      return [
        section('Here', list(d.here, f => h('span', { text: cap(f) }))),
        section('Seats of power', list(d.seats, s => h('span', { text: `${cap(s.faction)}: ${s.title} ${s.ruler}${s.regent ? ` (regent ${s.regent})` : ''}${s.disputedBy ? ` — disputed by ${s.disputedBy}` : ''}` }))),
        section('Between the powers', list(d.relations, r => h('span', { text: `${cap(r.a)} and ${r.b}: ${r.state}${r.state === 'war' ? (r.years ? ` (${r.years} year${r.years === 1 ? '' : 's'})` : ' (begun this year)') : ''}` }))),
        section('Your standing', list((d.standings || []), f => h('span', { text: `${f.label}: ${f.value} (${f.standing})` }))),
        actions(d.actions)
      ];
    },
    chronicle(d) {
      return [
        h('p', { class: 'dim', text: [d.world, d.era, d.date].filter(Boolean).join(' · ') }),
        section('Recent history', list(d.entries, e => h('span', { text: `${e.year}: ${e.text}` }))),
        d.legends.length ? section('Legends', list(d.legends, l => h('span', { text: `${l.name}, ${l.title} (${l.status})` }))) : null,
        actions(d.actions)
      ];
    },
    crafting(d) {
      return [
        section('Materials', list(d.materials, m => h('span', { text: `${m.name} × ${m.qty}` }))),
        section('Recipes', list(d.recipes, r => [h('span', { class: r.allowed ? '' : 'dim', text: `${r.label} — ${r.needs.map(n => `${n.qty} ${n.material}`).join(' + ')}${r.trades ? ` [${r.trades.join('/')}]` : ''}` }), ' ', r.allowed ? cmdBtn('Craft', r.cmd) : null]))
      ];
    },
    ai(d) {
      return [
        section('Narrator', h('p', { text: d.mode === 'ai' ? 'The AI narrator is telling your story.' : `The game's own narrator is telling your story (${d.reason || 'offline'}).` }),
          d.retryInSeconds ? h('p', { class: 'dim', text: `The AI will be tried again in ${d.retryInSeconds}s.` }) : null,
          h('p', { class: 'dim', text: `AI key configured on the server: ${d.keyConfigured ? 'yes' : 'no'}.` })),
        section('This story so far', h('p', { text: `${d.turns} narrated turns · ${d.removedSentences} invented sentences removed · ${d.regenerations} retold · ${d.fallbacks} told by the game's own narrator · ${d.repeats} repeats caught` }),
          h('p', { class: 'dim', text: `Memory: ${d.memory.notes} people and places noted, ${d.memory.chapters} chapters summarised.` }))
      ];
    }
  };

  async function load(tab) {
    current = tab;
    tabs.forEach(t => { const on = t.dataset.tab === tab; t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1; t.classList.toggle('selected', on); });
    body.setAttribute('aria-labelledby', `jtab-${tab}`);
    body.dataset.tab = tab;
    body.replaceChildren(h('p', { class: 'dim', text: 'Reading…' }));
    const { ok, data } = await window.apiCall('GET', `/journal/${tab}`);
    if (current !== tab) return;
    if (!ok) { body.replaceChildren(h('p', { class: 'journal-error', text: (data && data.error) || 'The journal could not be read.' })); return; }
    body.replaceChildren(...(RENDER[tab](data.data) || []).filter(Boolean));
    body.dataset.loaded = tab;
  }

  function open() {
    opener = document.activeElement;
    modal.classList.remove('hidden');
    load(current);
    const sel = tabs.find(t => t.dataset.tab === current) || tabs[0];
    sel.focus();
  }
  function close() {
    modal.classList.add('hidden');
    if (opener && opener.focus) opener.focus();
  }

  openBtn.addEventListener('click', open);
  if (closeBtn) closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    let j = null;
    if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = tabs.length - 1;
    if (j !== null) { e.preventDefault(); tabs[j].focus(); load(tabs[j].dataset.tab); }
  });
  tabs.forEach(t => t.addEventListener('click', () => load(t.dataset.tab)));
  // A command button: the same path as typing the command.
  body.addEventListener('click', async (e) => {
    const b = e.target.closest('.journal-cmd');
    if (!b || b.disabled) return;
    const input = document.getElementById('player-input');
    if (!input || typeof window.submitAction !== 'function') return;
    close();
    input.value = b.dataset.cmd;
    await window.submitAction();
  });
  // "j" opens the journal when not typing.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'j' || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || !modal.classList.contains('hidden')) return;
    if (!document.getElementById('input-area') || document.getElementById('input-area').classList.contains('hidden')) return;
    e.preventDefault(); open();
  });
}());
