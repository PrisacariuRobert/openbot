import { chmodSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/** An index of the owner's own material on this Mac — chosen folders, Notes,
 * Mail, Messages — so a teammate can answer "what did Anna say about the
 * Berlin trip?" without scanning everything for each question.
 *
 * - Lives in its own file in the studio's data folder; nothing is uploaded.
 * - Every source is opt-in and can be cleared at any time.
 * - Search is full-text (SQLite FTS5): instant, accent-insensitive, ranked.
 *   Only the few snippets a teammate retrieves for a question ever reach the
 *   AI the owner chose; the index itself never leaves the Mac. */

export type SourceKind = "files" | "notes" | "mail" | "messages";
export const SOURCES: readonly SourceKind[] = ["files", "notes", "mail", "messages"];

export interface IndexItem {
  source: SourceKind;
  /** Stable per source: a path, a note id, a message id. */
  key: string;
  title: string;
  author?: string | null;
  at: string;
  body: string;
  /** Changes when the item changed (mtime and size); unchanged items are skipped. */
  stamp?: string;
}

export interface Hit { source: SourceKind; key: string; title: string; author: string | null; at: string; snippet: string }

const MAX_BODY = 40_000;
const STOP = new Set("a an and are as at be been but by can could did do does for from had has have how i if in into is it its me my of on or our so than that the their them then there these they this to was we were what when where which who whom why will with would you your about say said tell".split(" "));

export function ftsQuery(text: string): string | null {
  const words = [...new Set((text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").match(/[\p{L}\p{N}]{2,}/gu) || []).filter((word) => !STOP.has(word)))].slice(0, 12);
  return words.length ? words.map((word) => `"${word}"*`).join(" OR ") : null;
}

export class PersonalIndex {
  private readonly db: DatabaseSync;

  constructor(file: string) {
    if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    // Snippets of mail and notes: readable by the owner only. The WAL and
    // shared-memory files inherit the main file's mode.
    if (file !== ":memory:") chmodSync(file, 0o600);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA secure_delete = ON;
      CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY,
        source TEXT NOT NULL, key TEXT NOT NULL, title TEXT NOT NULL, author TEXT, at TEXT NOT NULL, body TEXT NOT NULL, stamp TEXT,
        UNIQUE(source, key)
      );
      CREATE INDEX IF NOT EXISTS items_source_at ON items(source, at);
      CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(title, author, body, content='items', content_rowid='id', tokenize='unicode61 remove_diacritics 2');
      CREATE TRIGGER IF NOT EXISTS items_ai AFTER INSERT ON items BEGIN INSERT INTO items_fts(rowid, title, author, body) VALUES (new.id, new.title, COALESCE(new.author,''), new.body); END;
      CREATE TRIGGER IF NOT EXISTS items_ad AFTER DELETE ON items BEGIN INSERT INTO items_fts(items_fts, rowid, title, author, body) VALUES ('delete', old.id, old.title, COALESCE(old.author,''), old.body); END;
      CREATE TRIGGER IF NOT EXISTS items_au AFTER UPDATE ON items BEGIN
        INSERT INTO items_fts(items_fts, rowid, title, author, body) VALUES ('delete', old.id, old.title, COALESCE(old.author,''), old.body);
        INSERT INTO items_fts(rowid, title, author, body) VALUES (new.id, new.title, COALESCE(new.author,''), new.body);
      END;
    `);
  }

  close() { this.db.close(); }

  /** Insert or update a batch; returns how many changed. */
  upsert(items: IndexItem[]): number {
    const find = this.db.prepare("SELECT id, stamp FROM items WHERE source=? AND key=?");
    const insert = this.db.prepare("INSERT INTO items (source,key,title,author,at,body,stamp) VALUES (?,?,?,?,?,?,?)");
    const update = this.db.prepare("UPDATE items SET title=?, author=?, at=?, body=?, stamp=? WHERE id=?");
    let changed = 0;
    this.db.exec("BEGIN");
    try {
      for (const item of items) {
        const body = item.body.slice(0, MAX_BODY), title = item.title.slice(0, 300) || "Untitled";
        const existing = find.get(item.source, item.key) as { id: number; stamp: string | null } | undefined;
        if (!existing) { insert.run(item.source, item.key, title, item.author ?? null, item.at, body, item.stamp ?? null); changed += 1; }
        else if (item.stamp === undefined || existing.stamp !== item.stamp) { update.run(title, item.author ?? null, item.at, body, item.stamp ?? null, existing.id); changed += 1; }
      }
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    return changed;
  }

  has(source: SourceKind, key: string, stamp?: string): boolean {
    const row = this.db.prepare("SELECT stamp FROM items WHERE source=? AND key=?").get(source, key) as { stamp: string | null } | undefined;
    return Boolean(row) && (stamp === undefined || row!.stamp === stamp);
  }

  /** Drop items of a source that are no longer there. */
  prune(source: SourceKind, keep: Set<string>): number {
    const rows = this.db.prepare("SELECT key FROM items WHERE source=?").all(source) as Array<{ key: string }>;
    const gone = rows.filter((row) => !keep.has(row.key));
    const remove = this.db.prepare("DELETE FROM items WHERE source=? AND key=?");
    this.db.exec("BEGIN");
    try { for (const row of gone) remove.run(source, row.key); this.db.exec("COMMIT"); } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    return gone.length;
  }

  clear(source?: SourceKind) {
    if (source) this.db.prepare("DELETE FROM items WHERE source=?").run(source); else this.db.exec("DELETE FROM items");
    // Deleting only marks pages free. Compact the file so forgotten text is
    // gone from the disk, not just from search.
    this.db.exec("INSERT INTO items_fts(items_fts) VALUES('optimize')");
    this.db.exec("VACUUM");
    this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  }

  search(text: string, options: { sources?: SourceKind[]; limit?: number; since?: string } = {}): Hit[] {
    const query = ftsQuery(text);
    if (!query) return [];
    const sources = (options.sources?.length ? options.sources : [...SOURCES]).filter((source) => SOURCES.includes(source));
    const marks = sources.map(() => "?").join(",");
    const rows = this.db.prepare(`
      SELECT i.source, i.key, i.title, i.author, i.at, snippet(items_fts, 2, '', '', ' … ', 28) AS snippet, bm25(items_fts, 8.0, 3.0, 1.0) AS rank
      FROM items_fts JOIN items i ON i.id = items_fts.rowid
      WHERE items_fts MATCH ? AND i.source IN (${marks}) ${options.since ? "AND i.at >= ?" : ""}
      ORDER BY rank LIMIT ?`).all(query, ...sources, ...(options.since ? [options.since] : []), Math.max(1, Math.min(20, options.limit ?? 8))) as Array<Record<string, unknown>>;
    return rows.map((row) => ({ source: row.source as SourceKind, key: String(row.key), title: String(row.title), author: row.author == null ? null : String(row.author), at: String(row.at), snippet: String(row.snippet || "").replace(/\s+/g, " ").trim() }));
  }

  counts(): Record<SourceKind, { items: number; newest: string | null }> {
    const out = Object.fromEntries(SOURCES.map((source) => [source, { items: 0, newest: null as string | null }])) as Record<SourceKind, { items: number; newest: string | null }>;
    for (const row of this.db.prepare("SELECT source, COUNT(*) AS n, MAX(at) AS newest FROM items GROUP BY source").all() as Array<{ source: SourceKind; n: number; newest: string | null }>) if (out[row.source]) out[row.source] = { items: Number(row.n), newest: row.newest };
    return out;
  }
}
