import { ROUTES } from '@/shared/lib/constants/routes';

/** The part of `window.location` the ways out use; a test passes its own. */
type Reloadable = Pick<Location, 'reload' | 'replace'>;

/*
 * The two ways out of «Экран не открылся» (#240). Both load the app again from the server rather than move inside
 * it: the usual cause is a page whose code did not load — often right after an update, when only a fresh start gets
 * the new code, and a browser keeps a failed load of a module, so moving inside the app would fail the same way. The
 * other cause, a screen that fell while drawing, starts from scratch too.
 */

/** «Обновить»: the same address, loaded again. */
export function reloadHere(location: Reloadable = window.location): void {
  location.reload();
}

/** «На главную»: Home loaded in this address's place, so «Назад» does not lead back to the screen that failed. */
export function reloadHome(location: Reloadable = window.location): void {
  location.replace(ROUTES.HOME);
}
