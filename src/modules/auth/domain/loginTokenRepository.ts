import { LoginStatus, LoginToken } from './webLogin';

export interface NewLoginToken {
  id: string;
  token: string;
  browserHash: string;
  device: string;
  createdAt: Date;
  expiresAt: Date;
}

export type LoginTokenChanges = Partial<Pick<LoginToken, 'status' | 'telegramId' | 'confirmedAt' | 'sessionHash' | 'sessionExpiresAt'>>;

export interface LoginTokenRepository {
  create(login: NewLoginToken): Promise<LoginToken>;
  findById(id: string): Promise<LoginToken | null>;
  findByToken(token: string): Promise<LoginToken | null>;
  findByBrowserHash(browserHash: string): Promise<LoginToken | null>;
  findBySessionHash(sessionHash: string): Promise<LoginToken | null>;
  /**
   * Applies the changes only while the login is still in `from` (and, with `telegramId`, still bound to that user
   * or to nobody): two answers, or an answer and a cancel, cannot both win. True when this call changed it.
   */
  updateIf(id: string, from: { status: LoginStatus; telegramId?: string | null }, changes: LoginTokenChanges): Promise<boolean>;
}
