/** In-process keyed mutex. */
const chains = new Map<string, Promise<unknown>>();

export async function withKeyLock<R>(key: string, fn: () => Promise<R>): Promise<R> {
  const prev = chains.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const next = prev.then(() => gate);
  chains.set(key, next);
  try {
    await prev.catch(() => undefined);
    return await fn();
  } finally {
    release();
    if (chains.get(key) === next) chains.delete(key);
  }
}
