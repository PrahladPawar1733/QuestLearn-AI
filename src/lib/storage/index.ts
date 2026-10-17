import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../config";

/**
 * Object storage for uploads and generated assets. Local disk in demo mode,
 * Cloud Storage in production. Objects are never public: the browser reads
 * them through an authorized API route (local) or a short-lived signed URL (GCS).
 */
export interface BlobStore {
  put(key: string, data: Buffer, contentType: string): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(prefix: string): Promise<void>;
  /** Returns a signed URL, or null when the caller should stream via the API. */
  signedUrl(key: string, ttlSeconds: number): Promise<string | null>;
}

function safeKey(key: string) {
  const norm = path.posix.normalize(key).replace(/^\/+/, "");
  if (norm.startsWith("..") || norm.includes("\0")) throw new Error("invalid storage key");
  return norm;
}

class LocalBlobStore implements BlobStore {
  constructor(private root: string) {}
  private p(key: string) {
    return path.join(this.root, safeKey(key));
  }
  async put(key: string, data: Buffer) {
    const file = this.p(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
    return `local://${safeKey(key)}`;
  }
  async get(key: string) {
    return fs.readFile(this.p(key));
  }
  async delete(prefix: string) {
    await fs.rm(this.p(prefix), { recursive: true, force: true });
  }
  async signedUrl() {
    return null;
  }
}

class GcsBlobStore implements BlobStore {
  // Lazy import keeps the GCS client out of demo-mode cold starts.
  private bucketP = import("@google-cloud/storage").then(({ Storage }) => new Storage().bucket(config.bucket));
  async put(key: string, data: Buffer, contentType: string) {
    const b = await this.bucketP;
    // Privacy comes from the bucket policy (uniform access + public access prevention), not per-object ACLs.
    await b.file(safeKey(key)).save(data, { contentType, resumable: false });
    return `gs://${config.bucket}/${safeKey(key)}`;
  }
  async get(key: string) {
    const b = await this.bucketP;
    const [buf] = await b.file(safeKey(key)).download();
    return buf;
  }
  async delete(prefix: string) {
    const b = await this.bucketP;
    await b.deleteFiles({ prefix: safeKey(prefix), force: true });
  }
  async signedUrl(key: string, ttlSeconds: number) {
    const b = await this.bucketP;
    const [url] = await b.file(safeKey(key)).getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + ttlSeconds * 1000,
    });
    return url;
  }
}

const g = globalThis as unknown as { __qlBlobs?: BlobStore };
export function blobs(): BlobStore {
  if (!g.__qlBlobs) {
    g.__qlBlobs =
      config.storageMode === "gcs" ? new GcsBlobStore() : new LocalBlobStore(path.resolve(config.dataDir, "blobs"));
  }
  return g.__qlBlobs;
}
