import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';

// scrypt at OWASP's minimum settings (N=2^17, r=8, p=1).
const N = 2 ** 17;
const R = 8;
const P = 1;
const KEYLEN = 64;

function scryptAsync(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, KEYLEN, { N: n, r, p, maxmem: 256 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const key = await scryptAsync(password, Buffer.from(salt, 'base64'), +n, +r, +p);
  const want = Buffer.from(hash, 'base64');
  return want.length === key.length && timingSafeEqual(want, key);
}

/** A readable temporary password such as "kape-tsinelas-4827-banig". */
export function generatePassword(): string {
  const words = ['banig', 'kape', 'bayong', 'halo', 'ube', 'abaca', 'jeep', 'sampaguita', 'mangga', 'tinapay', 'kalamansi', 'palay', 'niyog', 'bangka', 'tsinelas', 'pandan'];
  const pick = () => words[randomBytes(1)[0] % words.length];
  const num = (randomBytes(2).readUInt16BE() % 9000) + 1000;
  return `${pick()}-${pick()}-${num}-${pick()}`;
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export const MIN_PASSWORD_LENGTH = 12;
