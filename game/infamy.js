'use strict';

// =============================================================
// EMBER AND ASH — VILLAINY, INFAMY AND SECRETS
// A character may be a villain. Coercion and force are possible acts,
// and they are crimes the world reacts to:
//   - the victim becomes hostile forever;
//   - companions who witness it lose faith, and most will leave;
//   - the act may be discovered at once (witnesses, towns, talkative
//     companions) or surface later as a rumour;
//   - discovery costs faction standing and local reputation, raises
//     infamy (how the world sees you), and enters the chronicle;
//   - every such act also marks the character's own corruption.
// Depiction: the act itself is never shown or described sexually, at
// any content setting — narration and artwork cut away to the threat
// before and the aftermath after. Children are never possible targets.
// =============================================================

const factions = require('./factions');
const chronicle = require('./chronicle');
const { REGIONS } = require('./constants');

// Only sexual coercion takes this path. Threats or blackmail for other ends
// are ordinary villainy, handled by the story and combat systems.
const FORCE = /^(?:i\s+)?(?:force myself (?:on|upon)\s+(.+?)|take (.+?) by force|(?:coerce|blackmail|threaten|pressure|force)\s+(.+?)\s+into\s+(?:bed|my bed|sleeping with me|sex|having sex|bedding me|lying with me))[.!?]*$/i;

function detectForce(text) {
  const m = String(text || '').trim().match(FORCE);
  if (!m) return null;
  return { target: (m[1] || m[2] || m[3] || '').trim() };
}

function infamyLabel(n) {
  if (n >= 70) return 'Reviled';
  if (n >= 40) return 'Infamous';
  if (n >= 15) return 'Whispered about';
  return 'Unknown';
}

function ensure(state) {
  if (typeof state.infamy !== 'number') state.infamy = 0;
  if (typeof state.corruption !== 'number') state.corruption = 0;
  if (!Array.isArray(state.secrets)) state.secrets = [];
  return state;
}

/**
 * Commits a coercive act against partner (already validated as an adult
 * the player knows). Returns { message, hint, discovered, failed, consequences[] }.
 */
function commitCoercion(state, partner, { removeCompanion } = {}) {
  ensure(state);
  const here = state.character.region;
  const r = REGIONS[here] || {};
  const world = chronicle.worldOf(state);
  const crime = { id: `crime_${state.characterId || 'c'}_${state.actionCount || 0}_${partner.id}`, victim: partner.name, victimId: partner.id, region: here, at: world ? chronicle.nowHour(world) : 0 };
  const consequences = [];

  // The victim may fight free — an attempted crime is still a crime.
  const failed = Math.random() < (partner.companion ? 0.45 : 0.35);

  // The victim never forgives.
  if (!state.npcRelationships) state.npcRelationships = {};
  const rel = state.npcRelationships[partner.id] || { rapport: 0, metBefore: true };
  rel.rapport = -100; rel.wronged = true; rel.metBefore = true;
  state.npcRelationships[partner.id] = rel;
  if (state.partners && state.partners[partner.id]) delete state.partners[partner.id];
  if (partner.companion && removeCompanion) {
    removeCompanion(state, partner.companion.id);
    consequences.push(`${partner.name} leaves you and will never return.`);
  }

  // Witnesses: everyone else in the party.
  const witnesses = (state.companions || []).filter(c => !partner.companion || c.id !== partner.companion.id);
  for (const c of [...witnesses]) {
    const cold = c.faction === 'choir' || c.hired;
    c.loyalty = Math.max(0, (c.loyalty || 50) - (cold ? 5 : 45));
    if (c.loyalty <= 10 && removeCompanion) { removeCompanion(state, c.id); consequences.push(`${c.name} saw what you did, and walks away.`); }
    else if (!cold) consequences.push(`${c.name} saw what you did. They will not forget (loyalty ${c.loyalty}).`);
  }

  // The Choir approves of cruelty; the self is changed by it.
  state.corruption = Math.min(100, state.corruption + 20);
  factions.changeStanding(state, { choir: 5 }, 'cruelty');

  const chance = Math.min(0.95, (r.settlement ? 0.55 : 0.25) + (witnesses.length ? 0.25 : 0) + (failed ? 0.3 : 0));
  const discovered = Math.random() < chance;
  if (discovered) consequences.push(...discover(state, crime));
  else { state.secrets.push(crime); consequences.push('No one saw. For now.'); }

  const message = failed
    ? `${partner.name} fights you off and escapes. What you tried to do cannot be undone.`
    : `You force your will on ${partner.name}. It is a crime, and you know it.`;
  const hint = `[VILLAIN ACT — the player character ${failed ? 'attempted to coerce' : 'coerced'} ${partner.name} (an adult). DO NOT depict or describe any sexual content, at any content setting. Cut away entirely. Narrate only the menace before and the aftermath: ${partner.name}'s fear and anger${failed ? ', their escape' : ''}, the character's isolation, and the consequences. Treat it as the crime it is.]`;
  return { message, hint, discovered, failed, consequences, crime };
}

// Public knowledge of a crime: standing, reputation, infamy, history.
function discover(state, crime) {
  ensure(state);
  const out = [];
  const owner = factions.getRegionFaction(crime.region);
  const changes = { compact: -20, wardens: -25, [owner]: -30 };
  const applied = factions.changeStanding(state, changes, 'crime');
  if (!state.reputation) state.reputation = {};
  state.reputation[crime.region] = Math.max(-100, (state.reputation[crime.region] || 0) - 50);
  state.infamy = Math.min(100, state.infamy + 30);
  out.push(`Word spreads through ${REGIONS[crime.region] ? REGIONS[crime.region].label : 'the region'}. ${factions.formatStandingChanges(applied)}. Infamy: ${infamyLabel(state.infamy)}.`);
  const world = chronicle.worldOf(state);
  if (world && state.character) {
    chronicle.addEvent(world, { type: 'crime', importance: 3, title: `${state.character.name} is accused of a vile crime against ${crime.victim}`, text: `People in ${REGIONS[crime.region] ? REGIONS[crime.region].label : 'the region'} speak of it in whispers and in anger.`, actor: chronicle.actorOf(state), region: crime.region }, `crime:${crime.id}`);
  }
  return out;
}

// Each elapsed month, a hidden crime may come out.
function secretsSurface(state, months) {
  ensure(state);
  const out = [];
  for (let m = 0; m < months && state.secrets.length; m++) {
    for (let i = state.secrets.length - 1; i >= 0; i--) {
      if (Math.random() < 0.08) { const crime = state.secrets.splice(i, 1)[0]; out.push(`A secret comes out: what you did to ${crime.victim}.`, ...discover(state, crime)); }
    }
  }
  return out;
}

// How people greet a known villain.
function greetingReaction(state) {
  ensure(state);
  if (state.infamy >= 70) return 'They recoil from you, and do not hide it.';
  if (state.infamy >= 40) return 'They know who you are. Their eyes are hard.';
  if (state.infamy >= 15) return 'Something in their face cools when they hear your name.';
  return null;
}

module.exports = { detectForce, commitCoercion, discover, secretsSurface, greetingReaction, infamyLabel, ensure };
