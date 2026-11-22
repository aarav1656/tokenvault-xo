// Chipnet probe: does a plain transaction with a height locktime already met get accepted? (FINDINGS.md 3)
import { openEngine, toAddress, waitForHeaders } from '../lib/xo.mjs';
import { runAction, waitFor, outpoint } from '../lib/flow.mjs';
const lockBack = BigInt(process.argv[2] ?? '10');
const { engine, templateIdentifier } = await openEngine('chipnet');
await waitForHeaders(engine);
const template = await engine.getTemplate(templateIdentifier);
const lb = await engine.generateLockingBytecodeFromDefaultPolicy('receive');
const coin = await waitFor(async () => (await engine.listUnspentOutputs()).filter((u) => u.status !== 'spent' && !u.tokenCategory)[0], 'coin', 30000);
const tip = BigInt((await engine.getChainStatus()).currentHeight);
console.log('tip', tip, 'locktime', tip - lockBack, 'coin', coin.outpointTransactionHash.slice(0, 10), coin.valueSatoshis);
const r = await runAction(engine, {
  templateIdentifier, action: 'sweep', intent: { action: 'sweep', role: 'fund', generate: ['fundKey'] }, locktime: Number(tip - lockBack),
  variables: [{ variableIdentifier: 'recipientLockingScript', value: lb }, { variableIdentifier: 'transferredSatoshis', value: 2000n }],
  inputs: [outpoint(coin)], outputs: ['sweepOutput'], change: true, broadcast: true, retryMs: 1,
});
console.log('ok txid', r.txid);
await engine.stop().catch(() => {});
process.exit(0);
