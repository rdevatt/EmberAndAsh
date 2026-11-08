'use strict';

// =============================================================
// Browser playtest — desktop and mobile — against a running server.
//
//   EMBER_DB_PATH=/tmp/ui.db NARRATIVE_OFFLINE=1 PORT=3999 node server.js &
//   UI_URL=http://localhost:3999/ CHROME_PATH=/path/to/chrome node scripts/ui-playtest.js
//
// Needs playwright-core (npm i --no-save playwright-core, or set
// PLAYWRIGHT_CORE to its path) and a Chromium binary. Never point it at
// a server using the production database.
// =============================================================

const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const URL  = process.env.UI_URL || 'http://localhost:3999/';
const SHOTS = process.env.UI_SHOTS || null;
const results = [];
const check = (name, cond, extra = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);

async function newPage(browser, viewport) {
  const context = await browser.newContext({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('dialog', d => d.accept());
  return { page, errors };
}

function helpers(page) {
  const visible = sel => page.locator(sel).first().isVisible().catch(() => false);
  const idle = () => page.waitForFunction(() => document.getElementById('loading-overlay').classList.contains('hidden'));
  const send = async text => { await page.fill('#player-input', text); await page.press('#player-input', 'Enter'); await idle(); };
  const lastStory = () => page.locator('#story-content .story-entry').last().innerText();
  return { visible, idle, send, lastStory };
}

async function createCharacter(page, h, name) {
  await page.waitForSelector('#creation-wizard:not(.hidden)');
  await page.fill('#cw-name', name);
  await page.click('.cw-gender-btn[data-value="female"]');
  await page.click('#cw-next-1'); await h.idle();
  await page.fill('#cw-features', 'a crooked nose and ink-stained fingers');
  await page.click('#cw-next-2'); await h.idle();
  await page.locator('#cw-background-list .cw-option').first().click();
  await page.click('#cw-next-3'); await h.idle();
  await page.locator('#cw-env-grid .cw-env-card').nth(2).click();
  await page.click('#cw-next-4'); await h.idle();
}

async function desktop(browser) {
  const { page, errors } = await newPage(browser, { width: 1400, height: 900 });
  const h = helpers(page);
  await page.goto(URL);
  await createCharacter(page, h, 'Mira');
  check('desktop: creation completes', await h.visible('#input-area') && !(await h.visible('#creation-wizard')));
  check('desktop: story panel shows chapter 1', /Chapter 1: Smoke on the Road/.test(await page.locator('#story-chapter').innerText()));
  check('desktop: objective names Maren', /Maren/.test(await page.locator('#story-objective').innerText()));
  check('desktop: narration mode shown', /narration/.test(await page.locator('#narration-mode').innerText()));
  check('desktop: factions panel visible', await h.visible('#section-factions') && (await page.locator('.faction-row').count()) === 4);

  await h.send('talk to Maren');
  check('desktop: talking advances objective', /Vesna/.test(await page.locator('#story-objective').innerText()));
  check('desktop: story beat has no undo/edit', (await page.locator('#story-content .story-entry').last().locator('.undo-btn').count()) === 0);

  await page.click('.quick-btn[data-cmd="explore"]'); await h.idle();
  check('desktop: explore quick button lists places', /PLACES IN/.test(await h.lastStory()));

  await h.send('I look around the valley');
  check('desktop: plain narrative keeps undo', (await page.locator('#story-content .story-entry').last().locator('.undo-btn').count()) === 1);

  await h.send('I attack the nearest creature');
  check('desktop: combat shows enemy panel', await h.visible('#enemy-display'));
  check('desktop: combat action bar appears', (await page.locator('#combat-actions .combat-btn').count()) >= 4);
  let rounds = 0;
  while (await h.visible('#enemy-display') && rounds < 40) {
    const defend = /defend to blunt/.test(await h.lastStory());
    await page.locator('#combat-actions .combat-btn', { hasText: defend ? 'Defend' : 'Attack' }).first().click(); await h.idle();
    rounds++;
  }
  check(`desktop: combat via buttons resolves (${rounds} rounds)`, !(await h.visible('#enemy-display')));
  check('desktop: action bar clears after combat', (await page.locator('#combat-actions .combat-btn').count()) === 0);
  check('desktop: combat round entry cannot be undone', (await page.locator('.undo-btn').count()) === 0 || !(/◀|▶/.test(await h.lastStory())));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/desktop.png` });

  for (const cmd of ['abilities', 'recipes', 'companions', 'factions', 'story']) {
    await h.send(cmd);
    check(`desktop: "${cmd}" command renders`, (await h.lastStory()).length > 20);
  }

  await page.reload();
  await page.waitForSelector('#input-area:not(.hidden)', { timeout: 8000 }).catch(() => {});
  check('desktop: reload keeps story progress', /Vesna/.test(await page.locator('#story-objective').innerText()));
  check('desktop: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.context().close();
}

async function mobile(browser) {
  const { page, errors } = await newPage(browser, { width: 390, height: 844 });
  const h = helpers(page);
  await page.goto(URL);
  await createCharacter(page, h, 'Wren');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('mobile: no horizontal page scroll', overflow <= 1, `overflow ${overflow}px`);
  check('mobile: bottom nav visible', await h.visible('#mobile-nav'));
  await page.click('.mobile-nav-btn[data-panel="center"]');
  check('mobile: input reachable on story tab', await h.visible('#player-input'));
  await h.send('I attack the nearest creature');
  check('mobile: combat buttons visible on story tab', await h.visible('#combat-actions .combat-btn'));
  const box = await page.locator('#combat-actions .combat-btn').first().boundingBox();
  check('mobile: combat buttons are touch-sized', box && box.height >= 36, box ? `${Math.round(box.height)}px` : 'none');
  let rounds = 0;
  while (await h.visible('#combat-actions .combat-btn') && rounds < 40) {
    await page.locator('#combat-actions .combat-btn', { hasText: 'Attack' }).first().click(); await h.idle(); rounds++;
  }
  check('mobile: combat completes from touch buttons', !(await h.visible('#combat-actions .combat-btn')));
  await page.click('.mobile-nav-btn[data-panel="right"]');
  check('mobile: world tab shows main story', await h.visible('#section-story'));
  await page.click('.mobile-nav-btn[data-panel="left"]');
  check('mobile: character tab shows factions', await h.visible('#section-factions'));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mobile.png`, fullPage: false });
  check('mobile: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.context().close();
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--disable-gpu']
  });
  try {
    await desktop(browser);
    await mobile(browser);
  } catch (e) {
    results.push(`FAIL  script error — ${e.message}`);
  }
  await browser.close();
  console.log(results.join('\n'));
  const failed = results.filter(r => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
