import { Firestore } from "@google-cloud/firestore";
import { withKeyLock } from "./lock";
import { sortAndLimit, type CollectionName, type DocStore, type ListOptions, type Where } from "./types";

/**
 * Firestore implementation. Collection names are prefixed (default "ql_") so
 * the app can share a database safely. Sorting is done in memory after
 * equality filters, so no composite indexes are required for the MVP.
 */
export class FirestoreStore implements DocStore {
  private db: Firestore;
  constructor(
    databaseId: string,
    private prefix = process.env.FIRESTORE_PREFIX ?? "ql_",
  ) {
    this.db = new Firestore({ databaseId, ignoreUndefinedProperties: true });
  }

  private ref(c: CollectionName) {
    return this.db.collection(`${this.prefix}${c}`);
  }

  async get<T>(c: CollectionName, id: string): Promise<T | null> {
    const snap = await this.ref(c).doc(id).get();
    return snap.exists ? (snap.data() as T) : null;
  }

  async getMany<T>(c: CollectionName, ids: string[]): Promise<T[]> {
    if (ids.length === 0) return [];
    const refs = ids.map((id) => this.ref(c).doc(id));
    const snaps = await this.db.getAll(...refs);
    return snaps.filter((s) => s.exists).map((s) => s.data() as T);
  }

  async set<T extends { id: string }>(c: CollectionName, doc: T): Promise<void> {
    await this.ref(c).doc(doc.id).set(doc as FirebaseFirestore.DocumentData);
  }

  async create<T extends { id: string }>(c: CollectionName, doc: T): Promise<boolean> {
    try {
      await this.ref(c).doc(doc.id).create(doc as FirebaseFirestore.DocumentData);
      return true;
    } catch (e) {
      // gRPC ALREADY_EXISTS = 6
      if ((e as { code?: number }).code === 6) return false;
      throw e;
    }
  }

  async delete(c: CollectionName, id: string): Promise<void> {
    await this.ref(c).doc(id).delete();
  }

  async list<T>(c: CollectionName, where?: Where, opts?: ListOptions): Promise<T[]> {
    let q: FirebaseFirestore.Query = this.ref(c);
    for (const [k, v] of Object.entries(where ?? {})) q = q.where(k, "==", v);
    const snap = await q.limit(2000).get();
    return sortAndLimit(
      snap.docs.map((d) => d.data() as T),
      opts,
    );
  }

  /**
   * Serializes work per key within this instance. Cross-instance safety for
   * answer submissions comes from `create()` on deterministic attempt ids.
   */
  withLock<R>(key: string, fn: () => Promise<R>): Promise<R> {
    return withKeyLock(key, fn);
  }
}
