// Full TokenVault lifecycle through XO invitations: fundMint, mint, then (prepareFeeCoin, release) x3 and a final release at end of life.
// Usage: node --import ./lib/no-native.mjs --env-file=.env scripts/lifecycle.mjs <chipnet|mainnet> [stopAfter]
import { openEngine, toAddress, waitForHeaders } from '../lib/xo.mjs';
import { runAction, waitFor, outpoint, saveInvitation } from '../lib/flow.mjs';
import { requestChipnetSats } from '../lib/faucet.mjs';

const network = process.argv[2] ?? 'chipnet';
const stopAfter = process.argv[3] ?? '';
const OUT = new URL('../invitations/' + network + '/', import.meta.url).pathname;
const J = (o) => JSON.stringify(o, (k, v) => (typeof v === 'bigint' ? v.toString() : v));

const P = { halvingLength: 4n, lockAmount: 60n, reward: 8n, coinSatoshis: 5000n, mintSatoshis: 6000n, startBack: 17n };

const { engine, templateIdentifier } = await openEngine(network);
await waitForHeaders(engine);
const template = await engine.getTemplate(templateIdentifier);
const lb = await engine.generateLockingBytecodeFromDefaultPolicy('receive');
console.log('template', templateIdentifier, 'wallet', toAddress(network, lb));

const live = async () => (await engine.listUnspentOutputs()).filter((u) => u.status !== 'spent');
const at = async (txid, index) => (await live()).find((u) => u.outpointTransactionHash === txid && u.outpointIndex === index);
const plain = async () => (await live()).filter((u) => !u.tokenCategory && !u.tokenAmount && !u.nftCommitment);
if (network === 'chipnet' && !(await plain())[0]) console.log('faucet', (await requestChipnetSats(toAddress(network, lb), 3000000)).txid);
const funded = await waitFor(async () => (await plain())[0], 'wallet funds');

const step = async (name, p) => {
  const r = await runAction(engine, { templateIdentifier, broadcast: true, ...p });
  saveInvitation(OUT, name, r.invitation);
  console.log(name, 'txid', r.txid, 'bytes', r.preview.transactionByteLength);
  if (stopAfter === name) { await engine.stop().catch(() => {}); process.exit(0); }
  return r;
};
const startIntent = (a) => template.start.find((i) => i.action === a);
const followUp = (script, a) => template.lockingScripts[script].roles.fund.actions.find((i) => i.action === a);
const hex = (n) => BigInt(n).toString(16);
const le8 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b.toString('hex'); };
const parse = (h) => { const b = Buffer.from(h, 'hex'); return { rh: b.readBigUInt64LE(0), hh: b.readBigUInt64LE(8), rw: b.readBigUInt64LE(16) }; };

// 1. fund the mint covenant: its output 0 becomes the token genesis
const fm = await step('01-fundMint', {
  action: 'fundMint', intent: startIntent('fundMint'),
  variables: [{ variableIdentifier: 'mintSatoshis', value: P.mintSatoshis }],
  inputs: [outpoint(funded)], outputs: ['mintFundingOutput'], change: true,
});
const category = fm.txid;
const mintCoin = await waitFor(() => at(category, 0), 'mint coin');
let change = await waitFor(() => at(category, 1), 'fundMint change');

// 2. mint: create the category, lock the supply in the vault, first state NFT
const tip = (await engine.getChainStatus()).currentHeight;
const startHeight = BigInt(tip) - P.startBack;
const mt = await step('02-mint', {
  action: 'mint', intent: followUp('mintContract', 'mint'),
  variables: [
    { variableIdentifier: 'tokenCategory', value: category }, { variableIdentifier: 'lockAmount', value: P.lockAmount },
    { variableIdentifier: 'startHeight', value: startHeight }, { variableIdentifier: 'reward', value: P.reward },
    { variableIdentifier: 'halvingLength', value: P.halvingLength }, { variableIdentifier: 'mintCoinSatoshis', value: BigInt(mintCoin.valueSatoshis) },
  ],
  inputs: [{ ...outpoint(mintCoin), inputIdentifier: 'mintCoinInput' }], outputs: ['mintVaultTokens', 'mintVaultState', 'mintChange'],
});
let tokenUtxo = await waitFor(() => at(mt.txid, 0), 'vault tokens');
let stateUtxo = await waitFor(() => at(mt.txid, 1), 'vault state');
console.log('vault utxos', J([tokenUtxo, stateUtxo].map((u) => ({ ...u, scriptHash: undefined, templateIdentifier: undefined }))));
await engine.stop().catch(() => {});
process.exit(0);
