import { randomBytes, createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const key = randomBytes(32).toString('base64url');
const hash = createHash('sha256').update(key).digest('hex');

if (process.argv.includes('--write-local')) {
  writeFileSync(resolve(process.cwd(), '.dev.vars'), `LOGIN_KEY_HASH=${hash}\n`, { mode: 0o600 });
  console.log('Wrote LOGIN_KEY_HASH to .dev.vars');
}

console.log('Save this personal login key somewhere safe (do not commit it):');
console.log(key);
console.log('\nSHA-256 hash (for .dev.vars or `wrangler secret put LOGIN_KEY_HASH`):');
console.log(hash);
