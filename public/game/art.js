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
    const bg = d.crown ? '#3a2a12' : d.regalia === 'archmage' ? '#1c2244' : '#1a1a20';
    const out = [];
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="ea-portrait" role="img" aria-label="${esc(`Portrait of ${d.name || 'your character'}`)}">`);
    out.push(`<defs><radialGradient id="pg${seed}" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="${shade(bg, 0.18)}"/><stop offset="1" stop-color="${bg}"/></radialGradient></defs>`);
    out.push(`<rect width="${W}" height="${H}" rx="8" fill="url(#pg${seed})"/>`);
    if (d.immortalGlow) out.push(`<circle cx="${cx}" cy="${cy}" r="${r * 2}" fill="#f0d070" opacity="0.12"/>`);
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
    const eye = d.undead ? '#7fffd0' : (a.eyeHex || '#5a4030');
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
    // headwear
    if (d.crown) out.push(`<path d="M${cx - 16} ${cy - r * 0.95} l3 -12 l6 7 l7 -11 l7 11 l6 -7 l3 12z" fill="#e0b84a" stroke="#8a6a1a"/><circle cx="${cx}" cy="${cy - r - 9}" r="2" fill="#c03a3a"/>`);
    else if (d.regalia === 'archmage') out.push(`<path d="M${cx - 17} ${cy - r * 0.8} q17 -6 34 0" stroke="#f0d070" stroke-width="2.5" fill="none"/><circle cx="${cx}" cy="${cy - r * 0.95}" r="2.4" fill="#8ad0ff"/>`);
    out.push('</svg>');
    return out.join('');
  }

  // ---------------------------------------------------------
  // Full-body figure for scenes (≈ 40×90 units), facing right.
  function figure(data, pose) {
    const d = data || {};
    const a = d.appearance || {};
    const age = Number(d.age) || 25;
    let skin = a.skinHex || '#e0b896';
    if (d.undead) skin = mix(skin, '#9fb0a8', 0.55);
    const hair = agedHair(a.hairHex || '#4a3020', age, d.undead);
    const armorKind = d.armor ? d.armor.kind : 'clothes';
    const body = armorKind === 'plate' ? '#9aa0aa' : armorKind === 'mail' ? '#7c818a' : armorKind === 'leather' ? '#6b4a30' : armorKind === 'robe' ? (CLASS_COLOR[d.cls] || '#3a3a5a') : '#5a4a3a';
    const trim = trimFor(d.armor ? d.armor.tier : 0);
    const stoop = age >= 70 ? 4 : 0;
    const w = a.build === 'broad' ? 13 : a.build === 'slender' ? 9 : 11;
    const legs = pose === 'rest' ? `<path d="M-8 78 l18 0 M-6 82 l18 0" stroke="#3a2e26" stroke-width="5" stroke-linecap="round"/>`
      : `<path d="M-4 60 L-6 88 M4 60 L6 88" stroke="#3a2e26" stroke-width="5" stroke-linecap="round" class="ea-legs"/>`;
    const robeSkirt = armorKind === 'robe' ? `<path d="M${-w} 56 L${-w - 3} 86 L${w + 3} 86 L${w} 56Z" fill="${body}"/>` : '';
    const arm = pose === 'attack' ? `<path d="M${w - 2} 30 L${w + 16} 30" stroke="${body}" stroke-width="6" stroke-linecap="round"/>`
      : pose === 'cast' ? `<path d="M${w - 2} 30 L${w + 10} 18" stroke="${body}" stroke-width="6" stroke-linecap="round"/><circle cx="${w + 12}" cy="15" r="4" fill="#9ad0ff" opacity="0.9" class="ea-glow"/>`
      : pose === 'defend' ? `<path d="M${w - 2} 30 L${w + 8} 26" stroke="${body}" stroke-width="6" stroke-linecap="round"/><rect x="${w + 6}" y="14" width="6" height="26" rx="2" fill="${trim}" opacity="0.9"/>`
      : `<path d="M${w - 2} 30 L${w + 2} 52" stroke="${body}" stroke-width="6" stroke-linecap="round"/>`;
    const wk = d.weapon ? d.weapon.kind : 'none';
    const weapon = wk === 'none' || pose === 'rest' ? '' :
      wk === 'bow' ? `<path d="M${w + 14} 14 Q${w + 24} 32 ${w + 14} 50" stroke="#6a4a2e" stroke-width="2.5" fill="none"/>` :
      wk === 'staff' ? `<rect x="${w + 12}" y="4" width="3" height="80" fill="#6a4a2e"/><circle cx="${w + 13.5}" cy="4" r="4" fill="${trim}"/>` :
      wk === 'spear' ? `<g transform="rotate(${pose === 'attack' ? 80 : 0} ${w + 6} 40)"><rect x="${w + 5}" y="0" width="2.5" height="86" fill="#6a4a2e"/><path d="M${w + 3} 2 l3.3 -10 l3.3 10z" fill="#c8ccd4"/></g>` :
      wk === 'tome' ? `<rect x="${w + 2}" y="40" width="10" height="13" rx="1.5" fill="#5a2a2a" stroke="${trim}"/>` :
      pose === 'attack' ? `<rect x="${w + 14}" y="27" width="${wk === 'dagger' ? 12 : 26}" height="4" fill="#c8ccd4" stroke="#6a6e78" stroke-width="0.6" class="ea-blade"/>` :
      `<rect x="${w + 2}" y="${wk === 'dagger' ? 40 : 22}" width="3.5" height="${wk === 'dagger' ? 12 : 30}" fill="#c8ccd4" stroke="#6a6e78" stroke-width="0.6" transform="rotate(15 ${w + 4} 52)"/>`;
    const head = `<circle cx="0" cy="${12 + stoop}" r="9" fill="${skin}" stroke="${shade(skin, -0.35)}"/>` +
      (a.hairStyle === 'bald' ? '' : `<path d="M-9 ${11 + stoop} Q-9 ${0 + stoop} 0 ${1 + stoop} Q9 ${0 + stoop} 9 ${11 + stoop} Q4 ${6 + stoop} -9 ${11 + stoop}Z" fill="${hair}"/>`) +
      ((a.hairStyle === 'long' || a.hairStyle === 'braided') ? `<path d="M-9 ${11 + stoop} L-10 ${26 + stoop} L-4 ${24 + stoop}Z" fill="${hair}"/>` : '') +
      (a.beard === 'beard' ? `<path d="M-6 ${16 + stoop} Q0 ${26 + stoop} 6 ${16 + stoop}Z" fill="${hair}"/>` : '') +
      `<circle cx="4" cy="${11 + stoop}" r="1.3" fill="${d.undead ? '#7fffd0' : '#222'}"/>` +
      (d.crown ? `<path d="M-7 ${3 + stoop} l2 -6 l3 4 l2 -6 l2 6 l3 -4 l2 6z" fill="#e0b84a"/>` : '');
    const torsoShape = `<path d="M${-w} 56 Q${-w} 26 0 ${22 + stoop} Q${w} 26 ${w} 56Z" fill="${body}" stroke="${shade(body, -0.35)}"/>` + (trim && armorKind !== 'clothes' ? `<path d="M${-w + 2} 30 L${w - 2} 30" stroke="${trim}" stroke-width="1.5"/>` : '');
    const tilt = pose === 'hurt' ? 'rotate(-8 0 88)' : pose === 'fallen' ? 'rotate(-85 0 88) translate(0 10)' : '';
    return `<g class="ea-figure ea-pose-${esc(pose || 'idle')}" transform="${tilt}">${legs}${robeSkirt}${torsoShape}${arm}${weapon}${head}</g>`;
  }

  // ---------------------------------------------------------
  const ENEMY_TINT = { fire: '#c8542a', frost: '#7ab8d8', void: '#6a3a9a', bone: '#d8d0b8', plain: '#5a5048' };
  function enemyArt(e) {
    if (!e) return '';
    const c = ENEMY_TINT[e.tint] || ENEMY_TINT.plain;
    const dk = shade(c, -0.4);
    const eye = e.tint === 'void' ? '#e0a0ff' : e.tint === 'frost' ? '#e0ffff' : '#ff5a3a';
    let body;
    switch (e.shape) {
      case 'beast': body = `<path d="M-30 60 Q-34 34 -8 32 L18 30 Q32 22 36 34 Q40 44 30 46 L22 48 L20 70 M-24 60 L-24 72 M-10 60 L-10 72 M10 58 L10 72" fill="${c}" stroke="${dk}" stroke-width="5" stroke-linecap="round"/><circle cx="30" cy="35" r="2.5" fill="${eye}"/>`; break;
      case 'wyrm': body = `<path d="M-40 70 Q-20 40 0 50 Q20 60 30 30 Q36 18 46 24 Q50 34 38 38" fill="none" stroke="${c}" stroke-width="12" stroke-linecap="round"/><path d="M-6 44 l-10 -26 l18 16z" fill="${dk}"/><circle cx="42" cy="27" r="2.5" fill="${eye}"/>`; break;
      case 'skeleton': body = `<circle cx="0" cy="14" r="9" fill="${c}" stroke="${dk}"/><circle cx="-3" cy="13" r="2" fill="${eye}"/><circle cx="3" cy="13" r="2" fill="${eye}"/><path d="M0 23 L0 58 M-12 30 L12 30 M-10 37 L10 37 M-8 44 L8 44 M0 58 L-7 86 M0 58 L7 86 M-12 30 L-16 54 M12 30 L22 44" stroke="${c}" stroke-width="3.5" stroke-linecap="round"/>`; break;
      case 'construct': body = `<rect x="-22" y="20" width="44" height="40" rx="3" fill="${c}" stroke="${dk}" stroke-width="2"/><rect x="-14" y="2" width="28" height="20" fill="${shade(c, -0.15)}" stroke="${dk}" stroke-width="2"/><rect x="-8" y="9" width="16" height="4" fill="${eye}"/><rect x="-18" y="60" width="12" height="28" fill="${c}" stroke="${dk}"/><rect x="6" y="60" width="12" height="28" fill="${c}" stroke="${dk}"/>`; break;
      case 'spirit': body = `<path d="M-16 20 Q0 -8 16 20 Q22 50 10 80 Q4 70 0 84 Q-4 70 -10 82 Q-22 50 -16 20Z" fill="${c}" opacity="0.7"/><circle cx="-5" cy="22" r="2.5" fill="${eye}"/><circle cx="5" cy="22" r="2.5" fill="${eye}"/>`; break;
      case 'treant': body = `<path d="M-14 88 L-10 20 Q0 -6 10 20 L14 88Z" fill="#5a4030" stroke="#3a2818" stroke-width="2"/><circle cx="0" cy="8" r="22" fill="${e.tint === 'plain' ? '#4f6a3a' : c}" opacity="0.9"/><circle cx="-4" cy="30" r="2.5" fill="${eye}"/><circle cx="4" cy="30" r="2.5" fill="${eye}"/>`; break;
      case 'caster': body = `<path d="M-14 86 L-10 26 Q0 16 10 26 L14 86Z" fill="${shade(c, -0.1)}" stroke="${dk}" stroke-width="2"/><path d="M-11 22 Q0 -6 11 22Z" fill="${dk}"/><circle cx="-3" cy="17" r="1.8" fill="${eye}"/><circle cx="3" cy="17" r="1.8" fill="${eye}"/><circle cx="-20" cy="34" r="5" fill="${eye}" opacity="0.6" class="ea-glow"/>`; break;
      default: body = `<circle cx="0" cy="12" r="10" fill="${shade(c, 0.2)}" stroke="${dk}"/><circle cx="-4" cy="11" r="2" fill="${eye}"/><path d="M-13 58 Q-13 26 0 22 Q13 26 13 58Z" fill="${c}" stroke="${dk}"/><path d="M-4 58 L-6 88 M4 58 L6 88" stroke="${dk}" stroke-width="5" stroke-linecap="round"/><path d="M-12 30 L-26 22" stroke="${c}" stroke-width="5" stroke-linecap="round"/><rect x="-36" y="10" width="4" height="22" fill="#9a9ea8" transform="rotate(-30 -28 22)"/>`;
    }
    const scale = e.boss ? 1.45 : 1;
    return `<g class="ea-enemy-body" transform="scale(${-scale} ${scale})">${body}</g>`;
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

  function weatherLayer(w, seed) {
    if (!w) return '';
    let s = '';
    const n = (i) => (seed >> (i % 20)) % 400;
    if (w === 'fog' || w === 'miasma') s += `<rect width="400" height="200" fill="${w === 'fog' ? '#d0d0d0' : '#8aa070'}" opacity="0.22" class="ea-drift"/>`;
    if (w === 'cold') for (let i = 0; i < 30; i++) s += `<circle cx="${(n(i) + i * 13) % 400}" cy="${(i * 29) % 200}" r="1.2" fill="#fff" class="ea-fall" style="animation-delay:${(i % 7) * 0.4}s"/>`;
    if (w === 'blight' || w === 'corruption') for (let i = 0; i < 24; i++) s += `<circle cx="${(n(i) + i * 17) % 400}" cy="${(i * 31) % 200}" r="1.5" fill="${w === 'blight' ? '#a070c0' : '#c0d8d0'}" opacity="0.7" class="ea-fall" style="animation-delay:${(i % 6) * 0.5}s"/>`;
    if (w === 'heat') s += `<rect width="400" height="200" fill="#ff8040" opacity="0.08"/>`;
    if (w === 'void') s += `<rect width="400" height="200" fill="#5a2a8a" opacity="0.12" class="ea-pulse"/>`;
    return s;
  }

  /**
   * Whole scene background + actors. Returns { svg } — the client adds
   * animation classes per event. Reflects state, never contradicts it.
   */
  function scene(sc) {
    if (!sc) return '';
    const seed = hash(sc.region || 'x');
    const sky = SKIES[sc.timeOfDay] || SKIES.afternoon;
    const era = sc.era === 'ascend' ? '#5a2a7a' : sc.era === 'rekindle' ? '#e0902a' : null;
    const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" preserveAspectRatio="xMidYMax slice" class="ea-scene" role="img" aria-label="${esc(`${sc.regionLabel || ''}, ${sc.timeOfDay || ''}, ${sc.season || ''}`)}">`];
    out.push(`<defs><linearGradient id="sky${seed}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient></defs>`);
    out.push(`<rect width="400" height="200" fill="url(#sky${seed})"/>`);
    if (sc.timeOfDay === 'night') { for (let i = 0; i < 26; i++) out.push(`<circle cx="${(seed >> (i % 20)) % 400}" cy="${(i * 37) % 110}" r="0.8" fill="#fff" opacity="0.8"/>`); out.push('<circle cx="330" cy="30" r="12" fill="#e8e8d8"/>'); }
    else out.push(`<circle cx="${sc.timeOfDay === 'dawn' ? 40 : sc.timeOfDay === 'dusk' ? 360 : 300}" cy="${sc.timeOfDay === 'dawn' || sc.timeOfDay === 'dusk' ? 120 : 34}" r="14" fill="${sc.timeOfDay === 'dusk' || sc.timeOfDay === 'dawn' ? '#f0a060' : '#fff4c0'}" opacity="0.9"/>`);
    if (era) out.push(`<rect width="400" height="200" fill="${era}" opacity="0.12"/>`);
    out.push(`<g class="ea-bg">${biomeLayers(sc.biome, sc.season, seed)}</g>`);
    if (sc.settlementStatus === 'ruined') out.push('<path d="M20 150 l10 -30 l8 30 M60 150 l6 -18 l8 18" stroke="#2a2420" stroke-width="3"/><circle cx="40" cy="110" r="10" fill="#555" opacity="0.4" class="ea-drift"/>');
    out.push(`<g class="ea-weather">${weatherLayer(sc.weather, seed)}</g>`);
    // campfire / inn for rest
    if (sc.playerPose === 'rest') out.push('<g class="ea-campfire" transform="translate(150 168)"><path d="M-10 6 L10 -2 M-10 -2 L10 6" stroke="#5a3a20" stroke-width="3"/><path d="M-6 0 Q0 -18 6 0Z" fill="#f08a2a" class="ea-flicker"/></g>');
    // actors
    out.push(`<g class="ea-actor ea-player" transform="translate(110 ${sc.playerPose === 'rest' ? 92 : 80})">${figure(sc.player, sc.playerPose === 'combat' ? 'idle' : sc.playerPose)}</g>`);
    if (sc.enemy) out.push(`<g class="ea-actor ea-enemy${sc.enemy.dead ? ' ea-dead' : ''}" transform="translate(290 ${sc.enemy.boss ? 50 : 82})">${enemyArt(sc.enemy)}</g>`);
    else if (sc.npc) out.push(`<g class="ea-actor ea-npc" transform="translate(290 80) scale(-1 1)">${figure({ appearance: sc.npc.appearance, age: 40, armor: { kind: 'clothes' }, weapon: { kind: 'none' }, crown: sc.npc.crown }, 'idle')}</g>`);
    out.push('<g class="ea-fx"></g>');
    if (sc.mood === 'death') out.push('<rect width="400" height="200" fill="#000" opacity="0.45"/>');
    out.push('</svg>');
    return out.join('');
  }

  return { portrait, figure, enemyArt, scene, esc, hash, mix };
}));
