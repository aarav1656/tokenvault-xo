// Prints what the engine's Electrum connections report. Usage: node --import ./lib/no-native.mjs --env-file=.env scripts/chain.mjs <network>
import { openEngine } from '../lib/xo.mjs';
const network = process.argv[2] ?? 'chipnet';
const { engine } = await openEngine(network);
await new Promise((r) => setTimeout(r, 5000));
console.log(JSON.stringify(await engine.getChainStatus()));
console.log(JSON.stringify(engine.listElectrumConnections(), (k, v) => (typeof v === 'bigint' ? v.toString() : v)).slice(0, 1500));
await engine.stop().catch(() => {});
process.exit(0);
