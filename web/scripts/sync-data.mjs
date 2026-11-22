// Build-time: copies the XO template, every invitation set and the original CashScript sources into web/public/data
// and writes manifest.json (per network, in lifecycle order: file, action, txid read from the invitation result).
// Usage: node web/scripts/sync-data.mjs   (run by "npm run build:web" before vite build)
import { readFileSync, readdirSync, existsSync, mkdirSync, rmSync, copyFileSync, writeFileSync, statSync } from 'node:fs';
import { deserializeInvitation } from '@xo-cash/utils';

const root = new URL('../../', import.meta.url);
const out = new URL('../public/data/', import.meta.url);
const j = (v) => JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? x.toString() : x), 2);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const templateFile = 'template/tokenvault.template.json';
copyFileSync(new URL(templateFile, root), new URL('tokenvault.template.json', out));

mkdirSync(new URL('contracts/', out), { recursive: true });
for (const f of readdirSync(new URL('contracts/', root)).filter((n) => n.endsWith('.cash'))) copyFileSync(new URL('contracts/' + f, root), new URL('contracts/' + f, out));

const manifest = { template: { file: 'tokenvault.template.json', identifier: null }, networks: {} };
const invRoot = new URL('invitations/', root);
const dirs = existsSync(invRoot) ? readdirSync(invRoot).filter((n) => statSync(new URL(n + '/', invRoot)).isDirectory()).sort() : [];
// <network> holds the lifecycle; <network>-recover (reclaim, sweep) is listed as the network's recovery set.
for (const name of dirs) {
  const dir = new URL(name + '/', invRoot);
  const files = readdirSync(dir).filter((f) => f.endsWith('.xo.json')).sort();
  if (!files.length) continue;
  const [network, ...rest] = name.split('-');
  const key = rest.length ? 'recovery' : 'transactions';
  mkdirSync(new URL('invitations/' + name + '/', out), { recursive: true });
  const transactions = [];
  for (const file of files) {
    copyFileSync(new URL(file, dir), new URL('invitations/' + name + '/' + file, out));
    const inv = deserializeInvitation(readFileSync(new URL(file, dir), 'utf8'));
    manifest.template.identifier ??= inv.templateIdentifier;
    if (inv.templateIdentifier !== manifest.template.identifier) throw new Error(file + ' uses another template');
    const results = Object.values(inv.result?.transactions ?? {}).map((t) => t.transactionHash).filter(Boolean);
    if (results.length !== 1 || !/^[0-9a-f]{64}$/.test(results[0])) throw new Error(name + '/' + file + ': no single transaction hash in the invitation result');
    transactions.push({ file, dir: name, action: inv.actionIdentifier, txid: results[0] });
    if (inv.actionIdentifier === 'mint') {
      const v = Object.fromEntries(inv.commits.flatMap((c) => c.data.variables ?? []).map((x) => [x.variableIdentifier, x.value]));
      (manifest.networks[network] ??= {}).vault = { category: v.tokenCategory, lockAmount: String(v.lockAmount), reward: String(v.reward), halvingLength: String(v.halvingLength), startHeight: String(v.startHeight) };
    }
  }
  (manifest.networks[network] ??= {})[key] = transactions;
  console.log(name, transactions.length, 'invitations');
}
writeFileSync(new URL('manifest.json', out), j(manifest) + '\n');
console.log('manifest written, template', manifest.template.identifier);
