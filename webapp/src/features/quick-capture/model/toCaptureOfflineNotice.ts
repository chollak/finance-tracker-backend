export interface CaptureOfflineNotice {
  title: string;
  description: string;
}

/**
 * Quick capture is a server round trip — `POST /api/quick-capture` parses and writes the row.
 * There is no offline queue in this feature, so with no network the honest thing is to say the
 * send will not happen and that the typed text is kept, not to accept a tap and imply it was
 * stored somewhere.
 */
export function toCaptureOfflineNotice(isOnline: boolean): CaptureOfflineNotice | null {
  if (isOnline) {
    return null;
  }

  return {
    title: 'Нет сети',
    description:
      'Быстрая запись сохраняет операцию на сервере, поэтому сейчас отправить не получится. Текст останется в поле — отправьте его, когда связь вернётся.',
  };
}

/**
 * Reads the browser's online flag, treating anything other than an explicit `false` as online.
 *
 * `navigator.onLine === false` is trustworthy — the browser knows it has no route out. `true` is
 * not (it only means an interface is up), and a missing `navigator` says nothing at all. Since
 * being wrong here blocks the submit button, only the trustworthy signal is allowed to do that.
 */
export function readOnlineStatus(nav: { onLine?: boolean } | undefined | null): boolean {
  return nav?.onLine !== false;
}
