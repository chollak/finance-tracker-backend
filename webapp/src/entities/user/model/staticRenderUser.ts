import { useUserStore, type UserType } from './store';

/**
 * For tests that render to static markup (there is no DOM in the webapp's tests). A server render reads the
 * store's server snapshot, which is its initial state — not what `setState` put in it — so a screen rendered
 * that way always sees nobody signed in, and every read that needs the user stays off. This puts the user
 * into the initial state; the returned function takes them out again.
 */
export function signInForStaticRender(user: { userId: string; userType: Exclude<UserType, null> }): () => void {
  const initial = useUserStore.getInitialState();
  const before = { ...initial };
  Object.assign(initial, {
    userId: user.userId,
    userType: user.userType,
    telegramId: user.userType === 'telegram' ? user.userId : null,
    userName: null,
  });
  return () => {
    Object.assign(initial, before);
  };
}
