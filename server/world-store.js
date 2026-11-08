'use strict';

// =============================================================
// World persistence: one canonical world record per world id, cached in
// memory and saved to the `worlds` table. Character saves only carry
// state.worldId; the live world is attached non-enumerably (state.__world)
// so it is never serialised into a character save.
// =============================================================

const chronicle = require('../game/chronicle');

module.exports = function createWorldStore(db) {
  const cache = new Map();

  function ownerKeyOf(session, sessionId) {
    return session && session.playerId ? `player:${session.playerId}` : `guest:${sessionId}`;
  }

  function getWorld(worldId) {
    if (!worldId) return null;
    if (cache.has(worldId)) return cache.get(worldId);
    const stored = db.loadWorld(worldId);
    if (!stored) return null;
    const world = chronicle.migrateWorld(stored);
    cache.set(worldId, world);
    return world;
  }

  function createWorld(ownerKey, name) {
    const world = chronicle.createWorld({ name });
    cache.set(world.id, world);
    db.saveWorld(world, ownerKey);
    return world;
  }

  // Ensures the state is attached to its world (creating one for old saves).
  function bind(state, session, sessionId) {
    if (!state || state.__world) return state ? state.__world : null;
    let world = state.worldId ? getWorld(state.worldId) : null;
    if (!world) {
      world = chronicle.createWorld({});
      if (state.worldId) world.id = state.worldId;      // keep the reference stable
      cache.set(world.id, world);
    }
    chronicle.bindCharacter(state, world);
    db.saveWorld(world, ownerKeyOf(session, sessionId));
    return world;
  }

  function persist(state, session, sessionId) {
    const world = state && state.__world;
    if (!world) return;
    chronicle.ensureCharacterIdentity(state, world);
    db.saveWorld(world, ownerKeyOf(session, sessionId));
  }

  return { bind, persist, getWorld, createWorld, ownerKeyOf, cache };
};
