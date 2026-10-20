import { describe, expect, it } from 'vitest';
import { GUEST_CATEGORIES, type Category } from '@/entities/category';
import {
  addPayload,
  addedToast,
  categoryRows,
  draftOf,
  editFormView,
  editOutcome,
  hideOutcome,
  keptAddedToast,
  monthCounts,
  NEW_DRAFT,
  newFormView,
  recordsInMonth,
  showOutcome,
  writeFailedToast,
} from './categoriesScreen';

/**
 * FT-127, boards «Категории», «Категория «Кафе»», «Новая категория», «Скрытые категории» and CategoryEditor.md: what
 * the screen says and what each close of a sheet writes.
 */

const categories: Category[] = GUEST_CATEGORIES.map((category, index) => ({ ...category, id: `c${index}` }));
const byName = (name: string, type: Category['type'] = 'expense') => categories.find((c) => c.name === name && c.type === type)!;
const cafe = byName('Кафе');
const other = byName('Другое');
const withHidden = (name: string) => categories.map((c) => (c.name === name && c.type === 'expense' ? { ...c, isHidden: true } : c));

const counts = monthCounts({
  month: '2026-10',
  categories: [
    { categoryId: cafe.id, count: 10 },
    { categoryId: byName('Продукты').id, count: 8 },
    { categoryId: byName('Покупки').id, count: 3 },
    { categoryId: byName('Транспорт').id, count: 1 },
  ],
});

describe('the list', () => {
  it('says how many records each category had this month, as analytics counts them', () => {
    expect(recordsInMonth(10, 10)).toBe('10 записей в октябре');
    expect(recordsInMonth(3, 10)).toBe('3 записи в октябре');
    expect(recordsInMonth(1, 10)).toBe('1 запись в октябре');
    expect(recordsInMonth(0, 10)).toBe('В октябре не было');
  });

  it('shows the visible categories of the type with «Другое» last, the hidden ones apart', () => {
    const view = categoryRows(withHidden('Покупки'), 'expense', counts);

    expect(view.listLabel).toBe('Категории расходов');
    expect(view.visible.map((row) => row.name)).toEqual(['Продукты', 'Кафе', 'Транспорт', 'Дом', 'Связь', 'Здоровье', 'Другое']);
    expect(view.visible[1]).toMatchObject({ caption: '10 записей в октябре', ariaLabel: 'Кафе, 10 записей в октябре. Изменить' });
    expect(view.visible[3].caption).toBe('В октябре не было');
    expect(view.hidden.map((row) => [row.name, row.caption])).toEqual([['Покупки', '3 записи в октябре']]);
    expect(view.hiddenLabel).toBe('Скрытые · 1');
  });

  it('has no «Скрытые» row while nothing is hidden, and no counts while they are read', () => {
    const view = categoryRows(categories, 'income', null);

    expect(view.listLabel).toBe('Категории доходов');
    expect(view.visible).toHaveLength(8);
    expect(view.visible.at(-1)?.name).toBe('Другое');
    expect(view.visible[0]).toMatchObject({ caption: null, ariaLabel: 'Зарплата. Изменить' });
    expect(view.hiddenLabel).toBeNull();
  });
});

describe('«Категория «Кафе»»', () => {
  it('as opened: titled by its name, «Готово», hiding explained, no note under the name', () => {
    const view = editFormView(cafe, draftOf(cafe), categories, counts);

    expect(view).toMatchObject({ title: 'Категория «Кафе»', letter: 'К', nameNote: null, button: { ready: true, label: 'Готово' }, canHide: true });
    expect(view.hideNote).toBe('Все записи с ней останутся в истории и аналитике. В выборе её не будет; вернуть — «Скрытые» внизу списка.');
    expect(view.otherNote).toBeNull();
  });

  it('a new name says which records get it; the circles show its first letter', () => {
    expect(editFormView(cafe, { name: 'Кофейни', color: 'rose' }, categories, counts)).toMatchObject({
      letter: 'К',
      nameNote: 'Все 10 записей за октябрь и прошлые получат новое название.',
    });
    expect(editFormView(byName('Дом'), { name: 'Квартира', color: 'sand' }, categories, counts)).toMatchObject({
      letter: 'К',
      nameNote: 'Все прошлые записи получат новое название.',
    });
    expect(editFormView(byName('Транспорт'), { name: 'Такси', color: 'sky' }, categories, counts).nameNote).toBe(
      'Запись за октябрь и прошлые получат новое название.'
    );
  });

  it('an empty or taken name: the button says what is wrong — regardless of case and «ё»', () => {
    expect(editFormView(cafe, { name: '  ', color: 'rose' }, categories, counts)).toMatchObject({ letter: '?', nameNote: null, button: { ready: false, label: 'Введите название' } });
    expect(editFormView(cafe, { name: 'продукты', color: 'rose' }, categories, counts).button).toEqual({ ready: false, label: 'Такая категория уже есть' });
    expect(editFormView(cafe, { name: 'ПОКУПКИ', color: 'rose' }, withHidden('Покупки'), counts).button).toEqual({
      ready: false,
      label: 'Такая есть в скрытых — верните её',
    });
    // Its own name in other letters is no clash, and an income category of the same name neither
    expect(editFormView(cafe, { name: 'кафе', color: 'rose' }, categories, counts).button.ready).toBe(true);
    expect(editFormView(cafe, { name: 'Подарки', color: 'rose' }, categories, counts).button.ready).toBe(true);
    const yo = [...categories, { ...cafe, id: 'own', name: 'Ёлка', presetKey: null, sortOrder: 90 }];
    expect(editFormView(cafe, { name: 'елка', color: 'rose' }, yo, counts).button.label).toBe('Такая категория уже есть');
  });

  it('«Другое» is not hidden: in place of the button it says why', () => {
    const view = editFormView(other, draftOf(other), categories, counts);

    expect(view.canHide).toBe(false);
    expect(view.otherNote).toBe('«Другое» нельзя скрыть: сюда попадает всё, что ИИ не смог разложить.');
  });
});

describe('closing «Категория «Кафе»» applies the edit', () => {
  it('nothing changed — nothing is written', () => {
    expect(editOutcome(cafe, draftOf(cafe), categories)).toEqual({ kind: 'none' });
    expect(editOutcome(cafe, { name: ' Кафе ', color: 'rose' }, categories)).toEqual({ kind: 'none' });
  });

  it('a new name and colour: one write, «Категория изменена · Кафе → Кофейни», and «Отменить» brings both back', () => {
    expect(editOutcome(cafe, { name: '  Кофейни ', color: 'butter' }, categories)).toEqual({
      kind: 'save',
      patch: { name: 'Кофейни', color: 'butter' },
      undo: { name: 'Кафе', color: 'rose' },
      toast: { title: 'Категория изменена', detail: 'Кафе → Кофейни' },
    });
  });

  it('only the colour: «Кафе · новый цвет»', () => {
    expect(editOutcome(cafe, { name: 'Кафе', color: 'sky' }, categories)).toEqual({
      kind: 'save',
      patch: { color: 'sky' },
      undo: { color: 'rose' },
      toast: { title: 'Категория изменена', detail: 'Кафе · новый цвет' },
    });
  });

  it('an empty or taken name: nothing is saved and the toast says why', () => {
    expect(editOutcome(cafe, { name: '', color: 'sky' }, categories)).toEqual({
      kind: 'refused',
      toast: { title: 'Не сохранено', detail: 'Название не может быть пустым' },
    });
    expect(editOutcome(cafe, { name: 'продукты', color: 'rose' }, categories)).toEqual({
      kind: 'refused',
      toast: { title: 'Не сохранено', detail: 'Категория «Продукты» уже есть' },
    });
    expect(editOutcome(cafe, { name: 'покупки', color: 'rose' }, withHidden('Покупки'))).toEqual({
      kind: 'refused',
      toast: { title: 'Не сохранено', detail: 'Категория «Покупки» уже есть в скрытых' },
    });
  });

  it('a write the server refuses or that does not get through says so', () => {
    expect(writeFailedToast({ statusCode: 409 }, 'Продукты')).toEqual({ title: 'Не сохранено', detail: 'Категория «Продукты» уже есть' });
    expect(writeFailedToast({ statusCode: 0 }, 'Кофейни')).toEqual({ title: 'Не получилось сохранить', detail: 'Проверьте связь и попробуйте ещё раз' });
  });
});

describe('«Скрыть категорию» and «Показать»', () => {
  it('hiding takes a valid edit with it, and «Отменить» brings back both', () => {
    expect(hideOutcome(cafe, { name: 'Кофейни', color: 'rose' }, categories)).toEqual({
      patch: { isHidden: true, name: 'Кофейни' },
      undo: { isHidden: false, name: 'Кафе' },
      toast: { title: 'Категория скрыта', detail: 'Кофейни · вернуть — «Скрытые»' },
    });
    // A taken name stays behind; the category is hidden under its own
    expect(hideOutcome(cafe, { name: 'Продукты', color: 'rose' }, categories)).toEqual({
      patch: { isHidden: true },
      undo: { isHidden: false },
      toast: { title: 'Категория скрыта', detail: 'Кафе · вернуть — «Скрытые»' },
    });
  });

  it('showing puts it back in the choice; «Отменить» hides it again', () => {
    expect(showOutcome(byName('Покупки'))).toEqual({
      patch: { isHidden: false },
      undo: { isHidden: true },
      toast: { title: 'Категория снова в выборе', detail: 'Покупки' },
    });
  });
});

describe('«Новая категория»', () => {
  it('starts empty and grey; the button says what is missing until the name is new', () => {
    expect(NEW_DRAFT).toEqual({ name: '', color: 'mist' });
    expect(newFormView('expense', NEW_DRAFT, categories)).toEqual({
      title: 'Новая категория расхода',
      letter: '?',
      nameNote: null,
      button: { ready: false, label: 'Введите название' },
    });
    expect(newFormView('expense', { name: 'кафе', color: 'sky' }, categories).button.label).toBe('Такая категория уже есть');
    expect(newFormView('expense', { name: 'Покупки', color: 'sky' }, withHidden('Покупки')).button.label).toBe('Такая есть в скрытых — верните её');
    expect(newFormView('income', { name: 'Спорт', color: 'sky' }, categories)).toMatchObject({
      title: 'Новая категория дохода',
      letter: 'С',
      button: { ready: true, label: 'Добавить категорию дохода' },
    });
  });

  it('only a new name is sent, cleaned; the toast says the AI will offer it', () => {
    expect(addPayload('expense', { name: '  Спорт  и  зал ', color: 'sky' }, categories)).toEqual({ type: 'expense', name: 'Спорт и зал', color: 'sky' });
    expect(addPayload('expense', { name: 'Кафе', color: 'sky' }, categories)).toBeNull();
    expect(addPayload('expense', NEW_DRAFT, categories)).toBeNull();
    expect(addedToast('Спорт')).toEqual({ title: 'Категория добавлена', detail: 'Спорт · ИИ начнёт предлагать её' });
  });

  it('«Отменить» after a record went into it: it stays, and the toast says why and what to do instead', () => {
    expect(keptAddedToast('Спорт')).toEqual({ title: 'Не удалено', detail: 'Спорт · уже есть запись — можно скрыть' });
  });
});
