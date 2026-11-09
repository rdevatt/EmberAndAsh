'use strict';

function updateAuthUI() {
  if (!el.authStatus) return;
  el.authStatus.textContent = client.isLoggedIn
    ? `Logged in${client.username ? ' as ' + client.username : ''}`
    : 'Guest session';
  const logoutForm = document.getElementById('form-logout');
  if (logoutForm) logoutForm.classList.toggle('hidden', !client.isLoggedIn);
  if (client.isLoggedIn) {
    el.formLogin.classList.add('hidden');
    el.formRegister.classList.add('hidden');
  } else if (el.formRegister.classList.contains('hidden')) {
    el.formLogin.classList.remove('hidden');
  }
}

function showToast(message) {
  let toast = document.getElementById('toast-notification');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-notification';
    toast.className = 'toast-notification';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function updateCharacterPanel(c) {
  if (!c) return;
  if (c.level !== undefined) {
    el.charLevel.textContent = `Level ${c.level}`;
  }
  if (c.background) el.charBackground.textContent = c.background;
  const nameEl = document.getElementById('char-name');
  if (nameEl) {
    nameEl.textContent = c.name || '';
    nameEl.classList.toggle('hidden', !c.name);
  }
  if (c.description) {
    el.charDescription.textContent = c.description;
    el.charDescription.classList.remove('hidden');
  }
  if (c.totalXP !== undefined && el.xpDisplay) {
    const xpNext = c.xpToNext !== null && c.xpToNext !== undefined ? ` (+${c.xpToNext} to next)` : ' (MAX)';
    el.xpDisplay.textContent = `XP: ${c.totalXP}${xpNext}`;
  }

  if (c.hp !== undefined && c.maxHp) {
    const pct = Math.max(0, Math.min(100, Math.round((c.hp / c.maxHp) * 100)));
    el.barHp.style.width = pct + '%';
    el.valHp.textContent = `${c.hp}/${c.maxHp}`;
  }
  if (c.mana !== undefined && c.maxMana) {
    const pct = Math.max(0, Math.min(100, Math.round((c.mana / c.maxMana) * 100)));
    el.barMp.style.width = pct + '%';
    el.valMp.textContent = `${c.mana}/${c.maxMana}`;
  }
  if (c.stamina !== undefined && c.maxStamina) {
    const pct = Math.max(0, Math.min(100, Math.round((c.stamina / c.maxStamina) * 100)));
    el.barSt.style.width = pct + '%';
    el.valSt.textContent = `${c.stamina}/${c.maxStamina}`;
  }

  if (c.stats) {
    el.statStr.textContent = c.stats.str ?? '—';
    el.statDex.textContent = c.stats.dex ?? '—';
    el.statVit.textContent = c.stats.vit ?? '—';
    el.statInt.textContent = c.stats.int ?? '—';
    el.statWis.textContent = c.stats.wis ?? '—';
    el.statCha.textContent = c.stats.cha ?? '—';
  }

  if (c.freePoints > 0) {
    el.freePointsBanner.classList.remove('hidden');
    el.freePointsCount.textContent = c.freePoints;
  } else {
    el.freePointsBanner.classList.add('hidden');
  }
}

function updateProgressionPanel(p) {
  if (!p) return;

  if (p.className) {
    el.classDisplay.textContent = `${p.className} Lv${p.classLevel || 1}`;
    el.classDisplay.classList.remove('dim');
  } else if (p.pendingClassOffer) {
    el.classDisplay.textContent = `Offer: ${p.pendingClassOffer.label} — type "yes" or "no"`;
    el.classDisplay.classList.remove('dim');
  } else {
    el.classDisplay.textContent = 'No class yet';
    el.classDisplay.classList.add('dim');
  }

  if (p.professionName) {
    el.profDisplay.textContent = `${p.professionRank || p.professionName} Lv${p.professionLevel || 1}`;
    el.profDisplay.classList.remove('dim');
  } else if (p.pendingProfOffer) {
    el.profDisplay.textContent = `Offer: ${p.pendingProfOffer.label} — type "yes" or "no"`;
    el.profDisplay.classList.remove('dim');
  } else {
    el.profDisplay.textContent = 'No profession yet';
    el.profDisplay.classList.add('dim');
  }
}

function updateEconomyPanel(e) {
  if (!e) return;

  if (e.weapon) {
    if (e.weapon.equipped) {
      const mods = e.weapon.modDisplay ? ` [${e.weapon.modDisplay}]` : '';
      el.gearWeapon.innerHTML = escHtml(e.weapon.label) + (mods ? `<div class="stat-mod-display">${escHtml(mods)}</div>` : '');
    } else {
      el.gearWeapon.textContent = 'Unarmed';
    }
    el.gearWeapon.classList.toggle('dim', !e.weapon.equipped);
  }

  if (e.armor) {
    if (e.armor.equipped) {
      const mods = e.armor.modDisplay ? ` [${e.armor.modDisplay}]` : '';
      el.gearArmor.innerHTML = escHtml(e.armor.label) + (mods ? `<div class="stat-mod-display">${escHtml(mods)}</div>` : '');
    } else {
      el.gearArmor.textContent = 'Unarmored';
    }
    el.gearArmor.classList.toggle('dim', !e.armor.equipped);
  }

  const craftedSection = document.getElementById('section-crafted-gear');
  const craftedList    = document.getElementById('crafted-gear-list');
  if (craftedSection && craftedList) {
    if (e.craftedGear && e.craftedGear.length > 0) {
      craftedSection.classList.remove('hidden');
      craftedList.innerHTML = e.craftedGear.map(g => {
        const typeLabel = g.isArmor ? 'Armor' : 'Weapon';
        const mods      = g.modDisplay ? `<div class="crafted-item-mods">${escHtml(g.modDisplay)}</div>` : '';
        return `<div class="crafted-item-row">
          <div class="crafted-item-name">${escHtml(g.name)}</div>
          <div class="crafted-item-quality">${escHtml(g.quality)} ${typeLabel}</div>
          ${mods}
        </div>`;
      }).join('');
    } else {
      craftedSection.classList.add('hidden');
    }
  }

  if (e.inventory !== undefined) {
    el.inventoryList.textContent = e.inventoryDisplay || 'Nothing.';
  }

  if (e.coinDisplay) {
    el.coinDisplay.textContent = e.coinDisplay;
  }

  if (e.reputationLabel) {
    el.reputationDisplay.textContent = `${e.reputationLabel}${e.region ? ' in ' + e.region : ''}`;
  }

  if (e.hasDeadGear) {
    el.sectionDeathGear.classList.remove('hidden');
    el.deathGearLocation.textContent = e.deathLocationLabel || 'Unknown location';
  } else {
    el.sectionDeathGear.classList.add('hidden');
  }

  const companionSection = document.getElementById('section-companions');
  const companionsList = document.getElementById('companions-list');
  if (companionSection && companionsList) {
    if (e.companions && e.companions.hasCompanions) {
      companionSection.classList.remove('hidden');
      companionsList.innerHTML = e.companions.list.map(c =>
        `<div class="companion-row">
          <span class="companion-name">${escHtml(c.name)}</span>
          <span class="companion-loyalty dim">(${escHtml(c.loyaltyLabel)})</span>
        </div>`
      ).join('');
    } else {
      companionSection.classList.add('hidden');
      companionsList.textContent = 'None.';
    }
  }
}

function escHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function updateRightPanel(r) {
  if (!r) return;
  if (r.regionLabel) {
    el.locationDisplay.textContent = r.regionLabel.toUpperCase();
  }

  if (r.location)     el.locationName.textContent = r.location;
  if (r.locationDesc) el.locationDesc.textContent = r.locationDesc;

  if (r.inCombat && r.enemy) {
    el.threatLabel.textContent  = 'ENEMY';
    el.enemyDisplay.classList.remove('hidden');
    el.npcDisplay.classList.add('hidden');
    el.neutralDisplay.classList.add('hidden');

    el.enemyName.textContent    = r.enemy.label;
    el.enemyDesc.textContent    = r.enemy.desc;

    const hpText = (r.enemy.currentHP !== undefined && r.enemy.maxHP !== undefined)
      ? `${r.enemy.currentHP}/${r.enemy.maxHP} [${r.enemy.hpLabel}]`
      : r.enemy.hpLabel;
    const bleedIndicator = r.enemy.isBleeding ? ' 🩸' : '';
    el.enemyHpLabel.textContent = hpText + bleedIndicator;

    el.enemyBehavior.textContent= `Behavior: ${r.enemy.behavior}`;
    el.barEnemy.style.width     = (r.enemy.hpPercent || 0) + '%';
  } else if (!r.inCombat && r.npc) {
    el.threatLabel.textContent  = 'NPC';
    el.npcDisplay.classList.remove('hidden');
    el.enemyDisplay.classList.add('hidden');
    el.neutralDisplay.classList.add('hidden');

    el.npcName.textContent      = r.npc.name;
    el.npcRapport.textContent   = `Rapport: ${r.npc.rapport}/100`;
  } else {
    el.threatLabel.textContent  = 'SURROUNDINGS';
    el.neutralDisplay.classList.remove('hidden');
    el.enemyDisplay.classList.add('hidden');
    el.npcDisplay.classList.add('hidden');

    el.sceneContext.textContent  = r.sceneContext || 'Exploring';
    el.ambientThreats.textContent= r.regionThreats && r.regionThreats.length
      ? 'Threats: ' + r.regionThreats.join(', ')
      : '—';
  }

  if (r.storySummary) {
    el.storySummary.textContent = r.storySummary;
  }
}

function updateBoardPanel(board) {
  if (!board) return;
  const section    = document.getElementById('section-board');
  const label      = document.getElementById('board-label');
  const boardList  = document.getElementById('board-quests-list');
  const boardWrap  = document.getElementById('board-quests-wrap');
  const activeList = document.getElementById('active-quests-list');
  const activeWrap = document.getElementById('active-quests-wrap');
  if (!section || !boardList || !activeList) return;

  const hasActive = board.activeQuests && board.activeQuests.length > 0;
  if (!board.available && !hasActive) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');

  if (label) label.textContent = board.available && board.boardLabel ? board.boardLabel.toUpperCase() : 'QUESTS';
  if (boardWrap) boardWrap.classList.toggle('hidden', !board.available);

  boardList.innerHTML = '';
  (board.quests || []).forEach(q => {
    const row = document.createElement('div');
    row.className = 'quest-row';
    row.innerHTML = `
      <div class="quest-label ${q.isAdvance ? 'advance-quest' : ''}">[${q.index}] ${escapeHtml(q.label)}</div>
      <div class="quest-giver dim">${escapeHtml(q.giver || '')} — <span class="quest-difficulty-${escapeHtml(q.difficulty || 'normal')}">${escapeHtml((q.difficulty || 'normal').toUpperCase())}</span></div>
      <div class="quest-reward">${escapeHtml(q.coinDisplay)} + XP</div>`;
    const btn = document.createElement('button');
    btn.className = 'story-btn quest-action-btn';
    btn.textContent = 'Accept';
    btn.title = q.desc || '';
    btn.addEventListener('click', () => runCommand(`accept quest ${q.index}`));
    row.appendChild(btn);
    boardList.appendChild(row);
  });

  if (!hasActive) {
    activeWrap.classList.add('hidden');
  } else {
    activeWrap.classList.remove('hidden');
    activeList.innerHTML = '';
    board.activeQuests.forEach((q, i) => {
      const row = document.createElement('div');
      row.className = 'active-quest-row';
      const pct = q.targetCount > 1 ? Math.round((q.progress / q.targetCount) * 100) : (q.isComplete ? 100 : 0);
      const progressHtml = q.targetCount > 1
        ? `<div class="quest-progress-bar"><div class="quest-progress-fill" style="width:${pct}%"></div></div><div class="active-quest-progress">${q.progress}/${q.targetCount}</div>`
        : '';
      const statusHtml = q.status ? `<div class="dim small">${escapeHtml(q.status)}</div>` : '';
      row.innerHTML = `<div class="active-quest-label">${escapeHtml(q.label)}</div>${progressHtml}${statusHtml}<div class="active-quest-progress">${escapeHtml(q.coinDisplay)}</div>`;
      const btn = document.createElement('button');
      btn.className = 'story-btn quest-action-btn';
      btn.textContent = 'Abandon';
      btn.addEventListener('click', () => {
        if (confirm(`Abandon "${q.label}"?`)) runCommand(`abandon quest ${i + 1}`);
      });
      row.appendChild(btn);
      activeList.appendChild(row);
    });
  }
}

// ---------------------------------------------
// Story, factions, party and combat-action panels
// ---------------------------------------------
function updateStoryPanel(story, narration) {
  const section = document.getElementById('section-story');
  if (!section) return;
  const mode = document.getElementById('narration-mode');
  if (mode) {
    mode.textContent = narration === 'ai' ? '· AI narration' : narration === 'offline' ? '· offline narration' : '';
    mode.title = narration === 'offline' ? 'The AI narrator is unavailable; the game engine narrates. Gameplay is unaffected.' : '';
  }
  if (!story) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  const chapter = document.getElementById('story-chapter');
  const objective = document.getElementById('story-objective');
  const choices = document.getElementById('story-choices');
  if (story.ended) {
    chapter.textContent = `THE END — ${story.ending}`;
    objective.textContent = `Postgame: bounties continue; at the Shattered Throne, "enter the rift". Deepest rift: ${story.riftDepth || 0}.`;
    choices.innerHTML = '';
    return;
  }
  chapter.textContent = `Chapter ${story.chapter}: ${story.title}`;
  objective.textContent = (story.locked ? '✕ ' : '► ') + story.objective;
  choices.innerHTML = '';
  (story.options || []).forEach(o => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'choice-btn';
    b.disabled = !o.available;
    b.textContent = `${o.n}. ${o.label}${o.available ? '' : ' (closed)'}`;
    b.addEventListener('click', () => {
      if (window.confirm(`Choose: "${o.label}"?\n\nStory decisions are permanent.`)) runCommand(`choose ${o.n}`);
    });
    choices.appendChild(b);
  });
}

function updateFactionsPanel(list) {
  const section = document.getElementById('section-factions');
  const box = document.getElementById('factions-list');
  if (!section || !box || !Array.isArray(list)) return;
  section.classList.remove('hidden');
  box.innerHTML = list.map(f => {
    const pct = Math.round((f.value + 100) / 2);
    return `<div class="faction-row" title="${escHtml(f.label)}: ${f.value}">
      <span class="faction-name">${escHtml(f.label)}</span>
      <span class="faction-standing ${f.value < 0 ? 'neg' : f.value >= 50 ? 'pos' : ''}">${escHtml(f.standing)}</span>
      <div class="faction-bar"><div class="faction-fill" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
}

function updatePartyPanel(party) {
  const section = document.getElementById('section-companions');
  const box = document.getElementById('companions-list');
  if (!section || !box || !Array.isArray(party)) return;
  if (!party.length) { section.classList.add('hidden'); box.textContent = 'None.'; return; }
  section.classList.remove('hidden');
  box.innerHTML = party.map(c => `<div class="companion-row">
      <span class="companion-name">${escHtml(c.name)}</span>
      <span class="companion-loyalty dim">${escHtml(c.role)} · loyalty ${Number(c.loyalty) || 0}${c.hired ? ' · hired' : ''}</span>
    </div>`).join('');
}

function updateCombatActions(data) {
  const box = document.getElementById('combat-actions');
  if (!box) return;
  const inCombat = data && data.rightPanel && data.rightPanel.inCombat;
  if (!inCombat) { box.innerHTML = ''; return; }
  // The buttons say exactly what the character does; nothing is drawn or
  // used unless the player chooses it.
  const w = data.weapon;
  const buttons = w && !w.drawn
    ? [{ label: `Draw ${w.name}`, cmd: `I draw my ${w.name}` }, { label: 'Fight barehanded', cmd: 'I punch it' }]
    : w ? [{ label: 'Attack', cmd: `I strike at it with my ${w.name}` }]
    : [{ label: 'Punch', cmd: 'I punch it' }];
  buttons.push({ label: 'Defend', cmd: 'I raise my guard and defend' });
  for (const a of (data.abilities || [])) {
    if (a.id === 'power_attack' && (data.abilities || []).length > 3) continue;
    buttons.push({ label: a.label, cmd: `I use ${a.label}`, disabled: !a.ready, title: a.desc });
  }
  if (data.potions) buttons.push({ label: `Potion (${data.potions})`, cmd: 'drink healing potion' });
  if (data.manaPotions) buttons.push({ label: `Mana (${data.manaPotions})`, cmd: 'drink mana potion' });
  buttons.push({ label: 'Inspect', cmd: 'inspect' }, { label: 'Flee', cmd: 'flee', cls: 'danger' });
  box.innerHTML = '';
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `combat-btn ${b.cls || ''}`;
    btn.textContent = b.label;
    btn.disabled = !!b.disabled;
    if (b.title) btn.title = b.title;
    btn.addEventListener('click', () => runCommand(b.cmd));
    box.appendChild(btn);
  }
}

document.addEventListener('click', (ev) => {
  const btn = ev.target.closest && ev.target.closest('.quick-btn[data-cmd]');
  if (btn) runCommand(btn.dataset.cmd);
});

// ---------------------------------------------
// Living world: date, age, titles, after-ending choices, scenes, worlds
// ---------------------------------------------
function updateWorldPanel(w) {
  const line = document.getElementById('world-line');
  const ageEl = document.getElementById('char-age');
  const titles = document.getElementById('char-titles');
  const after = document.getElementById('after-ending');
  if (!w) { if (line) line.textContent = ''; if (after) after.classList.add('hidden'); return; }
  if (line) line.textContent = `${w.date} · ${w.era}${w.realm ? ` · ${w.realm}` : ''}${w.crises ? ` · ${w.crises} crisis${w.crises > 1 ? 'es' : ''}` : ''}${w.saga ? `\nSaga — ${w.saga}` : ''}`;
  if (ageEl) ageEl.textContent = `Age ${w.age} (${w.ageBand})${w.deceased ? ' — deceased' : ''}`;
  if (titles) titles.textContent = (w.titles || []).join(' · ');
  if (after) after.classList.toggle('hidden', !(w.afterEnding || w.deceased));
  const cont = document.getElementById('btn-after-continue');
  if (cont) cont.classList.toggle('hidden', !!w.deceased);
}

let sceneHidden = false;
try { sceneHidden = localStorage.getItem('ea-hide-art') === '1'; } catch (e) { /* ignore */ }
function showScene(scene, inCreation) {
  const stage = document.getElementById('scene-stage');
  if (!stage) return;
  stage.classList.toggle('hidden', sceneHidden || !!inCreation);
  if (sceneHidden) return;
  EmberScene.render(document.getElementById('scene-holder'), document.getElementById('scene-caption'), scene);
}

async function afterEnding(path, body) {
  if (client.isLoading) return;
  setLoading(true);
  const { ok, data } = await apiCall('POST', path, body || {});
  setLoading(false);
  if (!ok) { appendSystemMessage(data.error || 'Something went wrong.'); return; }
  if (data.inCreation) {
    el.storyContent.innerHTML = '';
    try { localStorage.removeItem('storyHistory'); } catch (e) { /* ignore */ }
    await enterSession(data, null);
    if (data.output) appendSystemMessage(data.output.split('\n\n')[0]);
    return;
  }
  applyPanels(data);
  if (data.output) appendCommandOutput(null, data.output);
}

async function loadWorldsList() {
  const box = document.getElementById('worlds-list');
  if (!box) return;
  const { ok, data } = await apiCall('GET', '/world');
  if (!ok) { box.textContent = 'Could not load worlds.'; return; }
  const parts = [];
  if (data.current) parts.push(`<div><b>${escHtml(data.current.name)}</b> — ${escHtml(data.current.date)} · ${escHtml(data.current.era)}</div>`);
  const others = (data.worlds || []).filter(w => !data.current || w.id !== data.current.id);
  if (others.length) parts.push('<div style="margin-top:6px">Other worlds (kept safe):</div>' + others.map(w => `<div>• ${escHtml(w.name || w.id)} — ${w.events} events, ${w.figures} legends</div>`).join(''));
  const arch = data.archived || [];
  if (arch.length) parts.push('<div style="margin-top:6px">Characters set aside:</div>' + arch.map(c => `<div class="archived-row">• ${escHtml(c.name || 'Unnamed')} (Lv ${escHtml(c.level)}) <button type="button" class="quick-btn resume-btn" data-id="${escHtml(c.character_id)}">Resume</button></div>`).join(''));
  if (!parts.length) parts.push('<div>Only this world so far.</div>');
  box.innerHTML = parts.join('');
  box.querySelectorAll('.resume-btn').forEach(b => b.addEventListener('click', async () => {
    if (!window.confirm('Switch to this character? Your current character will be set aside safely and can be resumed later.')) return;
    document.getElementById('btn-close-saves').click();
    await afterEnding('/world/resume', { characterId: b.dataset.id });
  }));
}

document.addEventListener('DOMContentLoaded', () => {
  const bind = (id, fn) => { const b = document.getElementById(id); if (b) b.addEventListener('click', fn); };
  bind('btn-after-continue', () => afterEnding('/world/continue'));
  bind('btn-after-same', () => {
    const y = window.prompt('How many years later does the new character begin? (0–200)', '20');
    if (y === null) return;
    afterEnding('/world/new-character', { mode: 'same', years: parseInt(y, 10) || 0 });
  });
  bind('btn-after-new', () => {
    if (!window.confirm('Start an entirely new world? This world and its characters are kept and can be resumed from the Saves menu.')) return;
    afterEnding('/world/new-character', { mode: 'new' });
  });
  bind('btn-scene-hide', () => {
    sceneHidden = !sceneHidden;
    try { localStorage.setItem('ea-hide-art', sceneHidden ? '1' : '0'); } catch (e) { /* ignore */ }
    document.getElementById('scene-stage').classList.toggle('hidden', sceneHidden);
    if (sceneHidden) appendSystemMessage('Illustrations hidden. Use the Hide art button (or reload) to bring them back.');
  });
  bind('btn-scene-still', () => {
    let still = false;
    try { still = localStorage.getItem('ea-still') !== '1'; localStorage.setItem('ea-still', still ? '1' : '0'); } catch (e) { /* ignore */ }
    const b = document.getElementById('btn-scene-still'); if (b) b.textContent = still ? 'Animate' : 'Still';
  });
  bind('btn-saves', () => setTimeout(loadWorldsList, 50));
});

// ---------------------------------------------
// Mature content preferences (server enforces them; this only edits)
// ---------------------------------------------
function renderContentPrefs(data) {
  const box = document.getElementById('content-prefs');
  const note = document.getElementById('content-prefs-note');
  const adult = document.getElementById('toggle-adult');
  if (!box || !data || !data.categories) return;
  if (adult) adult.checked = !!(data.eligibility && data.eligibility.adultConfirmed);
  box.innerHTML = '';
  for (const c of data.categories) {
    const row = document.createElement('div');
    row.className = 'content-row';
    row.dataset.category = c.key;
    const label = document.createElement('div');
    label.className = 'content-label small';
    label.textContent = c.label;
    const seg = document.createElement('div');
    seg.className = 'segmented';
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-label', c.label);
    for (const lvl of ['off', 'mild', 'mature']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'seg-btn' + (c.requested === lvl ? ' selected' : '');
      b.dataset.level = lvl;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', c.requested === lvl ? 'true' : 'false');
      b.textContent = lvl === 'off' ? 'Off' : lvl === 'mild' ? 'Mild' : 'Mature';
      b.addEventListener('click', () => saveContentPrefs({ prefs: { [c.key]: lvl } }));
      seg.appendChild(b);
    }
    row.appendChild(label);
    row.appendChild(seg);
    if (c.limited || (c.note && c.requested !== 'off')) {
      const n = document.createElement('div');
      n.className = 'content-limit dim small';
      n.textContent = c.limited ? `In effect: ${c.effective} — ${c.limited}.` : c.note;
      row.appendChild(n);
    }
    box.appendChild(row);
  }
  if (note) note.textContent = data.eligibility ? data.eligibility.notice : '';
}

async function loadContentPrefs() {
  const { ok, data } = await apiCall('GET', '/settings/content');
  if (ok) renderContentPrefs(data);
}

async function saveContentPrefs(body) {
  const { ok, data } = await apiCall('POST', '/settings/content', body);
  if (!ok) { appendSystemMessage(`[${data.error || 'Could not save that setting.'}]`); if (data.categories) renderContentPrefs(data); return; }
  renderContentPrefs(data);
  refreshPanels();
}

document.addEventListener('DOMContentLoaded', () => {
  const adult = document.getElementById('toggle-adult');
  if (adult) adult.addEventListener('change', () => saveContentPrefs({ adultConfirmed: adult.checked }));
});

// Submits a command as if the player had typed it.
function runCommand(text) {
  if (client.inCreation || client.isLoading) return;
  el.playerInput.value = text;
  updateCharCount();
  submitAction();
}

async function refreshPanels() {
  const { ok, data } = await apiCall('GET', '/state');
  if (!ok) return;
  applyPanels(data);
  client.inCreation = data.inCreation || false;
}

function appendPlayerAction(text, isHistory = false) {
  const entry = document.createElement('div');
  entry.className = 'story-entry player-entry';
  entry.innerHTML = `<div class="player-action">&gt; ${escapeHtml(text)}</div>`;
  el.storyContent.appendChild(entry);

  if (!isHistory) {
    client.lastPlayerEntry = entry;
  }

  return entry;
}

const MAX_LOCAL_HISTORY = 30;

// Local story cache is tied to the session that wrote it.
function saveStoryEntryLocally(playerAction, text) {
  if (!text) return;
  try {
    const history = JSON.parse(localStorage.getItem('storyHistory') || '[]');
    history.push({ playerAction, text, ts: Date.now(), sid: client.sessionId });
    while (history.length > MAX_LOCAL_HISTORY) history.shift();
    localStorage.setItem('storyHistory', JSON.stringify(history));
  } catch (e) { }
}

function popLastLocalStoryEntry() {
  try {
    const history = JSON.parse(localStorage.getItem('storyHistory') || '[]');
    history.pop();
    localStorage.setItem('storyHistory', JSON.stringify(history));
  } catch (e) { }
}

// Non-story messages (welcome, errors): no buttons, not cached.
function appendSystemMessage(text) {
  if (!text) return null;
  const entry = document.createElement('div');
  entry.className = 'story-entry system-entry';
  entry.innerHTML = `<div class="announcement">${escapeHtml(text)}</div>`;
  el.storyContent.appendChild(entry);
  afterStoryAppend();
  return entry;
}

// Instant command results: cached for reload, but no retry/edit buttons.
function appendCommandOutput(playerAction, text) {
  if (!text) return null;
  // The server's "last action" is now this command, so earlier
  // retry/edit/undo buttons would act on the wrong exchange.
  el.storyContent.querySelectorAll('.story-entry-buttons').forEach(b => b.remove());
  client.lastAIEntry = null;
  saveStoryEntryLocally(playerAction, text);
  const entry = document.createElement('div');
  entry.className = 'story-entry command-entry';
  entry.innerHTML = `<div class="announcement command-output">${escapeHtml(text)}</div>`;
  el.storyContent.appendChild(entry);
  afterStoryAppend();
  return entry;
}

function afterStoryAppend() {
  scrollToBottom();
  if (window.innerWidth <= 768 && typeof setMobilePanel === 'function') setMobilePanel('center');
}

function loadStoryHistoryFromLocal() {
  try {
    const history = JSON.parse(localStorage.getItem('storyHistory') || '[]')
      .filter(h => !h.sid || h.sid === client.sessionId);
    if (!history.length) return false;

    const divider = document.createElement('div');
    divider.className = 'story-entry';
    divider.innerHTML = '<div class="ai-response history-divider">— Previous session —</div>';
    el.storyContent.appendChild(divider);

    for (const entry of history) {
      if (entry.playerAction) appendPlayerAction(entry.playerAction, true);
      if (entry.text) appendStory(null, entry.text, false, true);
    }

    const endDivider = document.createElement('div');
    endDivider.className = 'story-entry';
    endDivider.innerHTML = '<div class="ai-response history-divider">— Continuing —</div>';
    el.storyContent.appendChild(endDivider);
    return true;
  } catch (e) {
    return false;
  }
}

function appendStory(playerAction, text, isCreation = false, skipSave = false, opts = {}) {
  if (!text) return null;

  if (!skipSave && !isCreation) {
    saveStoryEntryLocally(playerAction, text);
  }

  const entry = document.createElement('div');
  entry.className = 'story-entry';

  const parts = splitNarrativeAndAnnouncements(text);
  let html    = '';

  if (parts.narrative) {
    const cssClass = isCreation ? 'creation-text' : 'ai-response';
    html += `<div class="${cssClass}">${escapeHtml(parts.narrative)}</div>`;
  }

  if (parts.announcements) {
    html += `<div class="announcement">${escapeHtml(parts.announcements.trim())}</div>`;
  }

  entry.innerHTML = html;

  if (!isCreation && (parts.narrative || parts.announcements) && !skipSave) {
    // Retry / edit / undo only ever apply to the latest action.
    el.storyContent.querySelectorAll('.story-entry-buttons').forEach(b => b.remove());
    const playerInputEntry = client.lastPlayerEntry;
    attachStoryEntryButtons(entry, playerInputEntry, opts.undoable !== false);
    client.lastAIEntry = entry;
    client.canUndo = true;
  }

  el.storyContent.appendChild(entry);
  afterStoryAppend();

  return entry;
}

function splitNarrativeAndAnnouncements(text) {
  const lines             = text.split('\n');
  const narrativeLines    = [];
  const announcementLines = [];
  let inAnnouncements     = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!inAnnouncements && (trimmed.startsWith('[') || trimmed.startsWith('— DARKNESS'))) {
      inAnnouncements = true;
    }
    if (inAnnouncements) {
      announcementLines.push(line);
    } else {
      narrativeLines.push(line);
    }
  }

  return {
    narrative:     narrativeLines.join('\n').trim(),
    announcements: announcementLines.join('\n').trim()
  };
}

function scrollToBottom() {
  el.storyOutput.scrollTop = el.storyOutput.scrollHeight;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setLoading(loading) {
  client.isLoading         = loading;
  el.btnSubmit.disabled    = loading;
  el.playerInput.disabled  = loading;
  el.loadingOverlay.classList.toggle('hidden', !loading);
}

function updateCharCount() {
  const len = el.playerInput.value.length;
  el.charCount.textContent = `${len} / 500`;
}

function openSettings() {
  el.modalSettings.classList.remove('hidden');
  loadContentPrefs();
  el.authStatus.textContent = client.isLoggedIn
    ? `Logged in as ${client.username}`
    : 'Guest session';
}

function closeSettings() {
  el.modalSettings.classList.add('hidden');
  clearAuthErrors();
}

function clearAuthErrors() {
  el.authError.classList.add('hidden');
  el.regError.classList.add('hidden');
}

function showAuthError(msg) {
  el.authError.textContent = msg;
  el.authError.classList.remove('hidden');
}

function showRegError(msg) {
  el.regError.textContent = msg;
  el.regError.classList.remove('hidden');
}

async function handleLogin() {
  const username   = el.inputUsername.value.trim();
  const password   = el.inputPassword.value;
  const rememberMe = el.checkRememberMe ? el.checkRememberMe.checked : false;

  if (!username || !password) {
    showAuthError('Username and password required.');
    return;
  }

  setLoading(true);
  const { ok, data } = await apiCall('POST', '/auth/login', {
    username, password, sessionId: client.sessionId, rememberMe
  });
  setLoading(false);

  if (!ok) {
    showAuthError(data.error || 'Login failed.');
    return;
  }

  client.sessionId  = data.sessionId;
  client.isLoggedIn = true;
  client.username   = data.username;
  localStorage.setItem('sessionId', data.sessionId);
  if (data.rememberToken) localStorage.setItem('rememberToken', data.rememberToken);

  if (el.toggleNsfw) el.toggleNsfw.checked = !!data.nsfwEnabled;
  el.inputPassword.value = '';
  clearAuthErrors();
  updateAuthUI();
  closeSettings();

  // Switch the screen to the account's game.
  const keepStory = data.carriedGuest;
  if (!keepStory) {
    el.storyContent.innerHTML = '';
    localStorage.removeItem('storyHistory');
  }
  const welcome = data.carriedGuest
    ? `Logged in as ${data.username}. Your character is now saved to slot ${data.saveSlot}.`
    : `Welcome, ${data.username}.`;
  if (keepStory) {
    appendSystemMessage(welcome);
    applyPanels(data);
  } else {
    await enterSession(data, welcome);
  }
}

async function handleLogout() {
  await apiCall('POST', '/auth/logout', { rememberToken: localStorage.getItem('rememberToken') });
  localStorage.removeItem('rememberToken');
  localStorage.removeItem('sessionId');
  localStorage.removeItem('storyHistory');
  window.location.reload();
}

async function handleRegister() {
  const username = el.inputRegUsername.value.trim();
  const password = el.inputRegPassword.value;
  const email    = el.inputRegEmail.value.trim();

  if (!username || !password) {
    showRegError('Username and password required.');
    return;
  }

  const { ok, data } = await apiCall('POST', '/auth/register', {
    username, password, email: email || null
  });

  if (!ok) {
    showRegError(data.error || 'Registration failed.');
    return;
  }

  el.inputUsername.value = username;
  el.inputPassword.value = password;
  el.formRegister.classList.add('hidden');
  el.formLogin.classList.remove('hidden');
  await handleLogin();
}

async function handleNsfwToggle() {
  const enabled = el.toggleNsfw.checked;
  const { ok, data } = await apiCall('POST', '/settings/nsfw', { enabled });
  if (!ok) {
    el.toggleNsfw.checked = !enabled;
    appendSystemMessage(`[${data.error || 'Could not change the setting.'}]`);
    return;
  }
  appendSystemMessage(enabled ? '[Adult content enabled.]' : '[Adult content disabled.]');
}

async function handleSave() {
  if (!client.isLoggedIn) {
    showToast('Guest progress saves automatically. Log in to use save slots.');
    openSettings();
    return;
  }
  const { ok, data } = await apiCall('POST', '/saves/save');
  if (ok) {
    el.btnSave.textContent = 'SAVED';
    setTimeout(() => { el.btnSave.textContent = 'SAVE'; }, 1500);
  } else {
    showToast(data.error || 'Save failed.');
  }
}
