'use strict';

// =============================================================
// EMBER AND ASH — APPEARANCE & PORTRAIT DATA
// A character's visual identity is parsed once from their creation
// description (hair, eyes, skin, build, scars, marks, species…), filled
// in deterministically from a seed where the player said nothing, and
// stored in state.appearance so they look the same in every scene and
// after save/load. The portrait data combines that identity with the
// live game state — age, equipment, class, rank — so the picture
// changes when the character does.
// =============================================================

function hashInt(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

const HAIR_COLORS = {
  black: '#1b1714', raven: '#14110f', brown: '#5a3b25', chestnut: '#6b3a1e', auburn: '#8a3b1d', red: '#a3341c', ginger: '#b5501f', copper: '#b0582a',
  blonde: '#d8b45d', blond: '#d8b45d', golden: '#d9a93a', sandy: '#c9a66b', silver: '#c9c9cf', white: '#ecebe6', grey: '#9a9a9a', gray: '#9a9a9a', blue: '#3b5ea8', green: '#3f7a4a', purple: '#6b3f8f'
};
const EYE_COLORS = { grey: '#8a96a0', gray: '#8a96a0', blue: '#4a78b8', green: '#4f8a52', brown: '#5b3a22', hazel: '#8a6a32', amber: '#c08a2a', black: '#222', violet: '#7a4ab0', red: '#a82a2a', gold: '#c9a227' };
const SKIN_TONES = { pale: '#f1d9c6', fair: '#efcfb4', light: '#e8c4a4', freckled: '#e6bd99', olive: '#c69a6c', tan: '#c08a5e', tanned: '#c08a5e', bronze: '#a8754a', brown: '#8a5a38', dark: '#5e3b25', ebony: '#3f2718', ashen: '#b9b2a8', grey: '#a9a49c' };
// Most specific first: "long braided hair" is braided.
const HAIR_STYLES = ['braided', 'ponytail', 'topknot', 'shaved', 'bald', 'curly', 'wild', 'cropped', 'long', 'short'];
const SPECIES = { elf: /\b(elf|elven|elfin|pointed ears)\b/, dwarf: /\bdwar(f|ven)\b/, orc: /\b(orc|orcish|half-orc|tusks?)\b/, halfling: /\bhalfling\b/ };

function firstMatch(text, dict) {
  const t = ` ${text.toLowerCase()} `;
  let best = null, at = Infinity;
  for (const k of Object.keys(dict)) {
    const i = t.search(new RegExp(`\\b${k}\\b`));
    if (i >= 0 && i < at) { best = k; at = i; }
  }
  return best;
}

// Finds "<color> hair", "hair the color of <x>", "<color> eyes" etc.
function nearWord(text, dict, nouns) {
  const t = text.toLowerCase();
  for (const noun of nouns) {
    const m = t.match(new RegExp(`([a-z-]+)(?:[ -][a-z]+)?[ -]${noun}`)) || t.match(new RegExp(`${noun} (?:of |the colou?r of |that is |are |is )?([a-z]+)`));
    if (m) { const k = Object.keys(dict).find(c => m[0].includes(c)); if (k) return k; }
  }
  return null;
}

function parseAppearance(description, character = {}, seedKey = '') {
  const text = String(description || '');
  const lower = text.toLowerCase();
  const seed = hashInt(seedKey || character.name || text);
  const pick = (list, salt) => list[(seed >>> salt) % list.length];

  const hairColor = nearWord(lower, HAIR_COLORS, ['hair', 'locks', 'braids?', 'mane', 'beard']) || (/\bbald\b/.test(lower) ? 'black' : pick(['black', 'brown', 'auburn', 'blonde', 'chestnut', 'red', 'sandy'], 3));
  const eyes = nearWord(lower, EYE_COLORS, ['eyes?']) || pick(['brown', 'grey', 'blue', 'green', 'hazel'], 7);
  const skin = firstMatch(lower, SKIN_TONES) || pick(['fair', 'light', 'olive', 'tan', 'brown', 'dark'], 11);
  const style = HAIR_STYLES.find(s => new RegExp(`\\b${s}\\b`).test(lower)) || (/\bbraid/.test(lower) ? 'braided' : null) || pick(character.gender === 'male' ? ['short', 'cropped', 'wild', 'short', 'long'] : ['long', 'braided', 'ponytail', 'long', 'curly', 'short'], 13);
  const species = Object.keys(SPECIES).find(k => SPECIES[k].test(lower)) || 'human';
  const scars = [];
  for (const where of ['cheek', 'eye', 'brow', 'lip', 'jaw', 'chin', 'nose', 'forehead', 'neck']) {
    if (new RegExp(`scar[^.,;]{0,25}\\b${where}|${where}[^.,;]{0,15}scar`).test(lower)) scars.push(where);
  }
  if (!scars.length && /\bscar/.test(lower)) scars.push('cheek');
  const marks = [];
  if (/tattoo|\binked\b|runes? on (?:my|his|her|their) (?:face|skin)/.test(lower)) marks.push('tattoo');
  if (/freckle/.test(lower)) marks.push('freckles');
  if (/eye ?patch|one eye|missing (?:an |one |my )?eye/.test(lower)) marks.push('eyepatch');
  if (/missing (?:an |one |my |half (?:of )?(?:an |my )?)?ear/.test(lower)) marks.push('missing ear');
  if (/crooked nose|broken nose/.test(lower)) marks.push('crooked nose');
  if (/earring|piercing/.test(lower)) marks.push('earring');
  const beard = character.gender === 'male' && !/clean[- ]shaven|beardless/.test(lower) ? (/\bbeard/.test(lower) ? 'beard' : /stubble/.test(lower) ? 'stubble' : ((seed >>> 17) % 3 === 0 ? 'stubble' : 'none')) : (/\bbeard/.test(lower) ? 'beard' : 'none');
  const build = /\b(stocky|broad|burly|heavy|muscular|brawny|thick)/.test(lower) ? 'broad' : /\b(lean|wiry|thin|slender|slight|gaunt|lithe)/.test(lower) ? 'slender' : (character.build && /broad|stocky|heavy|muscular/.test(character.build) ? 'broad' : 'average');
  const height = /\b(tall|towering|lanky)\b/.test(lower) ? 'tall' : /\b(short|small|petite)\b/.test(lower) ? 'short' : (character.height && /tall/.test(String(character.height)) ? 'tall' : 'average');

  return {
    version: 1, seed, species, hairColor, hairHex: HAIR_COLORS[hairColor], hairStyle: species === 'dwarf' && style === 'bald' ? 'bald' : style,
    eyes, eyeHex: EYE_COLORS[eyes], skin, skinHex: SKIN_TONES[skin], beard, build, height, scars, marks,
    features: text.slice(0, 200)
  };
}

function ensureAppearance(state) {
  if (state.appearance && state.appearance.version) return state.appearance;
  const c = state.character || {};
  state.appearance = parseAppearance(c.description || '', c, state.characterId || c.name);
  return state.appearance;
}

// Lasting marks from hard fights. One scar per boss, at most six.
function addScar(state, where) {
  const a = ensureAppearance(state);
  if (a.scars.length >= 6 || a.scars.includes(where)) return false;
  a.scars.push(where);
  return true;
}

function weaponKind(name) {
  const n = String(name || '').toLowerCase();
  if (/bow|crossbow|sling/.test(n)) return 'bow';
  if (/staff|wand|rod|scepter|sceptre/.test(n)) return 'staff';
  if (/tome|grimoire|book|focus|orb/.test(n)) return 'tome';
  if (/dagger|knife|stiletto|dirk/.test(n)) return 'dagger';
  if (/axe|hatchet/.test(n)) return 'axe';
  if (/mace|hammer|maul|club|flail/.test(n)) return 'mace';
  if (/spear|pike|javelin|halberd|pitchfork|polearm/.test(n)) return 'spear';
  if (/sword|blade|sabre|saber|rapier|katana|greatsword/.test(n)) return 'sword';
  return n ? 'sword' : 'none';
}

function armorKind(name, cls) {
  const n = String(name || '').toLowerCase();
  if (/plate|breastplate|full armou?r/.test(n)) return 'plate';
  if (/mail|chain|scale/.test(n)) return 'mail';
  if (/robe|vestment|cassock/.test(n) || (!n && ['wizard', 'sorcerer', 'warlock', 'cleric', 'druid'].includes(cls))) return 'robe';
  if (/leather|hide|jerkin|brigandine|padded/.test(n)) return 'leather';
  return n ? 'leather' : 'clothes';
}

// Everything the client needs to draw this character right now.
function portraitData(state, extras = {}) {
  const a = ensureAppearance(state);
  const c = state.character || {};
  const weapon = state.gear && state.gear.weapon;
  const armor = state.gear && state.gear.armor;
  const classLevel = state.classLevel || 0;
  const age = typeof c.bodyAge === 'number' ? c.bodyAge : Number(c.age) || 25;
  return {
    name: c.name || '', gender: c.gender || 'unspecified', age,
    appearance: a,
    weapon: { kind: weaponKind(weapon && weapon.name), tier: weapon ? weapon.tier || 0 : 0, name: weapon ? weapon.name : null, broken: !!(weapon && weapon.durability === 0) },
    armor: { kind: armorKind(armor && armor.name, state.combatClass), tier: armor ? armor.tier || 0 : 0, name: armor ? armor.name : null },
    cls: state.combatClass || null,
    regalia: classLevel >= 5 && ['wizard', 'sorcerer', 'warlock'].includes(state.combatClass) ? 'archmage' : null,
    crown: !!extras.ruler,
    undead: !!(state.longevity && state.longevity.undead),
    immortalGlow: !!(state.longevity && state.longevity.immortal),
    // The road they walk shows in the face.
    road: require('./morality').marks(state),
    title: extras.title || null
  };
}

// Named people of the world, by id. Used for art and narration; a holder's
// heir may differ (successors get their own record).
const NPC_GENDER = {
  maren: 'female', hask: 'male', brannoc: 'male', sarn: 'male', ilsa: 'female', crane: 'male', vesna: 'female', halloran: 'male',
  old_wenna: 'female', tamsin: 'female', elder_fen: 'male', marta: 'female', sexton: 'male', nell: 'female', lighthouse_keeper: 'male',
  foreman_dagny: 'female', grisk: 'male', mother_ysolde: 'female', punter_jory: 'male', seraphine: 'female', tower_warden: 'male',
  salter_ruk: 'male', brisa: 'female', thrane: 'male', calloway: 'male', pick: 'male', wildheart: 'female', castellan: 'male',
  sergeant_bree: 'female', heron: 'female', magistrate: 'male', jarl_eydis: 'female', lantern_ama: 'female', lieutenant_aske: 'male', aske: 'male',
  magister_ilo: 'male', ashwife: 'female', seraphine_court: 'female', archivist: 'male', pilgrim_ora: 'female', warden_tove: 'female',
  forgemaster_ulla: 'female', steward: 'male', drowned_knight: 'male', brother_lucan: 'male', lucan: 'male', bone_reader: 'male',
  siege_marshal: 'male', ghost_general: 'female', anchor_monk: 'male', watcher_mira: 'female', ember_keeper: 'female', last_warden: 'male'
};
function npcGender(idOrName, fallbackSeed) {
  const k = String(idOrName || '').toLowerCase();
  if (NPC_GENDER[k]) return NPC_GENDER[k];
  for (const [id, g] of Object.entries(NPC_GENDER)) if (k.includes(id.replace(/_/g, ' ')) || k.split(/\s+/).includes(id)) return g;
  const name = String(fallbackSeed || idOrName || '');
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 2 ? 'female' : 'male';
}

module.exports = { parseAppearance, ensureAppearance, addScar, portraitData, weaponKind, armorKind, HAIR_COLORS, SKIN_TONES, NPC_GENDER, npcGender };
