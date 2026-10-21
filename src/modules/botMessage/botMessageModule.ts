import { BotMessageRepository } from './domain/botMessageRepository';
import { BotMessageLog } from './application/botMessageLog';
import { RepositoryFactory } from '../../shared/infrastructure/database/repositoryFactory';

/**
 * Bot messages (FT-122): the link between a confirmation in the chat and the records it shows, with the
 * keyboard screen that is open, kept in `bot_messages` so the buttons and /undo survive a restart.
 */
export class BotMessageModule {
  private log: BotMessageLog;

  constructor(repository: BotMessageRepository) {
    this.log = new BotMessageLog(repository);
  }

  static create(): BotMessageModule {
    return new BotMessageModule(RepositoryFactory.createBotMessageRepository());
  }

  getLog(): BotMessageLog {
    return this.log;
  }
}
