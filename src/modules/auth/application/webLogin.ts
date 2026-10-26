import crypto from 'crypto';
import { Result, ResultHelper } from '../../../shared/domain/types/Result';
import {
  canTakeSession,
  deviceLabel,
  isLiveSession,
  LOGIN_LINK_TTL_MS,
  LOGIN_START_PREFIX,
  loginRowsCutoff,
  LoginAnswer,
  LoginToken,
  SESSION_TTL_MS,
  webLoginState,
  WebLoginState,
} from '../domain/webLogin';
import { LoginTokenRepository } from '../domain/loginTokenRepository';
import { BotUsernameSource, LoginNotConfirmedError, LoginUnavailableError, SecretGenerator } from '../domain/authPorts';

/** What the use cases share: the logins, the secrets and the clock. */
export interface WebLoginDeps {
  logins: LoginTokenRepository;
  secrets: SecretGenerator;
  now: () => Date;
}

/** `t.me/<bot>?start=login_<token>`: the chat with the bot opens on «Запустить», which sends /start with the token. */
export function botLoginLink(username: string, token: string): string {
  return `https://t.me/${encodeURIComponent(username)}?start=${LOGIN_START_PREFIX}${token}`;
}

export interface StartedWebLogin {
  status: 'pending';
  link: string;
  expiresAt: Date;
  /** Goes to the browser's httpOnly cookie only; the server keeps its hash. */
  browserSecret: string;
}

/**
 * «Войти через Telegram»: a new login with its own link and its own waiting secret. It also clears the logins that are
 * over for good (`LOGIN_ROW_KEEP_MS`), so the table holds about a month of them.
 */
export class StartWebLoginUseCase {
  constructor(private deps: WebLoginDeps, private botUsername: BotUsernameSource) {}

  async execute(input: { userAgent?: string }): Promise<Result<StartedWebLogin>> {
    const username = await this.botUsername.username();
    if (!username) return ResultHelper.failure(new LoginUnavailableError());

    const { logins, secrets, now } = this.deps;
    const createdAt = now();
    await logins.deleteEndedBefore(loginRowsCutoff(createdAt));
    const token = secrets.newSecret();
    const browserSecret = secrets.newSecret();
    const expiresAt = new Date(createdAt.getTime() + LOGIN_LINK_TTL_MS);
    await logins.create({
      id: crypto.randomUUID(),
      token,
      browserHash: secrets.hash(browserSecret),
      device: deviceLabel(input.userAgent),
      createdAt,
      expiresAt,
    });
    return ResultHelper.success({ status: 'pending', link: botLoginLink(username, token), expiresAt, browserSecret });
  }
}

export type WebLoginStatus =
  | { status: 'pending'; link: string; expiresAt: Date }
  | { status: Exclude<WebLoginState, 'pending'> };

/** How the login of this browser went: the page polls it while it waits (and reads it again after a reload). */
export class GetWebLoginStatusUseCase {
  constructor(private deps: WebLoginDeps, private botUsername: BotUsernameSource) {}

  async execute(input: { browserSecret: string }): Promise<Result<WebLoginStatus>> {
    const login = await findByBrowser(this.deps, input.browserSecret);
    const state = webLoginState(login, this.deps.now());
    if (state === 'pending' && login) {
      const username = await this.botUsername.username();
      if (username) return ResultHelper.success({ status: 'pending', link: botLoginLink(username, login.token), expiresAt: login.expiresAt });
    }
    return ResultHelper.success({ status: state === 'pending' ? 'none' : state });
  }
}

/** «Отменить вход»: the link stops working, the bot says it is out of date. */
export class CancelWebLoginUseCase {
  constructor(private deps: WebLoginDeps) {}

  async execute(input: { browserSecret: string }): Promise<Result<void>> {
    const login = await findByBrowser(this.deps, input.browserSecret);
    if (login?.status === 'pending' || login?.status === 'confirmed') {
      await this.deps.logins.updateIf(login.id, { status: login.status }, { status: 'cancelled' });
    }
    return ResultHelper.success(undefined);
  }
}

export interface OpenedWebSession {
  /** Goes to the browser's httpOnly cookie only; the server keeps its hash. */
  sessionSecret: string;
  telegramId: string;
  expiresAt: Date;
}

/**
 * The browser takes its confirmed login as a session: a new secret (not the waiting one), valid 30 days. A login
 * becomes a session once; one that is not confirmed, or whose 5 minutes are over, is refused.
 */
export class OpenWebSessionUseCase {
  constructor(private deps: WebLoginDeps) {}

  async execute(input: { browserSecret: string }): Promise<Result<OpenedWebSession>> {
    const { logins, secrets, now } = this.deps;
    const login = await findByBrowser(this.deps, input.browserSecret);
    const at = now();
    if (!login || !login.telegramId || !canTakeSession(login, at)) return ResultHelper.failure(new LoginNotConfirmedError());

    const sessionSecret = secrets.newSecret();
    const expiresAt = new Date(at.getTime() + SESSION_TTL_MS);
    const taken = await logins.updateIf(login.id, { status: 'confirmed' }, {
      status: 'active',
      sessionHash: secrets.hash(sessionSecret),
      sessionExpiresAt: expiresAt,
    });
    if (!taken) return ResultHelper.failure(new LoginNotConfirmedError());
    return ResultHelper.success({ sessionSecret, telegramId: login.telegramId, expiresAt });
  }
}

/** Whose session a cookie is; null when it is unknown, signed out or over. */
export class GetWebSessionUseCase {
  constructor(private deps: WebLoginDeps) {}

  async execute(input: { sessionSecret: string }): Promise<Result<{ telegramId: string } | null>> {
    if (!input.sessionSecret) return ResultHelper.success(null);
    const login = await this.deps.logins.findBySessionHash(this.deps.secrets.hash(input.sessionSecret));
    if (!login || !login.telegramId || !isLiveSession(login, this.deps.now())) return ResultHelper.success(null);
    return ResultHelper.success({ telegramId: login.telegramId });
  }
}

/** «Выйти»: only this browser's session ends; records and other browsers stay. */
export class CloseWebSessionUseCase {
  constructor(private deps: WebLoginDeps) {}

  async execute(input: { sessionSecret: string }): Promise<Result<void>> {
    if (input.sessionSecret) {
      const login = await this.deps.logins.findBySessionHash(this.deps.secrets.hash(input.sessionSecret));
      if (login?.status === 'active') await this.deps.logins.updateIf(login.id, { status: 'active' }, { status: 'signed_out' });
    }
    return ResultHelper.success(undefined);
  }
}

export type BotLoginPrompt = { kind: 'ask'; loginId: string; device: string; createdAt: Date } | { kind: 'stale' };

/**
 * /start login_<token> in the bot: the login is bound to the one who opened the link, and the bot asks them. A link
 * that does not exist, is over, was answered, cancelled, or is someone else's is out of date.
 */
export class OpenLoginInBotUseCase {
  constructor(private deps: WebLoginDeps) {}

  async execute(input: { token: string; telegramId: string }): Promise<Result<BotLoginPrompt>> {
    const { logins, now } = this.deps;
    const login = input.token ? await logins.findByToken(input.token) : null;
    if (!login || webLoginState(login, now()) !== 'pending') return ResultHelper.success({ kind: 'stale' });
    if (login.telegramId !== input.telegramId) {
      const bound = login.telegramId === null
        && await logins.updateIf(login.id, { status: 'pending', telegramId: null }, { telegramId: input.telegramId });
      if (!bound) return ResultHelper.success({ kind: 'stale' });
    }
    return ResultHelper.success({ kind: 'ask', loginId: login.id, device: login.device, createdAt: login.createdAt });
  }
}

export type BotLoginAnswer = { kind: 'confirmed' | 'rejected' | 'expired'; device: string } | { kind: 'stale' };

/** «Подтвердить» or «Это не я» under the bot's question. The first answer stands. */
export class AnswerLoginUseCase {
  constructor(private deps: WebLoginDeps) {}

  async execute(input: { loginId: string; telegramId: string; answer: LoginAnswer }): Promise<Result<BotLoginAnswer>> {
    const { logins, now } = this.deps;
    const login = await logins.findById(input.loginId);
    if (!login || login.telegramId !== input.telegramId) return ResultHelper.success({ kind: 'stale' });

    const at = now();
    if (login.status === 'pending') {
      if (webLoginState(login, at) === 'expired') return ResultHelper.success({ kind: 'expired', device: login.device });
      const changed = await logins.updateIf(
        login.id,
        { status: 'pending', telegramId: input.telegramId },
        input.answer === 'confirm' ? { status: 'confirmed', confirmedAt: at } : { status: 'rejected' }
      );
      if (changed) return ResultHelper.success({ kind: input.answer === 'confirm' ? 'confirmed' : 'rejected', device: login.device });
      // Another answer (or a cancel) came first: say what it was
      const current = await logins.findById(login.id);
      return ResultHelper.success(answered(current));
    }
    return ResultHelper.success(answered(login));
  }
}

/** A login that was answered before: what the message says now. */
function answered(login: LoginToken | null): BotLoginAnswer {
  if (!login) return { kind: 'stale' };
  if (login.status === 'confirmed' || login.status === 'active' || login.status === 'signed_out') return { kind: 'confirmed', device: login.device };
  if (login.status === 'rejected') return { kind: 'rejected', device: login.device };
  return { kind: 'stale' };
}

async function findByBrowser(deps: WebLoginDeps, browserSecret: string): Promise<LoginToken | null> {
  if (!browserSecret) return null;
  return deps.logins.findByBrowserHash(deps.secrets.hash(browserSecret));
}
