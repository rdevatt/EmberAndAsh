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

// Polls a condition with page.evaluate (CDP), which the page's strict CSP
// allows; page.waitForFunction needs eval, which the game forbids.
async function waitUntil(page, fn, arg, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await page.evaluate(fn, arg).catch(() => false)) return true;
    await page.waitForTimeout(100);
  }
  throw new Error('waitUntil timed out');
}

function helpers(page) {
  const visible = sel => page.locator(sel).first().isVisible().catch(() => false);
  const idle = () => waitUntil(page, () => document.getElementById('loading-overlay').classList.contains('hidden'));
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
  check('desktop: portrait drawn from the description', (await page.locator('#portrait-holder svg.ea-portrait').count()) === 1);
  // Identity (face, hair, skin, marks) must stay stable; gear may legitimately change.
  const identity = () => page.evaluate(() => JSON.stringify(JSON.parse(document.getElementById('portrait-holder').dataset.key).appearance));
  const portraitIdentity = await identity();
  check('desktop: illustrated scene shown', await h.visible('#scene-holder svg.ea-scene'));
  check('desktop: date and age shown', /E\.R\./.test(await page.locator('#world-line').innerText()) && /Age \d+/.test(await page.locator('#char-age').innerText()));

  await h.send('talk to Maren');
  check('desktop: talking advances objective', /Vesna/.test(await page.locator('#story-objective').innerText()));
  check('desktop: story beat has no undo/edit', (await page.locator('#story-content .story-entry').last().locator('.undo-btn').count()) === 0);

  await page.click('.quick-btn[data-cmd="explore"]'); await h.idle();
  check('desktop: explore quick button lists places', /PLACES IN/.test(await h.lastStory()));

  await h.send('I look around the valley');
  check('desktop: plain narrative keeps undo', (await page.locator('#story-content .story-entry').last().locator('.undo-btn').count()) === 1);

  // The player's words, narrated back exactly; described speech voiced as one line.
  await h.send('I walk to the well, asking for a drink of water.');
  const echo = await h.lastStory();
  check('desktop: the player\'s own action is narrated in their words', /You walk to the well, asking for a drink of water\./.test(echo), echo.slice(0, 120));
  check('desktop: described speech becomes one short line', /"A drink of water, please\."/.test(echo));

  await h.send('I attack the nearest creature');
  check('desktop: combat shows enemy panel', await h.visible('#enemy-display'));
  check('desktop: combat action bar appears', (await page.locator('#combat-actions .combat-btn').count()) >= 4);
  const sheathed = await page.locator('#combat-actions .combat-btn', { hasText: 'Draw' }).count();
  check('desktop: weapon stays sheathed until drawn (Draw / Fight barehanded offered)', sheathed === 1 && (await page.locator('#combat-actions .combat-btn', { hasText: 'barehanded' }).count()) === 1);
  let rounds = 0;
  while (await h.visible('#enemy-display') && rounds < 40) {
    const defend = /defend to blunt/.test(await h.lastStory());
    const draw = page.locator('#combat-actions .combat-btn', { hasText: 'Draw' });
    if (!defend && await draw.count()) { await draw.first().click(); await h.idle(); rounds++; continue; }
    await page.locator('#combat-actions .combat-btn', { hasText: defend ? 'Defend' : 'Attack' }).first().click(); await h.idle();
    rounds++;
  }
  check(`desktop: combat via buttons resolves (${rounds} rounds)`, !(await h.visible('#enemy-display')));
  await page.waitForTimeout(1800);
  const played = await page.locator('#scene-holder').getAttribute('data-played');
  check('desktop: scene animated the turn\'s events', /attack|spell|death|enemyAttack/.test(played || ''), played);
  const deadAttr = await page.locator('#scene-holder').getAttribute('data-enemy-dead');
  check('desktop: a slain enemy is drawn dead (or the player fell)', deadAttr === 'true' || deadAttr === 'none', deadAttr);
  check('desktop: same face across turns', (await identity()) === portraitIdentity);
  check('desktop: action bar clears after combat', (await page.locator('#combat-actions .combat-btn').count()) === 0);
  check('desktop: combat round entry cannot be undone', (await page.locator('.undo-btn').count()) === 0 || !(/◀|▶/.test(await h.lastStory())));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/desktop.png` });

  // Mature content settings
  await page.click('#btn-settings');
  await page.waitForSelector('#content-prefs .content-row');
  check('desktop: six content categories with three levels each', (await page.locator('#content-prefs .content-row').count()) === 6 && (await page.locator('#content-prefs .seg-btn').count()) === 18);
  await page.locator('.content-row[data-category="violence"] .seg-btn[data-level="mature"]').click();
  await page.waitForTimeout(400);
  check('desktop: choosing Mature violence sticks', (await page.locator('.content-row[data-category="violence"] .seg-btn.selected').getAttribute('data-level')) === 'mature');
  await page.locator('.content-row[data-category="sexual"] .seg-btn[data-level="mature"]').click();
  await page.waitForTimeout(400);
  check('desktop: sexual themes limited without the adult declaration', /adult/.test(await page.locator('.content-row[data-category="sexual"]').innerText()));
  check('desktop: self-declaration is labelled as not verified', /not verified/i.test(await page.locator('.adult-confirm').innerText()));
  await page.locator('#toggle-adult').check(); await page.waitForTimeout(500);
  await page.click('#btn-close-settings');
  await h.send('I undress and wade into the stream');
  await page.waitForTimeout(300);
  check('desktop: undressing is drawn (adult declared, nudity Mature)', /r="3\.6"/.test(await page.locator('#scene-holder').innerHTML()));
  await h.send('I get dressed');

  for (const cmd of ['abilities', 'recipes', 'companions', 'factions', 'story']) {
    await h.send(cmd);
    check(`desktop: "${cmd}" command renders`, (await h.lastStory()).length > 20);
  }

  await page.reload();
  await page.waitForSelector('#input-area:not(.hidden)', { timeout: 8000 }).catch(() => {});
  check('desktop: reload keeps story progress', /Vesna/.test(await page.locator('#story-objective').innerText()));
  check('desktop: reload keeps the same face', (await identity()) === portraitIdentity);
  await page.click('#btn-saves'); await page.waitForTimeout(600);
  check('desktop: worlds list in saves menu', /Guttering Age|E\.R\.|Only this world/.test(await page.locator('#worlds-list').innerText()));
  await page.click('#btn-close-saves');
  // The road: a meter under the portrait, neutral at first.
  check('desktop: the road meter shows under the portrait', await h.visible('#road-meter') && /Neither good nor evil/.test(await page.locator('#road-label').innerText()));
  // Crime: the deed is drawn and remembered; the world reacts.
  await h.send('talk to Old Hask');
  await h.send('I murder Old Hask');
  const crimeMood = await page.locator('#scene-holder').getAttribute('data-mood');
  check('desktop: a crime is drawn as a crime scene', crimeMood === 'crime' && /ea-grim/.test(await page.locator('#scene-holder').innerHTML()), `mood=${crimeMood}; story: ${(await h.lastStory()).slice(0, 120)}`);
  if (/plead innocent/.test(await page.locator('#story-content').innerText())) await h.send('confess');
  await h.send('deeds');
  // The attempt can fail (Old Hask fights back): then it is remembered as an assault.
  check('desktop: the character remembers what they did', /(murder|assault) — Old Hask/.test(await h.lastStory()), (await h.lastStory()).slice(0, 160));
  check('desktop: the road darkens after a murder', Number(await page.locator('#road-meter').getAttribute('data-value')) < 0, await page.locator('#road-label').innerText());
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/desktop-crime.png` });
  check('desktop: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.context().close();
}

async function reducedMotion(browser) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  const h = helpers(page);
  await page.goto(URL);
  await createCharacter(page, h, 'Still');
  await page.evaluate(async () => { await fetch('/api/settings/content', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-session-id': localStorage.getItem('sessionId') }, body: JSON.stringify({ prefs: { violence: 'mature', horror: 'mature' } }) }); });
  await h.send('I attack the nearest creature');
  await h.send('I slash at its torso');
  const played = await page.locator('#scene-holder').getAttribute('data-played');
  check('reduced motion: events drawn as final state immediately', !!played && /attack|spell|stunned|item/.test(played), played);
  const anims = await page.evaluate(() => [...document.querySelectorAll('#scene-holder *')].filter(el => getComputedStyle(el).animationName !== 'none').length);
  check('reduced motion: no running animations', anims === 0, `${anims} animated`);
  check('reduced motion: no console errors', errors.length === 0, errors.join(' | '));
  await context.close();
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
  check('mobile: scene visible on story tab', await h.visible('#scene-holder svg'));
  const sceneBox = await page.locator('#scene-holder').boundingBox();
  check('mobile: scene fits the screen', sceneBox && sceneBox.width <= 391 && sceneBox.height <= 200, sceneBox ? `${Math.round(sceneBox.width)}×${Math.round(sceneBox.height)}` : 'none');
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
  check('mobile: portrait on character tab', await h.visible('#portrait-holder svg'));
  await page.click('#btn-settings');
  await page.waitForSelector('#content-prefs .content-row');
  const seg = await page.locator('.content-row[data-category="horror"] .seg-btn').first().boundingBox();
  check('mobile: content settings are touch-sized', seg && seg.height >= 36, seg ? `${Math.round(seg.height)}px` : 'none');
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('mobile: settings fit the screen', ov <= 1, `overflow ${ov}px`);
  await page.click('#btn-close-settings');
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
    await reducedMotion(browser);
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
