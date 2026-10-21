import { create } from 'zustand';
import { offlineStorage, type OutboxRow } from './storage';

/**
 * The outbox (FT-129): what was written without a connection, as the screens see it — at once, without waiting for
 * IndexedDB — and as the device keeps it for the next start. What is in it and how it is sent belongs to its writer
 * (the records: `entities/transaction`).
 */
interface OutboxState {
  entries: OutboxRow[];
}

export const useOutboxStore = create<OutboxState>()(() => ({ entries: [] }));

const byAge = (a: OutboxRow, b: OutboxRow) => a.createdAt - b.createdAt;

/** What waits for this user, oldest first. */
export function outboxOf(userId: string, entries: readonly OutboxRow[] = useOutboxStore.getState().entries): OutboxRow[] {
  return entries.filter((row) => row.userId === userId).sort(byAge);
}

/** Adds what the device kept from an earlier start (once each). */
export async function loadOutbox(userId: string): Promise<void> {
  const kept = await offlineStorage().listOutbox(userId);
  useOutboxStore.setState((state) => {
    const known = new Set(state.entries.map((row) => row.clientId));
    const fresh = kept.filter((row) => !known.has(row.clientId));
    return fresh.length ? { entries: [...state.entries, ...fresh] } : state;
  });
}

/** Shown at once; kept on the device when the promise resolves. */
export function addToOutbox(rows: OutboxRow[]): Promise<void> {
  useOutboxStore.setState((state) => ({ entries: [...state.entries, ...rows] }));
  return offlineStorage().putOutbox(rows);
}

/** Sent or taken back: gone from the screens at once and from the device. */
export function removeFromOutbox(clientIds: readonly string[]): Promise<void> {
  const gone = new Set(clientIds);
  useOutboxStore.setState((state) => ({ entries: state.entries.filter((row) => !gone.has(row.clientId)) }));
  return offlineStorage().deleteOutbox([...gone]);
}
