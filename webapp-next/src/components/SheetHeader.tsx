/**
 * Шапка листа: отмена слева, действие справа.
 *
 * Действие живёт здесь, а не у нижней кромки, ровно по одной причине: при вводе
 * снизу стоит клавиатура. Нативная кнопка Telegram (MainButton) от этого
 * не страдает — она вне вебвью, — но своя вёрстка страдает, и на iOS это
 * известный источник поломок.
 */
export function SheetHeader({
  title,
  onCancel,
  onSubmit,
  submitLabel = 'Готово',
  submitDisabled,
  busy,
}: {
  title: string;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  submitDisabled?: boolean;
  busy?: boolean;
}) {
  return (
    <div className="flex h-[52px] shrink-0 items-center justify-between px-[18px]">
      <button
        type="button"
        onClick={onCancel}
        className="flex h-11 min-w-11 items-center text-[16px] text-muted active:opacity-60"
      >
        Отмена
      </button>

      <div className="text-[16.5px] font-bold tracking-[-0.01em]">{title}</div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={submitDisabled || busy}
        className={`flex h-11 min-w-11 items-center justify-end text-[16px] font-bold active:opacity-60 ${
          submitDisabled || busy ? 'text-faint' : 'text-text'
        }`}
      >
        {busy ? '…' : submitLabel}
      </button>
    </div>
  );
}
