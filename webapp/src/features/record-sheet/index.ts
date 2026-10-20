// The record sheet (FT-115): a saved record changed field by field, each change saved at once; delete with
// «Отменить». A screen that lists records mounts `RecordSheet` once and opens it from its rows.

export { RecordSheet } from './ui/RecordSheet';
export { useRecordLink, recordLinkState } from './api/useRecordLink';
export { SAVED_NOTICE_MS } from './api/useRecordEdits';
export type { RecordPeriod } from './model/recordSheet';
export {
  openRecordSheet,
  openRecordCategory,
  closeRecordSheet,
  useRecordFlash,
  useRecordSheetStore,
  RECORD_FLASH_MS,
  type RecordSheetTarget,
} from './model/recordSheetStore';
