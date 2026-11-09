#!/usr/bin/env node
'use strict';

// =============================================================
// Database backups — safe while the server runs.
//
//   node scripts/db-backup.js backup  [--db PATH] [--dir DIR] [--keep N]
//   node scripts/db-backup.js verify  FILE
//   node scripts/db-backup.js restore FILE [--db PATH]   (stop the server first)
//   node scripts/db-backup.js list    [--dir DIR]
//
// backup uses SQLite's online backup API (consistent even mid-write),
// then checks the copy with PRAGMA integrity_check and counts its rows.
// restore refuses a backup that fails the check, and keeps a copy of the
// database it replaces. Defaults: --db is EMBER_DB_PATH or the game's
// data/emberandash.db; --dir is data/backups next to it; --keep 14.
// =============================================================

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function arg(name, def) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def; }
const DEFAULT_DB = process.env.EMBER_DB_PATH || path.join(__dirname, '..', 'data', 'emberandash.db');

let lastStamp = '';
function stamp() {
  // Millisecond resolution, never repeated within one process.
  let s = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 23);
  while (s <= lastStamp) s = lastStamp.slice(0, 23) + 'x';
  lastStamp = s;
  return s;
}

function verify(file) {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const ok = db.prepare('PRAGMA integrity_check').get();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(t => t.name);
    const counts = {};
    for (const t of tables) counts[t] = db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c;
    return { ok: ok && Object.values(ok)[0] === 'ok', tables: counts };
  } finally { db.close(); }
}

async function backup(dbPath = DEFAULT_DB, dir = path.join(path.dirname(dbPath), 'backups'), keep = 14) {
  if (!fs.existsSync(dbPath)) throw new Error(`No database at ${dbPath}`);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${path.basename(dbPath, '.db')}-${stamp()}.db`);
  const src = new Database(dbPath, { readonly: true, fileMustExist: true });
  try { await src.backup(out); } finally { src.close(); }
  const v = verify(out);
  if (!v.ok) { fs.renameSync(out, out + '.FAILED'); throw new Error(`Backup failed its integrity check: ${out}.FAILED`); }
  prune(dir, path.basename(dbPath, '.db'), keep);
  return { file: out, ...v };
}

function list(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.db')).sort().map(f => path.join(dir, f));
}

function prune(dir, prefix, keep) {
  const files = list(dir).filter(f => path.basename(f).startsWith(prefix + '-'));
  for (const f of files.slice(0, Math.max(0, files.length - keep))) fs.unlinkSync(f);
}

// Replace the database with a verified backup. The server must be stopped.
function restore(file, dbPath = DEFAULT_DB) {
  const v = verify(file);
  if (!v.ok) throw new Error('Refusing to restore: the backup fails its integrity check.');
  if (fs.existsSync(dbPath)) {
    const keepCopy = `${dbPath}.before-restore-${stamp()}`;
    const cur = new Database(dbPath, { fileMustExist: true });
    try { cur.pragma('wal_checkpoint(TRUNCATE)'); } finally { cur.close(); }
    fs.copyFileSync(dbPath, keepCopy);
  }
  for (const ext of ['-wal', '-shm']) if (fs.existsSync(dbPath + ext)) fs.unlinkSync(dbPath + ext);
  fs.copyFileSync(file, dbPath);
  return verify(dbPath);
}

if (require.main === module) {
  (async () => {
    const cmd = process.argv[2];
    const dbPath = arg('--db', DEFAULT_DB);
    const dir = arg('--dir', path.join(path.dirname(dbPath), 'backups'));
    try {
      if (cmd === 'backup') { const r = await backup(dbPath, dir, Number(arg('--keep', 14))); console.log(`Backed up to ${r.file}: integrity ok; rows ${JSON.stringify(r.tables)}`); }
      else if (cmd === 'verify') { const r = verify(process.argv[3]); console.log(r.ok ? 'integrity ok' : 'INTEGRITY FAILED', JSON.stringify(r.tables)); process.exit(r.ok ? 0 : 1); }
      else if (cmd === 'restore') { const r = restore(process.argv[3], dbPath); console.log(`Restored ${dbPath}: ${r.ok ? 'integrity ok' : 'CHECK FAILED'}`); }
      else if (cmd === 'list') { for (const f of list(dir)) console.log(f); }
      else { console.log('usage: db-backup.js backup|verify FILE|restore FILE|list'); process.exit(2); }
    } catch (e) { console.error(e.message); process.exit(1); }
  })();
}

module.exports = { backup, verify, restore, list };
