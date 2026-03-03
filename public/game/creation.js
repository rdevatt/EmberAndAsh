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
    const opts   = [...container.querySelectorAll('.cw-option:not(.cw-option-cat)')];
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
  const lines  = promptText.split('\n');
  const result = [];

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

// ---- Safety valve — if creation dismissal somehow fails, show a manual button ----
function showCreationFallback() {
  if (document.getElementById('cw-fallback-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'cw-fallback-btn';
  btn.textContent = 'BEGIN YOUR STORY →';
  btn.style.cssText = 'margin: 20px auto; display: block; padding: 10px 24px; background: #8b6914; color: #f0e6c8; border: none; cursor: pointer; font-size: 13px; letter-spacing: 2px;';
  btn.onclick = () => {
    client.inCreation = false;
    cwDismiss();
    btn.remove();
  };
  el.storyContent.appendChild(btn);
  btn.scrollIntoView({ behavior: 'smooth' });
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

  let ok, data;
  try {
    ({ ok, data } = await apiCall('POST', '/action', { input: text }));
  } catch (e) {
    setLoading(false);
    appendStory(null, 'Connection error. Please try again.', true);
    return;
  }

  setLoading(false);

  if (!ok) {
    const errMsg = data.detail
      ? `${data.error || 'Something went wrong.'} [${data.detail}]`
      : (data.error || 'Something went wrong.');
    appendStory(null, errMsg, true);
    // Show a manual dismiss button so the player can't get permanently stuck
    showCreationFallback();
    return;
  }

  if (data.output) {
    appendStory(null, data.output, true);
  }

  try {
    if (data.character)   updateCharacterPanel(data.character);
    if (data.progression) updateProgressionPanel(data.progression);
    if (data.economy)     updateEconomyPanel(data.economy);
    if (data.rightPanel)  updateRightPanel(data.rightPanel);
  if (data.board)       updateBoardPanel(data.board);
  } catch (e) {
    console.warn('[CW] Panel update error (non-fatal):', e);
  }

  if (!data.inCreation) {
    // Creation complete — dismiss wizard and reveal the input area
    client.inCreation = false;
    cwDismiss();
    return;
  }

  if (onSuccess) onSuccess(data.output || '');
}


// ---- Fallback background list (minimal) if server parse fails ----
function cwFallbackBgList() {
  return [
    { key:'peasant',        label:'Peasant',           desc:'The lowest rung of society.',            isMagical:false, index:1 },
    { key:'villager',       label:'Villager',          desc:'Community life and modest horizons.',    isMagical:false, index:2 },
    { key:'wanderer',       label:'Wanderer',          desc:'The road has been your home.',           isMagical:false, index:3 },
    { key:'soldier',        label:'Soldier',           desc:'Drilled in combat and discipline.',      isMagical:false, index:4 },
    { key:'hunter',         label:'Hunter',            desc:'The wild is your domain.',               isMagical:false, index:5 },
    { key:'mageapprentice', label:"Mage's Apprentice", desc:'You learned the basics of spellwork.',  isMagical:true,  startingSpell:'mana_bolt', index:6 },
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
// SAVES MODAL
// =============================================
const elSavesModal    = document.getElementById('modal-saves');
const elBtnSaves      = document.getElementById('btn-saves');
const elBtnCloseSaves = document.getElementById('btn-close-saves');
const elSavesGuestNote = document.getElementById('saves-guest-note');

async function openSavesModal() {
  elSavesModal.classList.remove('hidden');
  await refreshSaveSlots();
}

function closeSavesModal() {
  elSavesModal.classList.add('hidden');
}

async function refreshSaveSlots() {
  const { ok, data } = await apiCall('GET', '/saves/all');
  if (!ok) return;

  if (data.isGuest) {
    elSavesGuestNote.style.display = '';
    for (let i = 1; i <= 3; i++) {
      const infoEl = document.querySelector(`#save-slot-${i} .save-slot-info`);
      const loadBtn = document.querySelector(`#save-slot-${i} .save-slot-load`);
      const saveBtn = document.querySelector(`#save-slot-${i} .save-slot-save`);
      if (infoEl) infoEl.textContent = i === 1 ? 'Guest auto-save slot' : 'Requires account';
      if (loadBtn) loadBtn.disabled = i !== 1;
      if (saveBtn) saveBtn.disabled = i !== 1;
    }
    return;
  }

  elSavesGuestNote.style.display = 'none';

  for (const slot of data.slots) {
    const slotEl  = document.getElementById(`save-slot-${slot.slot}`);
    const infoEl  = slotEl && slotEl.querySelector('.save-slot-info');
    if (!infoEl) continue;

    if (slot.empty) {
      infoEl.textContent = 'Empty';
    } else {
      const updated = slot.updatedAt ? new Date(slot.updatedAt).toLocaleDateString() : '';
      infoEl.innerHTML = `<strong>${escHtml(slot.name)}</strong> — Level ${slot.level}<br>
        <span style="font-size:10px;color:var(--text-dim)">${escHtml(slot.background)} · ${escHtml(slot.region)}${updated ? ' · ' + updated : ''}</span>`;
    }

    if (slot.slot === data.currentSlot) {
      slotEl.classList.add('active-slot');
    } else {
      slotEl.classList.remove('active-slot');
    }
  }
}

elBtnSaves.addEventListener('click', openSavesModal);
elBtnCloseSaves.addEventListener('click', closeSavesModal);
elSavesModal.addEventListener('click', e => {
  if (e.target === elSavesModal) closeSavesModal();
});

// Save to a specific slot
document.querySelectorAll('.save-slot-save').forEach(btn => {
  btn.addEventListener('click', async () => {
    if (!client.isLoggedIn) { openSettings(); return; }
    const slot = parseInt(btn.dataset.slot);
    const { ok } = await apiCall('POST', '/saves/save-to-slot', { slot });
    if (ok) {
      btn.textContent = 'SAVED!';
      setTimeout(() => { btn.textContent = 'SAVE HERE'; }, 1500);
      await refreshSaveSlots();
    }
  });
});

// Load from a specific slot
document.querySelectorAll('.save-slot-load').forEach(btn => {
  btn.addEventListener('click', async () => {
    if (!client.isLoggedIn) { openSettings(); return; }
    const slot = parseInt(btn.dataset.slot);
    const { ok, data } = await apiCall('POST', '/saves/load', { slot });
    if (ok && data.success) {
      closeSavesModal();
      if (data.character)   updateCharacterPanel(data.character);
      if (data.rightPanel)  updateRightPanel(data.rightPanel);
  if (data.board)       updateBoardPanel(data.board);
      const resume = data.storySummary
        ? `— Loaded slot ${slot} —\n\n${data.storySummary}`
        : `Save slot ${slot} loaded.`;
      appendStory(null, resume, false);
      client.inCreation = false;
      document.getElementById('creation-wizard').classList.add('hidden');
      document.getElementById('input-area').classList.remove('hidden');
      el.playerInput.focus();
    }
  });
});


// =============================================
// RESET / NEW GAME
// =============================================
const elModalReset      = document.getElementById('modal-reset');
const elBtnResetGame    = document.getElementById('btn-reset-game');
const elBtnConfirmReset = document.getElementById('btn-confirm-reset');
const elBtnCancelReset  = document.getElementById('btn-cancel-reset');

function openResetModal() {
  closeSettings();
  elModalReset.classList.remove('hidden');
}

function closeResetModal() {
  elModalReset.classList.add('hidden');
}

async function handleReset() {
  closeResetModal();
  setLoading(true);

  const { ok, data } = await apiCall('POST', '/game/reset');
  setLoading(false);

  if (!ok) {
    appendStory(null, '[Reset failed. Try again.]', false);
    return;
  }

  // Clear story
  el.storyContent.innerHTML = '';
  localStorage.removeItem('sessionId');
  localStorage.removeItem('storyHistory');

  // Reinitialize
  client.inCreation  = true;
  client.creationStep = 1;
  client.creation    = { name:'', age:null, gender:null, heightText:'', buildKey:'', features:'', bgKey:null, bgIndex:null, bgFreeform:'', envKey:null, envIndex:null };

  appendStory(null, data.output || '', true);
  document.getElementById('creation-wizard').classList.remove('hidden');
  document.getElementById('input-area').classList.add('hidden');
  cwInit();
}

elBtnResetGame.addEventListener('click', openResetModal);
elBtnConfirmReset.addEventListener('click', handleReset);
elBtnCancelReset.addEventListener('click', closeResetModal);
elModalReset.addEventListener('click', e => {
  if (e.target === elModalReset) closeResetModal();
});


// =============================================
// MOBILE NAV
// =============================================
const mobileNavBtns = document.querySelectorAll('.mobile-nav-btn');
const panels = {
  left:   document.getElementById('panel-left'),
  center: document.getElementById('panel-center'),
  right:  document.getElementById('panel-right')
};

function setMobilePanel(active) {
  mobileNavBtns.forEach(b => b.classList.toggle('active', b.dataset.panel === active));
  Object.entries(panels).forEach(([key, el]) => {
    if (el) el.classList.toggle('mobile-active', key === active);
  });
}

// On mobile, story is the default active panel
if (window.innerWidth <= 768) {
  setMobilePanel('center');
}

mobileNavBtns.forEach(btn => {
  btn.addEventListener('click', () => setMobilePanel(btn.dataset.panel));
});

// When AI responds on mobile, auto-switch to story panel
const _origAppendStory = appendStory;


// =============================================
// STARTUP
// =============================================
window.addEventListener('DOMContentLoaded', () => {
  initSession();
});
