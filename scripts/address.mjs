// Prints the funding address (fund wallet of the TokenVault template) and the utxos the account tracks.
// Usage: node --import ./lib/no-native.mjs --env-file=.env scripts/address.mjs chipnet
import { openEngine, toAddress } from '../lib/xo.mjs';
const network = process.argv[2] ?? 'chipnet';
const { engine, templateIdentifier } = await openEngine(network);
const lb = await engine.generateLockingBytecodeFromDefaultPolicy('receive');
console.log(network, 'template', templateIdentifier);
console.log('fund wallet address', toAddress(network, lb));
const utxos = await engine.listUnspentOutputs();
console.log('utxos', utxos.length);
await engine.stop().catch(() => {});
process.exit(0);
