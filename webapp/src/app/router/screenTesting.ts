import { act } from 'react';
import { vi } from 'vitest';

/**
 * What the route tests share (#295): they render the app's routes in jsdom and wait for the gates and the lazy pages,
 * which take a few renders. For tests only.
 */

/** Text with every run of whitespace as one space. */
export const squash = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim() ?? '';

const screenText = () => squash(document.body.textContent);

/** Lets `ms` pass, inside act: on the fake clock when the test runs one (`vi.useFakeTimers`), otherwise for real. */
export async function wait(ms: number): Promise<void> {
  await act(async () => {
    if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(ms);
    else await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

/** Waits, up to `timeout`, for the screen to show something; a timeout says what the screen shows instead. */
export async function until(predicate: () => boolean, timeout = 4000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeout) throw new Error(`Timed out; the screen says: ${screenText().slice(0, 300)}`);
    await wait(20);
  }
}

/**
 * The app shell's ScrollRestoration scrolls the window after each navigation; jsdom cannot scroll and writes «Not
 * implemented: Window's scrollTo() method» to the test output every time. No route test checks scrolling.
 */
export function ignoreWindowScroll(): void {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
}
