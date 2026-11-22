// Reads every transaction of an invitation set back from an Electrum server (not through the XO engine) and checks the outcome.
// Usage: node scripts/verify.mjs <chipnet|mainnet> [dir]
import { readFileSync, readdirSync } from 'node:fs';
import { decodeTransactionBch, hexToBin, binToHex } from '@bitauth/libauth';
import { deserializeInvitation } from '@xo-cash/utils';
import { rpc } from '../lib/electrum.mjs';

const network = process.argv[2] ?? 'chipnet';
const dir = new URL('../' + (process.argv[3] ?? 'invitations/' + network) + '/', import.meta.url);
const txidOf = (inv) => { const r = JSON.stringify(inv.result, (k, v) => (typeof v === 'bigint' ? v.toString() : v)); return /"transactionHash":"([0-9a-f]{64})"/.exec(r)?.[1]; };
const tip = (await rpc(network, 'blockchain.headers.subscribe')).height;
const rows = []; let released = 0n, locked = 0n;
for (const file of readdirSync(dir).filter((f) => f.endsWith('.xo.json')).sort()) {
  const inv = deserializeInvitation(readFileSync(new URL(file, dir), 'utf8'));
  const txid = txidOf(inv);
  const hex = await rpc(network, 'blockchain.transaction.get', [txid, false]);
  const confirmedAt = await rpc(network, 'blockchain.transaction.get_merkle', [txid]).then((m) => m.block_height, () => 'mempool');
  const tx = decodeTransactionBch(hexToBin(hex));
  if (typeof tx === 'string') throw new Error(txid + ' ' + tx);
  const tokens = tx.outputs.map((o, i) => o.token && { i, cat: binToHex(o.token.category).slice(0, 8), amount: o.token.amount, nft: o.token.nft ? binToHex(o.token.nft.commitment) : undefined });
  const action = inv.actionIdentifier;
  if (action === 'mint') locked = tx.outputs[0].token.amount;
  if (action === 'release' || action === 'finalRelease') released += tx.outputs[0].token.amount;
  rows.push({ file, action, txid: txid.slice(0, 16), block: confirmedAt, in: tx.inputs.length, out: tx.outputs.length, locktime: tx.locktime, tokens: tokens.filter(Boolean).map((t) => t.i + ':' + t.amount + (t.nft ? ' nft ' + t.nft : '')).join(' ; ') });
}
console.table(rows);
console.log(network, 'tip', tip, 'transactions read back', rows.length);
if (locked > 0n) { console.log('locked', locked, 'released across releases', released); if (released !== locked) { console.error('released total differs from the locked supply'); process.exit(1); } }
