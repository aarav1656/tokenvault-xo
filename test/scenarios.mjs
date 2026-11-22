// Transaction scenarios for the two covenants. The JS model below is written from the CashScript source, not from the template.
import { compiler, debugCompiler, dataFor, stateBytes, vaultLocking, mintLocking, walletLocking, build, verify, hash, compileCashAssemblyString } from './support.mjs';
import { tokenVaultTemplate as T } from '../template/tokenvault.template.mjs';

export const HL = 4n;          // halving length used by the tests
export const DUST = 1000n;
export const CAT = hash(1);    // fungible token category
export const FUND = 'fund';

// Reference model of TokenVault_Release.release(), line by line from the source.
export function model({ rh, hh, rw, bh, hl = HL, tokens }) {
  let nrh = bh, nhh = hh, nrw = rw;
  let released = (bh - rh + 1n) * rw;
  if (bh - hh + 1n >= hl) {
    nrh = hh + hl; nhh = nrh; nrw = rw / 2n > 1n ? rw / 2n : 1n;
    released = (nrh - rh) * rw;
  }
  const change = tokens - released;
  return { halving: bh - hh + 1n >= hl, nrh, nhh, nrw, released, change, eol: change <= 0n };
}

// What the XO template computes for the same inputs (the engine's own evaluator on the template's scripts).
export function templateValues({ rh, hh, rw, bh, hl = HL }) {
  const variables = { releaseHeight: rh, halvingHeight: hh, currentReward: rw, blockHeight: bh, halvingLength: hl, minerFee: 2000n };
  const run = (text, mode) => compileCashAssemblyString({ cashAssemblyText: text, variables, evaluationDecodeMode: mode, templateVariables: T.variables, templateScripts: T.scripts });
  return { amount: BigInt(run('$(releaseAmount)', 'bigint')), nextStateHex: run('$(nextStateHex)', 'utf8'), stateHex: run('$(stateHex)', 'utf8') };
}

const wallet = () => walletLocking(FUND);

// parts of a release transaction; tests mutate them, then run().
export const releaseParts = (opts = {}) => (c) => releaseBuild(opts, c);
function releaseBuild({ rh = 1000n, hh = 1000n, rw = 8n, bh = 1001n, tokens = 60n, hl = HL, finalRelease = false, signer = FUND, stateCommitment } = {}, compiler) {
  const m = model({ rh, hh, rw, bh, hl, tokens });
  const vault = vaultLocking(FUND, hl, compiler);
  const hashA = hash(10), hashB = hash(11), nextCat = hashB;
  const commitment = stateCommitment ?? stateBytes(rh, hh, rw);
  const src = [
    { lockingBytecode: vault, valueSatoshis: DUST, token: { category: CAT, amount: tokens } },
    { lockingBytecode: vault, valueSatoshis: DUST, token: { category: CAT, amount: 0n, nft: { capability: 'none', commitment } } },
    { lockingBytecode: wallet(), valueSatoshis: 5000n },
  ];
  const unlock = (i, script, who, data = {}) => ({
    compiler, data: dataFor(FUND, data, script.endsWith('Attacker') ? who : undefined), valueSatoshis: src[i].valueSatoshis, script, ...(src[i].token ? { token: src[i].token } : {}),
  });
  const spend = signer === FUND ? 'releaseUnlock' : signer === 'none' ? 'releaseUnlockNoSig' : 'releaseUnlockAttacker';
  const inputs = [
    { outpointTransactionHash: hashA, outpointIndex: 0, sequenceNumber: 0xfffffffe, unlockingBytecode: unlock(0, spend, signer, { blockHeight: bh, halvingLength: hl }) },
    { outpointTransactionHash: hashA, outpointIndex: 1, sequenceNumber: 0xfffffffe, unlockingBytecode: unlock(1, spend, signer, { blockHeight: bh, halvingLength: hl }) },
    { outpointTransactionHash: hashB, outpointIndex: 0, sequenceNumber: 0, unlockingBytecode: unlock(2, 'fundUnlock', FUND) },
  ];
  const outputs = finalRelease
    ? [{ lockingBytecode: wallet(), valueSatoshis: 5000n + 2n * DUST - 2000n, token: { category: CAT, amount: tokens } }]
    : [
      { lockingBytecode: wallet(), valueSatoshis: 3000n, token: { category: CAT, amount: m.released } },
      { lockingBytecode: vault, valueSatoshis: DUST, token: { category: CAT, amount: m.change } },
      { lockingBytecode: vault, valueSatoshis: DUST, token: { category: nextCat, amount: 0n, nft: { capability: 'none', commitment: stateBytes(m.nrh, m.nhh, m.nrw) } } },
    ];
  return { inputs, outputs, locktime: Number(bh), src, model: m, vault, hashA, hashB };
}

// Builds the scenario with the deployed body for the verdict, and with the unoptimized body for the failing source line.
export function exec(make, mutate = (p) => p, contract = 'release') {
  const parts = mutate(make(compiler));
  const transaction = build({ inputs: parts.inputs, outputs: parts.outputs, locktime: parts.locktime });
  const result = verify(transaction, parts.src, contract);
  if (result.ok) return { result };
  const d = mutate(make(debugCompiler));
  const dres = verify(build({ inputs: d.inputs, outputs: d.outputs, locktime: d.locktime }), d.src, contract);
  return { result: { ...result, line: dres.line, source: dres.source, debugAgrees: dres.ok === false } };
}

export const mintParts = (opts = {}) => (c) => mintBuild(opts, c);
function mintBuild({ lockAmount = 60n, reward = 8n, startHeight = 1000n, signer = FUND } = {}, compiler) {
  const hashM = hash(20);
  const vault = vaultLocking(FUND, HL, compiler);
  const src = [{ lockingBytecode: mintLocking(FUND, compiler), valueSatoshis: 6000n }];
  const inputs = [{
    outpointTransactionHash: hashM, outpointIndex: 0, sequenceNumber: 0,
    unlockingBytecode: { compiler, data: dataFor(FUND, { reward, startHeight, lockAmount }, signer === FUND || signer === 'none' ? undefined : signer), valueSatoshis: 6000n, script: signer === FUND ? 'mintUnlock' : signer === 'none' ? 'mintUnlockNoSig' : 'mintUnlockAttacker' },
  }];
  const outputs = [
    { lockingBytecode: vault, valueSatoshis: DUST, token: { category: hashM, amount: lockAmount } },
    { lockingBytecode: vault, valueSatoshis: DUST, token: { category: hashM, amount: 0n, nft: { capability: 'none', commitment: stateBytes(startHeight, startHeight, reward) } } },
    { lockingBytecode: wallet(), valueSatoshis: 2000n },
  ];
  return { inputs, outputs, locktime: 0, src, hashM, vault };
}
export const execMint = (make, mutate) => exec(make, mutate, 'mint');
