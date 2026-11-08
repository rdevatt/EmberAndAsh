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
  lastInput:     null, // tracks last player action for retry
  lastPlayerEntry: null, // DOM element of last player input
  lastAIEntry:   null, // DOM element of last AI response
  canUndo:       false, // whether undo is available
  isEditing:     false, // whether we're in edit mode
  editPlayerEntry: null, // player entry being edited
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
  checkRememberMe: document.getElementById('check-remember-me'),
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
let sessionRecoveryInProgress = false;

async function apiCall(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };

  if (client.sessionId) {
    opts.headers['x-session-id'] = client.sessionId;
  }

  if (body) opts.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(`/api${path}`, opts);
  } catch (err) {
    // Network failure — never leave the UI locked.
    return { ok: false, status: 0, data: { error: 'Cannot reach the server. Check that it is running, then try again.' } };
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    data = { error: `Unexpected server response (${res.status}).` };
  }

  // The server restores sessions from the database, so a 401 means the
  // session is truly gone (e.g. an expired guest). Start over cleanly.
  if (res.status === 401 && data && data.code === 'SESSION_EXPIRED' && !path.startsWith('/auth')) {
    handleSessionExpired();
  }

  return { ok: res.ok, status: res.status, data };
}

function handleSessionExpired() {
  if (sessionRecoveryInProgress) return;
  sessionRecoveryInProgress = true;
  localStorage.removeItem('sessionId');
  showToast('Your session expired — reconnecting…');
  setTimeout(() => window.location.reload(), 1200);
}

function normalizeLikelyCommandInput(rawInput) {
  const input = String(rawInput || '').trim();
  if (!input) return '';

  const lower = input.toLowerCase();
  const commandLike = /^(equip|unequip|take|loot|search|show|inspect|examine|drop|discard|remove|sell|set companion|add companion|companions|party|backpack|gear|inventory|check board|accept quest|abandon quest|quests|journal|map|travel to|help|rest|long rest|make camp|status|check stats|open shop|close shop|shop|buy|drink potion|recover gear|retrieve gear)\b/.test(lower);

  return commandLike ? input.replace(/[.!?]+$/g, '').trim() : input;
}

// Applies every panel payload present in a server response.
function applyPanels(data) {
  if (!data) return;
  try {
    if (data.character)   updateCharacterPanel(data.character);
    if (data.progression) updateProgressionPanel(data.progression);
    if (data.economy)     updateEconomyPanel(data.economy);
    if (data.rightPanel)  updateRightPanel(data.rightPanel);
    if (data.board)       updateBoardPanel(data.board);
    if ('story' in data)  updateStoryPanel(data.story, data.narration);
    if (data.factions)    updateFactionsPanel(data.factions);
    if (data.party)       updatePartyPanel(data.party);
    if ('world' in data)  updateWorldPanel(data.world);
    if (data.portrait && window.EmberScene) EmberScene.renderPortrait(document.getElementById('portrait-holder'), data.portrait);
    if (data.scene && window.EmberScene) showScene(data.scene, data.inCreation);
    updateCombatActions(data);
  } catch (e) {
    console.warn('[UI] Panel update error (non-fatal):', e);
  }
}

function showGameUI() {
  client.inCreation = false;
  el.creationWizard.classList.add('hidden');
  el.inputArea.classList.remove('hidden');
  el.playerInput.focus();
}

// Puts the client into the right mode for a session payload
// (from /state, /auth/*, or /saves/load).
async function enterSession(data, welcome) {
  applyPanels(data);
  if (data.inCreation) {
    client.inCreation = true;
    if (welcome) appendSystemMessage(welcome);
    if (!data.creationPhase || data.creationPhase <= 1) {
      appendStory(null, data.output || OPENING_PROMPT_FALLBACK, true);
    }
    await cwResume(data.creationPhase || 1);
  } else {
    const hadHistory = !welcome && loadStoryHistoryFromLocal();
    if (!hadHistory) {
      const summary = data.storySummary ? `\n\n— Your story so far —\n\n${data.storySummary}\n\n— — —` : '';
      appendSystemMessage((welcome || 'Your story continues...') + summary);
    }
    showGameUI();
  }
}

const OPENING_PROMPT_FALLBACK = 'Before this story goes further — who are you?';


// =============================================
// SESSION INIT
// Order: resume the stored session (the server restores it from the
// database even after a restart) → remember-me auto-login → new guest.
// =============================================
async function initSession() {
  if (client.sessionId) {
    const { ok, data } = await apiCall('GET', '/state');
    if (ok && data.success) {
      client.isLoggedIn = !!data.isLoggedIn;
      updateAuthUI();
      await enterSession(data, null);
      return;
    }
  }

  const rememberToken = localStorage.getItem('rememberToken');
  if (rememberToken) {
    const { ok, data } = await apiCall('POST', '/auth/auto-login', { rememberToken });
    if (ok && data.success) {
      client.sessionId  = data.sessionId;
      client.isLoggedIn = true;
      client.username   = data.username;
      localStorage.setItem('sessionId', data.sessionId);
      if (data.rememberToken) localStorage.setItem('rememberToken', data.rememberToken);
      localStorage.removeItem('storyHistory');
      updateAuthUI();
      if (el.toggleNsfw) el.toggleNsfw.checked = !!data.nsfwEnabled;
      await enterSession(data, `Welcome back, ${data.username}.`);
      return;
    }
    localStorage.removeItem('rememberToken');
  }

  const { ok, data } = await apiCall('POST', '/auth/guest', {});
  if (!ok) {
    appendSystemMessage(data.error || 'Failed to connect to server. Please refresh.');
    return;
  }

  client.sessionId = data.sessionId;
  client.isLoggedIn = false;
  localStorage.setItem('sessionId', data.sessionId);
  localStorage.removeItem('storyHistory');
  updateAuthUI();
  await enterSession(data, null);
}


// =============================================
// MAIN ACTION HANDLER
// =============================================
async function submitAction() {
  // Wizard handles creation — block manual submit during active creation
  if (client.inCreation) return;

  const input = normalizeLikelyCommandInput(el.playerInput.value);
  if (!input || client.isLoading) return;

  // Check if we're in edit mode
  if (client.isEditing) {
    await submitEditedAction(input);
    el.playerInput.value = '';
    updateCharCount();
    return;
  }

  // Track for retry
  client.lastInput = input;

  setLoading(true);
  el.playerInput.value = '';
  updateCharCount();

  // Show player input in story
  appendPlayerAction(input);

  try {
    await _doNormalAction(input);
  } finally {
    setLoading(false);
  }
}

async function _doNormalAction(input) {
  const { ok, data } = await apiCall('POST', '/action', { input });

  if (!ok) {
    appendSystemMessage(data.error || 'Something went wrong.');
    return;
  }

  applyPanels(data);

  // Instant command responses: shown without retry/edit buttons.
  if (data.isCommand) {
    if (data.output) {
      appendCommandOutput(input, data.output);
    } else if (data.commandType === 'stats') {
      appendCommandOutput(input, '[Character sheet updated in the left panel.]');
    }
    return;
  }

  if (data.output) appendStory(input, data.output, false, false, { undoable: data.undoable !== false });
  client.inCreation = !!data.inCreation;
}


// =============================================
// RETRY NARRATIVE ONLY
// Regenerates just the AI prose without re-rolling combat mechanics.
// The damage/hit results stay the same, only the description changes.
// =============================================
async function retryNarrative(entryToReplace, playerInputEntry) {
  if (!client.lastInput || client.isLoading) return;

  setLoading(true);
  const { ok, data } = await apiCall('POST', '/retry-narrative', {});
  setLoading(false);

  if (!ok) {
    appendSystemMessage(data.error || 'Failed to regenerate.');
    return;
  }

  if (data.output && entryToReplace) {
    const parts = splitNarrativeAndAnnouncements(data.output);
    let html = '';
    if (parts.narrative) {
      html += `<div class="ai-response">${escapeHtml(parts.narrative)}</div>`;
    }
    if (parts.announcements) {
      html += `<div class="announcement">${escapeHtml(parts.announcements.trim())}</div>`;
    }
    entryToReplace.innerHTML = html;

    // Re-attach action buttons
    attachStoryEntryButtons(entryToReplace, playerInputEntry);
  }

  applyPanels(data);
}


// =============================================
// UNDO LAST ACTION
// Restores game state to before the action was processed.
// Removes the last exchange from the story.
// =============================================
async function undoLastAction(aiEntry, playerInputEntry) {
  if (client.isLoading) return;

  setLoading(true);

  const { ok, data } = await apiCall('POST', '/undo', {});

  setLoading(false);

  if (!ok) {
    appendSystemMessage(data.error || 'Failed to undo.');
    return;
  }

  // Remove both the AI response and the player input from the story
  if (aiEntry && aiEntry.parentNode) {
    aiEntry.parentNode.removeChild(aiEntry);
  }
  if (playerInputEntry && playerInputEntry.parentNode) {
    playerInputEntry.parentNode.removeChild(playerInputEntry);
  }

  // Clear client tracking
  client.lastInput = null;
  client.lastPlayerEntry = null;
  client.lastAIEntry = null;
  client.canUndo = false;

  popLastLocalStoryEntry();

  // Update all panels to reflect restored state
  applyPanels(data);

  // Show confirmation
  showToast('Action undone — try something different.');
}


// =============================================
// EDIT LAST ACTION
// Opens input field with previous action text for editing.
// =============================================
function editLastAction(playerInputEntry) {
  if (!client.lastInput || client.isLoading) return;

  // Put the last input back in the input field
  el.playerInput.value = client.lastInput;
  el.playerInput.focus();
  
  // Mark that we're in edit mode
  client.isEditing = true;
  client.editPlayerEntry = playerInputEntry;
  
  // Update submit button text
  el.btnSubmit.textContent = 'Resubmit';
  el.btnSubmit.classList.add('edit-mode');
  
  // Show cancel option
  showEditModeUI();
}

function showEditModeUI() {
  // Add cancel button if not exists
  let cancelBtn = document.getElementById('btn-cancel-edit');
  if (!cancelBtn) {
    cancelBtn = document.createElement('button');
    cancelBtn.id = 'btn-cancel-edit';
    cancelBtn.className = 'btn-cancel-edit';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', cancelEdit);
    el.btnSubmit.parentNode.insertBefore(cancelBtn, el.btnSubmit.nextSibling);
  }
  cancelBtn.classList.remove('hidden');
}

function cancelEdit() {
  client.isEditing = false;
  client.editPlayerEntry = null;
  el.playerInput.value = '';
  el.btnSubmit.textContent = 'Send';
  el.btnSubmit.classList.remove('edit-mode');
  
  const cancelBtn = document.getElementById('btn-cancel-edit');
  if (cancelBtn) cancelBtn.classList.add('hidden');
}

async function submitEditedAction(newInput) {
  if (client.isLoading) return;

  const normalizedInput = normalizeLikelyCommandInput(newInput);
  if (!normalizedInput) return;

  setLoading(true);
  const { ok, data } = await apiCall('POST', '/edit-action', { input: normalizedInput });
  setLoading(false);

  cancelEdit();

  if (!ok) {
    appendSystemMessage(data.error || 'Failed to process edit.');
    return;
  }

  // Replace the old exchange with the new one.
  if (client.lastAIEntry && client.lastAIEntry.parentNode) {
    client.lastAIEntry.parentNode.removeChild(client.lastAIEntry);
  }
  popLastLocalStoryEntry();
  if (client.editPlayerEntry) {
    client.editPlayerEntry.querySelector('.player-action').textContent = '> ' + normalizedInput;
    client.lastPlayerEntry = client.editPlayerEntry;
  }
  client.editPlayerEntry = null;
  client.lastInput = normalizedInput;

  if (data.output) appendStory(normalizedInput, data.output, false);
  applyPanels(data);
}


// =============================================
// ATTACH STORY ENTRY BUTTONS
// Adds retry/undo/edit buttons to a story entry
// =============================================
function attachStoryEntryButtons(aiEntry, playerInputEntry, undoable = true) {
  // Create button container
  const btnContainer = document.createElement('div');
  btnContainer.className = 'story-entry-buttons';

  // Retry button (regenerate narrative only)
  const retryBtn = document.createElement('button');
  retryBtn.className = 'story-btn retry-btn';
  retryBtn.textContent = '↺ Retry';
  retryBtn.title = 'Regenerate the narrative (same outcome)';
  retryBtn.addEventListener('click', () => retryNarrative(aiEntry, playerInputEntry));
  btnContainer.appendChild(retryBtn);

  // Combat rounds and story decisions can't be edited or undone.
  if (!undoable) { aiEntry.appendChild(btnContainer); return; }

  // Edit button
  const editBtn = document.createElement('button');
  editBtn.className = 'story-btn edit-btn';
  editBtn.textContent = '✎ Edit';
  editBtn.title = 'Change what you said/did';
  editBtn.addEventListener('click', () => editLastAction(playerInputEntry));
  btnContainer.appendChild(editBtn);

  // Undo button (only for most recent action)
  const undoBtn = document.createElement('button');
  undoBtn.className = 'story-btn undo-btn';
  undoBtn.textContent = '↶ Undo';
  undoBtn.title = 'Undo this action completely';
  undoBtn.addEventListener('click', () => undoLastAction(aiEntry, playerInputEntry));
  btnContainer.appendChild(undoBtn);

  aiEntry.appendChild(btnContainer);
}


// UI helper functions moved to public/game/ui.js
