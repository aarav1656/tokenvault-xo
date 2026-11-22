// TokenVault on XO: the template's scripts run on the BCH 2026 VM against the two original covenants, plus template integrity checks.
// Run: npm test            (MUTANT=commitment|signer|payout|locktime npm test  switches one guard off and must turn tests red)
import test from 'node:test';
import assert from 'node:assert/strict';
import { Contract, MockNetworkProvider } from 'cashscript';
import { cashAddressToLockingBytecode, binToHex, hexToBin } from '@bitauth/libauth';
import { tokenVaultTemplate as T } from '../template/tokenvault.template.mjs';
import { release, mint } from '../contracts/bodies.mjs';
import { MUTANT, pubFor, walletLocking, vaultLocking, mintLocking, stateBytes, hash, compileCashAssemblyString } from './support.mjs';
import { exec, execMint, releaseParts, mintParts, model, templateValues, HL, DUST, CAT, FUND } from './scenarios.mjs';

const { parseTemplate, serializeTemplate, generateTemplateIdentifier } = await import(new URL('../node_modules/@xo-cash/engine/node_modules/@xo-cash/utils/dist/index.mjs', import.meta.url));

const FROZEN_TEMPLATE_ID = '833cf84d9673303502e916f0a305753c4ada691d0e2c106ec4afec717aa4dd29';
const run = (make, mutate) => exec(make, mutate).result;
const rejected = (name, make, mutate, fragment, contract = 'release') => test(name, () => {
  const { result } = contract === 'release' ? exec(make, mutate) : execMint(make, mutate);
  assert.equal(result.ok, false, 'the tampered transaction must be rejected');
  assert.ok(result.debugAgrees, 'the unoptimized body must reject it too');
  assert.ok(result.source?.includes(fragment), 'failed at: ' + result.source + ' (expected a line containing: ' + fragment + ')');
});

// ---------------------------------------------------------------- the covenants accept the transactions the template describes
test('release: plain branch accepted (up to a height short of the halving)', () => assert.deepEqual(run(releaseParts({ bh: 1001n })), { ok: true }));
test('release: halving branch accepted (release crosses the halving)', () => assert.deepEqual(run(releaseParts({ bh: 1003n })), { ok: true }));
test('release: later halving period accepted (state after one halving)', () => assert.deepEqual(run(releaseParts({ rh: 1004n, hh: 1004n, rw: 4n, bh: 1007n, tokens: 28n })), { ok: true }));
test('release: reward floor of one token per block accepted', () => assert.deepEqual(run(releaseParts({ rh: 2000n, hh: 2000n, rw: 1n, bh: 2003n, tokens: 9n })), { ok: true }));
test('release: end of life pays every remaining token in one output', () => assert.deepEqual(run(releaseParts({ rh: 1000n, hh: 1000n, rw: 8n, bh: 1003n, tokens: 20n, finalRelease: true })), { ok: true }));
test('mint: accepted, token and state NFT locked in the vault', () => assert.deepEqual(execMint(mintParts()).result, { ok: true }));

// ---------------------------------------------------------------- template math equals the contract's math
test('template releaseAmount and next state equal the reference model on 40 random states', () => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return BigInt(seed % Number(n)); };
  for (let i = 0; i < 40; i++) {
    const hh = 100n + rnd(1000000n), rh = hh + rnd(HL * 2n), rw = 1n + rnd(1n << 40n), bh = rh + rnd(HL * 3n);
    const m = model({ rh, hh, rw, bh, tokens: 1n << 62n });
    const t = templateValues({ rh, hh, rw, bh });
    assert.equal(t.amount, m.released, 'amount for ' + [rh, hh, rw, bh]);
    assert.equal(t.nextStateHex, binToHex(stateBytes(m.nrh, m.nhh, m.nrw)), 'next state for ' + [rh, hh, rw, bh]);
    assert.equal(t.stateHex, binToHex(stateBytes(rh, hh, rw)), 'current state for ' + [rh, hh, rw]);
  }
});
test('three consecutive releases built from template-computed values are accepted, then the vault ends', () => {
  let state = { rh: 1000n, hh: 1000n, rw: 8n }; let tokens = 60n; let n = 0;
  for (const bh of [1001n, 1003n, 1007n, 1011n]) {
    const t = templateValues({ ...state, bh });
    const m = model({ ...state, bh, tokens });
    assert.equal(t.amount, m.released);
    const eol = tokens - t.amount <= 0n;
    assert.deepEqual(run(releaseParts({ ...state, bh, tokens, finalRelease: eol })), { ok: true }, 'release ' + (n + 1));
    n++;
    if (eol) break;
    tokens -= t.amount; state = { rh: m.nrh, hh: m.nhh, rw: m.nrw };
    assert.equal(t.nextStateHex, binToHex(stateBytes(state.rh, state.hh, state.rw)));
  }
  assert.equal(n, 4); assert.ok(tokens > 0n);
});
test('state hex encoder fits the 32800 operation budget at the largest values (heights 5e8, reward 2^62)', () => {
  const t = templateValues({ rh: 500000000n, hh: 500000000n, rw: (1n << 62n), bh: 500000003n, hl: 4n });
  assert.equal(t.nextStateHex.length, 48);
  assert.match(t.nextStateHex, /^[0-9a-f]{48}$/);
});
test('the same encoder as one evaluation exceeds the budget (why each byte is its own evaluation)', () => {
  const unrolled = 'OP_0 OP_SWAP ' + Array(24).fill('<1> OP_SPLIT OP_SWAP <0x00> OP_CAT OP_BIN2NUM hexByte OP_ROT OP_SWAP OP_CAT OP_SWAP').join(' ') + ' OP_DROP';
  assert.throws(() => compileCashAssemblyString({
    cashAssemblyText: '$(nextState ' + unrolled + ')', evaluationDecodeMode: 'utf8', templateVariables: T.variables, templateScripts: { ...T.scripts },
    variables: { releaseHeight: 1000n, halvingHeight: 1000n, currentReward: 8n, blockHeight: 1003n, halvingLength: 4n },
  }), /operation cost density limit/);
});

// ---------------------------------------------------------------- release guards: each tampered transaction fails at the guard it targets
rejected('release: wrong signer (a valid signature of another key)', releaseParts({ signer: 'someone else' }), (p) => p, 'require(checkSig(signature, fund))');
rejected('release: no signature', releaseParts({ signer: 'none' }), (p) => p, 'require(checkSig(signature, fund))');
rejected('release: released amount one token too high', releaseParts({ bh: 1001n }), (p) => { p.outputs[0].token.amount += 1n; return p; }, 'require(tx.outputs[0].tokenAmount == releaseAmount)');
rejected('release: token change one too low', releaseParts({ bh: 1001n }), (p) => { p.outputs[1].token.amount -= 1n; return p; }, 'require(tx.outputs[1].tokenAmount == changeAmount)');
rejected('release: next state commitment tampered (release height)', releaseParts({ bh: 1001n }), (p) => { p.outputs[2].token.nft.commitment = stateBytes(1000n, 1000n, 8n); return p; }, 'require(tx.outputs[2].nftCommitment');
rejected('release: halving not applied to the reward', releaseParts({ bh: 1003n }), (p) => { p.outputs[2].token.nft.commitment = stateBytes(1004n, 1004n, 8n); return p; }, 'require(tx.outputs[2].nftCommitment');
rejected('release: payout to a stranger', releaseParts({ bh: 1001n }), (p) => { p.outputs[0].lockingBytecode = walletLocking('stranger'); return p; }, 'require(tx.outputs[0].lockingBytecode == recipientLockingBytecode)');
rejected('release: token change sent away from the vault', releaseParts({ bh: 1001n }), (p) => { p.outputs[1].lockingBytecode = walletLocking('stranger'); return p; }, 'require(tx.outputs[1].lockingBytecode == tx.inputs[0].lockingBytecode)');
rejected('release: state NFT sent away from the vault', releaseParts({ bh: 1001n }), (p) => { p.outputs[2].lockingBytecode = walletLocking('stranger'); return p; }, 'require(tx.outputs[2].lockingBytecode == tx.inputs[0].lockingBytecode)');
rejected('release: token change in another category', releaseParts({ bh: 1001n }), (p) => { p.outputs[1].token.category = hash(99); return p; }, 'require(tx.outputs[1].tokenCategory == tx.inputs[0].tokenCategory)');
rejected('release: payout in another category', releaseParts({ bh: 1001n }), (p) => { p.outputs[0].token.category = hash(98); return p; }, 'require(tx.outputs[0].tokenCategory == tx.inputs[0].tokenCategory)');
rejected('release: payout carries an NFT', releaseParts({ bh: 1001n }), (p) => { p.outputs[0].token.nft = { capability: 'none', commitment: Uint8Array.of(1) }; return p; }, 'require(tx.outputs[0].nftCommitment == 0x)');
rejected('release: fourth output', releaseParts({ bh: 1001n }), (p) => { p.outputs.push({ lockingBytecode: walletLocking(FUND), valueSatoshis: 1000n }); return p; }, 'require(tx.outputs.length == 3)');
rejected('release: only one output while tokens remain', releaseParts({ bh: 1001n }), (p) => { p.outputs.splice(1); return p; }, 'require(tx.outputs.length == 3)');
rejected('release: end of life with the three output shape', releaseParts({ tokens: 4n, bh: 1003n }), (p) => p, 'require(tx.outputs.length == 1)');
rejected('release: end of life paying less than every remaining token', releaseParts({ tokens: 20n, bh: 1003n, finalRelease: true }), (p) => { p.outputs[0].token.amount -= 1n; return p; }, 'require(tx.outputs[0].tokenAmount == tx.inputs[0].tokenAmount)');
rejected('release: locktime below the release height', releaseParts({ bh: 1001n }), (p) => { p.locktime = 1000; return p; }, 'require(tx.time >= blockHeight)');
rejected('release: input sequence final disables the locktime', releaseParts({ bh: 1001n }), (p) => { p.inputs[0].sequenceNumber = 0xffffffff; return p; }, 'require(tx.time >= blockHeight)');
rejected('release: release height below the state release height', releaseParts({ bh: 999n }), (p) => { p.locktime = 1000; return p; }, 'require(blockHeight >= releaseHeight)');
rejected('release: fee coin carries tokens', releaseParts({ bh: 1001n }), (p) => { p.src[2].token = { category: CAT, amount: 1n }; return p; }, 'require(tx.inputs[2].tokenCategory == 0x)');
rejected('release: token coin and state NFT from different transactions', releaseParts({ bh: 1001n }), (p) => { p.inputs[1].outpointTransactionHash = hash(77); return p; }, 'require(tx.inputs[0].outpointTransactionHash == tx.inputs[1].outpointTransactionHash)');
rejected('release: state commitment of the wrong length', releaseParts({ bh: 1001n, stateCommitment: new Uint8Array(16) }), (p) => p, 'require(state.length == (8 * 3))');
rejected('release: state with a zero reward', releaseParts({ bh: 1001n, rw: 0n }), (p) => p, 'require(reward > 0)');
rejected('release: halving length zero', releaseParts({ bh: 1001n, hl: 0n }), (p) => p, 'require(within(halvingLength, 1, 500000000 + 1))');
rejected('release: a third input is missing (two inputs)', releaseParts({ bh: 1001n }), (p) => { p.inputs.splice(2); p.src.splice(2); return p; }, 'require(tx.inputs.length == 3)');

// ---------------------------------------------------------------- mint guards
rejected('mint: wrong signer (a valid signature of another key)', mintParts({ signer: 'someone else' }), (p) => p, 'require(checkSig(signature, fund))', 'mint');
rejected('mint: no signature', mintParts({ signer: 'none' }), (p) => p, 'require(checkSig(signature, fund))', 'mint');
rejected('mint: nothing locked', mintParts({ lockAmount: 0n }), (p) => p, 'require(amount > 0)', 'mint');
rejected('mint: reward above the locked amount', mintParts({ reward: 61n }), (p) => p, 'require(within(reward, 1, lockAmount + 1))', 'mint');
rejected('mint: reward zero', mintParts({ reward: 0n }), (p) => p, 'require(within(reward, 1, lockAmount + 1))', 'mint');
rejected('mint: start height above 500000000', mintParts({ startHeight: 500000001n }), (p) => p, 'require(within(blockHeight, 0, 500000000 + 1))', 'mint');
rejected('mint: token output not a genesis of this coin', mintParts(), (p) => { p.outputs[0].token.category = hash(55); return p; }, 'require(tx.outputs[0].tokenCategory == tx.inputs[0].outpointTransactionHash)', 'mint');
rejected('mint: locked amount differs from the declared lock', mintParts(), (p) => { p.outputs[0].token.amount = 59n; return p; }, 'require(tx.outputs[0].tokenAmount == lockAmount)', 'mint');
rejected('mint: state NFT commitment tampered', mintParts(), (p) => { p.outputs[1].token.nft.commitment = stateBytes(1000n, 1000n, 9n); return p; }, 'require(tx.outputs[1].nftCommitment', 'mint');
rejected('mint: change not paid to the fund', mintParts(), (p) => { p.outputs[2].lockingBytecode = walletLocking('stranger'); return p; }, 'require(tx.outputs[2].lockingBytecode == fundLockingBytecode)', 'mint');
rejected('mint: change carries tokens', mintParts(), (p) => { p.outputs[2].token = { category: p.hashM, amount: 1n }; return p; }, 'require(tx.outputs[2].tokenCategory == 0x)', 'mint');
rejected('mint: only two outputs', mintParts(), (p) => { p.outputs.splice(2); return p; }, 'require(tx.outputs.length == 3)', 'mint');
rejected('mint: a second input', mintParts(), (p) => { p.inputs.push({ ...p.inputs[0], outpointTransactionHash: hash(3), outpointIndex: 1 }); p.src.push(p.src[0]); return p; }, 'require(tx.inputs.length == 1)', 'mint');

// ---------------------------------------------------------------- the template is the original contract
test('template addresses equal the CashScript SDK addresses for two argument sets (Release and Mint)', () => {
  for (const [label, hl] of [['alpha', 4n], ['beta', 157500n]]) {
    const sdk = new Contract(release.artifact, [pubFor(label), hl], { provider: new MockNetworkProvider(), addressType: 'p2sh32' });
    assert.equal(binToHex(cashAddressToLockingBytecode(sdk.address).bytecode), binToHex(vaultLocking(label, hl)), 'Release ' + label);
    const sdkMint = new Contract(mint.artifact, [pubFor(label)], { provider: new MockNetworkProvider(), addressType: 'p2sh32' });
    assert.equal(binToHex(cashAddressToLockingBytecode(sdkMint.address).bytecode), binToHex(mintLocking(label)), 'Mint ' + label);
  }
});
test('the template differs from the SDK address when an argument differs (the check can fail)', () => {
  const sdk = new Contract(release.artifact, [pubFor('alpha'), 5n], { provider: new MockNetworkProvider(), addressType: 'p2sh32' });
  assert.notEqual(binToHex(cashAddressToLockingBytecode(sdk.address).bytecode), binToHex(vaultLocking('alpha', 4n)));
});
test('embedded bodies are exactly the artifacts of the original project (compiler 0.10.0-next.5)', () => {
  assert.equal(release.artifact.compiler.version, '0.10.0-next.5');
  assert.equal(T.scripts.releaseBody, '0x' + release.bodyHex);
  assert.equal(T.scripts.mintBody, '0x' + mint.bodyHex);
  assert.match(release.artifact.source, /contract TokenVault_Release\(\s*pubkey fund,\s*int halvingLength/);
});

// ---------------------------------------------------------------- template integrity
test('template is frozen: its identifier (as the engine computes it) is the one funded on mainnet', () => {
  const back = parseTemplate(serializeTemplate(T));
  assert.equal(generateTemplateIdentifier(back), FROZEN_TEMPLATE_ID);
});
test('every reference in the template resolves', () => {
  const ids = (o) => Object.keys(o ?? {});
  for (const [a, action] of Object.entries(T.actions)) {
    assert.ok(T.transactions[action.transaction], 'action ' + a + ' transaction');
    for (const p of action.requirements.participants) assert.ok(T.roles[p.role]);
    for (const v of action.roles.fund.requirements.variables) assert.ok(T.variables[v], 'action ' + a + ' variable ' + v);
  }
  for (const [t, tx] of Object.entries(T.transactions)) {
    for (const i of tx.inputs) assert.ok(T.inputs[i.input], t + ' input ' + i.input);
    for (const o of tx.outputs) assert.ok(T.outputs[o.output], t + ' output ' + o.output);
  }
  for (const [o, out] of Object.entries(T.outputs)) assert.ok(T.lockingScripts[out.lockingScript], o + ' locking script ' + out.lockingScript);
  for (const [i, inp] of Object.entries(T.inputs)) assert.ok(T.scripts[inp.unlockingScript], i + ' unlocking script');
  for (const [l, ls] of Object.entries(T.lockingScripts)) {
    assert.ok(T.scripts[ls.lockingBytecode], l + ' bytecode');
    for (const act of [...(ls.actions ?? []), ...Object.values(ls.roles ?? {}).flatMap((r) => r.actions ?? [])]) assert.ok(T.actions[act.action], l + ' follow-up ' + act.action);
  }
  for (const o of ['mintVaultTokens', 'mintVaultState', 'releaseVaultTokens', 'releaseVaultState']) {
    assert.deepEqual(T.outputs[o].actions.map((a) => a.action), ['release', 'finalRelease'], o + ' declares the follow-ups');
  }
  assert.ok(ids(T.actions).length >= 6);
});
test('every spend path of the covenants is reachable from an action', () => {
  assert.equal(T.inputs.mintCoinInput.unlockingScript, 'mintUnlock');
  assert.equal(T.inputs.reclaimInput.unlockingScript, 'reclaimUnlock');
  assert.equal(T.inputs.vaultTokenInput.unlockingScript, 'releaseUnlock');
  assert.equal(T.inputs.vaultStateInput.unlockingScript, 'releaseUnlock');
  assert.ok(T.transactions.releaseTransaction.locktime.includes('blockHeight'));
  assert.equal(T.inputs.vaultTokenInput.sequenceNumber, 0xfffffffe);
});
