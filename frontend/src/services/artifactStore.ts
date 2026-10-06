import { openDB, IDBPDatabase } from 'idb';

// Kept out of the 'arch-ide' database: StorageService deletes and recreates that one when it fails to open,
// and adding a store there would need a version bump that blocks while another tab holds v1.
const DB_NAME = 'arch-ide-artifacts';
const STORE = 'artifacts';

let dbPromise: Promise<IDBPDatabase> | null = null;

const getDb = () => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore(STORE);
      },
    });
  }
  return dbPromise;
};

/** Deployable program binaries (data URLs), keyed by project id. */
export const artifactStore = {
  async get(projectId: string): Promise<string | null> {
    return ((await (await getDb()).get(STORE, projectId)) as string | undefined) ?? null;
  },
  async put(projectId: string, binary: string): Promise<void> {
    await (await getDb()).put(STORE, binary, projectId);
  },
  async delete(projectId: string): Promise<void> {
    await (await getDb()).delete(STORE, projectId);
  },
};
