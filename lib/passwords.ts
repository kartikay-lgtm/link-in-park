/* Password hashing with Node's scrypt. Stored as scrypt$<salt>$<hash>. */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

/* A readable random password for new accounts: 3 words + 2 digits. */
const WORDS = ['amber', 'birch', 'cedar', 'delta', 'ember', 'flint', 'grove', 'harbor', 'ivory', 'juniper', 'kestrel', 'lumen', 'maple', 'nectar', 'ochre', 'pebble', 'quartz', 'river', 'saffron', 'timber', 'umber', 'velvet', 'willow', 'zephyr'];
export function generatePassword(): string {
  const pick = () => WORDS[randomBytes(1)[0] % WORDS.length];
  return `${pick()}-${pick()}-${pick()}-${10 + (randomBytes(1)[0] % 90)}`;
}
