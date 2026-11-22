// Chipnet only: tops the fund wallet up from the faucet when it holds no plain coin. Usage: node --import ./lib/no-native.mjs --env-file=.env scripts/fund.mjs
import { openEngine, toAddress, waitForHeaders } from '../lib/xo.mjs';
import { requestChipnetSats } from '../lib/faucet.mjs';
const { engine } = await openEngine('chipnet');
await waitForHeaders(engine);
const address = toAddress('chipnet', await engine.generateLockingBytecodeFromDefaultPolicy('receive'));
const coins = (await engine.listUnspentOutputs()).filter((u) => u.status !== 'spent');
const total = coins.reduce((s, u) => s + u.valueSatoshis, 0);
if (total >= 100000) console.log('wallet', address, 'already holds', total, 'sats');
else console.log('wallet', address, 'faucet', (await requestChipnetSats(address, 3000000)).txid);
await engine.stop().catch(() => {});
process.exit(0);
