import { useRef, useState } from 'react';
import type { Category, CategoryType } from '@/entities/category';
import type { ApiError } from '@/shared/api';
import { pastelBgClass } from '@/shared/lib/pastel/categoryColors';
import { showUndoToast } from '@/shared/lib/undo';
import { cn } from '@/shared/lib/utils';
import { Button, CategoryDot, Sheet } from '@/shared/ui/pastel';
import {
  addedToast,
  addFailedText,
  addPayload,
  CATEGORY_NAME_MAX,
  COLOR_OPTIONS,
  draftOf,
  editFormView,
  editOutcome,
  HIDDEN_NOTE,
  hideOutcome,
  NEW_DRAFT,
  newFormView,
  showOutcome,
  type CategoryDraft,
  type CategoryRowView,
  type MonthCounts,
} from '../model/categoriesScreen';
import { useCategoryWrites } from './useCategoryWrites';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink';
const NOTE = 'mx-1 shrink-0 text-[13px] font-semibold leading-[1.45] text-ink-muted';

/** «Название»: a pill on `sheet-card` with the label above it, up to 24 characters (CategoryEditor.md). */
function NameField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex shrink-0 flex-col gap-1.5">
      <span className="px-1 text-[13px] font-bold text-ink-muted">Название</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={CATEGORY_NAME_MAX}
        placeholder="Например, Спорт"
        enterKeyHint="done"
        className="h-control rounded-pill bg-sheet-card px-4 text-[16px] font-semibold text-ink outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-ink"
      />
    </label>
  );
}

/**
 * «Цвет кружка»: the 8 pastel colours as 48px circles with the name's first letter in `pastel-ink`, 4×2. The chosen one
 * has a ring: a 3px gap of the card, then 2px of `ink` (CategoryEditor.md).
 */
function ColorChoice({ value, letter, onChange }: { value: CategoryDraft['color']; letter: string; onChange: (color: CategoryDraft['color']) => void }) {
  return (
    <div className="flex shrink-0 flex-col gap-2 rounded-card bg-sheet-card px-4 pb-4 pt-3">
      <span id="category-color-label" className="text-[13px] font-bold text-ink-muted">
        Цвет кружка
      </span>
      <div role="radiogroup" aria-labelledby="category-color-label" className="grid grid-cols-4 justify-items-center gap-3">
        {COLOR_OPTIONS.map((option) => {
          const checked = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={option.label}
              onClick={() => onChange(option.value)}
              className={cn(
                'flex size-12 items-center justify-center rounded-pill text-[16px] font-extrabold text-pastel-ink',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-[3px] focus-visible:ring-offset-sheet-card',
                pastelBgClass[option.value],
                checked && 'ring-2 ring-ink ring-offset-[3px] ring-offset-sheet-card'
              )}
            >
              {letter}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor">
      <path
        d="M3 3l14 14M8.2 5.2A8 8 0 0 1 10 5c4.2 0 7 5 7 5a13 13 0 0 1-2.3 2.8M12 14.6a6.7 6.7 0 0 1-2 .4c-4.2 0-7-5-7-5a13 13 0 0 1 2.6-3.1M8.6 8.6a2 2 0 0 0 2.8 2.8"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * «Категория «Кафе»» (board «Категория «Кафе»», CategoryEditor.md): the name, the colour, «Готово» and «Скрыть
 * категорию». The edit is applied whenever the sheet closes — «Готово», «Закрыть», the scrim, Esc or a drag — with
 * «Категория изменена» and «Отменить»; an empty or taken name saves nothing and the toast says why. «Другое» is not
 * hidden: in place of the button it says why. Mounted for one opening (the page keys it).
 */
export function EditCategorySheet({
  category,
  categories,
  counts,
  onClose,
}: {
  category: Category;
  categories: readonly Category[];
  counts: MonthCounts | null;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<CategoryDraft>(() => draftOf(category));
  const writes = useCategoryWrites();
  const finished = useRef(false);
  const view = editFormView(category, draft, categories, counts);

  const finish = (how: 'close' | 'hide') => {
    if (finished.current) return;
    finished.current = true;
    onClose();
    if (how === 'hide') {
      const write = hideOutcome(category, draft, categories);
      void writes.apply(category.id, write, write.patch.name ?? category.name);
      return;
    }
    const outcome = editOutcome(category, draft, categories);
    if (outcome.kind === 'refused') showUndoToast({ kind: 'info', ...outcome.toast });
    if (outcome.kind === 'save') void writes.apply(category.id, outcome, outcome.patch.name ?? category.name);
  };

  return (
    <Sheet open onOpenChange={(open) => !open && finish('close')} title={view.title}>
      <NameField value={draft.name} onChange={(name) => setDraft((current) => ({ ...current, name }))} />
      {view.nameNote && <p className="-mt-1 mx-1 shrink-0 text-[13px] font-bold leading-[1.45] text-ink">{view.nameNote}</p>}
      <ColorChoice value={draft.color} letter={view.letter} onChange={(color) => setDraft((current) => ({ ...current, color }))} />
      <Button inSheet onClick={() => finish('close')} disabled={!view.button.ready}>
        {view.button.label}
      </Button>
      {view.canHide && (
        <div className="flex shrink-0 flex-col gap-1.5">
          <button
            type="button"
            onClick={() => finish('hide')}
            className={cn('flex h-control items-center justify-center gap-2 rounded-pill bg-sheet-card text-[15px] font-extrabold text-ink', FOCUS)}
          >
            <EyeOffIcon />
            Скрыть категорию
          </button>
          <p className={NOTE}>{view.hideNote}</p>
        </div>
      )}
      {view.otherNote && <p className={NOTE}>{view.otherNote}</p>}
    </Sheet>
  );
}

/**
 * «Новая категория расхода» (board «Новая категория»): the same form, but only its button adds — closing the sheet adds
 * nothing. The button says what is missing: «Введите название», «Такая категория уже есть», «Такая есть в скрытых —
 * верните её». The new one stands before «Другое», with «Категория добавлена» and «Отменить». A failed add keeps the
 * sheet open with what was typed and says why inside it (a toast would be hidden behind the sheet).
 */
export function NewCategorySheet({ type, categories, onClose }: { type: CategoryType; categories: readonly Category[]; onClose: () => void }) {
  const [draft, setDraft] = useState<CategoryDraft>(NEW_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const writes = useCategoryWrites();
  const view = newFormView(type, draft, categories);

  const add = async () => {
    const payload = addPayload(type, draft, categories);
    if (!payload || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await writes.add(payload);
      onClose();
      showUndoToast({ kind: 'saved', ...addedToast(created.name), undo: () => writes.remove(created.id) });
    } catch (failure) {
      setBusy(false);
      setError(addFailedText(failure as Partial<ApiError>));
    }
  };

  const edit = (change: Partial<CategoryDraft>) => {
    setError(null);
    setDraft((current) => ({ ...current, ...change }));
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()} title={view.title}>
      <NameField value={draft.name} onChange={(name) => edit({ name })} />
      <ColorChoice value={draft.color} letter={view.letter} onChange={(color) => edit({ color })} />
      {error && (
        <p role="alert" className="mx-1 shrink-0 text-[13px] font-semibold leading-[1.45] text-ink">
          {error}
        </p>
      )}
      <Button inSheet onClick={() => void add()} disabled={!view.button.ready || busy} aria-busy={busy || undefined}>
        {view.button.label}
      </Button>
    </Sheet>
  );
}

/**
 * «Скрытые категории» (board «Скрытые категории»): each hidden category with its records this month and «Показать». It
 * comes back into the choice with «Категория снова в выборе» and «Отменить»; once none is left the sheet closes.
 */
export function HiddenCategoriesSheet({
  rows,
  categories,
  onClose,
}: {
  rows: readonly CategoryRowView[];
  categories: readonly Category[];
  onClose: () => void;
}) {
  const writes = useCategoryWrites();

  const show = (row: CategoryRowView) => {
    const category = categories.find((item) => item.id === row.id);
    if (!category) return;
    if (rows.length <= 1) onClose();
    void writes.apply(category.id, showOutcome(category), category.name);
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()} title="Скрытые категории">
      <ul className="shrink-0 rounded-card bg-sheet-card px-4 [&>*+*]:border-t [&>*+*]:border-line">
        {rows.map((row) => (
          <li key={row.id} className="flex min-h-row items-center gap-3">
            <CategoryDot name={row.name} color={row.color} className="size-9 text-[14px]" />
            <span className="flex min-w-0 flex-1 flex-col gap-px">
              <span className="truncate text-[15px] font-bold text-ink">{row.name}</span>
              {row.caption && <span className="type-label text-ink-muted">{row.caption}</span>}
            </span>
            <button
              type="button"
              onClick={() => show(row)}
              aria-label={`Показать категорию «${row.name}»`}
              className={cn('h-touch shrink-0 rounded-pill bg-sheet-track px-4 text-[14px] font-extrabold text-ink', FOCUS)}
            >
              Показать
            </button>
          </li>
        ))}
      </ul>
      <p className={NOTE}>{HIDDEN_NOTE}</p>
    </Sheet>
  );
}
