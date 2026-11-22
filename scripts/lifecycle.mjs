// Full TokenVault lifecycle through XO invitations: fundMint, mint, then (prepareFeeCoin, release) x3 and a final release at end of life.
// Usage: node --import ./lib/no-native.mjs --env-file=.env scripts/lifecycle.mjs <chipnet|mainnet> [stopAfter]
import { openEngine, toAddress, waitForHeaders } from '../lib/xo.mjs';
import { runAction, waitFor, outpoint, saveInvitation } from '../lib/flow.mjs';
import { requestChipnetSats } from '../lib/faucet.mjs';

const network = process.argv[2] ?? 'chipnet';
const stopAfter = process.argv[3] ?? '';
const OUT = new URL('../invitations/' + network + '/', import.meta.url).pathname;
const J = (o) => JSON.stringify(o, (k, v) => (typeof v === 'bigint' ? v.toString() : v));

// chipnet nodes treat a height locktime as final only when it is far behind the tip (FINDINGS.md 3), so the chipnet schedule starts ~41000 blocks back.
const P = { halvingLength: 4n, lockAmount: 60n, reward: 8n, coinSatoshis: 5000n, mintSatoshis: 6000n, startBack: network === 'chipnet' ? 41000n : 17n };

const { engine, templateIdentifier } = await openEngine(network);
await waitForHeaders(engine);
const template = await engine.getTemplate(templateIdentifier);
const lb = await engine.generateLockingBytecodeFromDefaultPolicy('receive');
console.log('template', templateIdentifier, 'wallet', toAddress(network, lb));

const live = async () => (await engine.listUnspentOutputs()).filter((u) => u.status !== 'spent');
const at = async (txid, index) => (await live()).find((u) => u.outpointTransactionHash === txid && u.outpointIndex === index);
const plain = async () => (await live()).filter((u) => !u.tokenCategory && !u.tokenAmount && !u.nftCommitment);
const bigCoin = async () => (await plain()).sort((a, b) => b.valueSatoshis - a.valueSatoshis).find((u) => u.valueSatoshis >= 100000);
// A coin that confirms while headers verify is dropped by the engine (FINDINGS.md 2), so chipnet funds are requested after the engine is live.
if (network === 'chipnet' && !(await bigCoin())) console.log('faucet', (await requestChipnetSats(toAddress(network, lb), 3000000)).txid);
const funded = await waitFor(bigCoin, 'wallet funds', 60000);

let seq = 0;
const step = async (label, p) => {
  const name = String(++seq).padStart(2, '0') + '-' + label;
  const r = await runAction(engine, { templateIdentifier, broadcast: true, ...p });
  saveInvitation(OUT, name, r.invitation);
  console.log(name, 'txid', r.txid, 'bytes', r.preview.transactionByteLength);
  if (stopAfter === label) { await engine.stop().catch(() => {}); process.exit(0); }
  return r;
};
const startIntent = (a) => template.start.find((i) => i.action === a);
const followUp = (script, a) => template.lockingScripts[script].roles.fund.actions.find((i) => i.action === a);
const hex = (n) => BigInt(n).toString(16);
const le8 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b.toString('hex'); };
const parse = (h) => { const b = Buffer.from(h, 'hex'); return { rh: b.readBigUInt64LE(0), hh: b.readBigUInt64LE(8), rw: b.readBigUInt64LE(16) }; };

// 1. fund the mint covenant: its output 0 becomes the token genesis
const fm = await step('fundMint', {
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
const mt = await step('mint', {
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

// 3. release until the vault ends: every release spends a fresh fee coin (output 0 of its own transaction) and ends one halving at most
let commitment = stateUtxo.tokenNftCommitment;
let stateCategory = category;
let tokens = BigInt(tokenUtxo.tokenAmount);
const expectedPaid = [];
for (let n = 1; tokens > 0n; n++) {
  const { rh, hh, rw } = parse(commitment);
  const height = BigInt((await engine.getChainStatus()).currentHeight);
  // release 1 stops short of the halving (the plain branch), every later one runs to the end of its halving period
  const bh = n === 1 ? rh + 1n : (hh + P.halvingLength - 1n <= height ? hh + P.halvingLength - 1n : height);
  const halving = bh - hh + 1n >= P.halvingLength;
  const amount = halving ? (hh + P.halvingLength - rh) * rw : (bh - rh + 1n) * rw;
  const eol = tokens - amount <= 0n;
  const next = halving ? { rh: hh + P.halvingLength, hh: hh + P.halvingLength, rw: rw / 2n > 0n ? rw / 2n : 1n } : { rh: bh, hh, rw };
  const nextCommitment = le8(next.rh) + le8(next.hh) + le8(next.rw);

  const pf = await step('prepareFeeCoin', {
    action: 'prepareFeeCoin', intent: { action: 'prepareFeeCoin', role: 'fund', generate: ['fundKey'] },
    variables: [{ variableIdentifier: 'coinSatoshis', value: P.coinSatoshis }], inputs: [outpoint(change)], outputs: ['walletCoin'], change: true,
  });
  const feeCoin = await waitFor(() => at(pf.txid, 0), 'fee coin');
  change = await waitFor(() => at(pf.txid, 1), 'fee coin change');

  const action = eol ? 'finalRelease' : 'release';
  const rel = await step(action, {
    action, intent: followUp('vault', action), locktime: Number(bh),
    variables: [
      { variableIdentifier: 'tokenCategory', value: category }, { variableIdentifier: 'stateCategory', value: stateCategory },
      ...(eol ? [] : [{ variableIdentifier: 'nextStateCategory', value: pf.txid }]),
      { variableIdentifier: 'releaseHeight', value: rh }, { variableIdentifier: 'halvingHeight', value: hh }, { variableIdentifier: 'currentReward', value: rw },
      { variableIdentifier: 'blockHeight', value: bh },
      { variableIdentifier: 'halvingLength', value: P.halvingLength }, { variableIdentifier: 'vaultTokens', value: tokens },
      { variableIdentifier: 'walletSatoshis', value: BigInt(feeCoin.valueSatoshis) },
    ],
    inputs: [{ ...outpoint(tokenUtxo), inputIdentifier: 'vaultTokenInput' }, { ...outpoint(stateUtxo), inputIdentifier: 'vaultStateInput' }, { ...outpoint(feeCoin), inputIdentifier: 'walletInput' }],
    outputs: eol ? ['finalPayout'] : ['releasePayout', 'releaseVaultTokens', 'releaseVaultState'],
  });
  const paid = await waitFor(() => at(rel.txid, 0), 'payout');
  console.log('release', n, 'up to height', bh, halving ? 'crosses a halving' : 'plain release', 'amount', amount, 'paid', paid.tokenAmount, 'eol', eol);
  if (BigInt(paid.tokenAmount) !== (eol ? tokens : amount)) throw new Error('paid amount differs from the schedule');
  expectedPaid.push(BigInt(paid.tokenAmount));
  if (eol) break;
  tokenUtxo = await waitFor(() => at(rel.txid, 1), 'vault tokens');
  stateUtxo = await waitFor(() => at(rel.txid, 2), 'vault state');
  if (stateUtxo.tokenNftCommitment !== nextCommitment) throw new Error('state commitment differs from the model: ' + stateUtxo.tokenNftCommitment + ' vs ' + nextCommitment);
  if (stateUtxo.tokenCategory !== pf.txid) throw new Error('state category is not the fee coin transaction');
  tokens = BigInt(tokenUtxo.tokenAmount);
  commitment = stateUtxo.tokenNftCommitment;
  stateCategory = pf.txid;
}
console.log('released total', expectedPaid.reduce((a, b) => a + b, 0n), 'of', P.lockAmount, 'in', expectedPaid.length, 'releases');
await engine.stop().catch(() => {});
process.exit(0);
