import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MINUS, NBSP } from '@/shared/lib/money';
import { useUndoToastStore, visibleEntry } from '@/shared/lib/undo';
import { announceSaved } from './announceSaved';
import type { ManualEntryRecord } from './manualEntry';

/** FT-113: after a save Home shows the toast «Записано» with «Отменить», and «Отменить» removes the record. */

const RECORD: ManualEntryRecord = {
  type: 'expense',
  amountMinor: 18_640_000,
  currency: 'UZS',
  accountId: 'card',
  categoryId: 'pr',
  categoryName: 'Продукты',
  date: '2026-10-14',
  note: '',
};

const shown = () => {
  const { stack, now } = useUndoToastStore.getState();
  return visibleEntry(stack, Math.max(now, Date.now()));
};

beforeEach(() => {
  useUndoToastStore.getState().clear();
});

describe('announceSaved', () => {
  it('shows «Записано» with what was written', () => {
    announceSaved({ id: 't1', record: RECORD, accountName: 'Карта', remove: vi.fn() });

    expect(shown()).toMatchObject({
      kind: 'saved',
      title: 'Записано',
      detail: `Продукты · ${MINUS}186${NBSP}400${NBSP}сум · Карта`,
    });
  });

  it('«Отменить» removes exactly the saved record', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    announceSaved({ id: 't1', record: RECORD, accountName: 'Карта', remove });

    expect(shown()?.undo).toBeDefined();
    await useUndoToastStore.getState().undoVisible();

    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('t1');
    expect(shown()).toBeNull();
  });

  it('a failed removal keeps «Отменить» so it can be pressed again', async () => {
    const remove = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    announceSaved({ id: 't1', record: RECORD, accountName: 'Карта', remove });

    await useUndoToastStore.getState().undoVisible();
    expect(shown()).toMatchObject({ title: 'Не получилось отменить' });

    await useUndoToastStore.getState().undoVisible();
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenLastCalledWith('t1');
  });
});
