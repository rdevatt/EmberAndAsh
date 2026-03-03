'use strict';

function updateAuthUI() {
  if (!el.authStatus) return;
  el.authStatus.textContent = client.isLoggedIn
    ? `Logged in as ${client.username}`
    : 'Guest session';
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
  if (c.description) {
    el.charDescription.textContent = c.description;
    el.charDescription.classList.remove('hidden');
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

  if (p.totalXP !== undefined) {
    const xpNext = p.xpToNext !== null ? ` (+${p.xpToNext} to next)` : ' (MAX)';
    el.xpDisplay.textContent = `XP: ${p.totalXP}${xpNext}`;
  }

  if (p.className) {
    el.classDisplay.textContent = `${p.className} Lv${p.classLevel || 1}`;
    el.classDisplay.classList.remove('dim');
  } else {
    el.classDisplay.textContent = 'No class yet';
    el.classDisplay.classList.add('dim');
  }

  if (p.professionName) {
    el.profDisplay.textContent = `${p.professionRank || p.professionName} Lv${p.professionLevel || 1}`;
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
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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
  const activeList = document.getElementById('active-quests-list');
  const activeWrap = document.getElementById('active-quests-wrap');
  if (!section || !boardList || !activeList) return;

  if (!board.available) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');

  if (label && board.boardLabel) label.textContent = board.boardLabel.toUpperCase();

  boardList.innerHTML = '';
  (board.quests || []).forEach(q => {
    const row = document.createElement('div');
    row.className = 'quest-row';
    row.innerHTML = `
      <div class="quest-label ${q.isAdvance ? 'advance-quest' : ''}">[${q.index}] ${q.label}</div>
      <div class="quest-giver dim">${q.giver} — <span class="quest-difficulty-${q.difficulty || 'normal'}">${(q.difficulty||'normal').toUpperCase()}</span></div>
      <div class="quest-reward">${q.coinDisplay} + XP</div>`;
    boardList.appendChild(row);
  });

  if (!board.activeQuests || board.activeQuests.length === 0) {
    activeWrap.classList.add('hidden');
  } else {
    activeWrap.classList.remove('hidden');
    activeList.innerHTML = '';
    board.activeQuests.forEach(q => {
      const row = document.createElement('div');
      row.className = 'active-quest-row';
      const pct = q.targetCount > 1 ? Math.round((q.progress / q.targetCount) * 100) : (q.isComplete ? 100 : 0);
      const progressHtml = q.targetCount > 1
        ? `<div class="quest-progress-bar"><div class="quest-progress-fill" style="width:${pct}%"></div></div><div class="active-quest-progress">${q.progress}/${q.targetCount}</div>`
        : q.isComplete ? `<div class="quest-complete-indicator">✓ READY TO COMPLETE</div>` : '';
      row.innerHTML = `<div class="active-quest-label">${q.label}</div>${progressHtml}<div class="active-quest-progress">${q.coinDisplay}</div>`;
      activeList.appendChild(row);
    });
  }
}

async function refreshPanels() {
  const { ok, data } = await apiCall('GET', '/state');
  if (!ok) return;

  if (data.character)   updateCharacterPanel(data.character);
  if (data.progression) updateProgressionPanel(data.progression);
  if (data.economy)     updateEconomyPanel(data.economy);
  if (data.rightPanel)  updateRightPanel(data.rightPanel);
  if (data.board)       updateBoardPanel(data.board);

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

function saveStoryEntryLocally(playerAction, text) {
  if (!text) return;
  try {
    const history = JSON.parse(localStorage.getItem('storyHistory') || '[]');
    history.push({ playerAction, text, ts: Date.now() });
    while (history.length > MAX_LOCAL_HISTORY) history.shift();
    localStorage.setItem('storyHistory', JSON.stringify(history));
  } catch (e) { }
}

function loadStoryHistoryFromLocal() {
  try {
    const history = JSON.parse(localStorage.getItem('storyHistory') || '[]');
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

function appendStory(playerAction, text, isCreation = false, skipSave = false) {
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

  if (!isCreation && parts.narrative && !skipSave) {
    const playerInputEntry = client.lastPlayerEntry;
    attachStoryEntryButtons(entry, playerInputEntry);
    client.lastAIEntry = entry;
    client.canUndo = true;
  }

  el.storyContent.appendChild(entry);

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

  const { ok, data } = await apiCall('POST', '/auth/login', {
    username, password, sessionId: client.sessionId, rememberMe
  });

  if (!ok) {
    showAuthError(data.error || 'Login failed.');
    return;
  }

  client.sessionId  = data.sessionId;
  client.isLoggedIn = true;
  client.username   = data.username;
  localStorage.setItem('sessionId', data.sessionId);

  if (data.rememberToken) {
    localStorage.setItem('rememberToken', data.rememberToken);
  }

  el.authStatus.textContent = `Logged in as ${data.username}`;
  el.toggleNsfw.checked     = !!data.nsfwEnabled;
  clearAuthErrors();
  closeSettings();
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

  await apiCall('POST', '/settings/nsfw', { enabled });

  appendStory(null, enabled
    ? '[Adult content enabled.]'
    : '[Adult content disabled.]',
  false);
}

async function handleSave() {
  if (!client.isLoggedIn) {
    openSettings();
    return;
  }
  const { ok } = await apiCall('POST', '/saves/save');
  if (ok) {
    el.btnSave.textContent = 'SAVED';
    setTimeout(() => { el.btnSave.textContent = 'SAVE'; }, 1500);
  }
}
