import { DataSource, Repository } from 'typeorm';
import { AppDataSource } from '../../../shared/infrastructure/database/database.config';
import { BotMessage as BotMessageEntity } from '../../../shared/infrastructure/database/entities/BotMessage';
import { BotMessage, BotMessageChanges, isRecordMessageMode, RecordMessageMode, RecordMessageState } from '../domain/botMessage';
import { BotMessageRepository, NewBotMessage } from '../domain/botMessageRepository';

export class SqliteBotMessageRepository implements BotMessageRepository {
  private repository: Repository<BotMessageEntity>;

  constructor(dataSource: DataSource = AppDataSource) {
    this.repository = dataSource.getRepository(BotMessageEntity);
  }

  async create(message: NewBotMessage): Promise<BotMessage> {
    await this.repository.insert({
      id: message.id,
      userId: message.userId,
      chatId: message.chatId,
      messageId: message.messageId,
      recordIds: JSON.stringify(message.recordIds),
      mode: message.mode,
      state: JSON.stringify(message.state),
      heard: message.heard,
    });
    return this.toDomain((await this.repository.findOne({ where: { id: message.id } }))!);
  }

  async findByMessage(chatId: string, messageId: number): Promise<BotMessage | null> {
    const entity = await this.repository.findOne({ where: { chatId, messageId } });
    return entity ? this.toDomain(entity) : null;
  }

  async findByChat(chatId: string, limit: number): Promise<BotMessage[]> {
    const entities = await this.repository.find({ where: { chatId }, order: { messageId: 'DESC' }, take: limit });
    return entities.map(entity => this.toDomain(entity));
  }

  async findByMode(chatId: string, mode: RecordMessageMode): Promise<BotMessage[]> {
    const entities = await this.repository.find({ where: { chatId, mode }, order: { messageId: 'DESC' } });
    return entities.map(entity => this.toDomain(entity));
  }

  async update(id: string, changes: BotMessageChanges): Promise<BotMessage> {
    const patch: Partial<BotMessageEntity> = {};
    if (changes.mode !== undefined) patch.mode = changes.mode;
    if (changes.state !== undefined) patch.state = JSON.stringify(changes.state);
    if (Object.keys(patch).length > 0) await this.repository.update(id, patch);
    const updated = await this.repository.findOne({ where: { id } });
    if (!updated) throw new Error(`Bot message ${id} not found after update`);
    return this.toDomain(updated);
  }

  private toDomain(entity: BotMessageEntity): BotMessage {
    return {
      id: entity.id,
      userId: entity.userId,
      chatId: entity.chatId,
      messageId: Number(entity.messageId),
      recordIds: parseIds(entity.recordIds),
      mode: isRecordMessageMode(entity.mode) ? entity.mode : 'confirm',
      state: parseState(entity.state),
      heard: entity.heard ?? null,
      createdAt: new Date(entity.createdAt),
      updatedAt: new Date(entity.updatedAt),
    };
  }
}

function parseIds(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** A state written by an older version may lack fields: the confirmation screen fills them in. */
function parseState(value: string): RecordMessageState {
  let parsed: Partial<RecordMessageState> = {};
  try {
    const raw = JSON.parse(value);
    if (raw && typeof raw === 'object') parsed = raw;
  } catch {
    // keep the defaults
  }
  const state: RecordMessageState = {
    selected: Number.isInteger(parsed.selected) && (parsed.selected as number) >= 0 ? (parsed.selected as number) : 0,
    guessed: Array.isArray(parsed.guessed) ? parsed.guessed.filter((id): id is string => typeof id === 'string') : [],
  };
  if (parsed.pickType === 'income' || parsed.pickType === 'expense') state.pickType = parsed.pickType;
  if (typeof parsed.changed === 'string' && parsed.changed) state.changed = parsed.changed;
  if (Number.isInteger(parsed.undoMessageId)) state.undoMessageId = parsed.undoMessageId;
  if (Array.isArray(parsed.undone)) {
    const undone = parsed.undone.filter((id): id is string => typeof id === 'string');
    if (undone.length > 0) state.undone = undone;
  }
  return state;
}
