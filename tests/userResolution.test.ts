import { Request } from 'express';
import { GetOrCreateUserUseCase } from '../src/modules/user/application/getOrCreateUserUseCase';
import { GetUserUseCase } from '../src/modules/user/application/getUserUseCase';
import { UpdateUserUseCase } from '../src/modules/user/application/updateUserUseCase';
import { UserModule } from '../src/modules/user/userModule';
import { UserRepository } from '../src/modules/user/domain/userRepository';
import { User, CreateUserDTO, UpdateUserDTO } from '../src/modules/user/domain/userEntity';
import { ValidationError } from '../src/shared/domain/errors/AppError';
import {
  isUUID,
  isGuestUser,
  resolveUserIdToUUID,
  resolveUserIdToUUIDStrict,
  tryResolveUserIdSync,
} from '../src/shared/application/helpers/userIdResolver';
import {
  verifyResourceOwnership,
  verifyAndGetResource,
  OwnedResource,
} from '../src/shared/infrastructure/utils/ownershipVerification';

const VALID_UUID = 'a1b2c3d4-e5f6-4a1b-8c2d-1234567890ab';

/**
 * In-memory fake mirroring SqliteUserRepository's getOrCreate()/update() contract:
 * getOrCreate finds by telegramId and touches lastSeenAt on hit, creates otherwise;
 * update() throws if the user doesn't exist, so UpdateUserUseCase can normalize
 * repository errors into Result failures.
 */
class InMemoryUserRepository implements UserRepository {
  private usersById = new Map<string, User>();
  private seq = 0;
  public updateLastSeenCalls: string[] = [];

  async findById(id: string): Promise<User | null> {
    return this.usersById.get(id) ?? null;
  }

  async findByTelegramId(telegramId: string): Promise<User | null> {
    return [...this.usersById.values()].find((u) => u.telegramId === telegramId) ?? null;
  }

  async create(dto: CreateUserDTO): Promise<User> {
    const id = `user-${++this.seq}`;
    const now = new Date();
    const user: User = {
      id,
      telegramId: dto.telegramId,
      userName: dto.userName,
      firstName: dto.firstName,
      lastName: dto.lastName,
      languageCode: dto.languageCode || 'ru',
      createdAt: now,
      updatedAt: now,
    };
    this.usersById.set(id, user);
    return user;
  }

  async update(id: string, dto: UpdateUserDTO): Promise<User> {
    const existing = this.usersById.get(id);
    if (!existing) {
      throw new Error('User not found after update');
    }
    const updated: User = { ...existing, ...dto, updatedAt: new Date() };
    this.usersById.set(id, updated);
    return updated;
  }

  async updateLastSeen(id: string): Promise<void> {
    this.updateLastSeenCalls.push(id);
    const existing = this.usersById.get(id);
    if (existing) {
      this.usersById.set(id, { ...existing, lastSeenAt: new Date() });
    }
  }

  async delete(id: string): Promise<void> {
    this.usersById.delete(id);
  }

  async getOrCreate(dto: CreateUserDTO): Promise<User> {
    const existing = await this.findByTelegramId(dto.telegramId);
    if (existing) {
      await this.updateLastSeen(existing.id);
      return existing;
    }
    return this.create(dto);
  }

  size(): number {
    return this.usersById.size;
  }
}

function makeRequest(telegramUser?: { id: number; first_name: string }): Request {
  return { telegramUser } as unknown as Request;
}

describe('User module', () => {
  let repo: InMemoryUserRepository;
  let getOrCreateUserUseCase: GetOrCreateUserUseCase;
  let getUserUseCase: GetUserUseCase;
  let updateUserUseCase: UpdateUserUseCase;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
    getOrCreateUserUseCase = new GetOrCreateUserUseCase(repo);
    getUserUseCase = new GetUserUseCase(repo);
    updateUserUseCase = new UpdateUserUseCase(repo);
  });

  describe('GetOrCreateUserUseCase', () => {
    it('creates a user when telegramId is unknown', async () => {
      const user = await getOrCreateUserUseCase.execute({ telegramId: '111', firstName: 'Alice' });

      expect(user.telegramId).toBe('111');
      expect(user.firstName).toBe('Alice');
      expect(user.id).toBeTruthy();
      expect(repo.size()).toBe(1);
    });

    it('returns the existing user for a known telegramId without creating a duplicate', async () => {
      const first = await getOrCreateUserUseCase.execute({ telegramId: '222' });
      const second = await getOrCreateUserUseCase.execute({ telegramId: '222' });

      expect(second.id).toBe(first.id);
      expect(repo.size()).toBe(1);
      // getOrCreate touches lastSeenAt on the existing user via the repository contract
      expect(repo.updateLastSeenCalls).toEqual([first.id]);
    });
  });

  describe('GetUserUseCase', () => {
    it('fails validation when neither id nor telegramId is provided', async () => {
      const result = await getUserUseCase.execute({});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ValidationError);
      }
    });

    it('succeeds with the user when found by id', async () => {
      const created = await getOrCreateUserUseCase.execute({ telegramId: '333' });

      const result = await getUserUseCase.execute({ id: created.id });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data?.id).toBe(created.id);
      }
    });

    it('fails with NotFoundError when id is not found', async () => {
      const result = await getUserUseCase.execute({ id: 'missing-id' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('User not found: missing-id');
      }
    });

    it('succeeds with the user when found by telegramId', async () => {
      const created = await getOrCreateUserUseCase.execute({ telegramId: '444' });

      const result = await getUserUseCase.execute({ telegramId: '444' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data?.id).toBe(created.id);
      }
    });

    it('fails with NotFoundError when telegramId is not found', async () => {
      const result = await getUserUseCase.execute({ telegramId: 'unknown-tg-id' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('User not found: unknown-tg-id');
      }
    });
  });

  describe('UpdateUserUseCase', () => {
    it('updates mutable fields on an existing user', async () => {
      const created = await getOrCreateUserUseCase.execute({ telegramId: '555' });

      const result = await updateUserUseCase.execute(created.id, { userName: 'newname', timezone: 'UTC' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.userName).toBe('newname');
        expect(result.data.timezone).toBe('UTC');
      }
    });

    it('returns Result failure when updating a non-existent user', async () => {
      const result = await updateUserUseCase.execute('missing-id', { userName: 'x' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('User not found after update');
      }
    });

    it('delegates updateLastSeen to the repository', async () => {
      const created = await getOrCreateUserUseCase.execute({ telegramId: '666' });
      repo.updateLastSeenCalls = [];

      await updateUserUseCase.updateLastSeen(created.id);

      expect(repo.updateLastSeenCalls).toEqual([created.id]);
    });
  });
});

describe('userIdResolver', () => {
  describe('isUUID', () => {
    it('accepts a valid UUID v4', () => {
      expect(isUUID(VALID_UUID)).toBe(true);
    });

    it('rejects a UUID with the wrong version nibble', () => {
      expect(isUUID('a1b2c3d4-e5f6-1a1b-8c2d-1234567890ab')).toBe(false);
    });

    it('rejects a plain numeric telegramId', () => {
      expect(isUUID('123456789')).toBe(false);
    });

    it('rejects a guest id', () => {
      expect(isUUID('guest_abc123')).toBe(false);
    });

    it('rejects an empty string', () => {
      expect(isUUID('')).toBe(false);
    });
  });

  describe('isGuestUser', () => {
    it('recognizes the guest_ prefix', () => {
      expect(isGuestUser('guest_abc123')).toBe(true);
    });

    it('rejects strings without the guest_ prefix', () => {
      expect(isGuestUser('guest')).toBe(false);
      expect(isGuestUser('guestabc')).toBe(false);
      expect(isGuestUser('123456789')).toBe(false);
    });
  });

  describe('tryResolveUserIdSync', () => {
    it('resolves a UUID synchronously', () => {
      expect(tryResolveUserIdSync(VALID_UUID)).toBe(VALID_UUID);
    });

    it('resolves a guest id synchronously', () => {
      expect(tryResolveUserIdSync('guest_xyz')).toBe('guest_xyz');
    });

    it('trims whitespace before matching', () => {
      expect(tryResolveUserIdSync(`  ${VALID_UUID}  `)).toBe(VALID_UUID);
    });

    it('returns null for a telegramId, signaling async resolution is needed', () => {
      expect(tryResolveUserIdSync('123456789')).toBeNull();
    });

    it('returns null for an empty string', () => {
      expect(tryResolveUserIdSync('')).toBeNull();
    });
  });

  describe('resolveUserIdToUUID', () => {
    let repo: InMemoryUserRepository;
    let userModule: UserModule;

    beforeEach(() => {
      repo = new InMemoryUserRepository();
      userModule = new UserModule(repo);
    });

    it('returns a UUID as-is without calling the user module', async () => {
      const spy = jest.spyOn(userModule, 'getGetOrCreateUserUseCase');

      const result = await resolveUserIdToUUID(VALID_UUID, userModule);

      expect(result).toBe(VALID_UUID);
      expect(spy).not.toHaveBeenCalled();
    });

    it('returns a guest id as-is without calling the user module', async () => {
      const spy = jest.spyOn(userModule, 'getGetOrCreateUserUseCase');

      const result = await resolveUserIdToUUID('guest_abc123', userModule);

      expect(result).toBe('guest_abc123');
      expect(spy).not.toHaveBeenCalled();
    });

    it('trims whitespace before checking guest/UUID shortcuts', async () => {
      const result = await resolveUserIdToUUID(`  guest_abc123  `, userModule);
      expect(result).toBe('guest_abc123');
    });

    it('resolves a numeric telegramId to the backing user id, creating the user on first use', async () => {
      const result = await resolveUserIdToUUID('987654321', userModule);

      const stored = await repo.findByTelegramId('987654321');
      expect(stored?.id).toBe(result);
      expect(result).not.toBe('987654321');
    });

    it('reuses the same UUID for a telegramId resolved twice (no duplicate user)', async () => {
      const first = await resolveUserIdToUUID('987654321', userModule);
      const second = await resolveUserIdToUUID('987654321', userModule);

      expect(second).toBe(first);
      expect(repo.size()).toBe(1);
    });

    it('trims whitespace around a telegramId before resolving', async () => {
      const result = await resolveUserIdToUUID('  987654321  ', userModule);

      const stored = await repo.findByTelegramId('987654321');
      expect(stored?.id).toBe(result);
    });

    it('fails open and returns the original id when resolution throws', async () => {
      const brokenUserModule = {
        getGetOrCreateUserUseCase: () => ({
          execute: jest.fn().mockRejectedValue(new Error('db unavailable')),
        }),
      } as unknown as UserModule;

      const result = await resolveUserIdToUUID('555555555', brokenUserModule);

      expect(result).toBe('555555555');
    });

    it('rejects an empty userId before attempting async resolution', async () => {
      await expect(resolveUserIdToUUID('', userModule)).rejects.toThrow('userId is required');
      await expect(resolveUserIdToUUID('   ', userModule)).rejects.toThrow('userId is required');
    });

    it('does not create a user for an empty userId', async () => {
      await expect(resolveUserIdToUUID('', userModule)).rejects.toThrow('userId is required');

      const stored = await repo.findByTelegramId('');
      expect(stored).toBeNull();
    });
  });

  describe('resolveUserIdToUUIDStrict', () => {
    let repo: InMemoryUserRepository;
    let userModule: UserModule;

    beforeEach(() => {
      repo = new InMemoryUserRepository();
      userModule = new UserModule(repo);
    });

    it('returns UUID and guest ids without calling the user module', async () => {
      const spy = jest.spyOn(userModule, 'getGetOrCreateUserUseCase');

      await expect(resolveUserIdToUUIDStrict(VALID_UUID, userModule)).resolves.toBe(VALID_UUID);
      await expect(resolveUserIdToUUIDStrict('guest_abc123', userModule)).resolves.toBe('guest_abc123');
      expect(spy).not.toHaveBeenCalled();
    });

    it('resolves a telegramId to UUID like the loose resolver', async () => {
      const result = await resolveUserIdToUUIDStrict('987654321', userModule);

      const stored = await repo.findByTelegramId('987654321');
      expect(stored?.id).toBe(result);
      expect(result).not.toBe('987654321');
    });

    it('fails closed when telegramId resolution throws', async () => {
      const brokenUserModule = {
        getGetOrCreateUserUseCase: () => ({
          execute: jest.fn().mockRejectedValue(new Error('db unavailable')),
        }),
      } as unknown as UserModule;

      await expect(resolveUserIdToUUIDStrict('555555555', brokenUserModule)).rejects.toThrow(
        'Failed to resolve userId to UUID'
      );
    });

    it('rejects empty ids before attempting resolution', async () => {
      await expect(resolveUserIdToUUIDStrict('', userModule)).rejects.toThrow('userId is required');
      await expect(resolveUserIdToUUIDStrict('   ', userModule)).rejects.toThrow('userId is required');
    });
  });
});

describe('ownershipVerification', () => {
  const resourceType = 'debt';

  function makeUserModuleReturning(user: User | null): UserModule {
    return {
      getGetUserUseCase: () => ({
        execute: jest.fn().mockResolvedValue({ success: true, data: user }),
      }),
    } as unknown as UserModule;
  }

  describe('verifyResourceOwnership', () => {
    it('bypasses verification for a guest-owned resource when allowGuest is true, even without auth', async () => {
      const resource: OwnedResource = { userId: 'guest_abc' };

      await expect(
        verifyResourceOwnership(makeRequest(undefined), resource, undefined, {
          resourceType,
          allowGuest: true,
        })
      ).resolves.toBeUndefined();
    });

    it('does not bypass a guest-owned resource when allowGuest is false (fail-closed)', async () => {
      const resource: OwnedResource = { userId: 'guest_abc' };

      await expect(
        verifyResourceOwnership(makeRequest(undefined), resource, undefined, {
          resourceType,
          allowGuest: false,
        })
      ).rejects.toThrow('Authentication required');
    });

    it('throws when the request is not authenticated', async () => {
      const resource: OwnedResource = { userId: 'user-1' };

      await expect(
        verifyResourceOwnership(makeRequest(undefined), resource, makeUserModuleReturning(null), {
          resourceType,
        })
      ).rejects.toThrow('Authentication required');
    });

    it('throws when userModule is not provided', async () => {
      const resource: OwnedResource = { userId: 'user-1' };
      const req = makeRequest({ id: 42, first_name: 'Bob' });

      await expect(
        verifyResourceOwnership(req, resource, undefined, { resourceType })
      ).rejects.toThrow(`Unable to verify ${resourceType} ownership`);
    });

    it('throws when the resolved user does not own the resource', async () => {
      const resource: OwnedResource = { userId: 'user-1' };
      const req = makeRequest({ id: 42, first_name: 'Bob' });
      const otherUser: User = {
        id: 'user-2',
        telegramId: '42',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await expect(
        verifyResourceOwnership(req, resource, makeUserModuleReturning(otherUser), { resourceType })
      ).rejects.toThrow('You do not have permission');
    });

    it('throws when the telegramId does not resolve to any user', async () => {
      const resource: OwnedResource = { userId: 'user-1' };
      const req = makeRequest({ id: 42, first_name: 'Bob' });

      await expect(
        verifyResourceOwnership(req, resource, makeUserModuleReturning(null), { resourceType })
      ).rejects.toThrow('You do not have permission');
    });

    it('resolves without throwing when the resolved user owns the resource', async () => {
      const owner: User = {
        id: 'user-1',
        telegramId: '42',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const resource: OwnedResource = { userId: 'user-1' };
      const req = makeRequest({ id: 42, first_name: 'Bob' });

      await expect(
        verifyResourceOwnership(req, resource, makeUserModuleReturning(owner), { resourceType })
      ).resolves.toBeUndefined();
    });
  });

  describe('verifyAndGetResource', () => {
    it('throws NotFoundError when the resource does not exist', async () => {
      await expect(
        verifyAndGetResource(
          makeRequest({ id: 42, first_name: 'Bob' }),
          async () => null,
          makeUserModuleReturning(null),
          { resourceType }
        )
      ).rejects.toThrow('Debt not found');
    });

    it('returns the resource once ownership is verified', async () => {
      const owner: User = {
        id: 'user-1',
        telegramId: '42',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const resource: OwnedResource & { name: string } = { userId: 'user-1', name: 'car loan' };
      const req = makeRequest({ id: 42, first_name: 'Bob' });

      const result = await verifyAndGetResource(
        req,
        async () => resource,
        makeUserModuleReturning(owner),
        { resourceType }
      );

      expect(result).toBe(resource);
    });
  });
});
