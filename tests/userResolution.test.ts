import { Request } from 'express';
import { GetOrCreateUserUseCase } from '../src/modules/user/application/getOrCreateUserUseCase';
import { GetUserUseCase } from '../src/modules/user/application/getUserUseCase';
import { UserModule } from '../src/modules/user/userModule';
import { UserRepository } from '../src/modules/user/domain/userRepository';
import { User, CreateUserDTO } from '../src/modules/user/domain/userEntity';
import { ValidationError } from '../src/shared/domain/errors/AppError';
import {
  isUUID,
  resolvableUserIdOf,
  resolveUserIdToUUID,
  UserLookupError,
} from '../src/shared/application/helpers/userIdResolver';
import {
  verifyResourceOwnership,
  OwnedResource,
} from '../src/shared/infrastructure/utils/ownershipVerification';

const VALID_UUID = 'a1b2c3d4-e5f6-4a1b-8c2d-1234567890ab';

/** Ids that are neither a UUID nor a positive whole number (#224): no user may be made of them. */
const NOT_USER_IDS = ['guest_zzz', 'abc', '-5', '1.5', '0', '000', '1e5', '0x1F', '12 34', '+5', 'NaN', 'undefined'];

/** Telegram ids past 32 bits (ids grow past 2^32; Telegram promises at most 52 significant bits); the last is 2^53 − 1. */
const BIG_TELEGRAM_IDS = ['7123456789', '4503599627370495', '9007199254740991'];

/**
 * Whole numbers from 2^53 on (#230): no Telegram id, and past it a number is no longer exact — `telegramIdOf` names no
 * one by them, so neither does the resolver. The last is the 30 digits that made a `users` row before.
 */
const PAST_SAFE_IDS = ['9007199254740992', '9007199254740993', '123456789012345678901234567890'];

/**
 * In-memory fake mirroring SqliteUserRepository's getOrCreate() contract:
 * getOrCreate finds by telegramId and only reads a user it finds (#335), creates otherwise.
 * There is no other way to make or change a user (#274).
 */
class InMemoryUserRepository implements UserRepository {
  private usersById = new Map<string, User>();
  private seq = 0;
  /** Users getOrCreate wrote: only the ones it made. */
  public written: string[] = [];

  async findById(id: string): Promise<User | null> {
    return this.usersById.get(id) ?? null;
  }

  async findByTelegramId(telegramId: string): Promise<User | null> {
    return [...this.usersById.values()].find((u) => u.telegramId === telegramId) ?? null;
  }

  async findAll(): Promise<User[]> {
    return [...this.usersById.values()];
  }

  private insert(dto: CreateUserDTO): User {
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
    this.written.push(id);
    return user;
  }

  async getOrCreate(dto: CreateUserDTO): Promise<User> {
    const existing = await this.findByTelegramId(dto.telegramId);
    if (existing) {
      return existing;
    }
    return this.insert(dto);
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

  beforeEach(() => {
    repo = new InMemoryUserRepository();
    getOrCreateUserUseCase = new GetOrCreateUserUseCase(repo);
    getUserUseCase = new GetUserUseCase(repo);
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
      // The second call only reads the user the first made (#335)
      expect(repo.written).toEqual([first.id]);
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

    it('trims whitespace before checking the UUID shortcut', async () => {
      const spy = jest.spyOn(userModule, 'getGetOrCreateUserUseCase');

      const result = await resolveUserIdToUUID(`  ${VALID_UUID}  `, userModule);

      expect(result).toBe(VALID_UUID);
      expect(spy).not.toHaveBeenCalled();
    });

    // #230: ids are stored in lower case and looked up exactly — an upper-case UUID found no one
    it('returns an upper-case UUID in lower case without calling the user module', async () => {
      const spy = jest.spyOn(userModule, 'getGetOrCreateUserUseCase');

      await expect(resolveUserIdToUUID(VALID_UUID.toUpperCase(), userModule)).resolves.toBe(VALID_UUID);
      expect(spy).not.toHaveBeenCalled();
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

    it('fails closed: a lookup that throws is a UserLookupError, not the Telegram id (#315)', async () => {
      const brokenUserModule = {
        getGetOrCreateUserUseCase: () => ({
          execute: jest.fn().mockRejectedValue(new Error('db unavailable')),
        }),
      } as unknown as UserModule;

      await expect(resolveUserIdToUUID('555555555', brokenUserModule)).rejects.toBeInstanceOf(UserLookupError);
      await expect(resolveUserIdToUUID(' 0555555555 ', brokenUserModule)).rejects.toBeInstanceOf(UserLookupError);
    });

    it('a UUID needs no lookup, so a failing one does not touch it (#315)', async () => {
      const brokenUserModule = {
        getGetOrCreateUserUseCase: () => ({
          execute: jest.fn().mockRejectedValue(new Error('db unavailable')),
        }),
      } as unknown as UserModule;

      await expect(resolveUserIdToUUID(VALID_UUID, brokenUserModule)).resolves.toBe(VALID_UUID);
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

    // #224: before, any id that was not a UUID went to getOrCreate as a Telegram id and made a `users` row
    it.each(NOT_USER_IDS)('refuses %p, which is no UUID and no Telegram id, creating no user', async id => {
      await expect(resolveUserIdToUUID(id, userModule)).rejects.toThrow(ValidationError);
      expect(repo.size()).toBe(0);
    });

    it.each(BIG_TELEGRAM_IDS)('resolves the big Telegram id %s as before', async id => {
      const result = await resolveUserIdToUUID(id, userModule);

      expect((await repo.findByTelegramId(id))?.id).toBe(result);
    });

    // #230: one rule with ALLOWED_TELEGRAM_IDS (`telegramIdOf`) — before, `0597843119` made a second user of the same person
    it('resolves a Telegram id with leading zeros to the same user as without them', async () => {
      const plain = await resolveUserIdToUUID('597843119', userModule);
      const padded = await resolveUserIdToUUID('0597843119', userModule);

      expect(padded).toBe(plain);
      expect(repo.size()).toBe(1);
    });

    it('creates the user of a Telegram id with leading zeros under the id without them', async () => {
      const result = await resolveUserIdToUUID('00900000143', userModule);

      expect((await repo.findByTelegramId('900000143'))?.id).toBe(result);
      expect(await repo.findByTelegramId('00900000143')).toBeNull();
    });

    it.each(PAST_SAFE_IDS)('refuses %s, a number from 2^53 on, creating no user', async id => {
      await expect(resolveUserIdToUUID(id, userModule)).rejects.toThrow(ValidationError);
      expect(repo.size()).toBe(0);
    });
  });

  describe('resolvableUserIdOf', () => {
    it.each([VALID_UUID, `  ${VALID_UUID}  `, '1', '131184740', ' 597843119 ', '0597843119', ...BIG_TELEGRAM_IDS])('accepts %p', id => {
      expect(resolvableUserIdOf(id)).not.toBeNull();
    });

    it.each(['', '   ', ...NOT_USER_IDS, ...PAST_SAFE_IDS])('refuses %p', id => {
      expect(resolvableUserIdOf(id)).toBeNull();
    });

    it('gives a Telegram id trimmed and without leading zeros (#230)', () => {
      expect(resolvableUserIdOf(' 0597843119 ')).toBe('597843119');
    });

    it('gives a UUID trimmed and in lower case, as ids are stored (#230)', () => {
      expect(resolvableUserIdOf(` ${VALID_UUID.toUpperCase()} `)).toBe(VALID_UUID);
    });
  });
});

describe('ownershipVerification', () => {
  const resourceType = 'transaction';

  function makeUserModuleReturning(user: User | null): UserModule {
    return {
      getGetUserUseCase: () => ({
        execute: jest.fn().mockResolvedValue({ success: true, data: user }),
      }),
    } as unknown as UserModule;
  }

  describe('verifyResourceOwnership', () => {
    // There are no guests (decision Д4, #206): a record left with a `guest_*` owner is nobody's to open
    it('does not open a guest-owned resource to a signed-in user either', async () => {
      const resource: OwnedResource = { userId: 'guest_abc' };
      const signedIn: User = {
        id: 'user-1',
        telegramId: '42',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await expect(
        verifyResourceOwnership(makeRequest({ id: 42, first_name: 'Bob' }), resource, makeUserModuleReturning(signedIn), {
          resourceType,
        })
      ).rejects.toThrow('You do not have permission');
    });

    it('does not open a guest-owned resource without auth (fail-closed)', async () => {
      const resource: OwnedResource = { userId: 'guest_abc' };

      await expect(
        verifyResourceOwnership(makeRequest(undefined), resource, undefined, { resourceType })
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
});
