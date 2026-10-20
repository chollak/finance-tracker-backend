import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RECORD_PARAM } from '@/shared/lib/constants/routes';
import { openRecordSheet } from '../model/recordSheetStore';

/**
 * A link to a record (`ROUTES.RECORD(id)`: the bot's «Изменить», FT-115) opens that record's sheet. The record
 * leaves the address at once, so «Назад» or a reload does not open it again.
 */
export function useRecordLink(): void {
  const [params, setParams] = useSearchParams();
  const linked = params.get(RECORD_PARAM);

  useEffect(() => {
    if (!linked) return;
    openRecordSheet(linked);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(RECORD_PARAM);
        return next;
      },
      { replace: true }
    );
  }, [linked, setParams]);
}
