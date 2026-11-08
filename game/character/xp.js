'use strict';

// =============================================================
// EMBER AND ASH — UNBOUNDED XP CURVE
//
// There is no final level. The cost of each level (XP to go from L to
// L+1) is:
//
//   L ≤ 100        10·L                         (the original campaign curve —
//                                                 unchanged, so chapter gates hold)
//   100 < L ≤ 200  10·L · 25^((L−100)/100)      (×5 by 150, ×25 by 200)
//   L > 200        L⁵ · 250 / 200⁴              (exact integer, polynomial)
//
// The pieces meet exactly at 100 (1,000) and 200 (50,000), so the cost is
// strictly increasing forever and never zero, negative or NaN.
//
// Totals are computed with BigInt. A stored XP value is a plain Number
// while it is a safe integer and a decimal string beyond that, so saves
// stay valid JSON at any level. Cumulative totals are cached and level
// lookup is a binary search, so level 100,000 is as cheap as level 10.
// =============================================================

const SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const DIV  = 6400000n;          // 200⁴ / 250
// Stored XP is clamped to this (about level 85 million) so a corrupted
// save cannot turn into an unbounded computation.
const XP_CEILING = 10n ** 40n;

// Σ_{k=1..n} k⁵, exact.
function sum5(n) {
  if (n <= 0n) return 0n;
  return (n * n * (n + 1n) * (n + 1n) * (2n * n * n + 2n * n - 1n)) / 12n;
}

// Exact cumulative cache for levels 1..201 (piecewise region).
const cumulative = [0n];        // cumulative[i] = XP to reach level i+1
function smallCost(L) {
  if (L <= 100) return BigInt(10 * L);
  return BigInt(Math.round(10 * L * Math.pow(25, (L - 100) / 100)));
}
while (cumulative.length < 201) {
  const L = cumulative.length;
  cumulative.push(cumulative[L - 1] + smallCost(L));
}
const C201 = cumulative[200];   // XP to reach level 201

// XP needed to reach `level` (cumulative). Polynomial region in closed form:
// C(L) = C(201) + ⌊(Σ_{k=201..L-1} k⁵) / DIV⌋, so each level costs ⌊k⁵/DIV⌋ or
// one more — strictly increasing, since k⁵/DIV grows by thousands per level.
function xpForLevelBig(level) {
  const L = Math.max(1, Math.floor(level));
  if (L <= 201) return cumulative[L - 1];
  const n = BigInt(L - 1);
  return C201 + (sum5(n) - sum5(200n)) / DIV;
}

function levelCost(level) {
  const L = Math.max(1, Math.floor(level));
  return xpForLevelBig(L + 1) - xpForLevelBig(L);
}

// Accepts a Number, a decimal string, or a BigInt. Anything invalid is 0.
function toBig(xp) {
  if (typeof xp === 'bigint') return xp < 0n ? 0n : xp;
  if (typeof xp === 'number') return Number.isFinite(xp) && xp > 0 ? BigInt(Math.floor(xp)) : 0n;
  if (typeof xp === 'string' && /^\d+$/.test(xp.trim())) {
    const b = BigInt(xp.trim());
    return b > XP_CEILING ? XP_CEILING : b;
  }
  return 0n;
}

// The serialisable form: Number when exact, decimal string otherwise.
function fromBig(b) {
  if (b > XP_CEILING) b = XP_CEILING;
  return b <= SAFE ? Number(b) : b.toString();
}

function getXPForLevel(level) { return fromBig(xpForLevelBig(level)); }

function getPlayerLevel(totalXP) {
  const xp = toBig(totalXP);
  if (xp <= 0n) return 1;
  // Bracket xp by doubling, then binary search (O(log level) BigInt ops).
  let hi = 2;
  while (xpForLevelBig(hi) <= xp) hi *= 2;
  let lo = 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (xpForLevelBig(mid) <= xp) lo = mid; else hi = mid - 1;
  }
  return lo;
}

function getXPToNextLevel(totalXP) {
  const L = getPlayerLevel(totalXP);
  return fromBig(xpForLevelBig(L + 1) - toBig(totalXP));
}

function addXP(totalXP, amount) {
  return fromBig(toBig(totalXP) + toBig(amount));
}

// Human-friendly XP: 12,345 · 4.2M · 3.1e15
function formatXP(xp) {
  const b = toBig(xp);
  if (b < 1000000n) return Number(b).toLocaleString('en-US');
  const s = b.toString();
  if (s.length <= 12) return `${(Number(b) / 1e6).toFixed(1)}M`;
  return `${s[0]}.${s.slice(1, 3)}e${s.length - 1}`;
}

module.exports = { levelCost, getXPForLevel, getPlayerLevel, getXPToNextLevel, addXP, toBig, fromBig, formatXP };
