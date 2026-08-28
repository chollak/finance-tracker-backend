import { useMemo } from 'react';
import { useTransactions } from '../api/transactions';
import { monthTotal, lastSevenDays, groupByDay } from '../lib/summary';
import { SummaryCard } from '../components/SummaryCard';
import { DayGroup } from '../components/DayGroup';
import { AddButton } from '../components/AddButton';
import type { Transaction } from '../types/transaction';
import type { ApiError } from '../api/client';

/** Лента режется, сводка считается по всему массиву: маршрут отдаёт всю историю. */
const FEED_LIMIT = 50;

export function Home({
  telegramId,
  onAdd,
  onSelect,
}: {
  telegramId: string;
  onAdd: () => void;
  onSelect: (tx: Transaction) => void;
}) {
  const { data, isPending, error } = useTransactions(telegramId);

  const view = useMemo(() => {
    const all = data ?? [];
    return {
      total: monthTotal(all),
      days: lastSevenDays(all),
      groups: groupByDay(all.slice(0, FEED_LIMIT)),
    };
  }, [data]);

  if (isPending) return <Skeleton />;
  if (error) return <Failure error={error as unknown as ApiError} />;

  return (
    <div className="flex min-h-full flex-col gap-[22px] px-4 pb-28 pt-13">
      <SummaryCard total={view.total} days={view.days} />

      {view.groups.length === 0 ? (
        <Empty />
      ) : (
        <div className="flex flex-col gap-4">
          {view.groups.map((group) => (
            <DayGroup key={group.date} group={group} onSelect={onSelect} />
          ))}
        </div>
      )}

      <AddButton onClick={onAdd} />
    </div>
  );
}

/** Каркас вместо крутилки: экран не прыгает, когда данные приезжают. */
function Skeleton() {
  return (
    <div className="flex min-h-full flex-col gap-[22px] px-4 pt-13">
      <div className="h-[196px] animate-pulse rounded-[var(--radius-card)] bg-surface" />
      <div className="h-[124px] animate-pulse rounded-[var(--radius-group)] bg-surface" />
    </div>
  );
}

function Empty() {
  return (
    <div className="rounded-[var(--radius-group)] bg-surface px-4 py-8 text-center">
      <div className="text-[15px] font-bold">Пока пусто</div>
      <div className="mt-1 text-[13.5px] leading-[1.5] text-muted">
        Продиктуйте трату боту или добавьте её здесь.
      </div>
    </div>
  );
}

function Failure({ error }: { error: ApiError }) {
  // Код важнее текста: протухший initData и упёршийся лимит лечатся по-разному.
  const message =
    error.code === 'INVALID_AUTH' || error.statusCode === 401
      ? 'Сессия истекла. Закройте приложение и откройте заново.'
      : error.statusCode === 0
        ? 'Нет связи с сервером.'
        : error.message;

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-2 px-10 text-center">
      <div className="text-[15px] font-bold">Не удалось загрузить</div>
      <div className="text-[13.5px] leading-[1.5] text-muted">{message}</div>
    </div>
  );
}
