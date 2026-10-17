import "server-only";
import path from "node:path";
import { config } from "../config";
import { LocalStore } from "./local";
import type { DocStore } from "./types";

const g = globalThis as unknown as { __qlStore?: DocStore };

export function db(): DocStore {
  if (!g.__qlStore) {
    if (config.dbMode === "firestore") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { FirestoreStore } = require("./firestore") as typeof import("./firestore");
      g.__qlStore = new FirestoreStore(config.firestoreDatabase);
    } else {
      g.__qlStore = new LocalStore(path.resolve(config.dataDir));
    }
  }
  return g.__qlStore;
}

export type { DocStore } from "./types";
