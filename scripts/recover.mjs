// Recovery paths through XO invitations: fundMint then reclaim (spend branch of TokenVault_Mint), then sweep.
// Usage: node --import ./lib/no-native.mjs --env-file=.env scripts/recover.mjs <chipnet|mainnet>
import { openEngine, toAddress, waitForHeaders } from '../lib/xo.mjs';
import { runAction, waitFor, outpoint, saveInvitation } from '../lib/flow.mjs';
import { requestChipnetSats } from '../lib/faucet.mjs';

const network = process.argv[2] ?? 'chipnet';
const OUT = new URL('../invitations/' + network + '-recover/', import.meta.url).pathname;
const { engine, templateIdentifier } = await openEngine(network);
await waitForHeaders(engine);
const template = await engine.getTemplate(templateIdentifier);
const lb = await engine.generateLockingBytecodeFromDefaultPolicy('receive');
const live = async () => (await engine.listUnspentOutputs()).filter((u) => u.status !== 'spent');
const at = async (txid, index) => (await live()).find((u) => u.outpointTransactionHash === txid && u.outpointIndex === index);
const bigCoin = async () => (await live()).filter((u) => !u.tokenCategory).sort((a, b) => b.valueSatoshis - a.valueSatoshis).find((u) => u.valueSatoshis >= 100000);
if (network === 'chipnet' && !(await bigCoin())) console.log('faucet', (await requestChipnetSats(toAddress(network, lb), 2000000)).txid);
const funded = await waitFor(bigCoin, 'wallet funds', 60000);
const step = async (name, p) => {
  const r = await runAction(engine, { templateIdentifier, broadcast: true, ...p });
  saveInvitation(OUT, name, r.invitation);
  console.log(name, 'txid', r.txid, 'bytes', r.preview.transactionByteLength);
  return r;
};
const fm = await step('1-fundMint', { action: 'fundMint', intent: template.start.find((i) => i.action === 'fundMint'), variables: [{ variableIdentifier: 'mintSatoshis', value: 6000n }], inputs: [outpoint(funded)], outputs: ['mintFundingOutput'], change: true });
const coin = await waitFor(() => at(fm.txid, 0), 'mint coin');
const rc = await step('2-reclaim', { action: 'reclaim', intent: template.lockingScripts.mintContract.roles.fund.actions.find((i) => i.action === 'reclaim'), variables: [{ variableIdentifier: 'mintCoinSatoshis', value: BigInt(coin.valueSatoshis) }], inputs: [{ ...outpoint(coin), inputIdentifier: 'reclaimInput' }], outputs: ['reclaimOutput'] });
const back = await waitFor(() => at(rc.txid, 0), 'reclaimed coin');
console.log('reclaimed', back.valueSatoshis, 'sats back in the fund wallet');
const sw = await step('3-sweep', { action: 'sweep', intent: { action: 'sweep', role: 'fund', generate: ['fundKey'] }, variables: [{ variableIdentifier: 'recipientLockingScript', value: lb }, { variableIdentifier: 'transferredSatoshis', value: 2000n }], inputs: [outpoint(back)], outputs: ['sweepOutput'], change: true });
const out = await waitFor(() => at(sw.txid, 0), 'sweep output');
console.log('swept', out.valueSatoshis);
await engine.stop().catch(() => {});
process.exit(0);
