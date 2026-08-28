import { env } from '../config/env';

/**
 * Ошибка запроса в форме, пригодной для показа человеку и для ветвления по коду.
 *
 * `code` обязателен по делу, а не для полноты: на нём строится обработка
 * протухшего initData (401 INVALID_AUTH) и упёршегося лимита распознаваний
 * (429 AI_RATE_LIMIT_EXCEEDED). Оба случая встречаются регулярно — initData
 * живёт час, а лимит считается по IP, не по пользователю.
 */
export interface ApiError {
  message: string;
  code?: string;
  statusCode: number;
}

/** Конверт успеха, одинаковый на всех живых маршрутах. */
interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp?: string;
}

function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'statusCode' in value;
}

/**
 * Сервер отвечает ошибкой в двух формах, и обе живые:
 *
 *   контроллеры  { success: false, error: { code, message } }   error — объект
 *   middleware   { success: false, error: 'строка', code: '…' }  error — строка
 *
 * Старый клиент читал `errorData.message` — такого поля нет ни в одной из них,
 * поэтому любая ошибка превращалась в «Request failed», а код терялся.
 */
function toApiError(body: unknown, statusCode: number): ApiError {
  const shape = (body ?? {}) as { error?: unknown; code?: unknown };

  if (typeof shape.error === 'string') {
    return {
      message: shape.error,
      code: typeof shape.code === 'string' ? shape.code : undefined,
      statusCode,
    };
  }

  if (typeof shape.error === 'object' && shape.error !== null) {
    const nested = shape.error as { message?: unknown; code?: unknown };
    return {
      message: typeof nested.message === 'string' ? nested.message : 'Не удалось выполнить запрос',
      code: typeof nested.code === 'string' ? nested.code : undefined,
      statusCode,
    };
  }

  // Пустое или неразобранное тело: сообщение всё равно обязано быть строкой,
  // иначе наружу утечёт undefined и человек увидит пустое место.
  return { message: 'Не удалось выполнить запрос', statusCode };
}

function authHeaders(): Record<string, string> {
  const initData = window.Telegram?.WebApp?.initData;
  if (initData) return { Authorization: `tma ${initData}` };

  // Только для отладки в браузере: на бэкенде обход закрыт в production.
  if (env.isDevelopment && env.devUserId) return { 'X-Dev-User-Id': env.devUserId };

  return {};
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${env.apiBaseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        ...options.headers,
      },
    });
  } catch {
    // Сеть не ответила вовсе. Отличать это от ответа сервера важно:
    // «нет связи» и «сервер отказал» лечатся по-разному.
    throw { message: 'Нет связи с сервером', code: 'NETWORK_ERROR', statusCode: 0 } as ApiError;
  }

  const body = await response.json().catch(() => undefined);

  if (!response.ok) {
    throw toApiError(body, response.status);
  }

  // Наружу отдаётся полезная нагрузка, а не конверт: вызывающему нет дела
  // до success и timestamp.
  return (body as ApiEnvelope<T>)?.data as T;
}

export const apiClient = {
  get: <T>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),

  post: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),

  put: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) }),

  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
};

export { isApiError };
