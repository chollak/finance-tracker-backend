import { useMemo, useState } from 'react';
import { useCreateTransaction, useCaptureText, useTransactions } from '../api/transactions';
import { suggestFromHistory, type Suggestion } from '../lib/suggestions';
import { todayUtc } from '../lib/dates';
import { formatAmount } from '../lib/money';
import { categoryName } from '../lib/categories';
import { hapticNotification, hapticSelection } from '../lib/haptic';
import { FormGroup, FormRow, FormLabel } from '../components/FormGroup';
import { CategoryPicker } from '../components/CategoryPicker';
import { SheetHeader } from '../components/SheetHeader';
import { CategoryIcon } from '../components/CategoryIcon';
import type { ApiError } from '../api/client';

type Mode = 'form' | 'quick';

/**
 * Добавление. Форма — основной способ, быстрая строка рядом.
 *
 * Это пересмотр первоначального решения: спека предписывала только одно
 * текстовое поле. Цена пересмотра записана там же — два независимых пути
 * создания вместо одного. Смягчение в том, что оба сходятся
 * в CreateTransactionUseCase, где стоит нормализация даты и семантического типа.
 */
export function Add({
  telegramId,
  userName,
  onDone,
  onCancel,
}: {
  telegramId: string;
  userName: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<Mode>('form');

  return (
    <div className="flex min-h-full flex-col pt-13">
      <div className="flex justify-center px-4 pb-3">
        <div className="flex gap-1 rounded-full bg-fill p-1">
          <ModeTab active={mode === 'form'} onClick={() => setMode('form')}>
            Форма
          </ModeTab>
          <ModeTab active={mode === 'quick'} onClick={() => setMode('quick')}>
            Одной строкой
          </ModeTab>
        </div>
      </div>

      {mode === 'form' ? (
        <ManualForm telegramId={telegramId} onDone={onDone} onCancel={onCancel} />
      ) : (
        <QuickLine
          telegramId={telegramId}
          userName={userName}
          onDone={onDone}
          onCancel={onCancel}
        />
      )}
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        hapticSelection();
        onClick();
      }}
      className={`min-h-[38px] rounded-full px-4 text-[14px] ${
        active ? 'bg-surface font-bold' : 'text-muted'
      }`}
    >
      {children}
    </button>
  );
}

function ManualForm({
  telegramId,
  onDone,
  onCancel,
}: {
  telegramId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('other');
  const [date] = useState(todayUtc);
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: history } = useTransactions(telegramId);
  const create = useCreateTransaction(telegramId);

  const suggestions = useMemo(
    () => suggestFromHistory(history ?? [], description),
    [history, description]
  );

  const amountValue = Number(amount.replace(/\D/g, ''));
  const canSubmit = amountValue > 0 && description.trim().length > 0;

  function applySuggestion(s: Suggestion) {
    hapticSelection();
    setDescription(s.description);
    setAmount(String(s.amount));
    setCategory(s.category);
  }

  function submit() {
    if (!canSubmit) return;
    create.mutate(
      { description: description.trim(), amount: amountValue, category, type: 'expense', date },
      {
        onSuccess: () => {
          hapticNotification('success');
          onDone();
        },
        onError: () => hapticNotification('error'),
      }
    );
  }

  return (
    <>
      <SheetHeader
        title="Новая трата"
        onCancel={onCancel}
        onSubmit={submit}
        submitDisabled={!canSubmit}
        busy={create.isPending}
      />

      <div className="flex flex-col gap-3.5 px-4 pt-2">
        <FormGroup>
          {[
            <FormRow key="d">
              <input
                autoFocus
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Описание"
                className="w-full bg-transparent text-[16px] tracking-[-0.01em] outline-none placeholder:text-faint"
              />
            </FormRow>,
            <FormRow key="a">
              <FormLabel>Сумма</FormLabel>
              <input
                value={amount ? formatAmount(amountValue) : ''}
                onChange={(e) => setAmount(e.target.value)}
                // Клавиатура должна быть цифровой: буквы здесь не нужны,
                // а переключать раскладку на каждую трату — трение.
                inputMode="numeric"
                placeholder="0"
                className="num w-full bg-transparent text-right text-[16px] font-bold tracking-[-0.015em] outline-none placeholder:font-normal placeholder:text-faint"
              />
              <div className="shrink-0 text-[14px] text-muted">сум</div>
            </FormRow>,
            <button
              key="c"
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              className="flex min-h-[58px] w-full items-center gap-3 px-[18px] text-left"
            >
              <FormLabel>Категория</FormLabel>
              <div className="grow" />
              <div className="text-[16px] text-muted">{categoryName(category)}</div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-faint">
                <path d="M8 9l4-4 4 4" />
                <path d="M16 15l-4 4-4-4" />
              </svg>
            </button>,
            pickerOpen ? <CategoryPicker key="p" value={category} onChange={setCategory} /> : null,
            <FormRow key="dt">
              <FormLabel>Дата</FormLabel>
              <div className="grow" />
              <div className="rounded-full bg-fill px-3 py-1.5 text-[15px] font-medium">
                сегодня
              </div>
            </FormRow>,
          ]}
        </FormGroup>

        {suggestions.length > 0 && (
          <div className="overflow-hidden rounded-[var(--radius-group)] bg-surface">
            {suggestions.map((s, i) => (
              <div key={s.description}>
                {i > 0 && <div className="ml-[54px] h-px bg-line" />}
                <button
                  type="button"
                  onClick={() => applySuggestion(s)}
                  className="flex min-h-[52px] w-full items-center gap-3 px-[18px] text-left active:opacity-60"
                >
                  <div className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] bg-fill">
                    <CategoryIcon category={s.category} size={17} />
                  </div>
                  <div className="flex min-w-0 grow flex-col">
                    <div className="truncate text-[15px] font-semibold">{s.description}</div>
                    <div className="truncate text-[12.5px] text-faint">
                      {categoryName(s.category)}
                      {s.count > 1 ? ` · ${s.count} раза` : ''}
                    </div>
                  </div>
                  <div className="num shrink-0 text-[15px] font-bold">{formatAmount(s.amount)}</div>
                </button>
              </div>
            ))}
          </div>
        )}

        {create.isError && <Failure error={create.error as unknown as ApiError} />}
      </div>
    </>
  );
}

function QuickLine({
  telegramId,
  userName,
  onDone,
  onCancel,
}: {
  telegramId: string;
  userName: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const [unparsed, setUnparsed] = useState(false);
  const capture = useCaptureText(telegramId, userName);

  function submit() {
    if (!text.trim()) return;
    setUnparsed(false);

    capture.mutate(text.trim(), {
      onSuccess: (result) => {
        // Частичный успех по конструкции: HTTP 200 не означает, что запись
        // создана. Упавшая при создании молча не попадает в массив.
        if (result.transactions.length === 0 && result.debts.length === 0) {
          hapticNotification('warning');
          setUnparsed(true);
          return;
        }
        hapticNotification('success');
        onDone();
      },
      onError: () => hapticNotification('error'),
    });
  }

  return (
    <>
      <SheetHeader
        title="Одной строкой"
        onCancel={onCancel}
        onSubmit={submit}
        submitLabel="Записать"
        submitDisabled={!text.trim()}
        busy={capture.isPending}
      />

      <div className="flex flex-col gap-3.5 px-4 pt-2">
        <div className="rounded-[var(--radius-card)] bg-surface p-5">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="такси до аэропорта 45 тысяч"
            className="w-full resize-none bg-transparent text-[21px] font-medium leading-[1.38] tracking-[-0.015em] outline-none placeholder:text-faint"
          />
        </div>

        <div className="px-1 text-[12.5px] leading-[1.5] text-faint">
          кофе 25 000 · продукты 200 тысяч · зарплата 12 млн
        </div>

        {unparsed && (
          <div className="rounded-[var(--radius-group)] bg-surface px-4 py-3.5 text-[13.5px] leading-[1.5] text-muted">
            Не удалось разобрать фразу. Попробуйте иначе или заполните форму.
          </div>
        )}

        {capture.isError && <Failure error={capture.error as unknown as ApiError} />}
      </div>
    </>
  );
}

/** Код важнее текста: протухший initData и упёршийся лимит лечатся по-разному. */
function Failure({ error }: { error: ApiError }) {
  const message =
    error.code === 'AI_RATE_LIMIT_EXCEEDED' || error.statusCode === 429
      ? 'Слишком много распознаваний. Лимит считается на всю сеть, попробуйте через несколько минут.'
      : error.code === 'INVALID_AUTH' || error.statusCode === 401
        ? 'Сессия истекла. Закройте приложение и откройте заново.'
        : error.statusCode === 0
          ? 'Нет связи с сервером.'
          : error.message;

  return (
    <div className="rounded-[var(--radius-group)] bg-surface px-4 py-3.5 text-[13.5px] leading-[1.5] text-danger">
      {message}
    </div>
  );
}
