/** How long an album is remembered: its messages come within seconds of each other. */
export const MEDIA_GROUP_TTL_MS = 2 * 60 * 1000;
/** How many albums are remembered at most: the oldest goes first. */
export const MEDIA_GROUP_MAX_SIZE = 100;

export interface RecentMediaGroupsOptions {
  ttlMs?: number;
  maxSize?: number;
  now?: () => number;
}

/**
 * The albums the bot saw lately (#279): several photos or videos sent together come as one message each, with one
 * `media_group_id`, and only the first is answered. Kept in the bot's process, small and short — not in the base: after
 * a restart an album may get its line once more, which is harmless. `isFirst` checks and remembers at once, with no
 * await in between, so the album's messages handled side by side (polling handles a batch with `Promise.all`) still
 * get one answer.
 */
export class RecentMediaGroups {
  /** Key → when it was first seen; a Map keeps insertion order, so the oldest is first. */
  private readonly seen = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly maxSize: number;
  private readonly now: () => number;

  constructor(options: RecentMediaGroupsOptions = {}) {
    this.ttlMs = options.ttlMs ?? MEDIA_GROUP_TTL_MS;
    this.maxSize = options.maxSize ?? MEDIA_GROUP_MAX_SIZE;
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    return this.seen.size;
  }

  /** True for the first message of an album within the time it is remembered; the album is remembered then. */
  isFirst(key: string): boolean {
    const now = this.now();
    this.forgetExpired(now);
    if (this.seen.has(key)) return false;

    this.seen.set(key, now);
    if (this.seen.size > this.maxSize) this.forgetOldest();
    return true;
  }

  private forgetExpired(now: number): void {
    for (const [key, seenAt] of this.seen) {
      if (now - seenAt < this.ttlMs) return;
      this.seen.delete(key);
    }
  }

  private forgetOldest(): void {
    const oldest = this.seen.keys().next();
    if (!oldest.done) this.seen.delete(oldest.value);
  }
}
