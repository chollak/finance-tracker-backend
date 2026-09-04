/**
 * "Put me in the capture field" — a one-slot request passed from the global dock to whatever
 * capture surface is currently on screen.
 *
 * The dock lives in every route, the capture field only on Home, so a plain callback or a shared
 * store would mean either lifting capture state into the app shell or wiring a context through
 * pages that have nothing to do with capture. Instead the dock states an intent and the capture
 * card answers it when it exists.
 *
 * The request is *latched*, not fired-and-forgotten: pressing the dock action on `/more`
 * navigates Home first, so the capture card mounts a frame or two after the press. A plain event
 * would land before anyone listened and the press would silently do nothing. The pending flag
 * survives until a listener subscribes, and is cleared the moment it is delivered so a later
 * remount of Home does not steal focus out of nowhere.
 */

type CaptureFocusListener = () => void;

const listeners = new Set<CaptureFocusListener>();
let pending = false;

function deliver(): void {
  if (!pending || listeners.size === 0) return;

  // Cleared before notifying: a request is consumed once, even if a listener re-subscribes
  // synchronously while handling it.
  pending = false;
  for (const listener of [...listeners]) {
    listener();
  }
}

/**
 * Ask the capture surface to take focus.
 *
 * Delivered immediately when a surface is listening (dock pressed on Home), otherwise held until
 * one subscribes (dock pressed elsewhere → navigate Home → card mounts).
 */
export function requestCaptureFocus(): void {
  pending = true;
  deliver();
}

/** Subscribe a capture surface; returns the unsubscribe function. */
export function subscribeToCaptureFocus(listener: CaptureFocusListener): () => void {
  listeners.add(listener);
  // A request made before this surface existed is what the latch is for.
  deliver();

  return () => {
    listeners.delete(listener);
  };
}

/** Whether a request is waiting for a surface to mount. Test/diagnostic use. */
export function hasPendingCaptureFocus(): boolean {
  return pending;
}

/** Drop a latched request and all listeners. Test helper — no production caller. */
export function resetCaptureFocus(): void {
  pending = false;
  listeners.clear();
}
