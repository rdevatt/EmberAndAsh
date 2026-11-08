'use strict';

// =============================================================
// EMBER AND ASH — SCENE DESCRIPTORS
// Every response carries a structured description of what should be
// drawn: where the player is (biome, time of day, season, weather),
// who is present (the player's portrait data, the enemy, an NPC), and
// the ordered events of the turn (hits, misses, crits, spells, defends,
// deaths, level-ups, travel, rest). The client animates exactly these
// events — the engine stays the source of truth, so a miss is drawn as
// a miss and a dead enemy is never drawn alive.
// =============================================================

const { REGIONS } = require('./constants');
const chronicle = require('./chronicle');
const { portraitData, parseAppearance } = require('./appearance');
const { getEnemyTraits } = require('./combat-tactics');

const BIOMES = {
  thornwick: 'farmland', dustfall: 'plains', ironport: 'city', greymere: 'moor', ashwood_shallow: 'silverwood', oakhaven: 'town', saltenbay: 'coast',
  blackstone_foothills: 'hills', sunkenfen_edge: 'swamp', ember_coast: 'coast', bleached_flats: 'saltflat', wyrmwood: 'forest', ruinwatch: 'ruins',
  ashwood_deep: 'silverwood', blackstone_peaks: 'mountain', coldsnap_pass: 'snow', sunkenfen_deep: 'swamp', veldrath_border: 'desert',
  frozennorth_reaches: 'snow', deepmark: 'forest', scar_vale: 'battlefield', void_fringe: 'void', ashen_vale: 'ashland', old_veldrath: 'desert',
  pale_city_approach: 'ruins', blighted_reaches: 'blight', crucible_approach: 'volcanic', hollowed_kingdom: 'castle', sunken_citadel: 'swamp',
  pale_city: 'whitecity', bone_desert: 'desert', crucible_gate: 'volcanic', shattered_march: 'battlefield', void_marches: 'void',
  eternal_breach: 'void', the_crucible: 'volcanic', the_core_wastes: 'void', shattered_throne: 'throne'
};

function hashInt(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

function enemyShape(enemy) {
  const tags = (enemy.traits || getEnemyTraits(enemy)).tags;
  if (tags.includes('construct')) return 'construct';
  if (tags.includes('spirit')) return 'spirit';
  if (tags.includes('beast')) return /wyrm|drake|wyvern|serpent/i.test(enemy.label) ? 'wyrm' : 'beast';
  if (tags.includes('plant')) return 'treant';
  if (tags.includes('undead')) return 'skeleton';
  if (tags.includes('caster')) return 'caster';
  return 'humanoid';
}

function enemyDescriptor(enemy, killed) {
  if (!enemy) return null;
  const tags = (enemy.traits || getEnemyTraits(enemy)).tags;
  return {
    label: enemy.label, level: enemy.level, shape: enemyShape(enemy), boss: !!enemy.isBoss,
    tint: tags.includes('fiery') ? 'fire' : tags.includes('frost') ? 'frost' : tags.includes('void') ? 'void' : tags.includes('undead') ? 'bone' : 'plain',
    hpPct: killed ? 0 : Math.max(0, Math.round(100 * enemy.currentHP / Math.max(1, enemy.maxHP))),
    dead: !!killed || enemy.currentHP <= 0, seed: hashInt(enemy.label)
  };
}

function npcDescriptor(name, world) {
  if (!name) return null;
  const fig = world && world.figures.find(f => f.name === name);
  if (fig && fig.snapshot && fig.snapshot.appearance) {
    return { name, legend: true, appearance: fig.snapshot.appearance, gender: fig.snapshot.gender, weaponKind: null, crown: fig.role === 'ruler' && fig.status !== 'deceased' };
  }
  return { name, legend: false, appearance: parseAppearance('', { name }, `npc:${name}`), gender: 'unspecified' };
}

// Converts the engine's combat result into animation events.
function combatEvents(result, killed, enemyLabel) {
  if (!result) return [];
  const ev = [];
  if (result.usedItem) ev.push({ type: 'item', item: result.usedItem });
  else if (result.defended) ev.push({ type: 'defend' });
  else if (result.spellCast || (result.abilityUsed && /spell|bolt|fire|frost|flame|blast|mockery|surge|lance|hex|entangle|whip|turn/i.test(result.abilityUsed))) {
    const label = result.spellCast || result.abilityUsed;
    const element = /fire|flame|ember/i.test(label) ? 'fire' : /frost|ice/i.test(label) ? 'frost' : /holy|divine|sacred|turn|smite/i.test(label) ? 'holy' : /eldritch|drain|hex|grave|shadow/i.test(label) ? 'shadow' : /thorn|entangle/i.test(label) ? 'nature' : 'arcane';
    ev.push({ type: 'spell', element, hit: !!result.playerHit, crit: !!result.playerCrit, damage: result.playerDamage || 0, label });
  } else if (result.playerLines && result.playerLines.some(l => /stunned and cannot act/.test(l))) {
    ev.push({ type: 'stunned', who: 'player' });
  } else {
    ev.push({ type: 'attack', hit: !!result.playerHit, crit: !!result.playerCrit, damage: result.playerDamage || 0, ability: result.abilityUsed || null });
  }
  for (const ca of result.companionAttacks || []) ev.push({ type: 'companion', name: ca.name, hit: !!ca.hit, heal: !!ca.heal, damage: ca.damage || 0 });
  if (killed) { ev.push({ type: 'death', who: 'enemy', label: enemyLabel }); return ev; }
  const lines = (result.enemyLines || []).join('\n');
  if (/defend to blunt/.test(lines)) ev.push({ type: 'telegraph' });
  if (/stunned and cannot act/.test(lines)) ev.push({ type: 'stunned', who: 'enemy' });
  else if (/unleashes/.test(lines)) ev.push({ type: 'enemySpecial', hit: !!result.enemyHit, damage: result.enemyDamage || 0, blocked: !!result.defended });
  else if (!/defend to blunt/.test(lines)) ev.push({ type: 'enemyAttack', hit: !!result.enemyHit, damage: result.enemyDamage || 0, blocked: !!result.defended });
  return ev;
}

/**
 * ctx: { combatResult, killed, killedEnemy, events (game events), commandType, npcName, died }
 */
function buildScene(state, ctx = {}) {
  if (!state || !state.character || !state.character.region) return null;
  const world = chronicle.worldOf(state);
  const region = REGIONS[state.character.region] || {};
  const date = world ? chronicle.dateOf(chronicle.nowHour(world)) : { timeOfDay: 'afternoon', season: 'summer', year: chronicle.START_YEAR };
  const ruler = !!(world && world.realm && world.realm.rulerId === state.characterId);
  const scene = {
    region: state.character.region, regionLabel: region.label, biome: BIOMES[state.character.region] || 'plains',
    timeOfDay: date.timeOfDay, season: date.season, year: date.year,
    weather: region.hazard ? region.hazard.key : null,
    settlement: !!region.settlement && !state.inCombat,
    settlementStatus: world && world.settlements[state.character.region] ? world.settlements[state.character.region].status : 'thriving',
    era: world && world.ending ? world.ending : null,
    player: portraitData(state, { ruler }),
    playerPose: state.inCombat ? 'combat' : 'idle',
    enemy: null, npc: null, events: [], mood: 'calm'
  };
  const enemy = state.inCombat ? state.currentEnemy : (ctx.killed ? ctx.killedEnemy : null);
  if (enemy) scene.enemy = enemyDescriptor(enemy, ctx.killed);
  if (state.inCombat || ctx.killed) scene.mood = enemy && enemy.isBoss ? 'boss' : 'combat';
  if (ctx.combatResult) scene.events.push(...combatEvents(ctx.combatResult, !!ctx.killed, enemy && enemy.label));
  for (const e of ctx.events || []) {
    if (e.type === 'levelUp') scene.events.push({ type: 'levelUp', level: e.newLevel });
    else if (e.type === 'travel') { scene.events.push({ type: 'travel', from: e.from, to: e.to }); scene.playerPose = 'travel'; }
    else if (e.type === 'death') { scene.events.push({ type: 'death', who: 'player' }); scene.mood = 'death'; }
    else if (e.type === 'questComplete' || e.type === 'chapterComplete') scene.events.push({ type: 'triumph', label: e.quest ? e.quest.label : `Chapter ${e.chapter}` });
    else if (e.type === 'combatStart') scene.events.push({ type: 'encounter', boss: !!e.boss });
    else if (e.type === 'itemCrafted') scene.events.push({ type: 'craft' });
  }
  if (ctx.commandType === 'longRest' || ctx.commandType === 'rest') { scene.playerPose = 'rest'; scene.events.push({ type: 'rest', inn: /room|inn/.test(ctx.input || '') }); }
  if (ctx.commandType === 'ambush') scene.events.push({ type: 'encounter', ambush: true });
  if (ctx.npcName && !state.inCombat) scene.npc = npcDescriptor(ctx.npcName, world);
  if (state.deceased) { scene.mood = 'death'; scene.playerPose = 'fallen'; }
  return scene;
}

module.exports = { buildScene, BIOMES, enemyShape, combatEvents };
