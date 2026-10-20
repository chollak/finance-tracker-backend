import { useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { RECORD_PARAM } from '@/shared/lib/constants/routes';
import type { Transaction } from '@/shared/types';
import { openRecordSheet } from '../model/recordSheetStore';

interface RecordLinkState {
  recordSeed?: Transaction;
}

/**
 * What a screen that already has the record passes with the link (`navigate(to, { state })`): the sheet shows it at
 * once, until the record is read (the account screen opening a record in History, FT-118).
 */
export function recordLinkState(record: Transaction | undefined): RecordLinkState {
  return record ? { recordSeed: record } : {};
}

/**
 * A link to a record (`?record=<id>`: the bot's «Изменить» to Home, FT-115; a record of the account screen to History,
 * FT-118) opens that record's sheet. The record leaves the address at once, so «Назад» or a reload does not open it
 * again.
 */
export function useRecordLink(): void {
  const [params, setParams] = useSearchParams();
  const { state } = useLocation();
  const linked = params.get(RECORD_PARAM);

  useEffect(() => {
    if (!linked) return;
    const seed = (state as RecordLinkState | null)?.recordSeed;
    openRecordSheet(linked, seed?.id === linked ? seed : undefined);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(RECORD_PARAM);
        return next;
      },
      { replace: true }
    );
  }, [linked, setParams, state]);
}
