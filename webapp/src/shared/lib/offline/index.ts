// The offline mode (FT-129): whether there is a connection, the outbox of what was written without one, and the
// reads kept on the device so Home and the accounts open without it
export {
  useConnectivityStore,
  offlineOf,
  isOffline,
  useIsOffline,
  connectionLost,
  connectionReached,
  watchBrowserConnection,
  isNoConnectionError,
  type ConnectivityState,
} from './connectivity';
export {
  offlineStorage,
  setOfflineStorage,
  memoryOfflineStorage,
  type OfflineStorage,
  type OutboxRow,
  type SavedReadRow,
} from './storage';
export { useOutboxStore, outboxOf, loadOutbox, addToOutbox, removeFromOutbox } from './outbox';
export { persistReads, restoreSavedReads, forgetSavedReads, workOffline, type SavedReadPolicy } from './savedReads';
