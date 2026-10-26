import crypto from 'crypto';
import { SecretGenerator } from '../domain/authPorts';

/** 32 random bytes, base64url (43 characters); kept as SHA-256 hex. */
export const cryptoSecrets: SecretGenerator = {
  newSecret: () => crypto.randomBytes(32).toString('base64url'),
  hash: (secret: string) => crypto.createHash('sha256').update(secret).digest('hex'),
};
