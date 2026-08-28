import type { Transaction } from '../types/transaction';
import { categoryName } from '../lib/categories';
import { formatAmount } from '../lib/money';
import { isExpense } from '../lib/semanticType';
import { CategoryIcon } from './CategoryIcon';

/**
 * Не-расходы показываются приглушённо и подписаны.
 *
 * Спрятать их нельзя: человек сложит суммы в ленте, не сойдётся с цифрой сверху
 * и решит, что приложение потеряло запись. Показать наравне тоже нельзя —
 * тогда не сойдётся по-другому.
 */
export function TransactionRow({
  transaction,
  onSelect,
}: {
  transaction: Transaction;
  onSelect?: (tx: Transaction) => void;
}) {
  const counted = isExpense(transaction);
  const muted = counted ? '' : 'text-muted';

  return (
    <button
      type="button"
      onClick={() => onSelect?.(transaction)}
      className="flex min-h-[56px] w-full items-center gap-3 text-left active:opacity-60"
    >
      <div className={`flex size-[38px] shrink-0 items-center justify-center rounded-[11px] bg-fill ${muted}`}>
        <CategoryIcon category={transaction.category} />
      </div>

      <div className="flex min-w-0 grow flex-col gap-px">
        <div className={`truncate text-[15px] font-bold tracking-[-0.01em] ${muted}`}>
          {transaction.description}
        </div>
        <div className="truncate text-[12.5px] text-faint">
          {counted ? categoryName(transaction.category) : 'Не входит в расходы'}
        </div>
      </div>

      <div
        className={`num whitespace-nowrap text-[15px] tracking-[-0.015em] ${
          counted ? 'font-bold' : 'font-medium text-muted'
        }`}
      >
        {formatAmount(transaction.amount)}
      </div>
    </button>
  );
}
