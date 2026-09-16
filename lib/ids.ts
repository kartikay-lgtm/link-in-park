import { randomInt } from 'node:crypto';

/* Identifier alphabet: lowercase letters and digits minus the ones that get
   misread when someone copies a URL by eye (0/o, 1/l/i). 31 symbols, so five
   characters give ~28 million combinations - collisions are checked against
   the database anyway. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export const IDENTIFIER_LENGTH = 5;

export function newIdentifier(length = IDENTIFIER_LENGTH): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/* Linkrunner echoes display ids back in whatever case it likes; our own are
   minted lowercase. Compare through this, always. */
export function normaliseCode(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}
