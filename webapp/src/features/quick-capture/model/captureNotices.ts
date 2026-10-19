/**
 * The short notices of the composer and the review (FT-114), shown as an info toast (Toast.md: two lines,
 * the second cut with an ellipsis): what went wrong and what to do. Nothing here claims a record was saved.
 */
export interface CaptureNotice {
  title: string;
  detail: string;
}

export const NOT_UNDERSTOOD: CaptureNotice = { title: 'Не понял, что записать', detail: 'Напишите, что и сколько: «такси 18к»' };

export const GUEST_TEXT: CaptureNotice = {
  title: 'Запись текстом — после входа',
  detail: 'Войдите через Telegram или нажмите «Ввести вручную»',
};

/** Until FT-117 brings voice into the mini app: where it works today. */
export const VOICE_NOT_YET: CaptureNotice = { title: 'Голос здесь — скоро', detail: 'Пока скажите боту в Telegram или напишите текстом' };

/** Until FT-135 brings receipts: there is no receipt capture anywhere yet. */
export const RECEIPT_NOT_YET: CaptureNotice = { title: 'Фото чека — скоро', detail: 'Пока напишите текстом: «кофе 25к»' };

export const CHANGE_FAILED: CaptureNotice = { title: 'Не получилось изменить', detail: 'Проверьте связь и попробуйте ещё раз' };

export const CANCEL_FAILED: CaptureNotice = { title: 'Не получилось отменить', detail: 'Проверьте связь и нажмите ещё раз' };

export const WRITE_FAILED: CaptureNotice = { title: 'Не получилось записать', detail: 'Проверьте связь и нажмите ещё раз' };

function field(error: unknown, key: 'name' | 'message' | 'statusCode'): unknown {
  return typeof error === 'object' && error !== null ? (error as Record<string, unknown>)[key] : undefined;
}

/**
 * A send that failed. `apiClient` rejects with plain `{ message, statusCode }` objects, not `Error`s, so
 * nothing here assumes `instanceof Error`. The text stays in the field in every case.
 */
export function sendFailedNotice(error: unknown): CaptureNotice {
  if (field(error, 'name') === 'GuestAccessError') return GUEST_TEXT;
  if (field(error, 'name') === 'CaptureTextError') {
    const message = field(error, 'message');
    return { title: typeof message === 'string' ? message : 'Не удалось разобрать текст', detail: 'Исправьте текст и отправьте снова' };
  }
  switch (field(error, 'statusCode')) {
    case 0:
      return { title: 'Нет связи с сервером', detail: 'Текст остался в поле — отправьте, когда связь вернётся' };
    case 401:
      return { title: 'Нужна авторизация', detail: 'Откройте приложение из Telegram' };
    case 429:
      // The AI limit is per-IP and shared with /api/voice/* (docs/QUICK_CAPTURE_API.md)
      return { title: 'Слишком много запросов', detail: 'Попробуйте через несколько минут' };
    default:
      return { title: 'Не удалось записать', detail: 'Текст остался в поле — попробуйте ещё раз' };
  }
}
