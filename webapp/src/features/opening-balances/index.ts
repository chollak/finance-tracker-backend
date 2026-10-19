// Opening balances feature: the first launch's «Сколько у вас сейчас денег?» form (FT-109)

export { OpeningBalancesForm } from './ui/OpeningBalancesForm';
export { useSaveOpeningBalances } from './api/mutations';
export {
  OPENING_SLOTS,
  initialOpeningBalances,
  selectOpeningRow,
  pressOpeningKey,
  openingBalancesRows,
  openingBalancesPayload,
  openingBalancesNote,
  startButtonLabel,
  keyFromKeyboard,
} from './model/openingBalances';
export type { OpeningBalancesState, OpeningBalancesPayload, OpeningSlot } from './model/openingBalances';
