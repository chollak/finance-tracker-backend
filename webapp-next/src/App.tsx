import { useEffect, useState } from 'react';
import { openTelegramSession, applyTelegramTheme } from './lib/telegram';

/**
 * Экраны появятся в задачах 7–9. Здесь — только вход в сессию.
 *
 * Роутера намеренно нет: экранов три, а «назад» всё равно даёт Telegram
 * своей нативной кнопкой, которой управляют руками. Роутер добавится,
 * когда появится боль от его отсутствия.
 *
 * ПОРЯДОК ОБРАЩЕНИЙ К API. Первым обязан идти список транзакций: он резолвит
 * telegramId через getOrCreateUser и тем самым создаёт пользователя в базе.
 * Правка и удаление ходят через GetUserUseCase, который не создаёт, и вернут
 * 403 для пользователя, которого ещё нет. Порядок неочевидный, поэтому записан
 * здесь, а не только в плане.
 */
export function App() {
  // ready() и expand() идемпотентны, повторный вызов в StrictMode безвреден.
  const [session] = useState(() => openTelegramSession());

  useEffect(() => {
    applyTelegramTheme();
  }, []);

  if (!session) {
    return <OutsideTelegram />;
  }

  return (
    <div className="flex min-h-full flex-col gap-5 p-4 pt-14">
      <div className="rounded-[var(--radius-card)] bg-surface p-5">
        <div className="text-[13.5px] text-muted">Потрачено в августе</div>
        <div className="num mt-1 text-[40px] font-extrabold leading-[1.05] tracking-[-0.03em]">
          54 124 654
        </div>
      </div>

      <div className="rounded-[var(--radius-group)] bg-surface px-4 py-3 text-[13.5px] text-muted">
        {session.userName}, сессия открыта. Экраны — задачи 7–9.
      </div>
    </div>
  );
}

/**
 * Единственный поддерживаемый способ запуска — Telegram. Выдумывать гостя
 * и складывать его записи в браузер значило бы обещать сохранность данных,
 * которой нет: их не увидит ни бот, ни другое устройство.
 */
function OutsideTelegram() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 px-10 text-center">
      <div className="text-[17px] font-bold tracking-[-0.01em]">Откройте через Telegram</div>
      <div className="text-[14px] leading-[1.5] text-muted">
        Приложение работает внутри бота — там ваши записи и там их видно.
      </div>
    </div>
  );
}
