/**
 * A deliberately small document-store interface implemented by a local JSON
 * store (demo / development) and by Firestore (production). Route handlers
 * never talk to either backend directly.
 */
export type CollectionName =
  | "users"
  | "materials"
  | "concepts"
  | "quests"
  | "questions"
  | "sessions"
  | "attempts"
  | "mastery"
  | "assets"
  | "audit"
  | "translations";

export type Where = Record<string, string | number | boolean>;

export interface ListOptions {
  /** Field to sort by (descending when `desc`). Sorting is applied in memory. */
  orderBy?: string;
  desc?: boolean;
  limit?: number;
}

export interface DocStore {
  get<T>(collection: CollectionName, id: string): Promise<T | null>;
  getMany<T>(collection: CollectionName, ids: string[]): Promise<T[]>;
  set<T extends { id: string }>(collection: CollectionName, doc: T): Promise<void>;
  /** Creates the document only if it does not already exist. Returns false if it existed. */
  create<T extends { id: string }>(collection: CollectionName, doc: T): Promise<boolean>;
  delete(collection: CollectionName, id: string): Promise<void>;
  list<T>(collection: CollectionName, where?: Where, opts?: ListOptions): Promise<T[]>;
  /**
   * Run `fn` with exclusive access to a logical key (e.g. a session id), so
   * concurrent requests touching the same session are serialized.
   */
  withLock<R>(key: string, fn: () => Promise<R>): Promise<R>;
}

export function sortAndLimit<T>(items: T[], opts?: ListOptions): T[] {
  let out = items;
  if (opts?.orderBy) {
    const k = opts.orderBy;
    out = [...out].sort((a, b) => {
      const av = (a as Record<string, unknown>)[k] as string | number;
      const bv = (b as Record<string, unknown>)[k] as string | number;
      if (av === bv) return 0;
      const r = av > bv ? 1 : -1;
      return opts.desc ? -r : r;
    });
  }
  if (opts?.limit) out = out.slice(0, opts.limit);
  return out;
}
