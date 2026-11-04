/**
 * Whom the admin may grant premium (#230): only a user that exists. `subscriptions.user_id` has no foreign key, so
 * without asking a UUID of no one got a subscription. Wired from the user module in `createModules()`.
 */
export interface GrantTargets {
  /** Whether a `users` row has this id. */
  exists(userId: string): Promise<boolean>;
}
