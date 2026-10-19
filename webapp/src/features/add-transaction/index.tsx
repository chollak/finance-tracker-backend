// The old record form. Since FT-113 a new record is written on the manual entry screen (features/manual-entry);
// only the edit page (/transactions/:id/edit) still uses this form, until FT-115 replaces it with the sheet.
export { TransactionForm, type TransactionFormResult } from './ui/TransactionForm';
export { addTransactionSchema, type AddTransactionFormData } from './model/schema';
