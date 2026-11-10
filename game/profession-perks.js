'use strict';

// =============================================================
// EMBER AND ASH — WHAT EACH PROFESSION GIVES
// Twelve trades, each with three things, balanced against each other the
// way classes are (measured in scripts/profession-sweep.js):
//   1. a combat edge, of equal worth on average but different in kind;
//   2. a living: "work" earns the same expected income per hour for every
//      trade at the same rank — paid in coin, in materials, or (for the
//      thief) in coin with the risk of being caught;
//   3. an active skill only that trade has.
// Everything scales with profession rank (1–5): 70% at rank 1, 110% at 5.
// No AI calls. No database calls. Pure game logic.
// =============================================================

const { REGIONS } = require('./constants');

const PERKS = {
  blacksmith: { edge: 'Your own steel: +10% weapon damage, 5% less damage taken.', combat: { weapon: 0.10, armor: 0.05 },
                work: { where: 'settlement', what: 'take commissions at the forge' }, skill: 'sharpen my blade', skillDesc: 'an honed edge: +15% weapon damage for the next fight' },
  alchemist:  { edge: 'Your potions heal 35% more, and your own tonics keep you sharp: +3% damage.', combat: { potion: 0.35, dmg: 0.03, hit: 0.01 },
                work: { where: 'settlement', what: 'brew remedies for the apothecary' }, skill: 'brew', skillDesc: 'potions, elixirs and draughts (see "recipes")' },
  scout:      { edge: 'You see blows coming and find the gap: +5% to hit, +4% dodge.', combat: { hit: 0.05, dodge: 0.04 },
                work: { where: 'any', what: 'guide travellers along the roads' }, skill: 'scout ahead', skillDesc: 'fewer ambushes, landmarks revealed, rare reagents' },
  merchant:   { edge: 'You read people: +6% damage, +30% coin from the fallen, and you can buy your way out of a fight with people.', combat: { loot: 0.30, dmg: 0.06, bribe: true },
                work: { where: 'settlement', what: 'trade at the market', variance: 0.6 }, skill: 'bribe it', skillDesc: 'pay a person to end a fight (coin)' },
  cook:       { edge: 'Well fed and steady: +4% damage and 2% less damage taken.', combat: { dmg: 0.04, armor: 0.02 },
                work: { where: 'settlement', what: 'work an inn kitchen' }, skill: 'cook a meal', skillDesc: 'hearty meals and travel feasts' },
  hunter:     { edge: 'You know where things are soft: +9% damage, and +20% more against beasts.', combat: { beast: 0.20, dmg: 0.09 },
                work: { where: 'wild', what: 'hunt for meat and pelts', material: 'hide' }, skill: 'set a snare', skillDesc: 'snares and tracking' },
  scholar:    { edge: 'You know what they fear: +5% damage, weaknesses hit 25% harder, and studying a foe reveals it.', combat: { weakness: 0.25, spell: 0.04, dmg: 0.05, study: true },
                work: { where: 'settlement', what: 'copy texts and tutor' }, skill: 'study it', skillDesc: 'in a fight: learn its weakness (+10% damage for the fight)' },
  woodsman:   { edge: 'Hardy from the work: +5% health, +8% damage with axes.', combat: { hp: 0.05, axe: 0.08, dmg: 0.02 },
                work: { where: 'wild', what: 'fell and split timber', material: 'timber' }, skill: 'build a shelter', skillDesc: 'camp without being ambushed' },
  miner:      { edge: 'Stone-hard: 3% less damage taken and +2% health.', combat: { armor: 0.03, hp: 0.02 },
                work: { where: 'wild', what: 'dig ore from the seams', material: 'iron ore' }, skill: 'prospect', skillDesc: 'find ore where others see rock' },
  physician:  { edge: 'You keep yourself standing: potions heal 25% more and you recover a little health each round.', combat: { potion: 0.25, regen: 0.004 },
                work: { where: 'settlement', what: 'treat the sick and wounded' }, skill: 'treat my wounds', skillDesc: 'heal 40% outside a fight, every few hours' },
  thief:      { edge: 'Quick hands, cruel timing: +10% critical chance, +5% damage, and you can rob people mid-fight.', combat: { crit: 0.10, dmg: 0.05, steal: true },
                work: { where: 'settlement', what: 'work the crowds', risk: 0.08, bonus: 0.6 }, skill: 'steal from it', skillDesc: 'in a fight with a person: take coin' },
  tailor:     { edge: 'Padded, layered, fitted: 4% less damage taken, and +3% dodge.', combat: { armor: 0.04, dodge: 0.03 },
                work: { where: 'settlement', what: 'take in tailoring' }, skill: 'mend my armour', skillDesc: 'restore armour and pad it: +10% armour for the next fight' }
};

// The wider trades. Edges are sized to the same measured budget as the
// first twelve (scripts/profession-sweep.js checks them all). Skills are
// data: buff (next fight), heal, gather, coin, reveal, and calm (beasts).
Object.assign(PERKS, {
  carpenter:   { edge: 'Sturdy and steady: +3% health, 2% less damage taken.', combat: { hp: 0.03, armor: 0.02 }, work: { where: 'settlement', what: 'take carpentry work' }, skill: 'build a barricade', skillDesc: '+8% armour for your next fight', skillSpec: { re: /^(?:i\s+)?build (?:a )?(?:barricade|palisade|cover)/i, kind: 'buff', buff: { armor: 0.08 }, hours: 2, message: 'A rough barricade of timber and nails. (+8% armour for your next fight.)' } },
  wainwright:  { edge: 'An eye for weight and motion: +3% to hit, +4% dodge, +1% health.', combat: { hit: 0.03, dodge: 0.04, hp: 0.01 }, work: { where: 'settlement', what: 'mend carts and wheels' }, skill: 'mend a cart', skillDesc: 'faster travel for a while', skillSpec: { re: /^(?:i\s+)?(?:mend|fix|repair) (?:a |the |my )?(?:cart|wagon|wheel)/i, kind: 'buff', buff: { hit: 0.05 }, hours: 2, message: 'The wheel runs true again; a carter pays you in coin and gossip. (+5% to hit next fight.)' } },
  carver:      { edge: 'A sure, small hand: +8% damage, +6% critical chance, 1% less damage taken.', combat: { dmg: 0.08, crit: 0.06, armor: 0.01 }, work: { where: 'any', what: 'carve and sell small work' }, skill: 'carve a charm', skillDesc: 'a bone charm: +6% damage next fight', skillSpec: { re: /^(?:i\s+)?(?:carve|whittle) (?:a |an )?(?:charm|ward|totem|figure)/i, kind: 'buff', buff: { dmg: 0.06 }, hours: 2, message: 'A small charm, warm in the hand. (+6% damage next fight.)' } },
  bowyer:      { edge: 'True arrows, true aim: +6% damage, +4% to hit, +2% dodge.', combat: { dmg: 0.06, hit: 0.04, dodge: 0.02 }, work: { where: 'settlement', what: 'make bows and arrows for sale' }, skill: 'fletch arrows', skillDesc: '+8% to hit next fight', skillSpec: { re: /^(?:i\s+)?(?:fletch|make) (?:some )?arrows/i, kind: 'buff', buff: { hit: 0.08 }, hours: 2, message: 'A sheaf of straight arrows. (+8% to hit next fight.)' } },
  armorer:     { edge: 'Armour that fits: 5% less damage taken.', combat: { armor: 0.05 }, work: { where: 'settlement', what: 'fit and mend armour' }, skill: 'fit my armour', skillDesc: '+10% armour next fight, armour mended', skillSpec: { re: /^(?:i\s+)?(?:fit|adjust|refit|rivet) my (?:armou?r|mail|plate)/i, kind: 'buff', buff: { armor: 0.10 }, mend: true, hours: 2, message: 'Every strap and rivet right. (+10% armour next fight; armour mended.)' } },
  weaponsmith: { edge: 'Your own blades: +12% weapon damage, +4% damage, 2% less damage taken.', combat: { weapon: 0.12, dmg: 0.04, armor: 0.02 }, work: { where: 'settlement', what: 'forge and sell blades' }, skill: 'hone my weapon', skillDesc: '+15% weapon damage next fight', skillSpec: { re: /^(?:i\s+)?(?:hone|balance|rework) my (?:blade|sword|axe|weapon|spear|dagger)/i, kind: 'buff', buff: { weapon: 0.15 }, hours: 1, message: 'Balanced, honed, deadly. (+15% weapon damage next fight.)' } },
  jeweler:     { edge: 'You see the flaw in anything: weaknesses hit 20% harder, +6% damage, a little less damage taken.', combat: { weakness: 0.20, dmg: 0.06, armor: 0.015 }, work: { where: 'settlement', what: 'set stones and sell rings' }, skill: 'appraise', skillDesc: 'sell loot for more for a day', skillSpec: { re: /^(?:i\s+)?(?:appraise|value) (?:my |the )?(?:loot|goods|gems|treasure)/i, kind: 'coin', coin: 0.6, hours: 2, message: 'You know exactly what it is worth, and sell it for that.' } },
  mason:       { edge: 'Stone-steady: 4% less damage taken, +1% health.', combat: { armor: 0.04, hp: 0.01 }, work: { where: 'settlement', what: 'cut and lay stone' }, skill: 'shore up a wall', skillDesc: '+8% armour next fight', skillSpec: { re: /^(?:i\s+)?(?:shore up|build) (?:a |the )?(?:wall|cairn|stone cover)/i, kind: 'buff', buff: { armor: 0.08 }, hours: 3, message: 'Stone on stone, solid cover. (+8% armour next fight.)' } },
  potter:      { edge: 'Good vessels keep remedies strong: potions +30%, +3% damage.', combat: { potion: 0.30, dmg: 0.03 }, work: { where: 'settlement', what: 'throw and fire pots' }, skill: 'fire vials', skillDesc: 'two empty vials (for brewing) and coin', skillSpec: { re: /^(?:i\s+)?(?:fire|make|throw) (?:some )?(?:vials|pots|jars)/i, kind: 'coin', coin: 0.5, hours: 3, message: 'A rack of fired vials, sold before they cool.' } },
  leatherworker: { edge: 'Boiled leather where it counts: 2.5% less damage taken, +2% dodge.', combat: { armor: 0.025, dodge: 0.02 }, work: { where: 'settlement', what: 'tan hides and stitch leather' }, skill: 'oil my leathers', skillDesc: '+6% dodge next fight', skillSpec: { re: /^(?:i\s+)?(?:oil|stitch|reinforce) my (?:leathers?|boots|jerkin)/i, kind: 'buff', buff: { dodge: 0.06 }, mend: true, hours: 1, message: 'Supple leather, quiet feet. (+6% dodge next fight.)' } },
  weaver:      { edge: 'Layered cloth turns blows: +4% dodge, 1% less damage taken.', combat: { dodge: 0.04, armor: 0.01 }, work: { where: 'settlement', what: 'weave cloth at the loom' }, skill: 'weave a cloak', skillDesc: '+6% dodge next fight', skillSpec: { re: /^(?:i\s+)?weave (?:a |an )?(?:cloak|scarf|shawl|wrap)/i, kind: 'buff', buff: { dodge: 0.06 }, hours: 3, message: 'A close-woven cloak that moves with you. (+6% dodge next fight.)' } },
  brewer:      { edge: 'Bold on your own brew: +5% damage, 2% less damage taken.', combat: { dmg: 0.05, armor: 0.02 }, work: { where: 'settlement', what: 'brew for the taverns' }, skill: 'brew ale', skillDesc: '+7% damage next fight', skillSpec: { re: /^(?:i\s+)?brew (?:some )?(?:ale|beer|mead|stout)/i, kind: 'buff', buff: { dmg: 0.07 }, hours: 3, message: 'Strong ale, stronger nerve. (+7% damage next fight.)' } },
  baker:       { edge: 'Well fed: +5% health, and you recover a little each round.', combat: { hp: 0.05, regen: 0.002 }, work: { where: 'settlement', what: 'bake before dawn' }, skill: 'bake bread', skillDesc: 'heal 25%', skillSpec: { re: /^(?:i\s+)?bake (?:some )?(?:bread|loaves|pies|cakes)/i, kind: 'heal', heal: 0.25, hours: 2, message: 'Warm bread and a full belly.' } },
  butcher:     { edge: 'You know where to cut: +7% damage, +10% more against beasts, 2% less damage taken.', combat: { dmg: 0.07, armor: 0.02, vs: { beast: 0.10 } }, work: { where: 'settlement', what: 'work the butcher\'s block' }, skill: 'dress the carcass', skillDesc: 'hides from a kill', skillSpec: { re: /^(?:i\s+)?(?:dress|butcher|skin) the (?:carcass|kill|beast|body)/i, kind: 'gather', material: 'hide', qty: 2, hours: 1, message: 'Clean cuts: meat, and hides worth keeping.' } },
  farmer:      { edge: 'Field-hardened: +5% health, 1% less damage taken.', combat: { hp: 0.05, armor: 0.01 }, work: { where: 'wild', what: 'work the fields', material: 'herbs' }, skill: 'forage the fields', skillDesc: 'herbs', skillSpec: { re: /^(?:i\s+)?(?:forage|glean|gather) (?:the )?(?:fields|crops|grain)/i, kind: 'gather', material: 'herbs', qty: 2, hours: 2, message: 'What the fields will give.' } },
  fisher:      { edge: 'Patient and quick: +3% to hit, +4% dodge, +2% health.', combat: { hit: 0.03, dodge: 0.04, hp: 0.02 }, work: { where: 'wild', what: 'fish the waters', material: 'hide' }, skill: 'cast a line', skillDesc: 'heal 20% (a good catch, cooked)', skillSpec: { re: /^(?:i\s+)?(?:cast a line|fish|go fishing)/i, kind: 'heal', heal: 0.20, hours: 2, message: 'A good catch, cooked on the bank.' } },
  herbalist:   { edge: 'Remedies at hand: potions +30%, and you recover a little each round.', combat: { potion: 0.30, regen: 0.002 }, work: { where: 'wild', what: 'gather and sell herbs', material: 'herbs' }, skill: 'make a poultice', skillDesc: 'heal 30%', skillSpec: { re: /^(?:i\s+)?(?:make|apply) (?:a )?(?:poultice|salve|remedy)/i, kind: 'heal', heal: 0.30, hours: 1, message: 'Crushed leaves, a clean cloth, and the pain eases.' } },
  tamer:       { edge: 'Beasts hesitate before you: +4% damage, +15% against beasts, +2% dodge, 1% less damage taken; and you can calm a beast mid-fight.', combat: { dmg: 0.04, dodge: 0.02, armor: 0.01, vs: { beast: 0.15 } }, work: { where: 'any', what: 'break horses and train hounds' }, skill: 'calm it', skillDesc: 'in a fight with a beast: end it without bloodshed', fightSkill: { re: /\b(calm (?:it|the beast)|soothe (?:it|the beast)|tame it)\b/i, kind: 'calm' } },
  innkeeper:   { edge: 'Hearty and hale: +4% health, potions +20%.', combat: { hp: 0.04, potion: 0.20 }, work: { where: 'settlement', what: 'keep the inn' }, skill: 'pour a round', skillDesc: 'coin and gossip', skillSpec: { re: /^(?:i\s+)?(?:pour a round|tend bar|serve the house)/i, kind: 'coin', coin: 0.5, hours: 3, message: 'The house drinks, talks and pays.' } },
  cartographer: { edge: 'You know the ground: +3% to hit, +4% dodge, +2% health.', combat: { hit: 0.03, dodge: 0.04, hp: 0.02 }, work: { where: 'any', what: 'survey and sell maps' }, skill: 'chart the land', skillDesc: 'reveal this region\'s landmarks', skillSpec: { re: /^(?:i\s+)?(?:chart|map|survey) the (?:land|area|region|terrain)/i, kind: 'reveal', hours: 3, message: 'You chart the land.' } },
  sailor:      { edge: 'Sea legs: +4% dodge, +3% health, 1% less damage taken.', combat: { dodge: 0.04, hp: 0.03, armor: 0.01 }, work: { where: 'any', what: 'crew a boat or work the docks' }, skill: 'tie off', skillDesc: '+6% dodge next fight', skillSpec: { re: /^(?:i\s+)?(?:tie off|rig|secure the lines)/i, kind: 'buff', buff: { dodge: 0.06 }, hours: 1, message: 'Lines secured, feet sure. (+6% dodge next fight.)' } },
  gambler:     { edge: 'Nerve and luck: +12% critical chance, +4% damage.', combat: { crit: 0.12, dmg: 0.04 }, work: { where: 'settlement', what: 'play the tables', variance: 1.6 }, skill: 'roll the dice', skillDesc: 'win big or lose', skillSpec: { re: /^(?:i\s+)?(?:roll the dice|play cards|gamble|place a bet)/i, kind: 'gamble', hours: 2, message: 'The dice fall.' } },
  courtesan:   { edge: 'Grace under threat: +4% dodge, +4% damage, 1% less damage taken.', combat: { dodge: 0.04, dmg: 0.04, armor: 0.01 }, work: { where: 'settlement', what: 'entertain wealthy clients' }, skill: 'charm a patron', skillDesc: 'coin, and a little regard here', skillSpec: { re: /^(?:i\s+)?(?:charm|entertain|seduce) a (?:patron|client|noble|merchant)/i, kind: 'coin', coin: 0.6, rep: 2, hours: 3, message: 'A patron, charmed — and generous.' } },
  bounty_hunter: { edge: 'Hunter of people: +6% damage, +3% to hit, +10% against people, 1% less damage taken.', combat: { dmg: 0.06, hit: 0.03, armor: 0.01, vs: { person: 0.10 } }, work: { where: 'any', what: 'hunt bounties' }, skill: 'read the warrants', skillDesc: 'who is wanted here', skillSpec: { re: /^(?:i\s+)?(?:read|check) the (?:warrants|bounties|wanted posters)/i, kind: 'reveal', hours: 0, message: 'You read the warrants.' } },
  assassin:    { edge: 'A killer\'s timing: +12% critical chance, +5% damage.', combat: { crit: 0.12, dmg: 0.05 }, work: { where: 'settlement', what: 'take a contract', risk: 0.03, bonus: 1.5, crime: { type: 'murder', heinous: 7 } }, skill: 'prepare poison', skillDesc: '+8% damage next fight', skillSpec: { re: /^(?:i\s+)?(?:prepare|brew|coat my blade with) (?:a )?poison/i, kind: 'buff', buff: { dmg: 0.08 }, hours: 1, message: 'A dark smear on the edge. (+8% damage next fight.)' } },
  smuggler:    { edge: 'Slippery: +4% dodge, +2% to hit.', combat: { dodge: 0.04, hit: 0.02 }, work: { where: 'settlement', what: 'run contraband', risk: 0.08, bonus: 0.9, crime: { type: 'theft', heinous: 3 } }, skill: 'stash my goods', skillDesc: 'coin from a hidden run', skillSpec: { re: /^(?:i\s+)?(?:stash|hide|move) (?:my |the )?(?:goods|cargo|contraband)/i, kind: 'coin', coin: 0.5, hours: 2, message: 'A quiet run, a quiet profit.' } },
  gravedigger: { edge: 'The dead do not frighten you: +5% damage, +20% against the undead, 2% less damage taken.', combat: { dmg: 0.05, armor: 0.02, vs: { undead: 0.20 } }, work: { where: 'settlement', what: 'dig graves and tend the dead' }, skill: 'lay it to rest', skillDesc: '+10% damage against the undead next fight', skillSpec: { re: /^(?:i\s+)?(?:lay (?:it|them|the dead) to rest|bless the grave|salt the grave)/i, kind: 'buff', buff: { dmg: 0.10 }, hours: 1, message: 'Salt, iron, a word for the dead. (+10% damage next fight.)' } }
});

function rankFactor(state) { return 0.6 + 0.1 * Math.max(1, Math.min(5, state.professionLevel || 1)); }

// The combat modifiers this character's trade gives against this enemy.
function combatMods(state, enemy) {
  const out = { dmg: 1, weapon: 1, armor: 1, hit: 0, dodge: 0, crit: 0, potion: 1, regen: 0, hp: 1, loot: 1, spell: 1, weakness: 1 };
  const p = state && state.profession && PERKS[state.profession];
  if (!p) return state ? require('./specializations').apply(state, out, enemy, isPerson) : out;
  const f = rankFactor(state);
  const c = p.combat;
  const tags = (enemy && enemy.traits && enemy.traits.tags) || [];
  out.dmg += ((c.dmg || 0) + (c.beast && tags.includes('beast') ? c.beast : 0)) * f;
  for (const [tag, v] of Object.entries(c.vs || {})) {
    const hit = tag === 'person' ? (enemy && isPerson(enemy)) : tags.includes(tag);
    if (hit) out.dmg += v * f;
  }
  const nb = state.buffs && state.buffs.next;
  if (nb) { out.dmg += nb.dmg || 0; out.weapon += nb.weapon || 0; out.armor -= nb.armor || 0; out.hit += nb.hit || 0; out.dodge += nb.dodge || 0; }
  const weaponName = (state.gear && state.gear.weapon && state.gear.weapon.name) || '';
  if (c.axe && /axe|hatchet/i.test(weaponName)) out.dmg += c.axe * f;
  if (state.buffs && state.buffs.sharpened) out.weapon += 0.15;
  if (state.buffs && state.buffs.studied && enemy && state.buffs.studied === enemy.label) out.dmg += 0.10;
  out.weapon += (c.weapon || 0) * f;
  out.armor -= (c.armor || 0) * f + (state.buffs && state.buffs.padded ? 0.10 : 0);
  out.hit += (c.hit || 0) * f;
  out.dodge += (c.dodge || 0) * f;
  out.crit += (c.crit || 0) * f;
  out.potion += (c.potion || 0) * f;
  out.regen += (c.regen || 0) * f;
  out.hp += (c.hp || 0) * f;
  out.loot += (c.loot || 0) * f;
  out.spell += (c.spell || 0) * f;
  out.weakness += (c.weakness || 0) * f;
  return require('./specializations').apply(state, out, enemy, isPerson);
}

// ---------------------------------------------
// Working for a living
// ---------------------------------------------
const WORK_RE = /^(?:i\s+)?(?:work|ply my trade|take on work|look for work|find work|work at my trade|do some work|earn (?:a|my) living)(?:\s+as\s+an?\s+\w+)?(?:\s+for\s+(\d+)\s+hours?)?(?:\s+(?:here|today|tonight))?[.!]*$/i;

function detectWork(input) {
  const m = String(input || '').trim().match(WORK_RE);
  if (!m) return null;
  return { hours: Math.max(2, Math.min(12, parseInt(m[1] || '8', 10))) };
}

// Value of an hour's work: the same for every trade at the same rank.
function hourlyValue(state) {
  const tier = (REGIONS[state.character.region] || {}).tier || 1;
  return 3 * tier * (1 + 0.25 * ((state.professionLevel || 1) - 1));
}

const MATERIAL_VALUE = { hide: 6, timber: 5, 'iron ore': 7, herbs: 4 };

function work(state, hours) {
  const key = state.profession;
  if (!key) return { success: false, message: 'You have no trade yet. Do the work of one, and a trade will find you.' };
  const p = PERKS[key];
  const r = REGIONS[state.character.region] || {};
  if (p.work.where === 'settlement' && !r.settlement) return { success: false, message: `There is no one here to ${p.work.what} for. Find a town.` };
  if (p.work.where === 'wild' && r.settlement && !r.resources) return { success: false, message: `You need open country to ${p.work.what}.` };
  const value = hourlyValue(state) * hours;
  const lines = [];
  let coin = 0;
  const gained = [];
  if (p.work.material) {
    // Paid in goods: the same value, as materials (plus a little coin).
    const tier = r.tier || 1;
    const unit = (MATERIAL_VALUE[p.work.material] || 6) * tier;
    const qty = Math.max(1, Math.round((value * 0.6) / unit));
    coin = Math.round(value * 0.4);
    if (!state.materials || typeof state.materials !== 'object') state.materials = {};
    state.materials[p.work.material] = (state.materials[p.work.material] || 0) + qty;
    gained.push(`${qty} ${p.work.material}`);
  } else if (p.work.risk) {
    // Higher pay, real risk: each shift may be seen.
    coin = Math.round(value * (1 + p.work.bonus) * (0.7 + Math.random() * 0.6));
    const sneak = (state.stats && state.stats.dex) || 10;
    if (Math.random() < p.work.risk * (1.2 - Math.min(0.6, (sneak - 10) / 50))) {
      const crime = require('./crime');
      const kind = p.work.crime || { type: 'theft', heinous: 2 };
      const res = crime.resolve(state, { type: kind.type, victim: { name: kind.type === 'murder' ? 'the mark' : 'a mark in the crowd' }, text: `${p.work.what}` }, { forceSeen: true, heinous: kind.heinous });
      lines.push(kind.type === 'murder' ? 'The job goes wrong — someone sees your face.' : 'A shout — someone saw.', ...res.lines);
      coin = Math.round(coin / 3);
    }
  } else {
    coin = Math.round(value * (1 - (p.work.variance || 0.2) / 2 + Math.random() * (p.work.variance || 0.2)));
  }
  state.coin = (state.coin || 0) + coin;
  const profXP = Math.round(hours * (4 + (state.professionLevel || 1)));
  state.profXP = (state.profXP || 0) + profXP;
  // A peaceful career: honest work moves a life forward too, paid in time.
  const xp = require('./trade-work').careerXP(state, hours);
  const levelUp = require('./character').grantXP(state, xp);
  return {
    success: true, hours, levelUp, xp,
    message: [`You ${p.work.what} for ${hours} hours: ${coin} copper${gained.length ? ` and ${gained.join(', ')}` : ''}, +${xp} XP.`, ...lines].join('\n'),
    hint: `[WORK — the player spends ${hours} hours as a ${key}: they ${p.work.what}. Narrate the work and the people.]`,
    coin, gained, profXP
  };
}

// ---------------------------------------------
// Trade skills
// ---------------------------------------------
const SKILLS = [
  { prof: 'blacksmith', re: /^(?:i\s+)?(?:sharpen|hone|whet) my (?:blade|sword|axe|weapon|dagger|spear)/i },
  { prof: 'tailor', re: /^(?:i\s+)?(?:mend|pad|patch|reinforce) my (?:armou?r|clothes|coat|jerkin|leathers)/i },
  { prof: 'physician', re: /^(?:i\s+)?(?:treat|tend|bandage|stitch|dress) my (?:wounds?|injuries|cuts)/i },
  { prof: 'woodsman', re: /^(?:i\s+)?build a (?:shelter|lean-to|hut)/i },
  { prof: 'miner', re: /^(?:i\s+)?(?:prospect|look for ore|search for ore|find a seam)/i }
];

function detectSkill(state, input) {
  const t = String(input || '').trim();
  const own = state && state.profession && PERKS[state.profession] && PERKS[state.profession].skillSpec;
  if (own && own.re.test(t)) return { prof: state.profession, spec: own };
  // Another trade's words are just a story action for everyone else
  // ("I fix the cart wheel" is not a wainwright's shift unless you are one).
  const fixed = SKILLS.find(s => s.re.test(t) && s.prof === (state && state.profession));
  return fixed || null;
}

function useSkill(state, skill, helpers = {}) {
  if (state.profession !== skill.prof) return { success: false, message: `That takes a ${skill.prof}'s training.` };
  state.buffs = state.buffs || {};
  const f = rankFactor(state);
  if (skill.spec) return useSpec(state, skill.spec, f);
  if (skill.prof === 'blacksmith') { state.buffs.sharpened = true; return { success: true, hours: 1, message: 'The edge sings when you test it. (+15% weapon damage for your next fight.)' }; }
  if (skill.prof === 'tailor') {
    state.buffs.padded = true;
    const a = state.gear && state.gear.armor;
    if (a && typeof a.durability === 'number') a.durability = Math.min(100, a.durability + 40);
    return { success: true, hours: 2, message: 'Fresh stitches, new padding. (+10% armour for your next fight; armour mended.)' };
  }
  if (skill.prof === 'physician') {
    const now = state.actionCount || 0;
    if (now - (state.lastTreatAt || -99) < 4) return { success: false, message: 'Your hands need rest before you can do it properly again.' };
    state.lastTreatAt = now;
    const before = state.hp;
    state.hp = Math.min(state.maxHp, state.hp + Math.round(state.maxHp * 0.4 * f / 0.9));
    return { success: true, hours: 1, message: `You clean and stitch your wounds. (HP +${state.hp - before}.)` };
  }
  if (skill.prof === 'woodsman') { state.buffs.shelter = true; return { success: true, hours: 2, message: 'A shelter of cut boughs, hidden from the road. Your next camp here will not be disturbed.' }; }
  if (skill.prof === 'miner') {
    const r = REGIONS[state.character.region] || {};
    if (!state.materials || typeof state.materials !== 'object') state.materials = {};
    const qty = 1 + Math.floor((state.professionLevel || 1) / 2) + ((r.tier || 1) >= 5 ? 1 : 0);
    state.materials['iron ore'] = (state.materials['iron ore'] || 0) + qty;
    return { success: true, hours: 3, message: `You find a seam others missed: ${qty} iron ore.` };
  }
  return null;
}

// Data-driven trade skills.
function useSpec(state, spec, f) {
  state.buffs = state.buffs || {};
  const r = REGIONS[state.character.region] || {};
  if (spec.kind === 'buff') {
    const nb = state.buffs.next = { ...(state.buffs.next || {}) };
    for (const [k, v] of Object.entries(spec.buff)) nb[k] = Math.max(nb[k] || 0, v * f / 0.9);
    if (spec.mend) { const a = state.gear && state.gear.armor; if (a && typeof a.durability === 'number') a.durability = Math.min(100, a.durability + 40); }
    return { success: true, hours: spec.hours, message: spec.message };
  }
  if (spec.kind === 'heal') {
    const now = state.actionCount || 0;
    if (now - (state.lastTreatAt || -99) < 4) return { success: false, message: 'Not again so soon.' };
    state.lastTreatAt = now;
    const before = state.hp;
    state.hp = Math.min(state.maxHp, state.hp + Math.round(state.maxHp * spec.heal * f / 0.9));
    return { success: true, hours: spec.hours, message: `${spec.message} (HP +${state.hp - before}.)` };
  }
  if (spec.kind === 'gather') {
    if (!state.materials || typeof state.materials !== 'object') state.materials = {};
    const qty = Math.max(1, Math.round(spec.qty * f));
    state.materials[spec.material] = (state.materials[spec.material] || 0) + qty;
    return { success: true, hours: spec.hours, message: `${spec.message} (${qty} ${spec.material}.)` };
  }
  if (spec.kind === 'coin' || spec.kind === 'gamble') {
    if (!r.settlement && spec.kind === 'gamble') return { success: false, message: 'There is no one here to play.' };
    const v = hourlyValue(state) * spec.hours;
    const coin = spec.kind === 'gamble' ? Math.round(v * (Math.random() < 0.5 ? 0 : 2.1)) : Math.round(v * (spec.coin || 0.5));
    state.coin = (state.coin || 0) + coin;
    if (spec.rep && state.reputation) state.reputation[state.character.region] = Math.min(100, (state.reputation[state.character.region] || 0) + spec.rep);
    return { success: true, hours: spec.hours, message: `${spec.message} (${coin ? `+${coin} copper` : 'you lose your stake'}.)` };
  }
  if (spec.kind === 'reveal') {
    if (state.profession === 'bounty_hunter') {
      const w = Object.keys(state.warrants || {});
      return { success: true, hours: 0, message: `Wanted here: outlaws and debtors, the usual. ${w.includes(state.character.region) ? 'One of the faces on the board is yours.' : 'None of them are you.'}` };
    }
    if (!state.discoveredLandmarks || typeof state.discoveredLandmarks !== 'object') state.discoveredLandmarks = {};
    for (const l of r.landmarks || []) state.discoveredLandmarks[l.id || l.name] = state.discoveredLandmarks[l.id || l.name] || { at: state.actionCount || 0, charted: true };
    return { success: true, hours: spec.hours, message: `You chart the land: ${(r.landmarks || []).map(l => l.name).join(', ') || 'nothing of note'}.` };
  }
  return null;
}

// In-fight trade skills: study (scholar), bribe (merchant), steal (thief).
const FIGHT_SKILLS = {
  scholar: /\b(study it|study (?:the|its) (?:weak|movements)|look for (?:a|its) weakness)\b/i,
  merchant: /\b(bribe it|bribe (?:him|her|them)|pay (?:it|him|her|them) off|offer (?:it|him|her|them) coin)\b/i,
  thief: /\b(steal from (?:it|him|her|them)|rob (?:it|him|her|them)|cut (?:its|his|her|their) purse|pick (?:its|his|her|their) pocket)\b/i
};

function isPerson(enemy) {
  return /bandit|thug|cutthroat|raider|marauder|smuggler|watchman|soldier|guard|knight|captain|mercenary|cultist|acolyte|hunter|scout|deserter|reaver|skirmisher|ambusher|scavenger|brute|hexer|stalker|lord|warlord|witch|druid|shaman|magistrate|noble|orc|goblin|kobold/i.test(String(enemy && enemy.label || ''));
}

function detectFightSkill(state, input) {
  const p = state.profession && PERKS[state.profession];
  if (p && p.fightSkill && p.fightSkill.re.test(String(input || ''))) return state.profession;
  const re = state.profession && FIGHT_SKILLS[state.profession];
  return re && re.test(String(input || '')) ? state.profession : null;
}

function useFightSkill(state, prof) {
  const e = state.currentEnemy;
  if (!e) return null;
  const lvl = require('./character').getPlayerLevel(state.totalXP || 0);
  if (prof === 'scholar') {
    state.buffs = state.buffs || {}; state.buffs.studied = e.label;
    const T = require('./combat-tactics');
    const tr = e.traits || T.getEnemyTraits(e);
    const weak = Object.entries(tr.resist || {}).filter(([, v]) => v < 0).map(([k]) => k);
    return { success: true, message: `You watch how it moves. ${weak.length ? `It fears ${weak.join(' and ')}.` : 'It has no weakness you can name, but you know its rhythm now.'} (+10% damage for this fight.)`, endsFight: false };
  }
  if (prof === 'tamer') {
    const T = require('./combat-tactics');
    const tags = (e.traits || T.getEnemyTraits(e)).tags;
    if (!tags.includes('beast') || e.isBoss) return { success: false, message: 'That is no beast you can calm.' };
    const ok = Math.random() < 0.45 + 0.08 * (state.professionLevel || 1);
    return ok ? { success: true, message: `You go still, speak low, and ${e.label} backs away into the brush.`, endsFight: true } : { success: true, message: 'It will not be calmed — not yet.', endsFight: false };
  }
  if (!isPerson(e)) return { success: false, message: 'There is no reasoning with that.' };
  if (prof === 'merchant') {
    if (e.isBoss) return { success: false, message: `${e.label} cannot be bought.` };
    const price = Math.round((e.level || 1) * 12 * (1 - 0.05 * (state.professionLevel || 1)));
    if ((state.coin || 0) < price) return { success: false, message: `It wants ${price} copper. You have ${state.coin || 0}.` };
    state.coin -= price;
    return { success: true, message: `You pay ${price} copper. ${e.label} counts it, spits, and goes.`, endsFight: true };
  }
  if (prof === 'thief') {
    const take = Math.round((5 + Math.random() * 20) * Math.max(1, lvl / 5));
    const ok = Math.random() < 0.55 + 0.05 * (state.professionLevel || 1);
    if (ok) state.coin = (state.coin || 0) + take;
    return { success: true, message: ok ? `Your hand finds its purse mid-scuffle: ${take} copper.` : 'It twists away before your fingers close.', endsFight: false, usesTurn: true };
  }
  return null;
}

function describe(state) {
  const key = state.profession;
  if (!key) return null;
  const p = PERKS[key];
  return `${p.edge} Work: "${'work'}" — you ${p.work.what}${p.work.material ? ` (paid partly in ${p.work.material})` : ''}${p.work.risk ? ' (better pay, risk of being caught)' : ''}. Skill: "${p.skill}" — ${p.skillDesc}.`;
}

module.exports = { PERKS, combatMods, rankFactor, detectWork, work, hourlyValue, detectSkill, useSkill, detectFightSkill, useFightSkill, describe, isPerson };
