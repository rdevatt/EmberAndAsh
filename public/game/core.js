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
  // --- Auto-login via remember-me token ---
  const rememberToken = localStorage.getItem('rememberToken');
  if (rememberToken) {
    const { ok, data } = await apiCall('POST', '/auth/auto-login', { rememberToken });
    if (ok && data.success) {
      client.sessionId = data.sessionId;
      client.isLoggedIn = true;
      client.username   = data.username;
      localStorage.setItem('sessionId', data.sessionId);
      localStorage.setItem('rememberToken', data.rememberToken); // rolling refresh
      updateAuthUI();

      if (data.hasCharacter) {
        client.inCreation = false;
        await refreshPanels();
        const resumeMsg = data.storySummary
          ? `Welcome back, ${data.username}.\n\n— Your story so far —\n\n${data.storySummary}\n\n— — —`
          : `Welcome back, ${data.username}. Your story continues...`;
        appendStory(null, resumeMsg, false);
        el.creationWizard.classList.add('hidden');
        el.inputArea.classList.remove('hidden');
        el.playerInput.focus();
      } else {
        appendStory(null, `Welcome back, ${data.username}.`, false);
        cwInit();
      }
      return;
    } else {
      // Token expired — clear it
      localStorage.removeItem('rememberToken');
    }
  }

  // --- Try to resume existing guest session ---
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
      // Try to restore the last session's story from local cache
      const hadHistory = loadStoryHistoryFromLocal();
      if (!hadHistory) {
        const resumeMsg = data.storySummary
          ? `— Your story so far —\n\n${data.storySummary}\n\n— — —`
          : 'Your story continues...';
        appendStory(null, resumeMsg, false);
      }
      el.creationWizard.classList.add('hidden');
      el.inputArea.classList.remove('hidden');
      el.playerInput.focus();
    } else {
      // Session found but creation never finished (stale/crashed session).
      // Drop the old session and start fresh.
      localStorage.removeItem('sessionId');
      client.sessionId = null;
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

  // --- Crafted gear commands ---
  const lInput = input.toLowerCase().trim();
  if (lInput.startsWith('equip ')) {
    const itemName = input.slice(6).trim();
    const { ok, data } = await apiCall('POST', '/game/equip-crafted', { itemName });
    setLoading(false);
    if (ok && data.success) {
      if (data.character) updateCharacterPanel(data.character);
      if (data.economy)   updateEconomyPanel(data.economy);
      appendStory(null, data.message, false);
    } else if (ok) {
      // Not a crafted item — let it fall through as normal action
      await _doNormalAction(input);
    }
    return;
  }

  if (lInput.startsWith('sell ')) {
    const itemName = input.slice(5).trim();
    const { ok, data } = await apiCall('POST', '/game/sell-crafted', { itemName });
    setLoading(false);
    if (ok && data.success) {
      if (data.economy)   updateEconomyPanel(data.economy);
      appendStory(null, data.message, false);
    } else if (ok) {
      // Not a crafted item — pass through as normal action
      await _doNormalAction(input);
    }
    return;
  }

  await _doNormalAction(input);
}

async function _doNormalAction(input) {
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
      appendStory(null, data.output || '[Gear updated in the left panel.]', false);
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
  if (data.board)       updateBoardPanel(data.board);
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
    appendStory(null, data.error || 'Failed to regenerate.', false);
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

  if (data.character)   updateCharacterPanel(data.character);
  if (data.progression) updateProgressionPanel(data.progression);
  if (data.economy)     updateEconomyPanel(data.economy);
  if (data.rightPanel)  updateRightPanel(data.rightPanel);
  if (data.board)       updateBoardPanel(data.board);
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
    appendStory(null, data.error || 'Failed to undo.', false);
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

  // Update all panels to reflect restored state
  if (data.character)   updateCharacterPanel(data.character);
  if (data.progression) updateProgressionPanel(data.progression);
  if (data.economy)     updateEconomyPanel(data.economy);
  if (data.rightPanel)  updateRightPanel(data.rightPanel);
  if (data.board)       updateBoardPanel(data.board);

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

  setLoading(true);

  const { ok, data } = await apiCall('POST', '/edit-action', { input: newInput });

  setLoading(false);
  
  // Exit edit mode
  client.isEditing = false;
  el.btnSubmit.textContent = 'Send';
  el.btnSubmit.classList.remove('edit-mode');
  const cancelBtn = document.getElementById('btn-cancel-edit');
  if (cancelBtn) cancelBtn.classList.add('hidden');

  if (!ok) {
    appendStory(null, data.error || 'Failed to process edit.', false);
    return;
  }

  // Remove the old AI response entry
  if (client.lastAIEntry && client.lastAIEntry.parentNode) {
    client.lastAIEntry.parentNode.removeChild(client.lastAIEntry);
  }

  // Update the player input entry with new text
  if (client.editPlayerEntry) {
    client.editPlayerEntry.querySelector('.player-action').textContent = '> ' + newInput;
  }

  // Track new input
  client.lastInput = newInput;

  // Append new AI response
  if (data.output) {
    appendStory(newInput, data.output, false, true); // skipSave since we're replacing
  }

  if (data.character)   updateCharacterPanel(data.character);
  if (data.progression) updateProgressionPanel(data.progression);
  if (data.economy)     updateEconomyPanel(data.economy);
  if (data.rightPanel)  updateRightPanel(data.rightPanel);
  if (data.board)       updateBoardPanel(data.board);
}


// =============================================
// ATTACH STORY ENTRY BUTTONS
// Adds retry/undo/edit buttons to a story entry
// =============================================
function attachStoryEntryButtons(aiEntry, playerInputEntry) {
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
