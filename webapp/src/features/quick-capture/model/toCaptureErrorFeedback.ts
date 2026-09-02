import type { CaptureFeedbackTone } from './toCaptureFeedback';

export interface CaptureErrorFeedback {
  tone: CaptureFeedbackTone;
  title: string;
  description?: string;
  /** True when the user has to change something (text/auth) rather than just retry. */
  actionable: boolean;
}

/**
 * Turns whatever `useQuickCapture()` rejects with into honest UI wording.
 *
 * Two error shapes reach this: real `Error` subclasses thrown before the request
 * (`GuestAccessError`, `CaptureTextError`), and the plain `ApiError` objects `apiClient`
 * throws (`{ message, statusCode }` — not `Error` instances), so nothing here may assume
 * `instanceof Error`.
 *
 * Nothing is ever reported as saved: a failed capture wrote nothing.
 */
export function toCaptureErrorFeedback(error: unknown): CaptureErrorFeedback {
  const name = errorName(error);

  if (name === 'GuestAccessError') {
    return {
      tone: 'info',
      title: 'В гостевом режиме недоступно',
      description:
        'Быстрая запись текстом сохраняет операции на сервере, а гостевые данные лежат только в этом браузере. Войдите через Telegram, напишите боту или добавьте операцию вручную.',
      actionable: true,
    };
  }

  if (name === 'CaptureTextError') {
    return {
      tone: 'warning',
      title: errorMessage(error) ?? 'Не удалось разобрать текст',
      actionable: true,
    };
  }

  switch (statusCode(error)) {
    case 0:
      return {
        tone: 'warning',
        title: 'Нет связи с сервером',
        description: 'Проверьте интернет и попробуйте ещё раз — операция не сохранена.',
        actionable: false,
      };
    case 401:
      return {
        tone: 'warning',
        title: 'Нужна авторизация',
        description: 'Откройте приложение из Telegram, чтобы записывать операции текстом.',
        actionable: true,
      };
    case 429:
      return {
        tone: 'warning',
        // The AI limit is per-IP and shared with /api/voice/* (docs/QUICK_CAPTURE_API.md).
        title: 'Слишком много запросов',
        description: 'Лимит распознавания исчерпан. Попробуйте через несколько минут.',
        actionable: false,
      };
    default:
      return {
        tone: 'warning',
        title: 'Не удалось записать',
        description: errorMessage(error) ?? 'Попробуйте ещё раз — операция не сохранена.',
        actionable: false,
      };
  }
}

function errorName(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const { name } = error as { name?: unknown };
  return typeof name === 'string' ? name : undefined;
}

function errorMessage(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const { message } = error as { message?: unknown };
  return typeof message === 'string' && message.trim().length > 0 ? message : undefined;
}

function statusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const { statusCode: code } = error as { statusCode?: unknown };
  return typeof code === 'number' ? code : undefined;
}
