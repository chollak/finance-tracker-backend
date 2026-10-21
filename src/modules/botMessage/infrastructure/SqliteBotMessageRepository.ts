import { DataSource, IsNull, Not, Repository } from 'typeorm';
import { AppDataSource } from '../../../shared/infrastructure/database/database.config';
import { BotMessage as BotMessageEntity } from '../../../shared/infrastructure/database/entities/BotMessage';
import {
  AssumedThousands,
  BotMessage,
  BotMessageChanges,
  isRecordMessageMode,
  openQuestion,
  RecordMessageState,
} from '../domain/botMessage';
import { ItemWithoutAmount } from '../../voiceProcessing/domain/processedTransaction';
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
      question: openQuestion(message.mode, message.state),
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

  async findWithOpenQuestion(chatId: string): Promise<BotMessage[]> {
    const entities = await this.repository.find({ where: { chatId, question: Not(IsNull()) }, order: { messageId: 'DESC' } });
    return entities.map(entity => this.toDomain(entity));
  }

  async update(id: string, changes: BotMessageChanges): Promise<BotMessage> {
    const current = await this.repository.findOne({ where: { id } });
    if (!current) throw new Error(`Bot message ${id} not found`);
    if (changes.mode !== undefined || changes.state !== undefined) {
      const before = this.toDomain(current);
      const mode = changes.mode ?? before.mode;
      const state = changes.state ?? before.state;
      // The open question follows the screen and the state: it is never written on its own
      await this.repository.update(id, { mode, state: JSON.stringify(state), question: openQuestion(mode, state) });
    }
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
  const assumed = parseAssumed(parsed.assumed);
  if (assumed) state.assumed = assumed;
  if (Array.isArray(parsed.missing)) {
    const missing = parsed.missing.filter(isItemWithoutAmount);
    if (missing.length > 0) state.missing = missing;
  }
  if (Array.isArray(parsed.notes)) {
    const notes = parsed.notes.filter((note): note is string => typeof note === 'string' && note.length > 0);
    if (notes.length > 0) state.notes = notes;
  }
  if (parsed.large && Number.isInteger(parsed.large.index) && parsed.large.index >= 0) {
    state.large = { index: parsed.large.index, ...(parsed.large.replyClosed === true ? { replyClosed: true } : {}) };
  }
  if (Array.isArray(parsed.declined)) {
    const declined = parsed.declined.filter((id): id is string => typeof id === 'string');
    if (declined.length > 0) state.declined = declined;
  }
  if (parsed.back === 'confirm') state.back = 'confirm';
  return state;
}

function parseAssumed(value: unknown): Record<string, AssumedThousands> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const entries = Object.entries(value as Record<string, Partial<AssumedThousands>>)
    .filter(([, assumed]) => typeof assumed?.written === 'string' && Number.isInteger(assumed.amountMinor))
    .map(([id, assumed]) => [id, { written: assumed.written!, amountMinor: assumed.amountMinor! }] as const);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function isItemWithoutAmount(value: unknown): value is ItemWithoutAmount {
  const item = value as Partial<ItemWithoutAmount> | null;
  return Boolean(item) && typeof item!.description === 'string' && typeof item!.category === 'string'
    && (item!.type === 'income' || item!.type === 'expense');
}
