import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

export function createStore(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const keyPath = join(directory, 'local.key');
  if (!existsSync(keyPath)) {try {writeFileSync(keyPath, randomBytes(32), { mode:0o600,flag:'wx' });} catch(error) {if(error.code!=='EEXIST')throw error;}}
  const key = readFileSync(keyPath);
  const path = join(directory, 'recall.sqlite');
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  chmodSync(path, 0o600);
  db.exec(`CREATE TABLE IF NOT EXISTS bookmarks (owner TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, manual_category TEXT, PRIMARY KEY(owner,id));
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  const get = k => { const r = db.prepare('SELECT value FROM settings WHERE key=?').get(k); return r ? JSON.parse(r.value) : null; };
  const set = (k, v) => db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, JSON.stringify(v));
  function encrypt(value) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
    const bytes = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return [iv, cipher.getAuthTag(), bytes].map(b => b.toString('base64')).join('.');
  }
  function decrypt(value) {
    if (!value) return null;
    const [iv, tag, bytes] = value.split('.').map(s => Buffer.from(s, 'base64'));
    const cipher = createDecipheriv('aes-256-gcm', key, iv); cipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([cipher.update(bytes), cipher.final()]).toString());
  }
  return {
    get, set, close: () => db.close(),
    change(k, update) {
      db.exec('BEGIN IMMEDIATE');
      try { const value = update(get(k)); set(k, value); db.exec('COMMIT'); return value; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    secret: name => decrypt(get(name)),
    saveSecret: (name, value) => set(name, value ? encrypt(value) : null),
    tokens: () => decrypt(get('tokens')),
    saveTokens: tokens => set('tokens', tokens ? encrypt(tokens) : null),
    list: owner => db.prepare("SELECT body, manual_category FROM bookmarks WHERE owner=? ORDER BY json_extract(body,'$.importedAt') DESC, json_extract(body,'$.createdAt') DESC").all(owner).map(r => {
      const b = JSON.parse(r.body); return { ...b, category: r.manual_category || b.category, manual: Boolean(r.manual_category) };
    }),
    save(owner, bookmarks) {
      const insert = db.prepare('INSERT INTO bookmarks(owner,id,body) VALUES (?,?,?) ON CONFLICT(owner,id) DO UPDATE SET body=excluded.body');
      const previous = db.prepare('SELECT body FROM bookmarks WHERE owner=? AND id=?');
      let added = 0;
      db.exec('BEGIN');
      try {
        for (let b of bookmarks) {
          const existing = previous.get(owner, b.id);
          if (existing) b = { ...b, importedAt: JSON.parse(existing.body).importedAt }; else added++;
          insert.run(owner, b.id, JSON.stringify(b));
        }
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      return added;
    },
    categorize(owner, id, category) {
      return db.prepare('UPDATE bookmarks SET manual_category=? WHERE owner=? AND id=?').run(category, owner, id).changes > 0;
    },
  };
}
