'use strict';

// =============================================================
// EMBER AND ASH — GAME CLIENT
// Handles all UI updates, API calls, and user interaction.
// No game logic lives here — that's all server-side.
// =============================================================


// =============================================
// STATE
// =============================================
const client = {
  sessionId:     localStorage.getItem('sessionId') || null,
  isLoggedIn:    false,
  username:      null,
  isLoading:     false,
  inCreation:    true,
  creationStep:  1,   // 1-4 wizard steps
  // Gathered creation data
  creation: {
    name:       '',
    age:        null,
    gender:     null,
    heightText: '',
    buildKey:   '',
    features:   '',
    bgKey:      null,
    bgIndex:    null,   // 1-based list index for server
    bgFreeform: '',
    envKey:     null,
    envIndex:   null,
  }
};


// =============================================
// DOM REFERENCES
// =============================================
const el = {
  // Story
  storyContent:    document.getElementById('story-content'),
  storyOutput:     document.getElementById('story-output'),
  playerInput:     document.getElementById('player-input'),
  btnSubmit:       document.getElementById('btn-submit'),
  charCount:       document.getElementById('char-count'),

  // Header
  locationDisplay: document.getElementById('location-display'),

  // Left panel
  charLevel:       document.getElementById('char-level'),
  charBackground:  document.getElementById('char-background'),
  charDescription: document.getElementById('char-description'),
  barHp:           document.getElementById('bar-hp'),
  barMp:           document.getElementById('bar-mp'),
  barSt:           document.getElementById('bar-st'),
  valHp:           document.getElementById('val-hp'),
  valMp:           document.getElementById('val-mp'),
  valSt:           document.getElementById('val-st'),
  statStr:         document.getElementById('stat-str'),
  statDex:         document.getElementById('stat-dex'),
  statVit:         document.getElementById('stat-vit'),
  statInt:         document.getElementById('stat-int'),
  statWis:         document.getElementById('stat-wis'),
  statCha:         document.getElementById('stat-cha'),
  freePointsBanner:document.getElementById('free-points-banner'),
  freePointsCount: document.getElementById('free-points-count'),
  xpDisplay:       document.getElementById('xp-display'),
  classDisplay:    document.getElementById('class-display'),
  profDisplay:     document.getElementById('profession-display'),
  gearWeapon:      document.getElementById('gear-weapon'),
  gearArmor:       document.getElementById('gear-armor'),
  inventoryList:   document.getElementById('inventory-list'),
  coinDisplay:     document.getElementById('coin-display'),
  reputationDisplay:document.getElementById('reputation-display'),

  // Right panel
  threatLabel:     document.getElementById('threat-label'),
  enemyDisplay:    document.getElementById('enemy-display'),
  npcDisplay:      document.getElementById('npc-display'),
  neutralDisplay:  document.getElementById('neutral-display'),
  enemyName:       document.getElementById('enemy-name'),
  enemyDesc:       document.getElementById('enemy-desc'),
  barEnemy:        document.getElementById('bar-enemy'),
  enemyHpLabel:    document.getElementById('enemy-hp-label'),
  enemyBehavior:   document.getElementById('enemy-behavior'),
  npcName:         document.getElementById('npc-name'),
  npcRapport:      document.getElementById('npc-rapport'),
  sceneContext:    document.getElementById('scene-context-display'),
  ambientThreats:  document.getElementById('ambient-threats'),
  locationName:    document.getElementById('location-name'),
  locationDesc:    document.getElementById('location-desc'),
  storySummary:    document.getElementById('story-summary'),
  sectionDeathGear:document.getElementById('section-deathgear'),
  deathGearLocation:document.getElementById('death-gear-location'),

  // Settings modal
  modalSettings:   document.getElementById('modal-settings'),
  btnSettings:     document.getElementById('btn-settings'),
  btnCloseSettings:document.getElementById('btn-close-settings'),
  toggleNsfw:      document.getElementById('toggle-nsfw'),
  authStatus:      document.getElementById('auth-status'),
  formLogin:       document.getElementById('form-login'),
  formRegister:    document.getElementById('form-register'),
  inputUsername:   document.getElementById('input-username'),
  inputPassword:   document.getElementById('input-password'),
  inputRegUsername:document.getElementById('input-reg-username'),
  inputRegPassword:document.getElementById('input-reg-password'),
  inputRegEmail:   document.getElementById('input-reg-email'),
  btnLogin:        document.getElementById('btn-login'),
  btnRegister:     document.getElementById('btn-register'),
  btnShowRegister: document.getElementById('btn-show-register'),
  btnShowLogin:    document.getElementById('btn-show-login'),
  authError:       document.getElementById('auth-error'),
  regError:        document.getElementById('reg-error'),

  // Save
  btnSave:         document.getElementById('btn-save'),

  // Loading
  loadingOverlay:  document.getElementById('loading-overlay'),

  // Input area wrapper (hidden during creation)
  inputArea:       document.getElementById('input-area'),

  // Creation wizard
  creationWizard:  document.getElementById('creation-wizard'),
  cwSteps: {
    1: document.getElementById('cw-step-1'),
    2: document.getElementById('cw-step-2'),
    3: document.getElementById('cw-step-3'),
    4: document.getElementById('cw-step-4'),
  },
  cwName:          document.getElementById('cw-name'),
  cwAgeList:       document.getElementById('cw-age-list'),
  cwGenderBtns:    document.querySelectorAll('.cw-gender-btn'),
  cwHeightList:    document.getElementById('cw-height-list'),
  cwBuildList:     document.getElementById('cw-build-list'),
  cwFeatures:      document.getElementById('cw-features'),
  cwBgList:        document.getElementById('cw-background-list'),
  cwBgFreeform:    document.getElementById('cw-bg-freeform'),
  cwEnvGrid:       document.getElementById('cw-env-grid'),
  cwNext1:         document.getElementById('cw-next-1'),
  cwNext2:         document.getElementById('cw-next-2'),
  cwNext3:         document.getElementById('cw-next-3'),
  cwNext4:         document.getElementById('cw-next-4'),
  cwBack2:         document.getElementById('cw-back-2'),
  cwBack3:         document.getElementById('cw-back-3'),
  cwBack4:         document.getElementById('cw-back-4'),
  cwStep1Error:    document.getElementById('cw-step1-error'),
  cwStep3Error:    document.getElementById('cw-step3-error'),
  cwStep4Error:    document.getElementById('cw-step4-error'),
};


// =============================================
// API HELPERS
// =============================================
async function apiCall(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };

  if (client.sessionId) {
    opts.headers['x-session-id'] = client.sessionId;
  }

  if (body) opts.body = JSON.stringify(body);

  const res  = await fetch(`/api${path}`, opts);
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}


// =============================================
// SESSION INIT
// =============================================
async function initSession() {
  // Try to resume existing guest session
  const { ok, data } = await apiCall('POST', '/auth/guest', {
    sessionId: client.sessionId
  });

  if (!ok) {
    appendStory(null, 'Failed to connect to server. Please refresh.', false);
    el.creationWizard.classList.add('hidden');
    el.inputArea.classList.remove('hidden');
    return;
  }

  client.sessionId = data.sessionId;
  localStorage.setItem('sessionId', data.sessionId);

  if (data.resumed) {
    // Session exists — check whether character creation is actually done
    if (data.isReady && !data.inCreation) {
      // Fully created character — jump straight into the game
      client.inCreation = false;
      await refreshPanels();
      appendStory(null, 'Your story continues...', false);
      el.creationWizard.classList.add('hidden');
      el.inputArea.classList.remove('hidden');
      el.playerInput.focus();
    } else {
      // Session found but creation never finished (stale/crashed session).
      // Drop the old session and start fresh.
      localStorage.removeItem('sessionId');
      client.sessionId = null;
      // Re-call with no sessionId — server will create a new one
      const { ok: ok2, data: data2 } = await apiCall('POST', '/auth/guest', {});
      if (ok2) {
        client.sessionId = data2.sessionId;
        localStorage.setItem('sessionId', data2.sessionId);
        appendStory(null, data2.output || '', true);
        cwInit();
      }
    }
  } else {
    // Brand new session — show the opening narrative then launch wizard
    appendStory(null, data.output || '', true);
    cwInit();
  }
}


// =============================================
// MAIN ACTION HANDLER
// =============================================
async function submitAction() {
  // Wizard handles creation — block manual submit during active creation
  if (client.inCreation) return;

  const input = el.playerInput.value.trim();
  if (!input || client.isLoading) return;

  setLoading(true);
  el.playerInput.value = '';
  updateCharCount();

  // Show player input in story
  appendPlayerAction(input);

  const { ok, data } = await apiCall('POST', '/action', { input });

  setLoading(false);

  if (!ok) {
    appendStory(null, data.error || 'Something went wrong.', false);
    return;
  }

  // Handle command responses (stats/gear panels — no narrative output)
  if (data.isCommand) {
    if (data.commandType === 'stats' && data.character) {
      updateCharacterPanel(data.character);
      appendStory(null, '[Character sheet updated in the left panel.]', false);
    } else if (data.commandType === 'gear' && data.economy) {
      updateEconomyPanel(data.economy);
      appendStory(null, '[Gear updated in the left panel.]', false);
    } else if (data.commandType === 'freePoint') {
      appendStory(null, data.output, false);
      if (data.character) updateCharacterPanel(data.character);
    } else if (data.output) {
      appendStory(null, data.output, false);
    }
    return;
  }

  // Normal action response
  if (data.output) {
    const isCreation = data.inCreation !== false && client.inCreation;
    appendStory(null, data.output, isCreation);
  }

  client.inCreation = data.inCreation || false;

  // Update all panels
  if (data.character)   updateCharacterPanel(data.character);
  if (data.progression) updateProgressionPanel(data.progression);
  if (data.economy)     updateEconomyPanel(data.economy);
  if (data.rightPanel)  updateRightPanel(data.rightPanel);
}


// =============================================
// PANEL UPDATERS
// =============================================
function updateCharacterPanel(c) {
  if (!c) return;

  // Identity
  if (c.level !== undefined) {
    el.charLevel.textContent = `Level ${c.level}`;
  }
  if (c.background) el.charBackground.textContent = c.background;
  if (c.description) {
    el.charDescription.textContent = c.description;
    el.charDescription.classList.remove('hidden');
  }

  // Resources
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

  // Stats
  if (c.stats) {
    el.statStr.textContent = c.stats.str ?? '—';
    el.statDex.textContent = c.stats.dex ?? '—';
    el.statVit.textContent = c.stats.vit ?? '—';
    el.statInt.textContent = c.stats.int ?? '—';
    el.statWis.textContent = c.stats.wis ?? '—';
    el.statCha.textContent = c.stats.cha ?? '—';
  }

  // Free points
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

  // Gear
  if (e.weapon) {
    el.gearWeapon.textContent = e.weapon.equipped
      ? e.weapon.label
      : 'Unarmed';
    el.gearWeapon.classList.toggle('dim', !e.weapon.equipped);
  }

  if (e.armor) {
    el.gearArmor.textContent = e.armor.equipped
      ? e.armor.label
      : 'Unarmored';
    el.gearArmor.classList.toggle('dim', !e.armor.equipped);
  }

  // Inventory
  if (e.inventory !== undefined) {
    el.inventoryList.textContent = e.inventoryDisplay || 'Nothing.';
  }

  // Coin
  if (e.coinDisplay) {
    el.coinDisplay.textContent = e.coinDisplay;
  }

  // Reputation
  if (e.reputationLabel) {
    el.reputationDisplay.textContent = `${e.reputationLabel}${e.region ? ' in ' + e.region : ''}`;
  }

  // Death gear warning
  if (e.hasDeadGear) {
    el.sectionDeathGear.classList.remove('hidden');
    el.deathGearLocation.textContent = e.deathLocationLabel || 'Unknown location';
  } else {
    el.sectionDeathGear.classList.add('hidden');
  }
}

function updateRightPanel(r) {
  if (!r) return;

  // Header location
  if (r.regionLabel) {
    el.locationDisplay.textContent = r.regionLabel.toUpperCase();
  }

  // Location section
  if (r.location)     el.locationName.textContent = r.location;
  if (r.locationDesc) el.locationDesc.textContent = r.locationDesc;

  // Threat section
  if (r.inCombat && r.enemy) {
    el.threatLabel.textContent  = 'ENEMY';
    el.enemyDisplay.classList.remove('hidden');
    el.npcDisplay.classList.add('hidden');
    el.neutralDisplay.classList.add('hidden');

    el.enemyName.textContent    = r.enemy.label;
    el.enemyDesc.textContent    = r.enemy.desc;
    el.enemyHpLabel.textContent = r.enemy.hpLabel;
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

  // Story summary
  if (r.storySummary) {
    el.storySummary.textContent = r.storySummary;
  }
}

async function refreshPanels() {
  const { ok, data } = await apiCall('GET', '/state');
  if (!ok) return;

  if (data.character)   updateCharacterPanel(data.character);
  if (data.progression) updateProgressionPanel(data.progression);
  if (data.economy)     updateEconomyPanel(data.economy);
  if (data.rightPanel)  updateRightPanel(data.rightPanel);

  client.inCreation = data.inCreation || false;
}


// =============================================
// STORY OUTPUT
// =============================================
function appendPlayerAction(text) {
  const entry = document.createElement('div');
  entry.className = 'story-entry';
  entry.innerHTML = `<div class="player-action">&gt; ${escapeHtml(text)}</div>`;
  el.storyContent.appendChild(entry);
  scrollToBottom();
}

function appendStory(playerAction, text, isCreation = false) {
  if (!text) return;

  const entry = document.createElement('div');
  entry.className = 'story-entry';

  // Split narrative from announcements (announcements start with \n[)
  const parts     = splitNarrativeAndAnnouncements(text);
  let html        = '';

  if (parts.narrative) {
    const cssClass = isCreation ? 'creation-text' : 'ai-response';
    html += `<div class="${cssClass}">${escapeHtml(parts.narrative)}</div>`;
  }

  if (parts.announcements) {
    html += `<div class="announcement">${escapeHtml(parts.announcements.trim())}</div>`;
  }

  entry.innerHTML = html;
  el.storyContent.appendChild(entry);
  scrollToBottom();
}

function splitNarrativeAndAnnouncements(text) {
  // Announcements are lines starting with [ that follow the main narrative
  const lines        = text.split('\n');
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


// =============================================
// LOADING STATE
// =============================================
function setLoading(loading) {
  client.isLoading         = loading;
  el.btnSubmit.disabled    = loading;
  el.playerInput.disabled  = loading;
  el.loadingOverlay.classList.toggle('hidden', !loading);
}


// =============================================
// CHAR COUNTER
// =============================================
function updateCharCount() {
  const len = el.playerInput.value.length;
  el.charCount.textContent = `${len} / 500`;
}


// =============================================
// SETTINGS MODAL
// =============================================
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
  const username = el.inputUsername.value.trim();
  const password = el.inputPassword.value;

  if (!username || !password) {
    showAuthError('Username and password required.');
    return;
  }

  const { ok, data } = await apiCall('POST', '/auth/login', {
    username, password, sessionId: client.sessionId
  });

  if (!ok) {
    showAuthError(data.error || 'Login failed.');
    return;
  }

  client.sessionId  = data.sessionId;
  client.isLoggedIn = true;
  client.username   = data.username;
  localStorage.setItem('sessionId', data.sessionId);

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

  // Auto-login after registration
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


// =============================================
// CREATION WIZARD
// Step-by-step character creation UI.
// Renders scrollable pickers, text inputs, and option cards.
// Sends formatted text to the server's phase parsers on each step.
// =============================================

// ---- Static data (mirrors server constants — kept in sync manually) ----
const CW_HEIGHTS = [
  { cat:'Very Short',  entries:[["4'6\"",138],["4'7\"",140],["4'8\"",142],["4'9\"",145],["4'10\"",147],["4'11\"",150]] },
  { cat:'Short',       entries:[["5'0\"",152],["5'1\"",155],["5'2\"",157],["5'3\"",160],["5'4\"",163],["5'5\"",165]] },
  { cat:'Average',     entries:[["5'6\"",168],["5'7\"",170],["5'8\"",173],["5'9\"",175]] },
  { cat:'Tall',        entries:[["5'10\"",178],["5'11\"",180],["6'0\"",183],["6'1\"",185]] },
  { cat:'Very Tall',   entries:[["6'2\"",188],["6'3\"",191],["6'4\"",193],["6'5\"",196]] },
  { cat:'Towering',    entries:[["6'6\"",198],["6'7\"",201],["6'8\"",203],["6'9\"",206],["6'10\"",208],["6'11\"",211]] },
  { cat:'Massive',     entries:[["7'0\"",213],["7'1\"",216],["7'2\"",218],["7'3\"",221],["7'4\"",224],["7'5\"",226],["7'6\"",229]] },
];

const CW_BUILDS = [
  { key:'frail',    label:'Frail',     desc:'Underdeveloped' },
  { key:'scrawny',  label:'Scrawny',   desc:'Thin, not broken' },
  { key:'lean',     label:'Lean',      desc:'Wiry, efficient' },
  { key:'slender',  label:'Slender',   desc:'Slim, graceful' },
  { key:'average',  label:'Average',   desc:'The baseline' },
  { key:'athletic', label:'Athletic',  desc:'Fit and conditioned' },
  { key:'stocky',   label:'Stocky',    desc:'Compact and solid' },
  { key:'broad',    label:'Broad',     desc:'Wide-shouldered' },
  { key:'heavyset', label:'Heavyset',  desc:'Heavy with weight' },
  { key:'muscular', label:'Muscular',  desc:'Visibly strong' },
  { key:'massive',  label:'Massive',   desc:'Exceptional size' },
];

// These mirror STARTING_ENVIRONMENTS in constants.js
const CW_ENVIRONMENTS = [
  {
    key:    'deep_forest',
    label:  'Deep Forest',
    desc:   'Dense woodland, far from settlements. Wildlife rules here.',
    stats:  ['Beast encounters: 78%', 'Ambush chance: 55%', 'Pop: Dozens'],
  },
  {
    key:    'open_plains',
    label:  'Open Plains',
    desc:   'Vast grasslands. You can see for miles — and so can threats.',
    stats:  ['Beast encounters: 40%', 'Ambush chance: 15%', 'Pop: Thousands'],
  },
  {
    key:    'small_village',
    label:  'Small Village',
    desc:   'A settlement of a few hundred. Community and modest safety.',
    stats:  ['Beast encounters: 28%', 'Ambush chance: 22%', 'Pop: 300–800'],
  },
  {
    key:    'bustling_city',
    label:  'Bustling City',
    desc:   'A metropolis of millions. Dangerous people, not beasts.',
    stats:  ['Beast encounters: 5%', 'Ambush chance: 32%', 'Pop: Millions'],
  },
];

// Available backgrounds — fetched from server on first show or kept as a simple static mirror
// The full list is very long; we store what the server returns in the phase 3 prompt.
// For the wizard, we populate the background list from server data when phase 3 is reached.
const CW_BG_CACHE = [];  // filled dynamically from server response


// ---- Scroll list builder ----
function cwBuildScrollList(container, items, onSelect) {
  container.innerHTML = '';
  let selectedEl = null;

  items.forEach((item, i) => {
    if (item.cat) {
      // Category divider
      const div = document.createElement('div');
      div.className = 'cw-option-cat';
      div.textContent = item.cat;
      container.appendChild(div);
      return;
    }

    const row = document.createElement('div');
    row.className = 'cw-option';
    row.dataset.value = item.value;
    row.dataset.idx   = i;

    let inner = `<span class="cw-option-label">${escapeHtml(item.label)}</span>`;
    if (item.sub)   inner += `<span class="cw-option-sub">${escapeHtml(item.sub)}</span>`;
    if (item.magic) inner += `<span class="cw-option-magic">✦</span>`;
    row.innerHTML = inner;
    row.title = item.title || '';

    row.addEventListener('click', () => {
      if (selectedEl) selectedEl.classList.remove('selected');
      row.classList.add('selected');
      selectedEl = row;
      onSelect(item.value, item, row);
    });

    container.appendChild(row);
  });

  // Keyboard nav
  container.addEventListener('keydown', e => {
    const opts  = [...container.querySelectorAll('.cw-option:not(.cw-option-cat)')];
    const curIdx = selectedEl ? opts.indexOf(selectedEl) : -1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = opts[Math.min(curIdx + 1, opts.length - 1)];
      if (next) next.click();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = opts[Math.max(curIdx - 1, 0)];
      if (prev) prev.click();
    } else if (e.key === 'Enter' && selectedEl) {
      e.preventDefault();
    }
  });
}


// ---- Step show/hide ----
function cwShowStep(n) {
  Object.values(el.cwSteps).forEach(s => s.classList.add('hidden'));
  if (el.cwSteps[n]) el.cwSteps[n].classList.remove('hidden');
  client.creationStep = n;

  // Scroll wizard into view
  el.creationWizard.scrollTop = 0;
}


// ---- Step 1 build ----
function cwBuildStep1() {
  // Age list: 10-90
  const ageItems = [];
  const ageCats = [
    { min:10, max:17, cat:'Youth'      },
    { min:18, max:33, cat:'Prime'      },
    { min:34, max:50, cat:'Experienced'},
    { min:51, max:65, cat:'Veteran'    },
    { min:66, max:90, cat:'Elder'      },
  ];

  ageCats.forEach(band => {
    ageItems.push({ cat: band.cat });
    for (let a = band.min; a <= band.max; a++) {
      ageItems.push({ value: String(a), label: `${a} years old` });
    }
  });

  cwBuildScrollList(el.cwAgeList, ageItems, (val) => {
    client.creation.age = parseInt(val);
    el.cwStep1Error.classList.add('hidden');
  });

  // Gender buttons
  el.cwGenderBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      el.cwGenderBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      client.creation.gender = btn.dataset.value;
      el.cwStep1Error.classList.add('hidden');
    });
  });

  // Pre-select Age 25 and Male as defaults — scroll to them
  const defaultAgeEl = el.cwAgeList.querySelector('[data-value="25"]');
  if (defaultAgeEl) {
    defaultAgeEl.click();
    setTimeout(() => {
      defaultAgeEl.scrollIntoView({ block:'center' });
    }, 50);
  }
}


// ---- Step 2 build ----
function cwBuildStep2() {
  // Height scroll list
  const heightItems = [];
  CW_HEIGHTS.forEach(group => {
    heightItems.push({ cat: group.cat });
    group.entries.forEach(([label]) => {
      heightItems.push({
        value: label,
        label: label,
        sub:   group.cat,
      });
    });
  });

  cwBuildScrollList(el.cwHeightList, heightItems, (val) => {
    client.creation.heightText = val;
  });

  // Default height: 5'9" (average)
  const defHeight = el.cwHeightList.querySelector('[data-value="5\'9\'\'"]');
  if (defHeight) {
    defHeight.click();
    setTimeout(() => defHeight.scrollIntoView({ block:'center' }), 50);
  }

  // Build scroll list
  const buildItems = CW_BUILDS.map(b => ({
    value: b.key,
    label: b.label,
    sub:   b.desc,
  }));

  cwBuildScrollList(el.cwBuildList, buildItems, (val) => {
    client.creation.buildKey = val;
  });

  // Default: average
  const defBuild = el.cwBuildList.querySelector('[data-value="average"]');
  if (defBuild) defBuild.click();
}


// ---- Step 3 build — dynamic, populated from server cache or minimal list ----
function cwBuildStep3Backgrounds(bgList) {
  // bgList = [{key, label, desc, isMagical, startingSpell, index}]
  // Group by magical/standard
  const standard = bgList.filter(b => !b.isMagical);
  const magical  = bgList.filter(b =>  b.isMagical);

  const items = [];

  if (standard.length) {
    items.push({ cat: 'Standard Backgrounds' });
    standard.forEach(b => {
      items.push({
        value:  b.key,
        label:  b.label,
        sub:    b.index,
        title:  b.desc,
        index:  b.index,
        isMagical: false,
      });
    });
  }

  if (magical.length) {
    items.push({ cat: '✦ Magical Backgrounds (grant starting spell)' });
    magical.forEach(b => {
      const spellName = b.startingSpell === 'divine_bolt' ? 'Divine Bolt' : 'Mana Bolt';
      items.push({
        value:  b.key,
        label:  b.label,
        sub:    spellName,
        title:  b.desc,
        index:  b.index,
        isMagical: true,
        magic:  true,
      });
    });
  }

  cwBuildScrollList(el.cwBgList, items, (val, item) => {
    client.creation.bgKey   = val;
    client.creation.bgIndex = item.index;
    el.cwStep3Error.classList.add('hidden');
  });
}


// ---- Step 4 build — environment cards ----
function cwBuildStep4() {
  el.cwEnvGrid.innerHTML = '';
  let selectedCard = null;

  CW_ENVIRONMENTS.forEach((env, i) => {
    const card = document.createElement('div');
    card.className = 'cw-env-card';
    card.dataset.key = env.key;

    let statsHtml = env.stats.map(s =>
      `<span class="cw-env-stat">${escapeHtml(s)}</span>`
    ).join('');

    card.innerHTML = `
      <div class="cw-env-card-name">${escapeHtml(env.label)}</div>
      <div class="cw-env-card-desc">${escapeHtml(env.desc)}</div>
      <div class="cw-env-card-stats">${statsHtml}</div>
    `;

    card.addEventListener('click', () => {
      if (selectedCard) selectedCard.classList.remove('selected');
      card.classList.add('selected');
      selectedCard = card;
      client.creation.envKey   = env.key;
      client.creation.envIndex = i + 1;
      el.cwStep4Error.classList.add('hidden');
    });

    el.cwEnvGrid.appendChild(card);
  });
}


// ---- Build the background list from server prompt text ----
// The server currently sends background lists as numbered text lines.
// We parse them to build the UI list. Falls back to empty if parse fails.
function cwParseBgFromServerPrompt(promptText) {
  // Static full list embedded here — mirrors BACKGROUNDS + magical ones in constants.js
  // Hardcoded to avoid a round-trip. Filtered by age/gender happens server-side anyway.
  // We use the response's list structure to know which are available.
  // Simple approach: the server's phase-3 prompt contains lines like "1. Farmboy — ..."
  const lines  = promptText.split('\n');
  const result = [];
  let idx      = 1;

  for (const line of lines) {
    // Match "1. Label — desc" or "1. Label *(Mana Bolt)* — desc"
    const m = line.match(/^(\d+)\.\s+\*?\*?([^*—]+)\*?\*?(?:\s+\*\(([^)]+)\)\*)?\s*—\s*(.+)$/);
    if (m) {
      const num       = parseInt(m[1]);
      const label     = m[2].trim();
      const spellHint = m[3] ? m[3].trim() : null;
      const desc      = m[4].trim();
      const isMagical = !!spellHint;
      const startingSpell = spellHint
        ? (spellHint.toLowerCase().includes('divine') ? 'divine_bolt' : 'mana_bolt')
        : null;

      // Try to derive key from label
      const key = label.toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');

      result.push({ key, label, desc, isMagical, startingSpell, index: num });
    }
  }

  return result;
}


// ---- Wizard init ---- called once after session starts ----
function cwInit() {
  el.creationWizard.classList.remove('hidden');
  el.inputArea.classList.add('hidden');

  cwBuildStep1();
  cwBuildStep2();
  cwBuildStep4();

  cwShowStep(1);
}

// ---- Wizard teardown ----
function cwDismiss() {
  el.creationWizard.classList.add('hidden');
  el.inputArea.classList.remove('hidden');
  el.playerInput.focus();
}


// ---- Step submission functions ----

async function cwSubmitStep1() {
  if (!client.creation.age) {
    el.cwStep1Error.textContent = 'Please select an age.';
    el.cwStep1Error.classList.remove('hidden');
    return;
  }
  if (!client.creation.gender) {
    el.cwStep1Error.textContent = 'Please select a gender.';
    el.cwStep1Error.classList.remove('hidden');
    return;
  }

  const name   = el.cwName.value.trim();
  client.creation.name = name;

  // Format text exactly as server phase 1 parser expects
  const nameClause = name ? `My name is ${name}, I am` : 'I am';
  const genderWord = client.creation.gender === 'male'   ? 'male'
                   : client.creation.gender === 'female' ? 'female'
                   : 'other';
  const text = `${nameClause} ${client.creation.age} years old and ${genderWord}`;

  await cwSendAndAdvance(text, () => cwShowStep(2));
}

async function cwSubmitStep2() {
  const height   = client.creation.heightText || "average height";
  const build    = client.creation.buildKey   || 'average';
  const features = el.cwFeatures.value.trim();

  client.creation.features = features;

  // Format description for phase 2 parser
  const featurePart = features ? `, ${features}` : '';
  const text = `${height} tall, ${build} build${featurePart}`;

  await cwSendAndAdvance(text, (responseText) => {
    // Phase 2 response contains the background list — parse it
    const bgList = cwParseBgFromServerPrompt(responseText || '');
    if (bgList.length > 0) {
      CW_BG_CACHE.length = 0;
      bgList.forEach(b => CW_BG_CACHE.push(b));
    }
    cwBuildStep3Backgrounds(CW_BG_CACHE.length > 0 ? CW_BG_CACHE : cwFallbackBgList());
    cwShowStep(3);
  });
}

async function cwSubmitStep3() {
  const freeform = el.cwBgFreeform.value.trim();

  // Freeform overrides list selection
  if (!freeform && !client.creation.bgKey) {
    el.cwStep3Error.textContent = 'Select a background or describe your history.';
    el.cwStep3Error.classList.remove('hidden');
    return;
  }

  // What to send: if freeform written, send that. Otherwise send the index number.
  const text = freeform || String(client.creation.bgIndex);

  await cwSendAndAdvance(text, () => cwShowStep(4));
}

async function cwSubmitStep4() {
  if (!client.creation.envKey) {
    el.cwStep4Error.textContent = 'Choose a starting environment.';
    el.cwStep4Error.classList.remove('hidden');
    return;
  }

  const text = String(client.creation.envIndex);
  await cwSendAndAdvance(text, null);
}


// ---- Core send helper ----
// Sends formatted text to server, shows loading, calls onSuccess(serverResponseText) on success
async function cwSendAndAdvance(text, onSuccess) {
  setLoading(true);

  const { ok, data } = await apiCall('POST', '/action', { input: text });
  setLoading(false);

  if (!ok) {
    const errMsg = data.detail
      ? `${data.error || 'Something went wrong.'} [${data.detail}]`
      : (data.error || 'Something went wrong.');
    appendStory(null, errMsg, true);
    return;
  }

  if (data.output) {
    appendStory(null, data.output, true);
  }

  if (data.character)   updateCharacterPanel(data.character);
  if (data.progression) updateProgressionPanel(data.progression);
  if (data.economy)     updateEconomyPanel(data.economy);
  if (data.rightPanel)  updateRightPanel(data.rightPanel);

  if (!data.inCreation) {
    // Creation complete — dismiss wizard
    client.inCreation = false;
    cwDismiss();
    return;
  }

  if (onSuccess) onSuccess(data.output || '');
}


// ---- Fallback background list (minimal) if server parse fails ----
function cwFallbackBgList() {
  return [
    { key:'peasant',   label:'Peasant',   desc:'The lowest rung of society.', isMagical:false, index:1 },
    { key:'villager',  label:'Villager',  desc:'Community life and modest horizons.', isMagical:false, index:2 },
    { key:'wanderer',  label:'Wanderer',  desc:'The road has been your home.', isMagical:false, index:3 },
    { key:'soldier',   label:'Soldier',   desc:'Drilled in combat and discipline.', isMagical:false, index:4 },
    { key:'hunter',    label:'Hunter',    desc:'The wild is your domain.', isMagical:false, index:5 },
    { key:'mageapprentice', label:"Mage's Apprentice", desc:'You learned the basics of spellwork.', isMagical:true, startingSpell:'mana_bolt', index:6 },
  ];
}


// =============================================
// EVENT LISTENERS
// =============================================

// Submit on Enter (Shift+Enter for newline)
el.playerInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitAction();
  }
});

el.playerInput.addEventListener('input', updateCharCount);

el.btnSubmit.addEventListener('click', submitAction);

// Creation wizard navigation
el.cwNext1.addEventListener('click', cwSubmitStep1);
el.cwNext2.addEventListener('click', cwSubmitStep2);
el.cwNext3.addEventListener('click', cwSubmitStep3);
el.cwNext4.addEventListener('click', cwSubmitStep4);

el.cwBack2.addEventListener('click', () => cwShowStep(1));
el.cwBack3.addEventListener('click', () => cwShowStep(2));
el.cwBack4.addEventListener('click', () => cwShowStep(3));

// Allow Enter on wizard text inputs to advance
el.cwName.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); cwSubmitStep1(); }
});
el.cwFeatures.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); cwSubmitStep2(); }
});
el.cwBgFreeform.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); cwSubmitStep3(); }
});

// Settings
el.btnSettings.addEventListener('click', openSettings);
el.btnCloseSettings.addEventListener('click', closeSettings);

el.modalSettings.addEventListener('click', e => {
  if (e.target === el.modalSettings) closeSettings();
});

el.btnLogin.addEventListener('click', handleLogin);
el.btnRegister.addEventListener('click', handleRegister);

el.btnShowRegister.addEventListener('click', () => {
  el.formLogin.classList.add('hidden');
  el.formRegister.classList.remove('hidden');
  clearAuthErrors();
});

el.btnShowLogin.addEventListener('click', () => {
  el.formRegister.classList.add('hidden');
  el.formLogin.classList.remove('hidden');
  clearAuthErrors();
});

el.toggleNsfw.addEventListener('change', handleNsfwToggle);
el.btnSave.addEventListener('click', handleSave);

// Login on Enter key in password field
el.inputPassword.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleLogin();
});


// =============================================
// STARTUP
// =============================================
window.addEventListener('DOMContentLoaded', () => {
  initSession();
});