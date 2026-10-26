/**
 * The short notices of the composer and the review (FT-114), shown as an info toast (Toast.md: two lines,
 * the second cut with an ellipsis): what went wrong and what to do. Nothing here claims a record was saved.
 */
export interface CaptureNotice {
  title: string;
  detail: string;
}

export const NOT_UNDERSTOOD: CaptureNotice = { title: 'Не понял, что записать', detail: 'Напишите, что и сколько: «такси 18к»' };

/** Until FT-117 brings voice into the mini app: where it works today. */
export const VOICE_NOT_YET: CaptureNotice = { title: 'Голос здесь — скоро', detail: 'Пока скажите боту в Telegram или напишите текстом' };

/** Until FT-135 brings receipts: there is no receipt capture anywhere yet. */
export const RECEIPT_NOT_YET: CaptureNotice = { title: 'Фото чека — скоро', detail: 'Пока напишите текстом: «кофе 25к»' };

export const CHANGE_FAILED: CaptureNotice = { title: 'Не получилось изменить', detail: 'Проверьте связь и попробуйте ещё раз' };

export const CANCEL_FAILED: CaptureNotice = { title: 'Не получилось отменить', detail: 'Проверьте связь и нажмите ещё раз' };

export const WRITE_FAILED: CaptureNotice = { title: 'Не получилось записать', detail: 'Проверьте связь и нажмите ещё раз' };

/** Without a connection a phrase is read on the device, but only a simple one (FT-129, board «Главная без связи»). */
export const OFFLINE_NOT_UNDERSTOOD: CaptureNotice = {
  title: 'Без связи понимаю только «что и сколько»',
  detail: 'Например: «такси 18к» или «обед 45 000, кофе 25к»',
};

/** «55$» without a dollar account: the server would refuse it, so the device does not write it (FT-129). */
export const NO_DOLLAR_ACCOUNT: CaptureNotice = {
  title: 'Нет долларового счёта',
  detail: 'Запишите в сумах или добавьте счёт «Доллары»',
};

function field(error: unknown, key: 'name' | 'message' | 'statusCode'): unknown {
  return typeof error === 'object' && error !== null ? (error as Record<string, unknown>)[key] : undefined;
}

/**
 * A send that failed. `apiClient` rejects with plain `{ message, statusCode }` objects, not `Error`s, so
 * nothing here assumes `instanceof Error`. The text stays in the field in every case.
 */
export function sendFailedNotice(error: unknown): CaptureNotice {
  if (field(error, 'name') === 'CaptureTextError') {
    const message = field(error, 'message');
    return { title: typeof message === 'string' ? message : 'Не удалось разобрать текст', detail: 'Исправьте текст и отправьте снова' };
  }
  switch (field(error, 'statusCode')) {
    case 0:
      return { title: 'Нет связи с сервером', detail: 'Текст остался в поле — отправьте, когда связь вернётся' };
    case 401:
      // In a browser the session is over: the login screen opens (FT-128)
      return { title: 'Нужно войти снова', detail: 'Вход — через Telegram, текст останется в поле' };
    case 429:
      // The AI limit is per-IP and shared with /api/voice/* (docs/QUICK_CAPTURE_API.md)
      return { title: 'Слишком много запросов', detail: 'Попробуйте через несколько минут' };
    default:
      return { title: 'Не удалось записать', detail: 'Текст остался в поле — попробуйте ещё раз' };
  }
}
