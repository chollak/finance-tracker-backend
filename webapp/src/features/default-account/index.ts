// Default account (FT-149): «Счёт по умолчанию» of «Ещё» — where records that name no account go — saved as the
// user's `defaultAccountId` setting
export { DefaultAccountRow } from './ui/DefaultAccountRow';
export { useDefaultAccount, type DefaultAccount } from './api/useDefaultAccount';
export { defaultAccountView, DEFAULT_ACCOUNT_NOTE, type DefaultAccountView, type DefaultAccountOption } from './model/defaultAccount';
