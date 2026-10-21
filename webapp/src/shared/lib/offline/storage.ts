import Dexie, { type Table } from 'dexie';

/**
 * What the device keeps for the offline mode (FT-129): the outbox of records written without a connection and the
 * last answers of the reads Home and the accounts need. In the browser it is IndexedDB through Dexie; without IndexedDB
 * (tests, storage blocked) it lives in memory for the session — the app still works, it just forgets on reload.
 */

/** One record waiting to be sent, with the client id (FT-106) it will be sent with. */
export interface OutboxRow<T = unknown> {
  clientId: string;
  userId: string;
  /** When it was written, ms; the outbox sends oldest first. */
  createdAt: number;
  body: T;
  /**
   * Taken back («Отменить») while it was being sent: the screens no longer show it, and it stays here until its sender
   * knows the server does not keep it — sent again with the same client id and deleted there.
   */
  cancelled?: boolean;
}

/** The last answer of a read: its TanStack key, the user it belongs to and when it was read. */
export interface SavedReadRow {
  /** The key as JSON: one row per read. */
  hash: string;
  userId: string;
  queryKey: readonly unknown[];
  data: unknown;
  /** When the server answered, ms. */
  updatedAt: number;
}

export interface OfflineStorage {
  putOutbox(rows: OutboxRow[]): Promise<void>;
  listOutbox(userId: string): Promise<OutboxRow[]>;
  deleteOutbox(clientIds: string[]): Promise<void>;
  putRead(row: SavedReadRow): Promise<void>;
  listReads(userId: string): Promise<SavedReadRow[]>;
  clearReads(): Promise<void>;
}

export function memoryOfflineStorage(): OfflineStorage {
  const outbox = new Map<string, OutboxRow>();
  const reads = new Map<string, SavedReadRow>();
  return {
    async putOutbox(rows) {
      for (const row of rows) outbox.set(row.clientId, row);
    },
    async listOutbox(userId) {
      return [...outbox.values()].filter((row) => row.userId === userId);
    },
    async deleteOutbox(clientIds) {
      for (const clientId of clientIds) outbox.delete(clientId);
    },
    async putRead(row) {
      reads.set(row.hash, row);
    },
    async listReads(userId) {
      return [...reads.values()].filter((row) => row.userId === userId);
    },
    async clearReads() {
      reads.clear();
    },
  };
}

class OfflineDatabase extends Dexie {
  outbox!: Table<OutboxRow, string>;
  reads!: Table<SavedReadRow, string>;

  constructor() {
    // Not the IndexedDB of the old guest mode (FT-128 removed it; its records stay where they were)
    super('daftar-offline');
    this.version(1).stores({ outbox: 'clientId, userId, createdAt', reads: 'hash, userId' });
  }
}

/**
 * IndexedDB, and memory beside it: a write the browser refuses (private mode, quota) is still known for the session,
 * and a read that fails answers what this session knows.
 */
function dexieOfflineStorage(): OfflineStorage {
  const db = new OfflineDatabase();
  const memory = memoryOfflineStorage();
  const attempt = async <T>(work: () => Promise<T>, fallback: () => Promise<T>): Promise<T> => {
    try {
      return await work();
    } catch {
      return fallback();
    }
  };
  return {
    async putOutbox(rows) {
      await memory.putOutbox(rows);
      await attempt(async () => void (await db.outbox.bulkPut(rows)), async () => undefined);
    },
    listOutbox: (userId) => attempt(() => db.outbox.where('userId').equals(userId).toArray(), () => memory.listOutbox(userId)),
    async deleteOutbox(clientIds) {
      await memory.deleteOutbox(clientIds);
      await attempt(() => db.outbox.bulkDelete(clientIds), async () => undefined);
    },
    async putRead(row) {
      await memory.putRead(row);
      await attempt(async () => void (await db.reads.put(row)), async () => undefined);
    },
    listReads: (userId) => attempt(() => db.reads.where('userId').equals(userId).toArray(), () => memory.listReads(userId)),
    async clearReads() {
      await memory.clearReads();
      await attempt(() => db.reads.clear(), async () => undefined);
    },
  };
}

let current: OfflineStorage | null = null;

/** The device's storage: IndexedDB in the browser, memory where there is none. */
export function offlineStorage(): OfflineStorage {
  if (!current) current = typeof indexedDB === 'undefined' ? memoryOfflineStorage() : dexieOfflineStorage();
  return current;
}

/** Tests put a fresh storage in place. */
export function setOfflineStorage(storage: OfflineStorage): void {
  current = storage;
}
