import { AppConfig } from '../../shared/infrastructure/config/appConfig';
import { RepositoryFactory } from '../../shared/infrastructure/database/repositoryFactory';
import { BotUsernameSource, SecretGenerator } from './domain/authPorts';
import { LoginTokenRepository } from './domain/loginTokenRepository';
import {
  AnswerLoginUseCase,
  CancelWebLoginUseCase,
  CloseWebSessionUseCase,
  GetWebLoginStatusUseCase,
  GetWebSessionUseCase,
  OpenLoginInBotUseCase,
  OpenWebSessionUseCase,
  StartWebLoginUseCase,
  WebLoginDeps,
} from './application/webLogin';
import { ConfiguredBotUsername } from './infrastructure/botUsername';
import { cryptoSecrets } from './infrastructure/cryptoSecrets';

export interface AuthModuleOptions {
  botUsername: BotUsernameSource;
  secrets?: SecretGenerator;
  /** The clock; tests move it. */
  now?: () => Date;
}

/**
 * Signing in to the web app through the bot (FT-128, decision Д4): the login link and its answer in the bot, the
 * browser's session cookie and «Выйти». Telegram's initData stays the sign-in of the Mini App.
 */
export class AuthModule {
  private startWebLogin: StartWebLoginUseCase;
  private webLoginStatus: GetWebLoginStatusUseCase;
  private cancelWebLogin: CancelWebLoginUseCase;
  private openWebSession: OpenWebSessionUseCase;
  private webSession: GetWebSessionUseCase;
  private closeWebSession: CloseWebSessionUseCase;
  private openLoginInBot: OpenLoginInBotUseCase;
  private answerLogin: AnswerLoginUseCase;

  constructor(logins: LoginTokenRepository, options: AuthModuleOptions) {
    const deps: WebLoginDeps = { logins, secrets: options.secrets ?? cryptoSecrets, now: options.now ?? (() => new Date()) };
    this.startWebLogin = new StartWebLoginUseCase(deps, options.botUsername);
    this.webLoginStatus = new GetWebLoginStatusUseCase(deps, options.botUsername);
    this.cancelWebLogin = new CancelWebLoginUseCase(deps);
    this.openWebSession = new OpenWebSessionUseCase(deps);
    this.webSession = new GetWebSessionUseCase(deps);
    this.closeWebSession = new CloseWebSessionUseCase(deps);
    this.openLoginInBot = new OpenLoginInBotUseCase(deps);
    this.answerLogin = new AnswerLoginUseCase(deps);
  }

  static create(): AuthModule {
    return new AuthModule(RepositoryFactory.createLoginTokenRepository(), {
      botUsername: new ConfiguredBotUsername(AppConfig.TG_BOT_USERNAME, AppConfig.TG_BOT_API_KEY),
    });
  }

  getStartWebLoginUseCase(): StartWebLoginUseCase {
    return this.startWebLogin;
  }

  getWebLoginStatusUseCase(): GetWebLoginStatusUseCase {
    return this.webLoginStatus;
  }

  getCancelWebLoginUseCase(): CancelWebLoginUseCase {
    return this.cancelWebLogin;
  }

  getOpenWebSessionUseCase(): OpenWebSessionUseCase {
    return this.openWebSession;
  }

  getWebSessionUseCase(): GetWebSessionUseCase {
    return this.webSession;
  }

  getCloseWebSessionUseCase(): CloseWebSessionUseCase {
    return this.closeWebSession;
  }

  getOpenLoginInBotUseCase(): OpenLoginInBotUseCase {
    return this.openLoginInBot;
  }

  getAnswerLoginUseCase(): AnswerLoginUseCase {
    return this.answerLogin;
  }
}
