import { DataSource, Repository } from 'typeorm';
import { AppDataSource } from '../../../shared/infrastructure/database/database.config';
import { LoginToken as LoginTokenEntity } from '../../../shared/infrastructure/database/entities/LoginToken';
import { isLoginStatus, LoginStatus, LoginToken } from '../domain/webLogin';
import { LoginTokenChanges, LoginTokenRepository, NewLoginToken } from '../domain/loginTokenRepository';

export class SqliteLoginTokenRepository implements LoginTokenRepository {
  private repository: Repository<LoginTokenEntity>;

  constructor(dataSource: DataSource = AppDataSource) {
    this.repository = dataSource.getRepository(LoginTokenEntity);
  }

  async create(login: NewLoginToken): Promise<LoginToken> {
    await this.repository.insert({
      id: login.id,
      token: login.token,
      browserHash: login.browserHash,
      device: login.device,
      status: 'pending',
      createdAt: login.createdAt,
      expiresAt: login.expiresAt,
    });
    const created = await this.findById(login.id);
    if (!created) throw new Error(`Login ${login.id} not found after create`);
    return created;
  }

  async findById(id: string): Promise<LoginToken | null> {
    return this.toDomain(await this.repository.findOne({ where: { id } }));
  }

  async findByToken(token: string): Promise<LoginToken | null> {
    return this.toDomain(await this.repository.findOne({ where: { token } }));
  }

  async findByBrowserHash(browserHash: string): Promise<LoginToken | null> {
    return this.toDomain(await this.repository.findOne({ where: { browserHash } }));
  }

  async findBySessionHash(sessionHash: string): Promise<LoginToken | null> {
    return this.toDomain(await this.repository.findOne({ where: { sessionHash } }));
  }

  async updateIf(id: string, from: { status: LoginStatus; telegramId?: string | null }, changes: LoginTokenChanges): Promise<boolean> {
    const query = this.repository
      .createQueryBuilder()
      .update(LoginTokenEntity)
      .set(changes)
      .where('id = :id', { id })
      .andWhere('status = :status', { status: from.status });
    if (from.telegramId === null) query.andWhere('telegram_id IS NULL');
    else if (from.telegramId !== undefined) query.andWhere('telegram_id = :telegramId', { telegramId: from.telegramId });
    const result = await query.execute();
    return (result.affected ?? 0) > 0;
  }

  async deleteEndedBefore(cutoff: Date): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .delete()
      .from(LoginTokenEntity)
      .where('expires_at < :cutoff', { cutoff })
      .andWhere('(session_expires_at IS NULL OR session_expires_at < :cutoff)', { cutoff })
      .execute();
    return result.affected ?? 0;
  }

  private toDomain(entity: LoginTokenEntity | null): LoginToken | null {
    if (!entity) return null;
    return {
      id: entity.id,
      token: entity.token,
      browserHash: entity.browserHash,
      sessionHash: entity.sessionHash ?? null,
      // An unknown status (written by a newer version) is treated as over
      status: isLoginStatus(entity.status) ? entity.status : 'cancelled',
      device: entity.device,
      telegramId: entity.telegramId ?? null,
      createdAt: new Date(entity.createdAt),
      expiresAt: new Date(entity.expiresAt),
      confirmedAt: entity.confirmedAt ? new Date(entity.confirmedAt) : null,
      sessionExpiresAt: entity.sessionExpiresAt ? new Date(entity.sessionExpiresAt) : null,
    };
  }
}
