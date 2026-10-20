import {
  categoryInitial,
  categoryNameKey,
  cleanCategoryName,
  pickableCategories,
  type Category,
  type CategoryPatch,
  type CategoryType,
  type NewCategory,
} from '@/entities/category';
import type { ApiError } from '@/shared/api';
import { monthNameIn, monthNameLower, parseLocalDate } from '@/shared/lib/dates';
import type { PastelColor } from '@/shared/lib/pastel/categoryColors';
import { pluralRu, pluralWithCount } from '@/shared/lib/plural';

/**
 * «Категории» (FT-127, boards «Категории», «Категория «Кафе»», «Новая категория», «Скрытые категории»;
 * CategoryEditor.md, design-system «Категории»): the categories of one type with their records this month; a sheet
 * renames one, gives it one of 8 colours or hides it — applied when the sheet closes, with a toast and «Отменить»; a
 * new one is added by its button only. «Другое» is never hidden.
 */

export const TYPE_OPTIONS: ReadonlyArray<{ value: CategoryType; label: string }> = [
  { value: 'expense', label: 'Расходы' },
  { value: 'income', label: 'Доходы' },
];

/** The 8 pastel colours in the order of the board, each with its name for screen readers. */
export const COLOR_OPTIONS: ReadonlyArray<{ value: PastelColor; label: string }> = [
  { value: 'peach', label: 'Персиковый' },
  { value: 'rose', label: 'Розовый' },
  { value: 'sky', label: 'Голубой' },
  { value: 'sand', label: 'Песочный' },
  { value: 'lilac', label: 'Сиреневый' },
  { value: 'mint', label: 'Мятный' },
  { value: 'butter', label: 'Жёлтый' },
  { value: 'mist', label: 'Серый' },
];

/** The name field takes up to 24 characters (CategoryEditor.md); the server allows 40. */
export const CATEGORY_NAME_MAX = 24;

export const LIST_NOTE = 'ИИ раскладывает записи по этим категориям. Новую он начнёт предлагать по её названию — так что лучше называть просто: «Спорт», «Дети».';

export const HIDDEN_NOTE = 'Скрытых категорий нет в выборе, и ИИ их не предлагает. Старые записи с ними остаются в истории и аналитике.';

const HIDE_NOTE = 'Все записи с ней останутся в истории и аналитике. В выборе её не будет; вернуть — «Скрытые» внизу списка.';

const OTHER_NOTE = '«Другое» нельзя скрыть: сюда попадает всё, что ИИ не смог разложить.';

/**
 * Records of each category this month, as analytics counts them (the board: «из тех же данных, что аналитика») —
 * hidden categories included. `month` is 1–12.
 */
export interface MonthCounts {
  month: number;
  byCategory: ReadonlyMap<string, number>;
}

export function monthCounts(analytics: { month: string; categories: ReadonlyArray<{ categoryId: string; count: number }> } | undefined): MonthCounts | null {
  if (!analytics) return null;
  return {
    month: parseLocalDate(`${analytics.month}-01`).month,
    byCategory: new Map(analytics.categories.map((row) => [row.categoryId, row.count])),
  };
}

/** «8 записей в октябре», «В октябре не было». */
export function recordsInMonth(count: number, month: number): string {
  if (count === 0) return `В ${monthNameIn(month)} не было`;
  return `${pluralWithCount(count, 'запись', 'записи', 'записей')} в ${monthNameIn(month)}`;
}

export interface CategoryRowView {
  id: string;
  name: string;
  color: PastelColor;
  /** «10 записей в октябре»; null while the month is read. */
  caption: string | null;
  ariaLabel: string;
}

function rowOf(category: Category, counts: MonthCounts | null): CategoryRowView {
  const caption = counts ? recordsInMonth(counts.byCategory.get(category.id) ?? 0, counts.month) : null;
  return {
    id: category.id,
    name: category.name,
    color: category.color,
    caption,
    ariaLabel: `${category.name}${caption ? `, ${caption}` : ''}. Изменить`,
  };
}

/** The visible categories of a type in the order of the pickers («Другое» last) and the hidden ones apart. */
export function categoryRows(categories: readonly Category[], type: CategoryType, counts: MonthCounts | null) {
  const hidden = categories
    .filter((category) => category.type === type && category.isHidden)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru'));
  return {
    listLabel: type === 'expense' ? 'Категории расходов' : 'Категории доходов',
    visible: pickableCategories(categories, type).map((category) => rowOf(category, counts)),
    hidden: hidden.map((category) => rowOf(category, counts)),
    hiddenLabel: hidden.length > 0 ? `Скрытые · ${hidden.length}` : null,
  };
}

export interface CategoryDraft {
  name: string;
  color: PastelColor;
}

export const NEW_DRAFT: CategoryDraft = { name: '', color: 'mist' };

export function draftOf(category: Category): CategoryDraft {
  return { name: category.name, color: category.color };
}

/** Another category of the type with this name, hidden ones too; `except` — the one being edited. */
function clashOf(categories: readonly Category[], type: CategoryType, name: string, except?: Category): Category | undefined {
  const key = categoryNameKey(name);
  return categories.find((category) => category.type === type && category.id !== except?.id && categoryNameKey(category.name) === key);
}

type NameCheck = { kind: 'empty' } | { kind: 'taken'; by: Category } | { kind: 'ok'; name: string };

function checkName(categories: readonly Category[], type: CategoryType, draftName: string, except?: Category): NameCheck {
  const name = cleanCategoryName(draftName);
  if (!name) return { kind: 'empty' };
  const by = clashOf(categories, type, name, except);
  return by ? { kind: 'taken', by } : { kind: 'ok', name };
}

/** The main button says what is missing (Button.md): «Введите название», «Такая категория уже есть». */
function buttonOf(check: NameCheck, readyLabel: string): { ready: boolean; label: string } {
  if (check.kind === 'empty') return { ready: false, label: 'Введите название' };
  if (check.kind === 'taken') return { ready: false, label: check.by.isHidden ? 'Такая есть в скрытых — верните её' : 'Такая категория уже есть' };
  return { ready: true, label: readyLabel };
}

export interface CategoryFormView {
  title: string;
  /** The first letter of the name on the colour circles; «?» without a name. */
  letter: string;
  /** Under the name: who gets a new name. */
  nameNote: string | null;
  button: { ready: boolean; label: string };
}

const letterOf = (name: string) => (cleanCategoryName(name) ? categoryInitial(name) : '?');

/** «Все 10 записей за октябрь и прошлые получат новое название.» */
function renameNote(count: number | undefined, month: number | undefined): string {
  if (!count || !month) return 'Все прошлые записи получат новое название.';
  const period = `за ${monthNameLower(month)} и прошлые`;
  if (count === 1) return `Запись ${period} получат новое название.`;
  return `Все ${count} ${pluralRu(count, 'запись', 'записи', 'записей')} ${period} получат новое название.`;
}

export interface EditFormView extends CategoryFormView {
  /** «Скрыть категорию» is offered: every category but «Другое». */
  canHide: boolean;
  hideNote: string;
  /** In place of the hide button of «Другое»: why it is not hidden. */
  otherNote: string | null;
}

/** «Категория «Кафе»»: the form as the draft stands. */
export function editFormView(category: Category, draft: CategoryDraft, categories: readonly Category[], counts: MonthCounts | null): EditFormView {
  const check = checkName(categories, category.type, draft.name, category);
  const renamed = check.kind === 'ok' && check.name !== category.name;
  return {
    title: `Категория «${category.name}»`,
    letter: letterOf(draft.name),
    nameNote: renamed ? renameNote(counts?.byCategory.get(category.id), counts?.month) : null,
    button: buttonOf(check, 'Готово'),
    canHide: !category.isOther,
    hideNote: HIDE_NOTE,
    otherNote: category.isOther ? OTHER_NOTE : null,
  };
}

/** «Новая категория расхода». */
export function newFormView(type: CategoryType, draft: CategoryDraft, categories: readonly Category[]): CategoryFormView {
  const kind = type === 'expense' ? 'расхода' : 'дохода';
  return {
    title: `Новая категория ${kind}`,
    letter: letterOf(draft.name),
    nameNote: null,
    button: buttonOf(checkName(categories, type, draft.name), `Добавить категорию ${kind}`),
  };
}

export interface CategoryToast {
  title: string;
  detail: string;
}

/** A write and the one that undoes it, with what the toast says. */
export interface CategoryWrite {
  patch: CategoryPatch;
  undo: CategoryPatch;
  toast: CategoryToast;
}

export type EditOutcome = { kind: 'none' } | { kind: 'refused'; toast: CategoryToast } | ({ kind: 'save' } & CategoryWrite);

const NOT_SAVED = 'Не сохранено';

function takenDetail(by: Category): string {
  return `Категория «${by.name}» уже есть${by.isHidden ? ' в скрытых' : ''}`;
}

/** The changed fields of a valid draft and their old values. */
function changes(category: Category, draft: CategoryDraft, name: string | null): { patch: CategoryPatch; undo: CategoryPatch } {
  const patch: CategoryPatch = {};
  const undo: CategoryPatch = {};
  if (name !== null && name !== category.name) {
    patch.name = name;
    undo.name = category.name;
  }
  if (draft.color !== category.color) {
    patch.color = draft.color;
    undo.color = category.color;
  }
  return { patch, undo };
}

/**
 * What closing «Категория «Кафе»» writes — by «Готово», «Закрыть», the scrim, Esc or a drag (CategoryEditor.md): the
 * new name and colour with «Категория изменена · Кафе → Кофейни»; nothing when nothing changed; nothing, and a toast
 * saying why, when the name is empty or taken.
 */
export function editOutcome(category: Category, draft: CategoryDraft, categories: readonly Category[]): EditOutcome {
  const check = checkName(categories, category.type, draft.name, category);
  const { patch, undo } = changes(category, draft, check.kind === 'ok' ? check.name : null);
  const touched = cleanCategoryName(draft.name) !== category.name || draft.color !== category.color;
  if (!touched) return { kind: 'none' };
  if (check.kind === 'empty') return { kind: 'refused', toast: { title: NOT_SAVED, detail: 'Название не может быть пустым' } };
  if (check.kind === 'taken') return { kind: 'refused', toast: { title: NOT_SAVED, detail: takenDetail(check.by) } };
  const detail = patch.name ? `${category.name} → ${patch.name}` : `${category.name} · новый цвет`;
  return { kind: 'save', patch, undo, toast: { title: 'Категория изменена', detail } };
}

/** «Скрыть категорию»: a valid edit goes with it — «Отменить» brings back both; a taken or empty name stays behind. */
export function hideOutcome(category: Category, draft: CategoryDraft, categories: readonly Category[]): CategoryWrite {
  const check = checkName(categories, category.type, draft.name, category);
  const edit = changes(category, draft, check.kind === 'ok' ? check.name : null);
  const name = edit.patch.name ?? category.name;
  return {
    patch: { isHidden: true, ...edit.patch },
    undo: { isHidden: false, ...edit.undo },
    toast: { title: 'Категория скрыта', detail: `${name} · вернуть — «Скрытые»` },
  };
}

/** «Показать» in «Скрытые категории». */
export function showOutcome(category: Category): CategoryWrite {
  return { patch: { isHidden: false }, undo: { isHidden: true }, toast: { title: 'Категория снова в выборе', detail: category.name } };
}

/** What «Добавить категорию расхода» sends; null while the name is empty or taken. */
export function addPayload(type: CategoryType, draft: CategoryDraft, categories: readonly Category[]): NewCategory | null {
  const check = checkName(categories, type, draft.name);
  return check.kind === 'ok' ? { type, name: check.name, color: draft.color } : null;
}

export function addedToast(name: string): CategoryToast {
  return { title: 'Категория добавлена', detail: `${name} · ИИ начнёт предлагать её` };
}

/** A write the server refused or that did not get through, said in a toast after the sheet has closed. */
export function writeFailedToast(error: Partial<ApiError> | undefined, name: string): CategoryToast {
  if (error?.statusCode === 409) return { title: NOT_SAVED, detail: `Категория «${name}» уже есть` };
  return { title: 'Не получилось сохранить', detail: 'Проверьте связь и попробуйте ещё раз' };
}

/** A failed add, said inside the sheet, which stays open with what was typed. */
export function addFailedText(error: Partial<ApiError> | undefined): string {
  if (error?.statusCode === 409) return 'Такая категория уже есть — выберите другое название';
  return 'Не получилось добавить. Проверьте связь и нажмите ещё раз';
}
