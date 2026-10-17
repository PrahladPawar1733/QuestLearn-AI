import { promises as fs } from "node:fs";
import path from "node:path";
import { withKeyLock } from "./lock";
import { sortAndLimit, type CollectionName, type DocStore, type ListOptions, type Where } from "./types";

type Data = Record<string, Record<string, unknown>>;

/**
 * JSON-file document store for local development and demo mode.
 * Writes are serialized and atomic (temp file + rename).
 */
export class LocalStore implements DocStore {
  private data: Data | null = null;
  private loading: Promise<Data> | null = null;
  private file: string;
  private writeTimer: NodeJS.Timeout | null = null;
  private writing = Promise.resolve();

  constructor(dir: string) {
    this.file = path.join(dir, "db.json");
  }

  private async load(): Promise<Data> {
    if (this.data) return this.data;
    if (!this.loading) {
      this.loading = (async () => {
        try {
          const raw = await fs.readFile(this.file, "utf8");
          this.data = JSON.parse(raw) as Data;
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
            // Corrupt file: keep a copy for inspection and start fresh.
            await fs.rename(this.file, `${this.file}.corrupt-${Date.now()}`).catch(() => undefined);
          }
          this.data = {};
        }
        return this.data!;
      })();
    }
    return this.loading;
  }

  private col(data: Data, c: CollectionName) {
    return (data[c] ??= {});
  }

  private scheduleWrite() {
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.writing = this.writing.then(() => this.flush()).catch((e) => console.error("[store] write failed", e));
    }, 25);
  }

  async flush() {
    if (!this.data) return;
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.data));
    await fs.rename(tmp, this.file);
  }

  async get<T>(c: CollectionName, id: string): Promise<T | null> {
    const d = await this.load();
    const v = this.col(d, c)[id];
    return v ? (structuredClone(v) as T) : null;
  }

  async getMany<T>(c: CollectionName, ids: string[]): Promise<T[]> {
    const d = await this.load();
    const col = this.col(d, c);
    return ids.map((id) => col[id]).filter(Boolean).map((v) => structuredClone(v) as T);
  }

  async set<T extends { id: string }>(c: CollectionName, doc: T): Promise<void> {
    const d = await this.load();
    this.col(d, c)[doc.id] = structuredClone(doc);
    this.scheduleWrite();
  }

  async create<T extends { id: string }>(c: CollectionName, doc: T): Promise<boolean> {
    const d = await this.load();
    const col = this.col(d, c);
    if (col[doc.id]) return false;
    col[doc.id] = structuredClone(doc);
    this.scheduleWrite();
    return true;
  }

  async delete(c: CollectionName, id: string): Promise<void> {
    const d = await this.load();
    delete this.col(d, c)[id];
    this.scheduleWrite();
  }

  async list<T>(c: CollectionName, where?: Where, opts?: ListOptions): Promise<T[]> {
    const d = await this.load();
    let items = Object.values(this.col(d, c)) as Record<string, unknown>[];
    if (where) {
      items = items.filter((it) => Object.entries(where).every(([k, v]) => it[k] === v));
    }
    return sortAndLimit(items, opts).map((v) => structuredClone(v) as T);
  }

  withLock<R>(key: string, fn: () => Promise<R>): Promise<R> {
    return withKeyLock(key, fn);
  }
}
