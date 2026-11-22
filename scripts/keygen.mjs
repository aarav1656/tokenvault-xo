// Generates one BIP39 mnemonic per network into the gitignored .env. Prints key NAMES only, never values.
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { generateBip39Mnemonic } from '@bitauth/libauth';

const envPath = new URL('../.env', import.meta.url);
let env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
const added = [];
for (const name of ['XO_CHIPNET_MNEMONIC', 'XO_MAINNET_MNEMONIC']) {
  if (new RegExp('^' + name + '=', 'm').test(env)) continue;
  const mnemonic = generateBip39Mnemonic();
  if (typeof mnemonic !== 'string') throw new Error('mnemonic generation failed');
  env += (env.endsWith('\n') || env === '' ? '' : '\n') + name + '=' + mnemonic + '\n';
  added.push(name);
}
writeFileSync(envPath, env);
chmodSync(envPath, 0o600);
console.log(added.length ? 'generated: ' + added.join(', ') : 'already present, nothing generated');
