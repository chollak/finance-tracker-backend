/**
 * The client's own id for a record it is sending (FT-106): the offline queue repeats a request until it
 * gets an answer, and a repeat must not create a second record. Unique per user.
 *
 * Letters, digits and «-», up to 64 — a UUID fits. «:» is not allowed: it separates the records of one
 * quick capture («<clientId>», «<clientId>:1», «<clientId>:2»).
 */
const CLIENT_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

export function isClientId(value: unknown): value is string {
  return typeof value === 'string' && CLIENT_ID_PATTERN.test(value);
}

/** The client id of the n-th record of one capture; the first keeps the client's id as is. */
export function itemClientId(clientId: string, index: number): string {
  return index === 0 ? clientId : `${clientId}:${index}`;
}

/** A stored client id: the client's own, or one of a capture's further records («<id>:2»). */
export function isStoredClientId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9-]{1,64}(?::\d{1,3})?$/.test(value);
}
