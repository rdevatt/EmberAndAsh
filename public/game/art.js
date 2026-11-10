/* =============================================================
   EMBER AND ASH — PROCEDURAL ART
   Layered SVG illustrations built from the engine's portrait and
   scene data. Deterministic: the same character data always draws
   the same face, so a character is recognisable from scene to scene
   and after reloading. Runs in the browser (window.EmberArt) and in
   Node (require) so the artwork can be tested.
   ============================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EmberArt = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

  function hexToRgb(h) { const n = parseInt(String(h || '#888888').slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgbToHex(r, g, b) { return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
  function mix(a, b, t) { const x = hexToRgb(a), y = hexToRgb(b); return rgbToHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); }
  function shade(c, t) { return t < 0 ? mix(c, '#000000', -t) : mix(c, '#ffffff', t); }

  const TIER_TRIM = ['#6b5a44', '#7a6a50', '#8a7a5c', '#9a9a9a', '#b0b0b8', '#c9c9d4', '#d9b85a', '#e0c060', '#f0d070', '#ffe08a'];
  function trimFor(tier) { return tier >= TIER_TRIM.length ? '#aee8ff' : TIER_TRIM[Math.max(0, tier || 0)]; }
  const CLASS_COLOR = { wizard: '#2f3f8f', sorcerer: '#7a2a5a', warlock: '#3a1f4f', cleric: '#c9c3b0', druid: '#3f6a3a', paladin: '#b8a36a', bard: '#8a3a2a', ranger: '#3f5a32', rogue: '#2a2a30', monk: '#a8643a', fighter: '#6a3a2a', barbarian: '#5a3a24' };

  // ---------------------------------------------------------
  // Hair colour shifts with age: grey from 45, white by 70.
  function agedHair(hex, age, undead) {
    if (undead) return mix(hex, '#d8d8d0', 0.7);
    if (age >= 70) return mix(hex, '#f2f2ee', 0.85);
    if (age >= 55) return mix(hex, '#b8b8b8', 0.6);
    if (age >= 45) return mix(hex, '#a8a8a8', 0.3);
    return hex;
  }

  function hairShapes(style, color, cx, cy, r, back) {
    const c = color, d = shade(color, -0.25);
    const top = `<path d="M${cx - r} ${cy - 2} Q${cx - r} ${cy - r * 1.25} ${cx} ${cy - r * 1.2} Q${cx + r} ${cy - r * 1.25} ${cx + r} ${cy - 2} Q${cx + r * 0.6} ${cy - r * 0.75} ${cx} ${cy - r * 0.8} Q${cx - r * 0.6} ${cy - r * 0.75} ${cx - r} ${cy - 2}Z" fill="${c}" stroke="${d}" stroke-width="1"/>`;
    if (style === 'bald') return back ? '' : '';
    if (style === 'shaved') return back ? '' : `<path d="M${cx - r * 0.95} ${cy - 4} Q${cx} ${cy - r * 1.25} ${cx + r * 0.95} ${cy - 4}" fill="none" stroke="${c}" stroke-width="3" opacity="0.45"/>`;
    if (back) {
      if (style === 'long' || style === 'braided' || style === 'curly') return `<path d="M${cx - r * 1.05} ${cy - 6} Q${cx - r * 1.25} ${cy + r * 1.3} ${cx - r * 0.6} ${cy + r * 1.6} L${cx + r * 0.6} ${cy + r * 1.6} Q${cx + r * 1.25} ${cy + r * 1.3} ${cx + r * 1.05} ${cy - 6}Z" fill="${d}"/>`;
      if (style === 'ponytail') return `<path d="M${cx + r * 0.7} ${cy - r * 0.5} Q${cx + r * 1.6} ${cy} ${cx + r * 1.1} ${cy + r * 1.4}" stroke="${c}" stroke-width="${r * 0.35}" fill="none" stroke-linecap="round"/>`;
      return '';
    }
    if (style === 'curly') { let s = ''; for (let i = 0; i < 9; i++) { const a = Math.PI * (1.05 + i * 0.11); s += `<circle cx="${cx + Math.cos(a) * r * 0.98}" cy="${cy - 2 + Math.sin(a) * r * 1.02}" r="${r * 0.28}" fill="${c}" stroke="${d}" stroke-width="0.8"/>`; } return s; }
    if (style === 'wild') return top + `<path d="M${cx - r} ${cy - r * 0.6} l-6 -6 l8 2 l-2 -9 l8 6 l2 -9 l5 8 l6 -8 l1 9 l8 -5 l-3 9 l8 -1 l-7 6" fill="${c}" stroke="${d}" stroke-width="0.8"/>`;
    if (style === 'topknot') return top + `<circle cx="${cx}" cy="${cy - r * 1.3}" r="${r * 0.3}" fill="${c}" stroke="${d}"/>`;
    if (style === 'braided') return top + `<path d="M${cx + r * 0.85} ${cy} q4 8 0 16 q-4 8 0 16 q4 8 0 14" stroke="${d}" stroke-width="5" fill="none"/>`;
    if (style === 'cropped') return `<path d="M${cx - r * 0.95} ${cy - 3} Q${cx} ${cy - r * 1.3} ${cx + r * 0.95} ${cy - 3} Q${cx} ${cy - r * 0.95} ${cx - r * 0.95} ${cy - 3}Z" fill="${c}"/>`;
    return top;
  }

  function weaponBehind(kind, trim, x, y) {
    if (kind === 'sword') return `<g transform="translate(${x} ${y}) rotate(-25)"><rect x="-2" y="-46" width="5" height="42" fill="#c8ccd4" stroke="#6a6e78"/><rect x="-8" y="-5" width="17" height="4" fill="${trim}"/><rect x="-1.5" y="-1" width="4" height="10" fill="#4a3426"/></g>`;
    if (kind === 'axe') return `<g transform="translate(${x} ${y}) rotate(-25)"><rect x="-1.5" y="-44" width="4" height="52" fill="#5a3e2a"/><path d="M2 -44 q14 4 12 18 q-8 -6 -12 -4z" fill="#b8bcc4" stroke="#6a6e78"/></g>`;
    if (kind === 'mace') return `<g transform="translate(${x} ${y}) rotate(-25)"><rect x="-1.5" y="-36" width="4" height="44" fill="#5a3e2a"/><circle cx="0.5" cy="-40" r="7" fill="#9a9ea8" stroke="${trim}" stroke-width="2"/></g>`;
    if (kind === 'spear') return `<g transform="translate(${x} ${y}) rotate(-20)"><rect x="-1" y="-60" width="3" height="70" fill="#6a4a30"/><path d="M-3 -60 l3.5 -12 l3.5 12z" fill="#c8ccd4"/></g>`;
    if (kind === 'staff') return `<g transform="translate(${x} ${y}) rotate(-12)"><rect x="-1.5" y="-56" width="4" height="66" fill="#6a4a2e"/><circle cx="0.5" cy="-58" r="5" fill="${trim}"/><circle cx="0.5" cy="-58" r="9" fill="${trim}" opacity="0.25"/></g>`;
    if (kind === 'bow') return `<g transform="translate(${x} ${y}) rotate(-15)"><path d="M0 -50 Q16 -22 0 8" stroke="#6a4a2e" stroke-width="3" fill="none"/><line x1="0" y1="-50" x2="0" y2="8" stroke="#ddd" stroke-width="0.8"/></g>`;
    if (kind === 'dagger') return `<g transform="translate(${x} ${y}) rotate(-30)"><rect x="-1.5" y="-20" width="4" height="18" fill="#c8ccd4"/><rect x="-5" y="-3" width="11" height="3" fill="${trim}"/></g>`;
    if (kind === 'tome') return `<g transform="translate(${x - 4} ${y - 18})"><rect width="16" height="20" rx="2" fill="#5a2a2a" stroke="${trim}" stroke-width="1.5"/></g>`;
    return '';
  }

  function torso(armor, cls, trim, cx, top, w, build, seed, regalia) {
    const bw = w * (build === 'broad' ? 1.18 : build === 'slender' ? 0.9 : 1);
    const base = armor.kind === 'plate' ? '#9aa0aa' : armor.kind === 'mail' ? '#7c818a' : armor.kind === 'leather' ? '#6b4a30' : armor.kind === 'robe' ? (CLASS_COLOR[cls] || '#3a3a5a') : ['#5a4a3a', '#4a5a4a', '#5a3a3a', '#3a4a5a'][seed % 4];
    let s = `<path d="M${cx - bw} ${top + 46} Q${cx - bw} ${top + 6} ${cx - bw * 0.35} ${top} L${cx + bw * 0.35} ${top} Q${cx + bw} ${top + 6} ${cx + bw} ${top + 46}Z" fill="${base}" stroke="${shade(base, -0.35)}" stroke-width="1.5"/>`;
    if (armor.kind === 'plate') s += `<path d="M${cx - bw} ${top + 12} q${bw * 0.4} -12 ${bw * 0.7} -4" fill="${shade(base, 0.2)}" stroke="${trim}" stroke-width="2"/><path d="M${cx + bw} ${top + 12} q${-bw * 0.4} -12 ${-bw * 0.7} -4" fill="${shade(base, 0.2)}" stroke="${trim}" stroke-width="2"/><path d="M${cx - 8} ${top + 8} L${cx} ${top + 30} L${cx + 8} ${top + 8}" fill="none" stroke="${trim}" stroke-width="1.5"/>`;
    if (armor.kind === 'mail') { for (let y = top + 8; y < top + 44; y += 5) s += `<path d="M${cx - bw + 4} ${y} ${Array.from({ length: 8 }, (_, i) => `q2 3 ${bw * 0.25} 0`).join(' ')}" fill="none" stroke="${shade(base, 0.25)}" stroke-width="0.8"/>`; }
    if (armor.kind === 'leather') s += `<path d="M${cx - bw * 0.7} ${top + 6} L${cx + bw * 0.6} ${top + 40}" stroke="#3a2618" stroke-width="3"/><circle cx="${cx}" cy="${top + 22}" r="2" fill="${trim}"/>`;
    if (armor.kind === 'robe') s += `<path d="M${cx - 6} ${top} L${cx} ${top + 46} L${cx + 6} ${top}" fill="${shade(base, -0.2)}"/><path d="M${cx - bw * 0.5} ${top + 2} Q${cx} ${top + 14} ${cx + bw * 0.5} ${top + 2}" fill="none" stroke="${trim}" stroke-width="2"/>`;
    if (regalia === 'archmage') for (let i = 0; i < 5; i++) s += `<path d="M${cx - bw * 0.6 + i * bw * 0.3} ${top + 30 + (i % 2) * 6} l1.5 3 l3 0.4 l-2.3 2 l0.6 3 l-2.8 -1.5 l-2.8 1.5 l0.6 -3 l-2.3 -2 l3 -0.4z" fill="#f0d070" opacity="0.85"/>`;
    if (armor.kind === 'clothes') s += `<path d="M${cx - 10} ${top + 2} L${cx} ${top + 12} L${cx + 10} ${top + 2}" fill="none" stroke="${shade(base, 0.3)}" stroke-width="1.5"/>`;
    return s;
  }

  /**
   * Portrait bust. data: { name, gender, age, appearance, weapon, armor, cls, regalia, crown, undead, immortalGlow }
   */
  function portrait(data, opts) {
    opts = opts || {};
    const d = data || {};
    const a = d.appearance || {};
    const seed = a.seed || hash(d.name);
    const age = Number(d.age) || 25;
    const W = 120, H = 140, cx = 60;
    const species = a.species || 'human';
    let skin = a.skinHex || '#e0b896';
    if (d.undead) skin = mix(skin, '#9fb0a8', 0.55);
    if (species === 'orc') skin = mix(skin, '#6f8f4f', 0.55);
    const hair = agedHair(a.hairHex || '#4a3020', age, d.undead);
    const youth = age < 16 ? 0.88 : 1;
    const r = (species === 'dwarf' ? 21 : species === 'halfling' ? 19 : 20) * youth * (a.build === 'broad' ? 1.05 : 1);
    const cy = 58 + (species === 'dwarf' ? 6 : 0) + (a.height === 'tall' ? -3 : a.height === 'short' ? 3 : 0);
    const trim = trimFor(d.armor ? d.armor.tier : 0);
    // The road they walk: light and warm toward good; red and black, red
    // eyes and growing horns toward evil.
    const road = d.road || {};
    if (road.tone === 'light') skin = mix(skin, '#fff6e0', 0.12);
    const bg = road.tone === 'dark' ? (road.horns >= 2 ? '#1a0204' : '#2a0a0c') : road.tone === 'light' ? '#4a4434' : d.crown ? '#3a2a12' : d.regalia === 'archmage' ? '#1c2244' : '#1a1a20';
    const out = [];
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="ea-portrait" role="img" aria-label="${esc(`Portrait of ${d.name || 'your character'}`)}">`);
    const gid = `pg${seed}${road.tone || 'n'}${road.horns || 0}${d.crown ? 'c' : ''}${d.regalia ? 'r' : ''}`;
    out.push(`<defs><radialGradient id="${gid}" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="${shade(bg, 0.18)}"/><stop offset="1" stop-color="${bg}"/></radialGradient></defs>`);
    out.push(`<rect width="${W}" height="${H}" rx="8" fill="url(#${gid})"/>`);
    if (d.immortalGlow) out.push(`<circle cx="${cx}" cy="${cy}" r="${r * 2}" fill="#f0d070" opacity="0.12"/>`);
    if (road.tone === 'light') out.push(`<circle cx="${cx}" cy="${cy - 6}" r="${r * 2.1}" fill="#fff0c0" opacity="${road.glow ? 0.28 : 0.16}" class="ea-road-light"/>`);
    if (road.tone === 'dark') out.push(`<path d="M0 ${H} Q${cx} ${H - 50} ${W} ${H}Z" fill="#6a0a0a" opacity="0.45"/><circle cx="${cx}" cy="${cy}" r="${r * 2.2}" fill="#3a0000" opacity="0.35" class="ea-road-dark"/>`);
    // behind: weapon and long hair
    out.push(weaponBehind(d.weapon ? d.weapon.kind : 'none', trim, cx + 30, 118));
    out.push(hairShapes(a.hairStyle, hair, cx, cy, r, true));
    // body
    out.push(torso(d.armor || { kind: 'clothes' }, d.cls, trim, cx, 94, 38, a.build, seed, d.regalia));
    out.push(`<rect x="${cx - 7}" y="${cy + r - 4}" width="14" height="${94 - (cy + r) + 6}" fill="${shade(skin, -0.08)}"/>`);
    // ears
    const earY = cy + 2;
    if (species === 'elf') out.push(`<path d="M${cx - r + 1} ${earY} l-10 -12 l6 16z" fill="${skin}" stroke="${shade(skin, -0.3)}"/><path d="M${cx + r - 1} ${earY} l10 -12 l-6 16z" fill="${skin}" stroke="${shade(skin, -0.3)}"/>`);
    else {
      const missing = (a.marks || []).includes('missing ear');
      out.push(`<ellipse cx="${cx - r + 1}" cy="${earY}" rx="4" ry="6" fill="${skin}" stroke="${shade(skin, -0.3)}"/>`);
      if (!missing) out.push(`<ellipse cx="${cx + r - 1}" cy="${earY}" rx="4" ry="6" fill="${skin}" stroke="${shade(skin, -0.3)}"/>`);
      if ((a.marks || []).includes('earring')) out.push(`<circle cx="${cx - r + 1}" cy="${earY + 7}" r="1.8" fill="#e0c060"/>`);
    }
    // head
    out.push(`<ellipse cx="${cx}" cy="${cy}" rx="${r * (species === 'dwarf' ? 1.05 : 0.92)}" ry="${r * 1.12}" fill="${skin}" stroke="${shade(skin, -0.35)}" stroke-width="1.2"/>`);
    // age lines
    if (age >= 55) out.push(`<path d="M${cx - 9} ${cy - r * 0.55} q9 -3 18 0" stroke="${shade(skin, -0.3)}" fill="none" stroke-width="0.9"/><path d="M${cx - 13} ${cy + 9} q2 4 5 5 M${cx + 13} ${cy + 9} q-2 4 -5 5" stroke="${shade(skin, -0.3)}" fill="none" stroke-width="0.9"/>`);
    if (age >= 70) out.push(`<path d="M${cx - 8} ${cy - r * 0.7} q8 -3 16 0 M${cx - 15} ${cy - 1} l-3 -2 M${cx + 15} ${cy - 1} l3 -2" stroke="${shade(skin, -0.32)}" fill="none" stroke-width="0.9"/>`);
    // eyes
    const eye = road.redEyes ? '#d01818' : d.undead ? '#7fffd0' : (a.eyeHex || '#5a4030');
    const patch = (a.marks || []).includes('eyepatch');
    out.push(`<ellipse cx="${cx - 7}" cy="${cy - 1}" rx="3.6" ry="2.4" fill="#f4f0e8"/><circle cx="${cx - 7}" cy="${cy - 1}" r="1.8" fill="${eye}"/>`);
    if (patch) out.push(`<ellipse cx="${cx + 7}" cy="${cy - 1}" rx="5" ry="4" fill="#1a1a1a"/><path d="M${cx - r} ${cy - 7} L${cx + r} ${cy - 3}" stroke="#1a1a1a" stroke-width="1.5"/>`);
    else out.push(`<ellipse cx="${cx + 7}" cy="${cy - 1}" rx="3.6" ry="2.4" fill="#f4f0e8"/><circle cx="${cx + 7}" cy="${cy - 1}" r="1.8" fill="${eye}"/>`);
    // brows
    const brow = shade(hair, -0.2);
    out.push(`<path d="M${cx - 11} ${cy - 6} q4 -2.5 8 0 M${cx + 3} ${cy - 6} q4 -2.5 8 0" stroke="${brow}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`);
    // nose & mouth
    const crooked = (a.marks || []).includes('crooked nose');
    out.push(`<path d="M${cx} ${cy + 1} ${crooked ? 'l2 5 l-3 3' : 'l-1.5 6 l3 1'}" stroke="${shade(skin, -0.35)}" fill="none" stroke-width="1.1"/>`);
    out.push(`<path d="M${cx - 5} ${cy + 13} q5 ${age >= 70 ? 1 : 2.5} 10 0" stroke="${shade(skin, -0.45)}" fill="none" stroke-width="1.3"/>`);
    if (species === 'orc') out.push(`<path d="M${cx - 5} ${cy + 13} l-1 -5 l2.5 4z M${cx + 5} ${cy + 13} l1 -5 l-2.5 4z" fill="#f4f0e0"/>`);
    // marks
    if ((a.marks || []).includes('freckles')) for (let i = 0; i < 8; i++) out.push(`<circle cx="${cx - 12 + ((seed >> i) % 24)}" cy="${cy + 4 + ((seed >> (i + 3)) % 5)}" r="0.7" fill="${shade(skin, -0.35)}"/>`);
    if ((a.marks || []).includes('tattoo')) out.push(`<path d="M${cx + 10} ${cy + 4} l4 3 l-4 3 l4 3" stroke="#2a4a7a" stroke-width="1.2" fill="none"/>`);
    const scarAt = { cheek: [cx - 12, cy + 4, 7, 7], eye: [cx + 4, cy - 9, 7, 13], brow: [cx - 12, cy - 9, 8, 4], lip: [cx + 2, cy + 10, 3, 6], jaw: [cx + 9, cy + 14, 6, 5], chin: [cx - 2, cy + 18, 4, 4], nose: [cx - 2, cy + 1, 4, 5], forehead: [cx - 6, cy - 16, 12, 4], neck: [cx - 5, cy + r + 2, 10, 3] };
    for (const s of a.scars || []) { const p = scarAt[s]; if (p) out.push(`<path d="M${p[0]} ${p[1]} l${p[2]} ${p[3]}" stroke="#b05a5a" stroke-width="1.4" stroke-linecap="round" opacity="0.85"/>`); }
    // beard
    if (a.beard === 'beard' || species === 'dwarf') out.push(`<path d="M${cx - r * 0.85} ${cy + 4} Q${cx - r * 0.8} ${cy + r * (species === 'dwarf' ? 1.9 : 1.45)} ${cx} ${cy + r * (species === 'dwarf' ? 2.1 : 1.55)} Q${cx + r * 0.8} ${cy + r * (species === 'dwarf' ? 1.9 : 1.45)} ${cx + r * 0.85} ${cy + 4} Q${cx} ${cy + 16} ${cx - r * 0.85} ${cy + 4}Z" fill="${hair}" stroke="${shade(hair, -0.25)}"/>`);
    else if (a.beard === 'stubble') out.push(`<path d="M${cx - r * 0.8} ${cy + 6} Q${cx} ${cy + r * 1.35} ${cx + r * 0.8} ${cy + 6}" fill="none" stroke="${hair}" stroke-width="5" opacity="0.3"/>`);
    // front hair
    out.push(hairShapes(a.hairStyle, hair, cx, cy, r, false));
    // The road's marks: shadow across the face and horns, or a halo.
    if (road.tone === 'dark') out.push(`<ellipse cx="${cx}" cy="${cy + 4}" rx="${r * 0.95}" ry="${r * 1.15}" fill="#1a0000" opacity="${road.horns >= 2 ? 0.32 : 0.2}"/>`);
    if (road.redEyes) out.push(`<circle cx="${cx - 7}" cy="${cy - 1}" r="3.4" fill="#ff2020" opacity="0.25"/><circle cx="${cx + 7}" cy="${cy - 1}" r="3.4" fill="#ff2020" opacity="0.25"/>`);
    if (road.horns === 1) out.push(`<path d="M${cx - 10} ${cy - r * 0.9} q-5 -10 -2 -16 q2 8 7 13z M${cx + 10} ${cy - r * 0.9} q5 -10 2 -16 q-2 8 -7 13z" fill="#2a1a1a" stroke="#0a0000"/>`);
    if (road.horns >= 2) out.push(`<path d="M${cx - 12} ${cy - r * 0.8} q-16 -6 -20 -24 q-2 -10 6 -12 q-6 6 -2 14 q4 10 20 16z M${cx + 12} ${cy - r * 0.8} q16 -6 20 -24 q2 -10 -6 -12 q6 6 2 14 q-4 10 -20 16z" fill="#1a0a0a" stroke="#4a0a0a" stroke-width="1.2"/>`);
    if (road.glow) out.push(`<ellipse cx="${cx}" cy="${cy - r - 10}" rx="${r * 0.8}" ry="4" fill="none" stroke="#ffe08a" stroke-width="2" opacity="0.85"/>`);
    // headwear
    if (d.crown) out.push(`<path d="M${cx - 16} ${cy - r * 0.95} l3 -12 l6 7 l7 -11 l7 11 l6 -7 l3 12z" fill="#e0b84a" stroke="#8a6a1a"/><circle cx="${cx}" cy="${cy - r - 9}" r="2" fill="#c03a3a"/>`);
    else if (d.regalia === 'archmage') out.push(`<path d="M${cx - 17} ${cy - r * 0.8} q17 -6 34 0" stroke="#f0d070" stroke-width="2.5" fill="none"/><circle cx="${cx}" cy="${cy - r * 0.95}" r="2.4" fill="#8ad0ff"/>`);
    out.push('</svg>');
    return out.join('');
  }

  // ---------------------------------------------------------
  // Full-body figure for scenes (≈ 40×90 units), facing right.
  // An unclothed adult body in the game's simple style. 'full' is drawn
  // plainly; 'covered' wraps chest and hips; 'under' is a plain shift.
  function nudeTorso(w, skin, hair, female, lvl, stoop) {
    const edge = shade(skin, -0.3), dark = shade(skin, -0.45);
    const shape = female
      ? `M${-w + 1} ${26 + stoop} Q0 ${20 + stoop} ${w - 1} ${26 + stoop} Q${w + 1} 36 ${w - 3} 46 Q${w + 1} 54 ${w} 60 L${-w} 60 Q${-w - 1} 54 ${-w + 3} 46 Q${-w - 1} 36 ${-w + 1} ${26 + stoop}Z`
      : `M${-w} 58 Q${-w} 26 0 ${22 + stoop} Q${w} 26 ${w} 58Z`;
    if (lvl === 'under') return `<path d="${shape}" fill="${skin}" stroke="${edge}"/><path d="M${-w + 1} ${28 + stoop} L${w - 1} ${28 + stoop} L${w + 2} 70 L${-w - 2} 70Z" fill="#d8d0c0" stroke="#a8a090"/>`;
    let out = `<path d="${shape}" fill="${skin}" stroke="${edge}"/>`;
    if (lvl === 'covered') {
      if (female) out += `<path d="M${-w + 1} 30 Q0 27 ${w - 1} 30 L${w - 1} 38 Q0 41 ${-w + 1} 38Z" fill="#d8d0c0"/>`;
      return out + `<path d="M${-w} 52 Q0 49 ${w} 52 L${w + 1} 66 Q0 69 ${-w - 1} 66Z" fill="#d8d0c0"/>`;
    }
    if (female) out += `<circle cx="-4.4" cy="34.5" r="3.6" fill="${skin}" stroke="${edge}" stroke-width="0.8"/><circle cx="4.4" cy="34.5" r="3.6" fill="${skin}" stroke="${edge}" stroke-width="0.8"/><circle cx="-4.4" cy="35.4" r="0.9" fill="${dark}"/><circle cx="4.4" cy="35.4" r="0.9" fill="${dark}"/>`;
    else out += `<path d="M${-w + 3} 32 q${w / 2 - 1.5} 3 ${w - 3} 0 q${w / 2 - 1.5} 3 ${w - 3} 0" stroke="${edge}" stroke-width="0.8" fill="none"/><circle cx="-3.5" cy="33.6" r="0.7" fill="${dark}"/><circle cx="3.5" cy="33.6" r="0.7" fill="${dark}"/>`;
    out += `<circle cx="0" cy="47" r="0.7" fill="${dark}"/><path d="M-3.4 55.5 L3.4 55.5 L0 60.5Z" fill="${hair}" opacity="0.9"/>`;
    if (!female) out += `<path d="M-1.4 58.5 Q-1.6 65 0 65.4 Q1.6 65 1.4 58.5Z" fill="${shade(skin, -0.12)}" stroke="${edge}" stroke-width="0.6"/>`;
    return out;
  }

  function figure(data, pose, opts) {
    const d = data || {};
    const o = opts || {};
    if (pose === 'abed') return figureAbed(d, o);
    const a = d.appearance || {};
    const age = Number(d.age) || 25;
    let skin = a.skinHex || '#e0b896';
    if (d.undead) skin = mix(skin, '#9fb0a8', 0.55);
    const hair = agedHair(a.hairHex || '#4a3020', age, d.undead);
    // Undressed is a fact of the story; how much is drawn follows the
    // nudity setting: full (Mature), covered at chest and hips (Mild), or a
    // plain shift (Off).
    const nudeLvl = d.nude ? (o.nudity === 'mature' ? 'full' : o.nudity === 'mild' ? 'covered' : 'under') : null;
    const female = d.gender === 'female';
    const armorKind = nudeLvl ? 'nude' : d.armor ? d.armor.kind : 'clothes';
    const body = nudeLvl ? skin : armorKind === 'plate' ? '#9aa0aa' : armorKind === 'mail' ? '#7c818a' : armorKind === 'leather' ? '#6b4a30' : armorKind === 'robe' ? (CLASS_COLOR[d.cls] || '#3a3a5a') : '#5a4a3a';
    const trim = trimFor(d.armor ? d.armor.tier : 0);
    const stoop = age >= 70 ? 4 : 0;
    const w = a.build === 'broad' ? 13 : a.build === 'slender' ? 9 : (female ? 10 : 11);
    const legC = nudeLvl ? skin : '#3a2e26';
    // Sitting: crossed legs tucked under the body, not floating below it.
    const legs = pose === 'rest' ? `<path d="M${-w - 2} 58 Q0 50 ${w + 4} 60 M${-w + 2} 61 Q2 66 ${w + 2} 56" stroke="${legC}" stroke-width="5.5" stroke-linecap="round" fill="none"/>`
      : (pose === 'kneel' || pose === 'cower') ? `<path d="M-4 60 L-1 74 L-13 79 M4 60 L8 74 L-4 79" stroke="${legC}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
      : pose === 'run' ? `<path d="M-4 60 L-13 86 M4 60 L12 82" stroke="${legC}" stroke-width="5" stroke-linecap="round"/>`
      : `<path d="M-4 60 L-6 88 M4 60 L6 88" stroke="${legC}" stroke-width="5" stroke-linecap="round" class="ea-legs"/>`;
    const robeSkirt = armorKind === 'robe' ? `<path d="M${-w} 56 L${-w - 3} 86 L${w + 3} 86 L${w} 56Z" fill="${body}"/>` : '';
    const arm = pose === 'attack' ? `<path d="M${w - 2} 30 L${w + 16} 30" stroke="${body}" stroke-width="6" stroke-linecap="round"/>`
      : pose === 'cast' ? `<path d="M${w - 2} 30 L${w + 10} 18" stroke="${body}" stroke-width="6" stroke-linecap="round"/><circle cx="${w + 12}" cy="15" r="4" fill="#9ad0ff" opacity="0.9" class="ea-glow"/>`
      : pose === 'defend' ? `<path d="M${w - 2} 30 L${w + 8} 26" stroke="${body}" stroke-width="6" stroke-linecap="round"/><rect x="${w + 6}" y="14" width="6" height="26" rx="2" fill="${trim}" opacity="0.9"/>`
      : (pose === 'kiss' || pose === 'embrace') ? `<path d="M${w - 2} 30 Q${w + 9} 33 ${w + 13} ${pose === 'kiss' ? 26 : 32}" stroke="${body}" stroke-width="6" stroke-linecap="round" fill="none"/>`
      : pose === 'cower' ? `<path d="M${w - 2} 30 L${w - 4} 12 L-4 6" stroke="${body}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
      : pose === 'run' ? `<path d="M${w - 2} 30 L${w + 6} 44 M${-w + 2} 30 L${-w - 6} 20" stroke="${body}" stroke-width="6" stroke-linecap="round"/>`
      : `<path d="M${w - 2} 30 L${w + 2} 52" stroke="${body}" stroke-width="6" stroke-linecap="round"/>`;
    const wk = d.weapon ? d.weapon.kind : 'none';
    // A weapon is in hand only once the player has drawn it; until then it
    // hangs sheathed at the hip (or across the back), and blows are fists.
    const noHands = ['rest', 'kneel', 'cower', 'kiss', 'embrace', 'run'].includes(pose) || nudeLvl;
    const sheathed = d.drawn === false && wk !== 'none' && !nudeLvl;
    const fist = pose === 'attack' && (sheathed || wk === 'none' || nudeLvl) ? `<circle cx="${w + 17}" cy="30" r="3" fill="${skin}" stroke="${shade(skin, -0.35)}"/>` : '';
    const scabbard = !sheathed || ['rest'].includes(pose) ? '' : (wk === 'bow' || wk === 'staff' || wk === 'spear')
      ? `<path d="M${-w - 2} 18 L${w - 2} 70" stroke="#5a3e26" stroke-width="2.5"/>`
      : `<rect x="${-w - 3}" y="46" width="3.5" height="${wk === 'dagger' ? 12 : 26}" rx="1.2" fill="#3a2a1c" transform="rotate(18 ${-w - 1} 50)"/>`;
    const weapon = wk === 'none' || noHands || sheathed ? fist + scabbard :
      wk === 'bow' ? `<path d="M${w + 14} 14 Q${w + 24} 32 ${w + 14} 50" stroke="#6a4a2e" stroke-width="2.5" fill="none"/>` :
      wk === 'staff' ? `<rect x="${w + 12}" y="4" width="3" height="80" fill="#6a4a2e"/><circle cx="${w + 13.5}" cy="4" r="4" fill="${trim}"/>` :
      wk === 'spear' ? `<g transform="rotate(${pose === 'attack' ? 80 : 0} ${w + 6} 40)"><rect x="${w + 5}" y="0" width="2.5" height="86" fill="#6a4a2e"/><path d="M${w + 3} 2 l3.3 -10 l3.3 10z" fill="#c8ccd4"/></g>` :
      wk === 'tome' ? `<rect x="${w + 2}" y="40" width="10" height="13" rx="1.5" fill="#5a2a2a" stroke="${trim}"/>` :
      (wk === 'axe' || wk === 'mace') ? (() => {
        const headShape = wk === 'axe' ? `<path d="M0 -2 q9 -3 10 6 q-1 9 -10 6z" fill="#c8ccd4" stroke="#6a6e78" stroke-width="0.6"/>` : `<circle cx="1.5" cy="2" r="5" fill="#8a8e98" stroke="#5a5e68"/><path d="M1.5 -4.5 v-2 M7 2 h2 M-4 2 h-2" stroke="#5a5e68" stroke-width="1.5"/>`;
        return pose === 'attack' ? `<g transform="translate(${w + 14} 29) rotate(90)"><rect x="-1.2" y="-2" width="3" height="26" fill="#6a4a2e"/><g transform="translate(0 -2)">${headShape}</g></g>`
          : `<g transform="translate(${w + 2} 26) rotate(12)"><rect x="-1.2" y="0" width="3" height="28" fill="#6a4a2e"/>${headShape}</g>`;
      })() :
      pose === 'attack' ? `<rect x="${w + 14}" y="27" width="${wk === 'dagger' ? 12 : 26}" height="4" fill="#c8ccd4" stroke="#6a6e78" stroke-width="0.6" class="ea-blade"/>` :
      `<rect x="${w + 2}" y="${wk === 'dagger' ? 40 : 22}" width="3.5" height="${wk === 'dagger' ? 12 : 30}" fill="#c8ccd4" stroke="#6a6e78" stroke-width="0.6" transform="rotate(15 ${w + 4} 52)"/>`;
    const head = `<circle cx="0" cy="${12 + stoop}" r="9" fill="${skin}" stroke="${shade(skin, -0.35)}"/>` +
      (a.hairStyle === 'bald' ? '' : `<path d="M-9 ${11 + stoop} Q-9 ${0 + stoop} 0 ${1 + stoop} Q9 ${0 + stoop} 9 ${11 + stoop} Q4 ${6 + stoop} -9 ${11 + stoop}Z" fill="${hair}"/>`) +
      ((a.hairStyle === 'long' || a.hairStyle === 'braided') ? `<path d="M-9 ${11 + stoop} L-10 ${26 + stoop} L-4 ${24 + stoop}Z" fill="${hair}"/>` : '') +
      // A beard follows the jaw from ear to ear and leaves the mouth clear,
      // so on any skin tone it reads as hair rather than an open mouth.
      (a.beard === 'beard' ? `<path d="M-8.6 ${12 + stoop} Q-8 ${24 + stoop} 0 ${26 + stoop} Q8 ${24 + stoop} 8.6 ${12 + stoop} Q7 ${17 + stoop} 4 ${17 + stoop} Q0 ${15.5 + stoop} -4 ${17 + stoop} Q-7 ${17 + stoop} -8.6 ${12 + stoop}Z" fill="${hair}"/><path d="M-2.6 ${18.4 + stoop} q2.6 1.2 5.2 0" stroke="${shade(skin, -0.45)}" stroke-width="0.9" fill="none"/>` : '') +
      `<circle cx="4" cy="${11 + stoop}" r="1.3" fill="${d.road && d.road.redEyes ? '#ff2020' : d.undead ? '#7fffd0' : '#222'}"/>` +
      (d.road && d.road.horns ? `<path d="M-5 ${4 + stoop} q-3 ${d.road.horns > 1 ? -9 : -5} 0 ${d.road.horns > 1 ? -12 : -7} q0 5 3 8z M5 ${4 + stoop} q3 ${d.road.horns > 1 ? -9 : -5} 0 ${d.road.horns > 1 ? -12 : -7} q0 5 -3 8z" fill="#2a1414"/>` : '') +
      (d.road && d.road.glow ? `<ellipse cx="0" cy="${-1 + stoop}" rx="7" ry="2" fill="none" stroke="#ffe08a" stroke-width="1.2"/>` : '') +
      (d.crown ? `<path d="M-7 ${3 + stoop} l2 -6 l3 4 l2 -6 l2 6 l3 -4 l2 6z" fill="#e0b84a"/>` : '');
    const torsoShape = nudeLvl ? nudeTorso(w, skin, hair, female, nudeLvl, stoop)
      : `<path d="M${-w} 56 Q${-w} 26 0 ${22 + stoop} Q${w} 26 ${w} 56Z" fill="${body}" stroke="${shade(body, -0.35)}"/>` + (trim && armorKind !== 'clothes' ? `<path d="M${-w + 2} 30 L${w - 2} 30" stroke="${trim}" stroke-width="1.5"/>` : '');
    const tilt = pose === 'hurt' ? 'rotate(-8 0 88)' : pose === 'fallen' ? 'rotate(-85 0 88) translate(0 10)' : pose === 'cower' ? 'rotate(16 0 80)' : pose === 'kneel' ? 'translate(0 9)' : '';
    // Injuries are game facts; how they look follows the violence setting.
    const v = o.violence || 'mild';
    let wounds = '';
    if (d.wounds && v === 'mild') wounds = `<path d="M${-w + 2} 38 L${w - 2} 34" stroke="#e8e0d0" stroke-width="3" class="ea-bandage"/>`;
    if (d.wounds && v === 'mature') wounds = `<path d="M${-w + 3} 32 q4 6 2 14 M${2} 30 q3 8 1 18" stroke="#8a0f0f" stroke-width="${d.wounds > 1 ? 2.6 : 1.6}" fill="none" class="ea-blood"/>` + (d.wounds > 1 ? `<path d="M-3 ${8 + stoop} q2 4 0 7" stroke="#8a0f0f" stroke-width="1.4" fill="none"/>` : '');
    // A cloak marks well-made armour (tier 5+), so progression shows in scenes too.
    const cape = !nudeLvl && d.armor && d.armor.tier >= 5 && armorKind !== 'robe' && pose !== 'rest' ? `<path d="M${-w + 1} 26 Q${-w - 10} 56 ${-w - 6} 80 L${-w + 6} 78 Q${-w + 2} 50 ${-w + 6} 26Z" fill="${shade(trim, -0.45)}" opacity="0.95"/>` : '';
    // Chains: an iron collar and manacles joined by a chain.
    const chains = d.shackled ? `<rect x="-6" y="${19 + stoop}" width="12" height="3.2" rx="1.2" fill="#4a4a50" stroke="#2a2a30" stroke-width="0.6"/><path d="M-6 52 q6 6 12 0" stroke="#5a5a62" stroke-width="1.6" fill="none" stroke-dasharray="2 1.2"/><rect x="${w - 1}" y="49" width="5" height="3" fill="#4a4a50"/><rect x="${-w - 3}" y="49" width="5" height="3" fill="#4a4a50"/>` : '';
    return `<g class="ea-figure ea-pose-${esc(pose || 'idle')}" transform="${tilt}">${cape}${legs}${robeSkirt}${torsoShape}${wounds}${arm}${weapon}${head}${chains}</g>`;
  }

  // Lying under a blanket. Implied nudity at most: bare shoulders are
  // drawn only when the nudity setting allows it; nothing more, ever.
  function figureAbed(d, o) {
    const a = d.appearance || {};
    const skin = a.skinHex || '#e0b896';
    const hair = agedHair(a.hairHex || '#4a3020', Number(d.age) || 25, d.undead);
    const shoulders = o.bareShoulders ? skin : (d.armor && d.armor.kind === 'robe' ? (CLASS_COLOR[d.cls] || '#3a3a5a') : '#d8d0c0');
    return `<g class="ea-figure ea-pose-abed"><ellipse cx="0" cy="18" rx="14" ry="7" fill="${shoulders}" stroke="${shade(shoulders, -0.3)}"/><circle cx="0" cy="6" r="9" fill="${skin}" stroke="${shade(skin, -0.35)}"/>${a.hairStyle === 'bald' ? '' : `<path d="M-9 5 Q-9 -6 0 -5 Q9 -6 9 5 Q4 0 -9 5Z" fill="${hair}"/>`}</g>`;
  }

  // ---------------------------------------------------------
  const ENEMY_TINT = { fire: '#c8542a', frost: '#7ab8d8', void: '#6a3a9a', bone: '#d8d0b8', plain: '#5a5048' };
  function enemyArt(e) {
    if (!e) return '';
    const JIT = ['#7a5a3a', '#4a5a3a', '#5a4a6a', '#6a3a2a', '#3a4a5a', '#8a7a5a'];
    const c = mix(ENEMY_TINT[e.tint] || ENEMY_TINT.plain, JIT[(e.seed || 0) % JIT.length], e.tint === 'plain' ? 0.35 : 0.12);
    const dk = shade(c, -0.4);
    const eye = e.tint === 'void' ? '#e0a0ff' : e.tint === 'frost' ? '#e0ffff' : '#ff5a3a';
    let body;
    switch (e.shape) {
      case 'beast': body = `<path d="M-30 60 Q-34 34 -8 32 L18 30 Q32 22 36 34 Q40 44 30 46 L22 48 L20 70 M-24 60 L-24 72 M-10 60 L-10 72 M10 58 L10 72" fill="${c}" stroke="${dk}" stroke-width="5" stroke-linecap="round"/><circle cx="30" cy="35" r="2.5" fill="${eye}"/>`; break;
      case 'wyrm': body = `<path d="M-40 70 Q-20 40 0 50 Q20 60 30 30 Q36 18 46 24 Q50 34 38 38" fill="none" stroke="${c}" stroke-width="12" stroke-linecap="round"/><path d="M-6 44 l-10 -26 l18 16z" fill="${dk}"/><circle cx="42" cy="27" r="2.5" fill="${eye}"/>`; break;
      case 'skeleton': body = `<circle cx="0" cy="14" r="9" fill="${c}" stroke="${dk}"/><circle cx="-3" cy="13" r="2" fill="${eye}"/><circle cx="3" cy="13" r="2" fill="${eye}"/><path d="M0 23 L0 58 M-12 30 L12 30 M-10 37 L10 37 M-8 44 L8 44 M0 58 L-7 86 M0 58 L7 86 M-12 30 L-16 54 M12 30 L22 44" stroke="${c}" stroke-width="3.5" stroke-linecap="round"/>`; break;
      case 'spider': body = `<path d="M-8 52 L-34 34 L-44 66 M-6 56 L-36 52 L-42 80 M6 56 L36 52 L42 80 M8 52 L34 34 L44 66 M-6 60 L-24 70 L-28 86 M6 60 L24 70 L28 86" stroke="${dk}" stroke-width="3" fill="none" stroke-linecap="round"/><ellipse cx="0" cy="56" rx="16" ry="12" fill="${c}" stroke="${dk}" stroke-width="2"/><ellipse cx="-14" cy="50" rx="9" ry="7" fill="${shade(c, -0.15)}"/><circle cx="-18" cy="48" r="1.6" fill="${eye}"/><circle cx="-14" cy="46" r="1.6" fill="${eye}"/><circle cx="-11" cy="49" r="1.2" fill="${eye}"/>`; break;
      case 'elemental': body = `<path d="M0 88 Q-22 70 -14 50 Q-26 34 -10 20 Q-4 2 6 10 Q22 4 18 26 Q30 42 14 56 Q22 74 0 88Z" fill="${c}" stroke="${dk}" stroke-width="2" opacity="0.92" class="ea-pulse"/><path d="M-8 60 Q0 40 10 52 M-6 36 Q4 24 10 34" stroke="${shade(c, 0.35)}" stroke-width="2" fill="none"/><circle cx="-4" cy="26" r="2.4" fill="${eye}"/><circle cx="5" cy="26" r="2.4" fill="${eye}"/>`; break;
      case 'horror': body = `<path d="M-24 86 Q-30 60 -22 44 Q-28 20 -6 14 Q8 4 20 18 Q34 30 24 50 Q32 70 24 86Z" fill="${c}" stroke="${dk}" stroke-width="2"/><path d="M-20 70 q-14 4 -18 16 M-10 80 q-6 6 -4 10 M14 80 q8 4 8 10 M22 64 q14 2 18 14 M-22 46 q-16 -6 -22 4" stroke="${dk}" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="-8" cy="30" r="3" fill="${eye}"/><circle cx="4" cy="26" r="2" fill="${eye}"/><circle cx="12" cy="34" r="2.6" fill="${eye}"/><path d="M-10 46 q10 8 20 0" stroke="#1a0a0a" stroke-width="2.5" fill="none"/>`; break;
      case 'construct': body = `<rect x="-22" y="20" width="44" height="40" rx="3" fill="${c}" stroke="${dk}" stroke-width="2"/><rect x="-14" y="2" width="28" height="20" fill="${shade(c, -0.15)}" stroke="${dk}" stroke-width="2"/><rect x="-8" y="9" width="16" height="4" fill="${eye}"/><rect x="-18" y="60" width="12" height="28" fill="${c}" stroke="${dk}"/><rect x="6" y="60" width="12" height="28" fill="${c}" stroke="${dk}"/>`; break;
      case 'spirit': body = `<path d="M-16 20 Q0 -8 16 20 Q22 50 10 80 Q4 70 0 84 Q-4 70 -10 82 Q-22 50 -16 20Z" fill="${c}" opacity="0.7"/><circle cx="-5" cy="22" r="2.5" fill="${eye}"/><circle cx="5" cy="22" r="2.5" fill="${eye}"/>`; break;
      case 'treant': body = `<path d="M-14 88 L-10 20 Q0 -6 10 20 L14 88Z" fill="#5a4030" stroke="#3a2818" stroke-width="2"/><circle cx="0" cy="8" r="22" fill="${e.tint === 'plain' ? '#4f6a3a' : c}" opacity="0.9"/><circle cx="-4" cy="30" r="2.5" fill="${eye}"/><circle cx="4" cy="30" r="2.5" fill="${eye}"/>`; break;
      case 'caster': body = `<path d="M-14 86 L-10 26 Q0 16 10 26 L14 86Z" fill="${shade(c, -0.1)}" stroke="${dk}" stroke-width="2"/><path d="M-11 22 Q0 -6 11 22Z" fill="${dk}"/><circle cx="-3" cy="17" r="1.8" fill="${eye}"/><circle cx="3" cy="17" r="1.8" fill="${eye}"/><circle cx="-20" cy="34" r="5" fill="${eye}" opacity="0.6" class="ea-glow"/>`; break;
      default: body = `<circle cx="0" cy="12" r="10" fill="${shade(c, 0.2)}" stroke="${dk}"/><circle cx="-4" cy="11" r="2" fill="${eye}"/><path d="M-13 58 Q-13 26 0 22 Q13 26 13 58Z" fill="${c}" stroke="${dk}"/><path d="M-4 58 L-6 88 M4 58 L6 88" stroke="${dk}" stroke-width="5" stroke-linecap="round"/><path d="M-12 30 L-26 22" stroke="${c}" stroke-width="5" stroke-linecap="round"/><rect x="-36" y="10" width="4" height="22" fill="#9a9ea8" transform="rotate(-30 -28 22)"/>`;
    }
    // Per-creature variation from the name: size, a touch of tint, and
    // features (wings, horns, a weapon, eight legs) layered on the shape.
    const f = e.features || [];
    const sd = e.seed || 0;
    let extra = '';
    if (f.includes('winged') && e.shape !== 'spider') extra += `<path d="M-6 30 Q-40 -6 -58 18 Q-44 20 -40 32 Q-26 26 -6 40Z M6 30 Q36 -10 50 10 Q38 14 34 26 Q22 24 6 40Z" fill="${dk}" opacity="0.85" class="ea-flap"/>`;
    if (f.includes('horned')) { const hy = e.shape === 'beast' ? 28 : e.shape === 'construct' ? 2 : e.shape === 'wyrm' ? 22 : 6; const hx = e.shape === 'beast' ? 30 : e.shape === 'wyrm' ? 42 : 0; extra += `<path d="M${hx - 6} ${hy} q-6 -10 -2 -16 q0 8 5 12z M${hx + 6} ${hy} q6 -10 2 -16 q0 8 -5 12z" fill="#e8e0c8" stroke="${dk}" stroke-width="0.6"/>`; }
    if (f.includes('armed') && ['humanoid', 'skeleton'].includes(e.shape)) extra += `<rect x="-24" y="34" width="12" height="18" rx="3" fill="${shade(c, -0.25)}" stroke="#9a9ea8" stroke-width="1.2"/>`;
    const scale = (e.boss ? 1.45 : 1) * (f.includes('giant') ? 1.25 : 1) * (0.92 + (sd % 17) / 100);
    return `<g class="ea-enemy-body" transform="scale(${-scale.toFixed(3)} ${scale.toFixed(3)})">${extra.includes('ea-flap') ? extra + body : body + extra}</g>`;
  }

  // ---------------------------------------------------------
  const SKIES = {
    dawn: ['#3a3a6a', '#d88a6a'], morning: ['#4a7ab8', '#b8d8f0'], afternoon: ['#3a6aa8', '#a8c8e8'],
    dusk: ['#3a2a5a', '#e07a4a'], night: ['#06060f', '#1a1a3a']
  };
  const GROUND = {
    farmland: '#5a6a32', plains: '#8a7a3a', city: '#4a4a4e', moor: '#5a5a48', silverwood: '#4a5a52', town: '#5a5040', coast: '#8a7a5a',
    hills: '#5a5a3a', swamp: '#3a4a32', saltflat: '#d8d4c8', forest: '#2f4a28', ruins: '#5a5450', mountain: '#5a5a62', snow: '#e8eef4',
    desert: '#c8a060', battlefield: '#5a4a3a', void: '#1a1028', ashland: '#5a5250', blight: '#4a3a52', volcanic: '#3a2420', castle: '#4a4648',
    whitecity: '#c8c4bc', throne: '#141016'
  };

  function biomeLayers(b, season, seed) {
    const g = GROUND[b] || '#5a5a3a';
    const far = shade(g, -0.35), mid = shade(g, -0.18);
    let s = '';
    const R = (i) => (seed >> (i % 24)) % 40;
    if (['mountain', 'snow', 'hills'].includes(b)) s += `<path d="M0 130 L40 ${70 + R(1)} L90 120 L140 ${55 + R(2)} L200 125 L250 ${65 + R(3)} L310 120 L360 ${60 + R(4)} L400 125 L400 200 L0 200Z" fill="${far}"/>` + (b !== 'hills' ? `<path d="M130 ${66 + R(2)} L140 ${55 + R(2)} L152 ${68 + R(2)}Z M240 ${76 + R(3)} L250 ${65 + R(3)} L262 ${78 + R(3)}Z" fill="#f4f8fc"/>` : '');
    else s += `<path d="M0 140 Q60 ${110 + R(1)} 120 135 T240 ${130 - R(2) / 2} T400 135 L400 200 L0 200Z" fill="${far}"/>`;
    if (['forest', 'silverwood', 'farmland', 'swamp'].includes(b)) {
      const leaf = b === 'silverwood' ? '#b8c8c0' : season === 'autumn' ? '#b8642a' : season === 'winter' ? '#5a6a5a' : '#2f5a2a';
      for (let i = 0; i < (b === 'farmland' ? 5 : 11); i++) { const x = (i * 37 + R(i)) % 400; const h = 40 + R(i + 5); s += `<rect x="${x - 2}" y="${150 - h * 0.4}" width="4" height="${h * 0.4}" fill="#3a2a1a"/><path d="M${x - 14} ${152 - h * 0.35} L${x} ${150 - h} L${x + 14} ${152 - h * 0.35}Z" fill="${leaf}" opacity="0.95"/>`; }
    }
    if (['city', 'town', 'whitecity', 'castle', 'ruins'].includes(b)) {
      const wall = b === 'whitecity' ? '#e8e4dc' : b === 'ruins' ? '#6a6460' : '#3a3438';
      for (let i = 0; i < 8; i++) { const x = i * 52 + R(i) % 12; const h = 30 + R(i + 2); const broken = b === 'ruins' ? ` L${x + 30} ${150 - h + 10} L${x + 20} ${150 - h - 4}` : ''; s += `<path d="M${x} 150 L${x} ${150 - h} L${x + 15} ${150 - h - 12} L${x + 30} ${150 - h}${broken} L${x + 30} 150Z" fill="${wall}" stroke="${shade(wall, -0.3)}"/>` + (b !== 'ruins' && i % 2 ? `<rect x="${x + 12}" y="${150 - h + 8}" width="5" height="6" fill="#f0c060" opacity="0.8"/>` : ''); }
      if (b === 'castle') s += `<rect x="160" y="70" width="80" height="80" fill="#3a3438"/><rect x="150" y="55" width="22" height="95" fill="#2e2a2e"/><rect x="228" y="55" width="22" height="95" fill="#2e2a2e"/>`;
    }
    if (b === 'coast' || b === 'swamp') s += `<rect x="0" y="150" width="400" height="50" fill="${b === 'coast' ? '#2a4a6a' : '#2a3a2a'}" opacity="0.9"/><path d="M0 158 q20 -4 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" stroke="#ffffff" stroke-width="1" fill="none" opacity="0.3"/>`;
    if (b === 'desert' || b === 'saltflat') s += `<path d="M0 150 Q80 130 160 150 T320 145 T400 150 L400 200 L0 200Z" fill="${shade(g, 0.1)}"/>`;
    if (b === 'volcanic' || b === 'ashland') s += `<path d="M150 150 L200 70 L250 150Z" fill="#2a1a18"/><path d="M190 80 L200 70 L210 80 L205 150 L195 150Z" fill="#e0602a" opacity="0.8"/><path d="M0 175 q50 -8 100 0 t100 0 t100 0 t100 0" stroke="#e0602a" stroke-width="3" fill="none" opacity="0.7"/>`;
    if (b === 'void' || b === 'throne') s += `<path d="M120 40 L160 90 L130 110 L180 160" stroke="#c080ff" stroke-width="2" fill="none" opacity="0.7"/><circle cx="300" cy="60" r="18" fill="none" stroke="#c080ff" stroke-width="1.5" opacity="0.6"/>` + (b === 'throne' ? `<path d="M175 150 L180 90 L200 70 L220 90 L225 150Z" fill="#0a080c" stroke="#5a3a7a"/><path d="M190 100 l20 30" stroke="#c080ff"/>` : '');
    if (b === 'battlefield') for (let i = 0; i < 9; i++) { const x = (i * 47 + R(i)) % 400; s += `<path d="M${x} 152 l2 -18 M${x - 5} 140 l10 0" stroke="#3a2a20" stroke-width="2"/>`; }
    if (b === 'moor') s += `<rect x="0" y="120" width="400" height="40" fill="#c8c8c0" opacity="0.18"/>`;
    s += `<rect x="0" y="150" width="400" height="50" fill="${season === 'winter' && !['desert', 'volcanic', 'void', 'throne', 'city', 'whitecity', 'saltflat'].includes(b) ? '#e8eef4' : mid}"/>`;
    return s;
  }

  // Foreground details along the bottom edge: grass, reeds, stones, cobbles,
  // embers or crystals depending on the land. Cheap shapes, seeded by region.
  function foreground(b, season, seed) {
    const g = GROUND[b] || '#5a5a3a';
    const snow = season === 'winter' && !['desert', 'volcanic', 'void', 'throne', 'city', 'whitecity', 'saltflat'].includes(b);
    const at = (i) => (((seed >> (i % 16)) + i * 61) % 400);
    let s = `<rect x="0" y="186" width="400" height="14" fill="${shade(snow ? '#e8eef4' : g, -0.28)}" opacity="0.9"/>`;
    for (let i = 0; i < 9; i++) {
      const x = at(i);
      if (['city', 'town', 'whitecity', 'castle'].includes(b)) s += `<rect x="${x}" y="${188 + (i % 3) * 3}" width="12" height="4" rx="1" fill="${shade(g, 0.12)}" opacity="0.7"/>`;
      else if (['desert', 'saltflat', 'ashland', 'ruins', 'mountain', 'battlefield'].includes(b)) s += `<path d="M${x} 192 q4 -7 9 -1 q3 4 -1 5z" fill="${shade(g, -0.4)}"/>`;
      else if (b === 'volcanic') s += `<circle cx="${x}" cy="${190 + (i % 4) * 2}" r="1.4" fill="#f08a3a" class="ea-flicker" style="animation-delay:${(i % 5) * 0.3}s"/>`;
      else if (['void', 'throne', 'blight'].includes(b)) s += `<path d="M${x} 194 l3 -10 l3 10z" fill="${b === 'blight' ? '#8a5aa8' : '#6a4a9a'}" opacity="0.8"/>`;
      else if (b === 'swamp' || b === 'coast') s += `<path d="M${x} 196 q-1 -10 -3 -14 M${x + 3} 196 q1 -12 3 -16" stroke="${shade(g, -0.1)}" stroke-width="1.5" fill="none"/>`;
      else s += `<path d="M${x} 194 l-3 -8 M${x + 2} 194 l0 -10 M${x + 4} 194 l3 -8" stroke="${snow ? '#c8d0d8' : season === 'autumn' ? '#9a7a3a' : shade(g, 0.1)}" stroke-width="1.4"/>`;
    }
    return s;
  }

  function weatherLayer(w, seed) {
    if (!w) return '';
    let s = '';
    const n = (i) => (seed >> (i % 20)) % 400;
    if (w === 'fog' || w === 'miasma') s += `<rect width="400" height="200" fill="${w === 'fog' ? '#d0d0d0' : '#8aa070'}" opacity="0.22" class="ea-drift"/>`;
    if (w === 'cold') for (let i = 0; i < 30; i++) s += `<circle cx="${(n(i) + i * 13) % 400}" cy="${(i * 29) % 200}" r="1.2" fill="#fff" class="ea-fall" style="animation-delay:${(i % 7) * 0.4}s"/>`;
    if (w === 'blight' || w === 'corruption') for (let i = 0; i < 24; i++) s += `<circle cx="${(n(i) + i * 17) % 400}" cy="${(i * 31) % 200}" r="1.5" fill="${w === 'blight' ? '#a070c0' : '#c0d8d0'}" opacity="0.7" class="ea-fall" style="animation-delay:${(i % 6) * 0.5}s"/>`;
    if (w === 'heat') s += `<rect width="400" height="200" fill="#ff8040" opacity="0.08"/>`;
    if (w === 'void') s += `<rect width="400" height="200" fill="#5a2a8a" opacity="0.12" class="ea-pulse"/>`;
    // Everyday weather: overcast, rain, storm, snow, dust.
    if (w === 'overcast' || w === 'rain' || w === 'storm') s += `<rect width="400" height="200" fill="#5a6270" opacity="${w === 'storm' ? 0.34 : w === 'rain' ? 0.2 : 0.12}" class="ea-overcast"/>`;
    if (w === 'rain' || w === 'storm') {
      s += '<g class="ea-rain">';
      for (let i = 0; i < (w === 'storm' ? 60 : 38); i++) { const x = (n(i) + i * 11) % 420 - 10, y = (i * 23) % 200; s += `<line x1="${x}" y1="${y}" x2="${x - 4}" y2="${y + 10}" stroke="#b8c8dc" stroke-width="0.9" opacity="0.7" class="ea-fall" style="animation-duration:${0.9 + (i % 5) * 0.12}s;animation-delay:${(i % 9) * 0.1}s"/>`; }
      s += '</g>';
    }
    if (w === 'storm') s += '<path d="M260 8 l-14 34 h10 l-12 30 l26 -40 h-10 l12 -24z" fill="#f4f0c0" opacity="0.85" class="ea-lightning ea-pulse"/>';
    if (w === 'snow') { s += '<g class="ea-snow">'; for (let i = 0; i < 44; i++) s += `<circle cx="${(n(i) + i * 13) % 400}" cy="${(i * 29) % 200}" r="${1 + (i % 3) * 0.5}" fill="#fff" opacity="0.9" class="ea-fall" style="animation-duration:${4 + (i % 4)}s;animation-delay:${(i % 7) * 0.4}s"/>`; s += '</g>'; }
    if (w === 'dust') s += '<rect width="400" height="200" fill="#c8a060" opacity="0.22" class="ea-drift ea-dust"/>';
    return s;
  }

  // Colours of the four powers, for banners over the places they hold.
  const FACTION_COLOURS = { wardens: ['#b8402a', '#f0b040'], compact: ['#2f6a3a', '#e8e0c0'], remnant: ['#c89a28', '#7a1a1a'], choir: ['#5a5a6a', '#d8d8e0'] };
  function banner(b) {
    if (!b || !FACTION_COLOURS[b.faction]) return '';
    const [field, mark] = FACTION_COLOURS[b.faction];
    // An occupier's banner hangs at every gate; a native one flies alone.
    const poles = b.occupied ? [352, 30] : [360];
    return poles.map(x => `<g class="ea-banner" data-faction="${esc(b.faction)}" data-occupied="${b.occupied ? 1 : 0}" transform="translate(${x} 70)"><rect x="-1" y="0" width="2" height="80" fill="#3a3028"/><path d="M1 4 h22 v26 l-11 -6 l-11 6z" fill="${field}" class="ea-flap"/><circle cx="12" cy="14" r="4" fill="${mark}"/></g>`).join('');
  }

  // A disaster that has not been rebuilt from, drawn over the land.
  function disasterLayer(d, seed) {
    if (!d) return '';
    const left = Math.max(0.2, 1 - (d.progress || 0) / 100);
    let s = `<g class="ea-disaster" data-kind="${esc(d.kind)}" opacity="${(0.4 + left * 0.6).toFixed(2)}">`;
    if (d.kind === 'flood') s += '<rect x="-400" y="150" width="1200" height="50" fill="#4a6a8a" opacity="0.7"/><path d="M-400 150 q20 -5 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" stroke="#a8c8e8" fill="none" class="ea-drift"/>';
    if (d.kind === 'fire') for (let i = 0; i < 4; i++) s += `<g transform="translate(${30 + i * 90} 120)"><rect x="-12" y="0" width="24" height="26" fill="#2a2420"/><path d="M-14 0 l5 -8 l4 4 l5 -8 l14 12z" fill="#1a1410"/><path d="M-2 -6 q-10 -18 4 -34 q12 -16 2 -36" stroke="#4a4a4a" stroke-width="${7 + i}" fill="none" opacity="0.38" stroke-linecap="round" class="ea-drift"/><circle cx="${-6 + i * 3}" cy="18" r="1.6" fill="#f08a2a" class="ea-flicker"/></g>`;
    if (d.kind === 'plague') s += '<rect x="-400" width="1200" height="200" fill="#8aa070" opacity="0.18"/><g transform="translate(40 140)"><rect x="0" y="0" width="16" height="12" fill="#2a2420"/><path d="M8 0 v-10 M3 -6 h10" stroke="#e8e0d0" stroke-width="2"/></g>';
    if (d.kind === 'quake') s += '<path d="M20 160 l20 6 l-8 10 l26 4 l-6 8 l30 2 M240 150 l16 10 l-10 6 l24 8" stroke="#1a1410" stroke-width="2.2" fill="none"/><path d="M300 140 l10 -30 l8 30" stroke="#2a2420" stroke-width="3"/>';
    if (d.kind === 'famine') for (let i = 0; i < 9; i++) s += `<path d="M${20 + i * 40} 168 l2 -14 l-5 -6 M${22 + i * 40} 154 l4 -5" stroke="#8a7040" stroke-width="1.4" fill="none"/>`;
    return s + '</g>';
  }

  // Work the player is doing: scaffolding for the rebuilding, a forge for a masterwork, the inn's sign.
  function workLayer(sc) {
    let s = '';
    if (sc.rebuilding) s += '<g class="ea-scaffold" transform="translate(196 92)"><rect x="0" y="20" width="64" height="58" fill="#7a6048" opacity="0.6"/><path d="M0 0 v78 M32 0 v78 M64 0 v78 M0 20 h64 M0 46 h64 M0 0 l32 20 M32 0 l32 20" stroke="#5a4028" stroke-width="2.4" fill="none"/><rect x="-8" y="72" width="24" height="6" fill="#9a8a70"/></g>';
    if (sc.forge) s += '<g class="ea-forge" transform="translate(186 140)"><path d="M0 0 h34 l-6 8 h-22z" fill="#3a3a42"/><rect x="12" y="8" width="10" height="20" fill="#2a2a30"/><g class="ea-flicker"><circle cx="30" cy="-6" r="1.6" fill="#ffd060"/><circle cx="24" cy="-11" r="1.2" fill="#ffb040"/><circle cx="36" cy="-12" r="1" fill="#fff0a0"/></g></g>';
    if (sc.ownInn) s += '<g class="ea-inn-sign" transform="translate(40 96)"><rect x="0" y="0" width="2" height="54" fill="#3a2818"/><path d="M2 4 h20" stroke="#3a2818" stroke-width="2"/><rect x="8" y="8" width="20" height="14" fill="#c8a060" stroke="#5a3a20"/><path d="M12 15 h12 M15 12 v6" stroke="#5a3a20" stroke-width="1.6"/></g>';
    return s;
  }

  // At sea: water to the horizon and the ship under the player's feet.
  function seaLayer(v) {
    let s = '<g class="ea-sea"><rect x="-400" y="132" width="1200" height="68" fill="#2a4a6a"/>';
    for (let i = 0; i < 10; i++) s += `<path d="M${-380 + i * 120} ${142 + (i % 3) * 16} q15 -6 30 0 t30 0" stroke="#7aa0c8" fill="none" class="ea-drift" style="animation-duration:${6 + i % 4}s"/>`;
    // The deck sits at the player's feet (y≈170); hull below, mast and sail behind them.
    s += '<g class="ea-ship" transform="translate(20 170)"><rect x="128" y="-120" width="4" height="120" fill="#3a2818"/><path d="M132 -116 q46 40 0 92z" fill="#e8e0c8" stroke="#a89878"/><path d="M-6 0 h190 l-26 26 h-140z" fill="#5a3a22" stroke="#2a1a10"/><path d="M-6 0 h190" stroke="#8a6040" stroke-width="2"/><path d="M180 0 l18 -16" stroke="#3a2818" stroke-width="3"/></g>';
    if (v && v.pirates) s += '<g class="ea-pirates" transform="translate(300 148)"><path d="M0 0 h90 l-14 18 h-62z" fill="#2a1a14"/><rect x="44" y="-56" width="3" height="56" fill="#1a1410"/><path d="M47 -52 q26 20 0 42z" fill="#1a1a1a"/><circle cx="56" cy="-34" r="4" fill="#e8e8e8"/></g>';
    return s + '</g>';
  }

  /**
   * Whole scene background + actors. Returns { svg } — the client adds
   * animation classes per event. Reflects state, never contradicts it.
   */
  // An intimate scene between consenting adults. What is drawn follows the
  // player's settings: a closed-door fade (Off), a sensual scene under the
  // covers (Mild), or the pose the player described, bodies shown as the
  // nudity setting allows, with a small looping animation (Mature).
  function intimateRoom(sc) {
    const c = sc.content || {};
    const ev = (sc.events || []).find(e => e.type === 'intimacy') || {};
    const style = ev.style || 'fade';
    const it = sc.intimacy || { pose: ev.pose || 'lying', undressed: style !== 'fade' };
    const p = sc.player || {};
    const partner = sc.npc ? { appearance: sc.npc.appearance, gender: sc.npc.gender, age: sc.npc.age || 35, armor: { kind: 'clothes' }, weapon: { kind: 'none' } } : null;
    const out = [];
    out.push('<rect x="-400" width="1200" height="200" fill="#1c120c"/><rect x="40" y="20" width="60" height="70" fill="#0a0a1a" stroke="#3a2a1a" stroke-width="4"/><circle cx="80" cy="40" r="6" fill="#e8e8d8"/>');
    out.push('<g class="ea-flicker"><rect x="300" y="120" width="6" height="22" fill="#e8dcc0"/><path d="M303 112 q-4 6 0 9 q4 -3 0 -9z" fill="#f0a040"/></g><circle cx="303" cy="116" r="60" fill="#f0a040" opacity="0.10"/>');
    out.push('<rect x="120" y="128" width="160" height="40" rx="6" fill="#4a2a20"/><rect x="118" y="118" width="164" height="16" rx="6" fill="#e8e0d0"/><rect x="0" y="168" width="400" height="32" fill="#2a1a12"/>');
    const explicit = style === 'explicit' && c.sexual === 'mature';
    if (!explicit) {
      const bare = it.undressed && c.nudity !== 'off' && style !== 'fade';
      out.push(`<g transform="translate(170 116)">${figure(p, 'abed', { bareShoulders: bare })}</g>`);
      if (partner) out.push(`<g transform="translate(212 116) scale(-1 1)">${figure(partner, 'abed', { bareShoulders: bare })}</g>`);
      out.push('<rect x="122" y="126" width="156" height="30" rx="5" fill="#7a3a3a"/>');
      if (style === 'fade') out.push('<rect x="-400" width="1200" height="200" fill="#000" opacity="0.55" class="ea-fadeout"/>');
      return out.join('');
    }
    const nud = it.undressed ? c.nudity : 'off';
    const P = { ...p, nude: !!it.undressed, wounds: 0, drawn: false };
    const Q = partner ? { ...partner, nude: !!it.undressed } : null;
    const fo = { nudity: nud };
    const fig = (d, pose) => figure(d, pose, fo);
    const pose = it.pose || 'lying';
    // Standing poses beside the bed.
    if (pose === 'kiss' || pose === 'embrace' || pose === 'undress') {
      const gap = pose === 'embrace' ? 12 : pose === 'kiss' ? 15 : 30;
      out.push(`<g transform="translate(${200 - gap} 78) scale(1.05)">${fig(P, pose === 'undress' ? 'idle' : pose)}</g>`);
      if (Q) out.push(`<g transform="translate(${200 + gap} 78) scale(-1.05 1.05)">${fig(Q, pose === 'undress' ? 'idle' : pose)}</g>`);
      if (pose === 'undress') out.push('<path d="M150 170 q10 -6 22 -2 q8 4 18 0 l2 4 q-20 4 -42 0z" fill="#6b4a30"/><path d="M228 171 q12 -5 24 0 l0 3 q-12 2 -24 0z" fill="#5a4a3a"/>');
      return out.join('');
    }
    // On the bed. The player is the one doing what they described.
    const lie = (d, x, y, flip) => `<g transform="translate(${x} ${y}) rotate(${flip ? 90 : -90})${flip ? ' scale(1 -1)' : ''}">${fig(d, 'idle')}</g>`;
    if (pose === 'lying') {
      if (Q) out.push(lie(Q, 150, 124));
      out.push(`<g class="ea-rock">${lie(P, 156, 113, false)}</g>`);
    } else if (pose === 'astride') {
      if (Q) out.push(lie(Q, 140, 124));
      out.push(`<g class="ea-bob"><g transform="translate(212 42)">${fig(P, 'kneel')}</g></g>`);
    } else if (pose === 'behind') {
      if (Q) out.push(`<g transform="translate(218 54) rotate(38 0 60)">${fig(Q, 'kneel')}</g>`);
      out.push(`<g class="ea-rock"><g transform="translate(196 44)">${fig(P, 'kneel')}</g></g>`);
    } else if (pose === 'oral') {
      if (Q) out.push(lie(Q, 140, 124));
      out.push(`<g class="ea-bob"><g transform="translate(246 52) rotate(-42 0 70)">${fig(P, 'kneel')}</g></g>`);
    }
    // A sheet over the hips when nudity is Mild.
    if (nud === 'mild') out.push('<path d="M150 112 q50 -8 100 0 l0 16 q-50 6 -100 0z" fill="#e8e0d0" opacity="0.95"/>');
    return out.join('');
  }

  function horrorLayer(sc, seed) {
    const c = sc.content || {};
    if (c.horror !== 'mature') return '';
    let s = '';
    const dark = sc.timeOfDay === 'night' || ['void', 'throne', 'blight', 'swamp'].includes(sc.biome);
    if (dark) for (let i = 0; i < 5; i++) { const x = (seed >> (i * 3)) % 380 + 10, y = 100 + ((seed >> (i + 5)) % 40); s += `<g class="ea-eyes"><circle cx="${x}" cy="${y}" r="1.6" fill="#ff3030"/><circle cx="${x + 5}" cy="${y}" r="1.6" fill="#ff3030"/></g>`; }
    if (['battlefield', 'desert', 'throne', 'void', 'blight'].includes(sc.biome)) for (let i = 0; i < 4; i++) { const x = (seed >> (i * 4)) % 360 + 20; s += `<g transform="translate(${x} 166)"><circle r="4" fill="#d8d0b8"/><circle cx="-1.5" cy="-0.5" r="1" fill="#222"/><circle cx="1.5" cy="-0.5" r="1" fill="#222"/></g>`; }
    return s;
  }

  function scene(sc) {
    if (!sc) return '';
    if (sc.mood === 'intimate') {
      const room = intimateRoom(sc);
      const cut = room.indexOf('<rect x="40"');
      // Background full-bleed; the bed and the two of them drawn larger.
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" preserveAspectRatio="xMidYMax slice" class="ea-scene ea-intimate" role="img" aria-label="${esc('A room at night')}">${room.slice(0, cut)}<g transform="translate(200 172) scale(1.3) translate(-200 -172)">${room.slice(cut)}</g><g class="ea-fx"></g></svg>`;
    }
    const seed = hash(sc.region || 'x');
    const sky = SKIES[sc.timeOfDay] || SKIES.afternoon;
    const era = sc.era === 'ascend' ? '#5a2a7a' : sc.era === 'rekindle' ? '#e0902a' : null;
    const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" preserveAspectRatio="xMidYMax slice" class="ea-scene" role="img" aria-label="${esc(`${sc.regionLabel || ''}, ${sc.timeOfDay || ''}, ${sc.season || ''}`)}">`];
    out.push(`<defs><linearGradient id="sky${seed}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient></defs>`);
    out.push('<g class="ea-backdrop">');
    out.push(`<rect width="400" height="200" fill="url(#sky${seed})"/>`);
    if (sc.timeOfDay === 'night') { for (let i = 0; i < 26; i++) out.push(`<circle cx="${(seed >> (i % 20)) % 400}" cy="${(i * 37) % 110}" r="0.8" fill="#fff" opacity="0.8"/>`); out.push('<circle cx="330" cy="30" r="12" fill="#e8e8d8"/>'); }
    else {
      // Behind cloud the sun is a pale smudge, or gone.
      const wx = sc.voyage && sc.voyage.storm ? 'storm' : sc.weather;
      const sunOp = wx === 'storm' || wx === 'snow' ? 0 : wx === 'rain' ? 0.18 : wx === 'overcast' || wx === 'fog' || wx === 'dust' ? 0.35 : 0.9;
      if (sunOp) out.push(`<circle cx="${sc.timeOfDay === 'dawn' ? 40 : sc.timeOfDay === 'dusk' ? 360 : 300}" cy="${sc.timeOfDay === 'dawn' || sc.timeOfDay === 'dusk' ? 120 : 34}" r="14" fill="${sc.timeOfDay === 'dusk' || sc.timeOfDay === 'dawn' ? '#f0a060' : '#fff4c0'}" opacity="${sunOp}" class="ea-sun"/>`);
    }
    if (sc.timeOfDay !== 'night' && !['void', 'throne'].includes(sc.biome)) {
      // A few clouds, placed by region so each place keeps its own sky.
      const cloud = sc.timeOfDay === 'dusk' || sc.timeOfDay === 'dawn' ? '#f0c8b0' : '#ffffff';
      for (let i = 0; i < 3; i++) { const cx = (seed >> (i * 5)) % 360 + 20, cy = 18 + ((seed >> (i * 3 + 2)) % 40), w = 26 + ((seed >> i) % 22); out.push(`<g opacity="${sc.weather === 'fog' ? 0.25 : 0.55}" class="ea-drift" style="animation-duration:${14 + i * 5}s"><ellipse cx="${cx}" cy="${cy}" rx="${w}" ry="${w * 0.28}" fill="${cloud}"/><ellipse cx="${cx + w * 0.35}" cy="${cy - 5}" rx="${w * 0.5}" ry="${w * 0.3}" fill="${cloud}"/></g>`); }
    }
    if (era) out.push(`<rect width="400" height="200" fill="${era}" opacity="0.12"/>`);
    out.push(`<g class="ea-bg">${sc.voyage ? seaLayer(sc.voyage) : biomeLayers(sc.biome, sc.season, seed)}</g>`);
    if (!sc.voyage) out.push(banner(sc.banner));
    if (!sc.voyage) out.push(disasterLayer(sc.disaster, seed));
    if (!sc.voyage) out.push(workLayer(sc));
    if (sc.settlementStatus === 'ruined' && !sc.voyage) out.push('<path d="M20 150 l10 -30 l8 30 M60 150 l6 -18 l8 18" stroke="#2a2420" stroke-width="3"/><circle cx="40" cy="110" r="10" fill="#555" opacity="0.4" class="ea-drift"/>');
    // Horror off softens the dread in void, blight and throne scenery.
    out.push(`<g class="ea-weather" data-weather="${esc(sc.voyage && sc.voyage.storm ? 'storm' : sc.weather || 'clear')}"${(sc.content || {}).horror === 'off' ? ' opacity="0.35"' : ''}>${weatherLayer(sc.voyage && sc.voyage.storm ? 'storm' : sc.weather, seed)}</g>`);
    out.push(horrorLayer(sc, seed));
    out.push('</g>');
    // campfire / inn for rest
    if (sc.playerPose === 'rest') out.push('<g class="ea-campfire" transform="translate(150 168)"><path d="M-10 6 L10 -2 M-10 -2 L10 6" stroke="#5a3a20" stroke-width="3"/><path d="M-6 0 Q0 -18 6 0Z" fill="#f08a2a" class="ea-flicker"/></g>');
    // actors
    const vio = (sc.content || {}).violence || 'mild';
    if (sc.enemy && sc.enemy.dead && vio !== 'off') out.push(`<ellipse cx="290" cy="170" rx="${vio === 'mature' ? 34 : 18}" ry="${vio === 'mature' ? 7 : 4}" fill="${vio === 'mature' ? '#6a0a0a' : '#3a2a26'}" opacity="0.85" class="ea-pool"/>`);
    if (sc.mood === 'death' && vio === 'mature') out.push('<ellipse cx="110" cy="172" rx="30" ry="6" fill="#6a0a0a" opacity="0.85" class="ea-pool"/>');
    // Shadows ground the actors on the land.
    if (sc.playerPose !== 'rest') out.push('<ellipse cx="110" cy="169" rx="16" ry="3.5" fill="#000" opacity="0.28"/>');
    if (sc.enemy && !sc.enemy.dead) out.push(`<ellipse cx="290" cy="${sc.enemy.boss ? 178 : 170}" rx="${sc.enemy.boss ? 40 : 24}" ry="${sc.enemy.boss ? 6 : 4}" fill="#000" opacity="0.28"/>`);
    else if (!sc.enemy && sc.npc) out.push('<ellipse cx="290" cy="169" rx="15" ry="3.5" fill="#000" opacity="0.28"/>');
    const fopts = { violence: vio, nudity: (sc.content || {}).nudity || 'off' };
    // Slaves who walk with you, chained, a step behind.
    (sc.slaves || []).forEach((sl, i) => {
      out.push(`<g class="ea-actor" transform="translate(${66 - i * 26} 86) scale(0.88)">${figure({ appearance: sl.appearance, gender: sl.gender, age: sl.age, armor: { kind: 'clothes' }, weapon: { kind: 'none' }, shackled: true, wounds: sl.hurt ? 1 : 0 }, sl.fear > 70 ? 'hurt' : 'idle', fopts)}</g>`);
      out.push(`<path d="M${66 - i * 26 + 4} 132 Q${88 - i * 13} 140 ${100} 128" stroke="#5a5a62" stroke-width="1.2" fill="none" stroke-dasharray="2 1.5"/>`);
    });
    if (sc.market && sc.market.length) {
      out.push('<rect x="215" y="140" width="170" height="14" fill="#5a4030" stroke="#3a2818"/>');
      sc.market.slice(0, 3).forEach((m, i) => out.push(`<g transform="translate(${240 + i * 52} 58) scale(0.92)">${figure({ appearance: m.appearance, gender: m.gender, age: m.age, armor: { kind: 'clothes' }, weapon: { kind: 'none' }, shackled: true }, 'idle', fopts)}</g>`));
    }
    if (sc.mood === 'crime' && sc.crime && sc.crime.kind === 'arson') {
      for (let i = 0; i < 7; i++) out.push(`<path d="M${30 + i * 52} 150 q-10 -26 4 -46 q2 18 10 6 q8 22 -4 40z" fill="${i % 2 ? '#f0a040' : '#e0602a'}" opacity="0.85" class="ea-flicker" style="animation-delay:${i * 0.15}s"/>`);
      out.push('<rect x="-400" width="1200" height="200" fill="#ff6020" opacity="0.12"/>');
    }
    if (sc.mood === 'trial') {
      out.push('<rect x="-400" width="1200" height="200" fill="#2a2220"/><rect x="220" y="96" width="140" height="60" fill="#4a3424" stroke="#2a1a10"/><rect x="230" y="40" width="120" height="8" fill="#6a4a30"/>');
      for (let i = 0; i < 8; i++) out.push(`<circle cx="${20 + i * 26}" cy="176" r="9" fill="#1a1412"/>`);
    }
    if (sc.npc && sc.npc.crimeVictim) {
      const vd = { appearance: sc.npc.appearance, gender: sc.npc.gender, age: sc.npc.age || 35, armor: { kind: 'clothes' }, weapon: { kind: 'none' }, shackled: sc.npc.shackled, wounds: sc.npc.pose === 'cower' || sc.npc.dead ? 2 : 0 };
      if (sc.npc.dead && vio !== 'off') out.push(`<ellipse cx="236" cy="170" rx="${vio === 'mature' ? 30 : 16}" ry="${vio === 'mature' ? 6 : 3}" fill="${vio === 'mature' ? '#6a0a0a' : '#3a2a26'}" opacity="0.85" class="ea-pool"/>`);
      out.push(`<g class="ea-actor ea-player" transform="translate(150 80)">${figure(sc.player, sc.crime && sc.crime.kind === 'theft' && !sc.crime.failed ? 'run' : 'idle', fopts)}</g>`);
      out.push(sc.npc.dead
        ? `<g class="ea-actor ea-npc" transform="translate(262 80)">${figure(vd, 'fallen', fopts)}</g>`
        : `<g class="ea-actor ea-npc" transform="translate(250 80) scale(-1 1)">${figure(vd, sc.npc.pose, fopts)}</g>`);
    } else if (sc.npc && sc.npc.victim) {
      // Villainy: the threat and the aftermath, never the act. The character's
      // shadow falls over the victim; the victim cowers, or has fought free.
      if (!sc.npc.escaped) out.push(`<g opacity="0.55" style="filter:brightness(0)" class="ea-shadow" transform="translate(212 -10) scale(2.1)">${figure(sc.player, 'idle', fopts)}</g>`);
      out.push(`<g class="ea-actor ea-player" transform="translate(170 80) scale(1.08)">${figure(sc.player, 'idle', fopts)}</g>`);
      const vd = { appearance: sc.npc.appearance, gender: sc.npc.gender, age: sc.npc.age || 35, armor: { kind: 'clothes' }, weapon: { kind: 'none' } };
      out.push(sc.npc.escaped
        ? `<g class="ea-actor ea-npc ea-flee" transform="translate(320 80)">${figure(vd, 'run', fopts)}</g>`
        : `<g class="ea-actor ea-npc" transform="translate(245 80) scale(-1 1)">${figure(vd, 'cower', fopts)}</g>`);
    } else {
      out.push(`<g class="ea-actor ea-player" transform="translate(110 ${sc.playerPose === 'rest' ? 92 : 80})">${figure(sc.player, sc.playerPose === 'combat' ? 'idle' : sc.playerPose, fopts)}</g>`);
      if (sc.enemy) out.push(`<g class="ea-actor ea-enemy${sc.enemy.dead ? ' ea-dead' : ''}" transform="translate(290 ${sc.enemy.boss ? 50 : 82})">${enemyArt(sc.enemy)}</g>`);
      else if (sc.npc) out.push(`<g class="ea-actor ea-npc" transform="translate(290 80) scale(-1 1)">${figure({ appearance: sc.npc.appearance, gender: sc.npc.gender, age: sc.npc.age || 40, armor: { kind: 'clothes' }, weapon: { kind: 'none' }, crown: sc.npc.crown, nude: sc.npc.nude }, sc.npc.pose || 'idle', fopts)}</g>`);
    }
    if (!sc.voyage) out.push(`<g class="ea-fore">${foreground(sc.biome, sc.season, seed)}</g>`);
    out.push('<g class="ea-fx"></g>');
    if (sc.mood === 'prison') {
      out.push('<rect x="-400" width="1200" height="200" fill="#000" opacity="0.5"/>');
      for (let x = -380; x < 800; x += 22) out.push(`<rect x="${x}" y="0" width="5" height="200" fill="#3a3a40" stroke="#1a1a1e"/>`);
      out.push('<rect x="-400" y="40" width="1200" height="6" fill="#3a3a40"/><rect x="-400" y="150" width="1200" height="6" fill="#3a3a40"/>');
    }
    if (sc.mood === 'crime') out.push('<rect x="-400" width="1200" height="200" fill="#1a0a10" opacity="0.35" class="ea-grim"/>');
    if (sc.mood === 'death') out.push('<rect x="-400" width="1200" height="200" fill="#000" opacity="0.45"/>');
    if (sc.mood === 'grim') out.push('<rect x="-400" width="1200" height="200" fill="#202028" opacity="0.55" class="ea-grim"/>');
    out.push('</svg>');
    return out.join('');
  }

  return { portrait, figure, enemyArt, scene, esc, hash, mix, weatherLayer, banner, disasterLayer };
}));
