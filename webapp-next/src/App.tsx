import { useEffect, useState } from 'react';
import { openTelegramSession, applyTelegramTheme } from './lib/telegram';
import { Home } from './screens/Home';
import { Add } from './screens/Add';

/**
 * Роутера намеренно нет: экранов немного, а «назад» всё равно даёт Telegram
 * своей нативной кнопкой, которой управляют руками. Роутер добавится, когда
 * появится боль от его отсутствия.
 *
 * ПОРЯДОК ОБРАЩЕНИЙ К API. Первым обязан идти список транзакций: он резолвит
 * telegramId через getOrCreateUser и тем самым создаёт пользователя в базе.
 * Правка и удаление ходят через GetUserUseCase, который не создаёт, и вернут
 * 403 для пользователя, которого ещё нет.
 */
export function App() {
  // ready() и expand() идемпотентны, повторный вызов в StrictMode безвреден.
  const [session] = useState(() => openTelegramSession());
  const [screen, setScreen] = useState<'home' | 'add'>('home');

  useEffect(() => {
    applyTelegramTheme();
  }, []);

  if (!session) return <OutsideTelegram />;

  if (screen === 'add') {
    return (
      <Add
        telegramId={session.telegramId}
        userName={session.userName}
        onDone={() => setScreen('home')}
        onCancel={() => setScreen('home')}
      />
    );
  }

  return (
    <Home
      telegramId={session.telegramId}
      onAdd={() => setScreen('add')}
      onSelect={() => {
        // Экран правки — задача 9.
      }}
    />
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
