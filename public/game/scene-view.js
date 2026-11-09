/* =============================================================
   EMBER AND ASH — SCENE VIEW
   Renders the server's scene descriptor with EmberArt and plays its
   events in order. The server decides every outcome; this only shows
   it. With prefers-reduced-motion (or the "Still" toggle) the final
   state is drawn without animation.
   ============================================================= */
(function () {
  'use strict';

  const STEP_MS = 520;
  let playToken = 0;

  function reducedMotion() {
    try {
      if (localStorage.getItem('ea-still') === '1') return true;
    } catch (e) { /* storage unavailable */ }
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function svgEl(tag, attrs, text) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function floatText(svg, x, y, text, color) {
    const fx = svg.querySelector('.ea-fx');
    if (!fx) return;
    const t = svgEl('text', { x, y, fill: color, 'font-size': '14', 'font-weight': 'bold', 'text-anchor': 'middle', class: 'ea-float', stroke: '#000', 'stroke-width': '0.6', 'paint-order': 'stroke' }, text);
    fx.appendChild(t);
    setTimeout(() => t.remove(), 1400);
  }

  // Hit effects follow the violence setting: off — a white flash; mild — a
  // red spark; mature — a spray of blood.
  function impact(svg, x, y, violence) {
    const fx = svg.querySelector('.ea-fx');
    if (!fx) return;
    const parts = [];
    if (violence === 'mature') for (let i = 0; i < 7; i++) parts.push(svgEl('circle', { cx: x + (i - 3) * 4, cy: y + ((i * 7) % 9) - 4, r: 1.5 + (i % 3), fill: '#9a0a0a', class: 'ea-splatter' }));
    else parts.push(svgEl('circle', { cx: x, cy: y, r: 6, fill: violence === 'off' ? '#ffffff' : '#ff5040', opacity: '0.8', class: 'ea-spark' }));
    parts.forEach(p => fx.appendChild(p));
    setTimeout(() => parts.forEach(p => p.remove()), 700);
  }

  function projectile(svg, element) {
    const fx = svg.querySelector('.ea-fx');
    if (!fx) return;
    const colors = { fire: '#ff7a2a', frost: '#9ae0ff', holy: '#fff0a0', shadow: '#9a4ad0', nature: '#7ad05a', arcane: '#a08aff' };
    const c = svgEl('circle', { cx: 135, cy: 100, r: 7, fill: colors[element] || colors.arcane, class: 'ea-projectile' });
    fx.appendChild(c);
    requestAnimationFrame(() => { c.style.transform = 'translate(150px, 0)'; });
    setTimeout(() => c.remove(), 700);
  }

  function pulseClass(el, cls, ms) {
    if (!el) return;
    el.classList.remove(cls);
    void el.getBoundingClientRect();
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms || 600);
  }

  // Plays one event against the drawn scene.
  function playEvent(svg, ev, content) {
    const violence = (content && content.violence) || 'mild';
    const player = svg.querySelector('.ea-player');
    const enemy = svg.querySelector('.ea-enemy');
    switch (ev.type) {
      case 'attack':
        pulseClass(player, 'ea-lunge', 500);
        if (ev.hit) { setTimeout(() => { pulseClass(enemy, 'ea-shake', 400); impact(svg, 285, 110, violence); floatText(svg, 290, 70, ev.crit ? `CRIT ${ev.damage}` : `-${ev.damage}`, ev.crit ? '#ffd040' : '#ff6a5a'); }, 220); }
        else setTimeout(() => floatText(svg, 270, 70, 'miss', '#cccccc'), 220);
        break;
      case 'spell':
        pulseClass(player, 'ea-cast', 600); projectile(svg, ev.element);
        setTimeout(() => { if (ev.hit) { pulseClass(enemy, 'ea-shake', 400); floatText(svg, 290, 70, `${ev.crit ? 'CRIT ' : ''}-${ev.damage}`, '#c0a0ff'); } else floatText(svg, 270, 70, 'miss', '#cccccc'); }, 420);
        break;
      case 'defend': pulseClass(player, 'ea-guard', 700); floatText(svg, 110, 60, 'guard', '#9ad0ff'); break;
      case 'item': pulseClass(player, 'ea-heal', 700); floatText(svg, 110, 60, ev.item === 'mana potion' ? '+mana' : '+HP', '#7ae07a'); break;
      case 'companion': if (ev.heal) floatText(svg, 90, 70, `+${ev.damage}`, '#7ae07a'); else if (ev.hit) floatText(svg, 300, 95, `-${ev.damage}`, '#ffa080'); break;
      case 'telegraph': pulseClass(enemy, 'ea-windup', 900); floatText(svg, 290, 50, '⚠', '#ff4040'); break;
      case 'stunned': pulseClass(ev.who === 'enemy' ? enemy : player, 'ea-dazed', 700); floatText(svg, ev.who === 'enemy' ? 290 : 110, 50, 'stunned', '#ffe080'); break;
      case 'enemyAttack': case 'enemySpecial':
        pulseClass(enemy, 'ea-enemy-lunge', 500);
        setTimeout(() => { if (ev.hit) { pulseClass(player, 'ea-shake', 400); impact(svg, 112, 110, violence); floatText(svg, 110, 70, `-${ev.damage}`, '#ff5050'); } else floatText(svg, 130, 70, ev.blocked ? 'blocked' : 'dodged', '#cccccc'); }, 230);
        break;
      case 'death':
        if (ev.who === 'enemy' && enemy) enemy.classList.add('ea-dying');
        if (ev.who === 'player' && player) player.classList.add('ea-dying');
        break;
      case 'levelUp': pulseClass(player, 'ea-levelup', 1200); floatText(svg, 110, 50, `Level ${ev.level}!`, '#ffd040'); break;
      case 'triumph': floatText(svg, 200, 40, '✦ ' + String(ev.label || 'Victory').slice(0, 28), '#ffd040'); break;
      case 'travel': { const bg = svg.querySelector('.ea-bg'); pulseClass(bg, 'ea-slide', 900); pulseClass(player, 'ea-walk', 900); break; }
      case 'encounter': pulseClass(enemy, 'ea-appear', 700); break;
      case 'rest': floatText(svg, 150, 140, 'zzz', '#c0c8ff'); break;
      case 'craft': floatText(svg, 110, 60, '⚒', '#ffd080'); break;
      case 'romance': floatText(svg, 200, 60, '…', '#ffb0a0'); break;
      case 'intimacy': { const f = svg.querySelector('.ea-fadeout'); if (f) f.classList.add('ea-fading'); break; }
      case 'grim': break;
      default: break;
    }
  }

  function render(holder, caption, scene) {
    if (!holder || !scene || !window.EmberArt) return;
    const token = ++playToken;
    const still = reducedMotion();
    const killsEnemy = (scene.events || []).some(e => e.type === 'death' && e.who === 'enemy');
    // When the enemy dies this turn, draw it alive first and let the death play
    // out — unless motion is reduced, in which case draw the final state.
    const first = (!still && killsEnemy && scene.enemy) ? { ...scene, enemy: { ...scene.enemy, dead: false } } : scene;
    holder.innerHTML = window.EmberArt.scene(first);
    holder.dataset.region = scene.region || '';
    holder.dataset.enemyDead = scene.enemy ? String(!!scene.enemy.dead) : 'none';
    if (caption) caption.textContent = `${scene.regionLabel || ''} · ${scene.season || ''} ${scene.timeOfDay || ''}${scene.year ? ` · ${scene.year} E.R.` : ''}`;
    const svg = holder.querySelector('svg');
    const events = scene.events || [];
    if (still || !svg) {
      holder.dataset.played = events.map(e => e.type).join(',');
      return;
    }
    holder.dataset.played = '';
    events.forEach((ev, i) => setTimeout(() => {
      if (token !== playToken) return;
      playEvent(svg, ev, scene.content);
      holder.dataset.played = (holder.dataset.played ? holder.dataset.played + ',' : '') + ev.type;
    }, i * STEP_MS));
  }

  function renderPortrait(holder, portrait) {
    if (!holder || !portrait || !window.EmberArt) return;
    const key = JSON.stringify(portrait);
    if (holder.dataset.key === key) return;            // unchanged — keep the DOM stable
    holder.dataset.key = key;
    holder.innerHTML = window.EmberArt.portrait(portrait);
  }

  window.EmberScene = { render, renderPortrait, reducedMotion };
}());
