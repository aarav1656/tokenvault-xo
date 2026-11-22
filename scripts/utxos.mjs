// Lists what the account tracks. Usage: node --import ./lib/no-native.mjs --env-file=.env scripts/utxos.mjs <network>
import { openEngine, toAddress, waitForHeaders } from '../lib/xo.mjs';
const network = process.argv[2] ?? 'chipnet';
const { engine } = await openEngine(network);
const lb = await engine.generateLockingBytecodeFromDefaultPolicy('receive');
console.log('wallet', toAddress(network, lb), JSON.stringify(await engine.getChainStatus()));
const t0 = Date.now(); console.log('headers', JSON.stringify(await waitForHeaders(engine)), Date.now() - t0, 'ms');
for (const u of await engine.listUnspentOutputs()) console.log(JSON.stringify({ ...u, scriptHash: undefined, templateIdentifier: undefined }, (k, v) => (typeof v === 'bigint' ? v.toString() : v)));
await engine.stop().catch(() => {});
process.exit(0);
