// Shared test support: the XO template's own scripts compiled with libauth, transactions built and run on the BCH 2026 VM.
import {
  walletTemplateToCompilerBch, generateTransaction, createVirtualMachineBch2026, bigIntToVmNumber, hexToBin, binToHex, sha256, secp256k1,
  encodeLockingBytecodeP2pkh, hash160, decodeAuthenticationInstructions,
} from '@bitauth/libauth';
import { sourceMapToLocationData } from '@cashscript/utils';
import { tokenVaultTemplate as T } from '../template/tokenvault.template.mjs';
import { release, mint } from '../contracts/bodies.mjs';

// The engine's own evaluator, the one that resolves $( ) in token fields.
export const { compileCashAssemblyString } = await import(new URL('../node_modules/@xo-cash/engine/node_modules/@xo-cash/utils/dist/index.mjs', import.meta.url));

const utf8 = (s) => new TextEncoder().encode(s);
// Throwaway keys derived from a label, never funded.
export const keyFor = (label) => sha256.hash(utf8('tokenvault-xo test key ' + label));
export const pubFor = (label) => secp256k1.derivePublicKeyCompressed(keyFor(label));

export const makeCompiler = (overrides = {}) => {
  const scripts = {};
  for (const [id, script] of Object.entries({ ...T.scripts, ...overrides })) scripts[id] = { script };
  scripts.fundLock.lockingType = 'standard';
  scripts.fundUnlock.unlocks = 'fundLock';
  scripts.mintRedeem.lockingType = 'p2sh32';
  scripts.vaultRedeem.lockingType = 'p2sh32';
  scripts.mintUnlock.unlocks = 'mintRedeem';
  scripts.reclaimUnlock.unlocks = 'mintRedeem';
  scripts.releaseUnlock.unlocks = 'vaultRedeem';
  // test only: the same unlocks, signed by a key that is not the one in the covenant
  scripts.releaseUnlockAttacker = { script: '<blockHeight> <attackerKey.schnorr_signature.all_outputs>', unlocks: 'vaultRedeem' };
  scripts.releaseUnlockNoSig = { script: '<blockHeight> OP_0', unlocks: 'vaultRedeem' };
  scripts.mintUnlockNoSig = { script: '<reward> <startHeight> <lockAmount> <lockAmount> OP_0 OP_1', unlocks: 'mintRedeem' };
  scripts.mintUnlockAttacker = { script: '<reward> <startHeight> <lockAmount> <lockAmount> <attackerKey.schnorr_signature.all_outputs> OP_1', unlocks: 'mintRedeem' };
  const variables = { fundKey: { type: 'Key' }, attackerKey: { type: 'Key' } };
  for (const id of Object.keys(T.variables)) if (id !== 'fundKey') variables[id] = { type: 'AddressData' };
  return walletTemplateToCompilerBch({ $schema: T.$schema, name: T.name, version: 0, supported: ['BCH_2026_05'], scripts, entities: { all: { variables } } });
};

// The artifacts carry two bodies: the optimized one that is deployed (and in the template), and the unoptimized one the source map
// belongs to. Verdicts come from the deployed body; the unoptimized body only names the failing source line.
const debugBodies = () => ({ releaseBody: '0x' + release.artifact.debug.bytecode, mintBody: '0x' + mint.artifact.debug.bytecode });

// MUTANT=<guard> runs the whole suite against a release covenant with one guard switched off (checks that can fail).
// Each mutation swaps the opcode that enforces one require: OP_VERIFY becomes OP_DROP, CHECKLOCKTIMEVERIFY becomes a NOP.
const MUTANTS = {
  commitment: { line: 111, from: 0x69, to: [0x75] },  // require(tx.outputs[2].nftCommitment == next state)
  signer: { line: 32, from: 0x69, to: [0x75] },       // require(checkSig(signature, fund))
  payout: { line: 115, from: 0x69, to: [0x75] },      // require(tx.outputs[0].lockingBytecode == fund)
  locktime: { line: 36, from: 0xb1, to: [0x61] },     // require(tx.time >= blockHeight): CLTV becomes a NOP, the DROP after it stays
};
function mutatedDebugBody(name) {
  const m = MUTANTS[name];
  const bytes = hexToBin(release.artifact.debug.bytecode);
  const ins = decodeAuthenticationInstructions(bytes);
  const locs = sourceMapToLocationData(release.artifact.debug.sourceMap);
  let off = 0; let done = false; const out = [];
  ins.forEach((i, idx) => {
    const size = 1 + (i.data ? (i.data.length <= 75 ? 0 : i.data.length <= 255 ? 1 : 2) + i.data.length : 0);
    const chunk = bytes.slice(off, off + size);
    if (!done && locs[idx]?.location.start.line === m.line && i.opcode === m.from) { out.push(...m.to); done = true; } else out.push(...chunk);
    off += size;
  });
  if (!done) throw new Error('mutation target not found: ' + name);
  return binToHex(Uint8Array.from(out));
}
export const MUTANT = process.env.MUTANT;
// In MUTANT mode both compilers use the mutated unoptimized body.
const mutatedOverride = MUTANT ? { releaseBody: '0x' + mutatedDebugBody(MUTANT) } : {};
export const compiler = makeCompiler(mutatedOverride);
export const debugCompiler = makeCompiler({ ...debugBodies(), ...mutatedOverride });
export const vm = createVirtualMachineBch2026();

export const num = (n) => bigIntToVmNumber(BigInt(n));
export const le8 = (n) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n), true); return b; };
export const stateBytes = (rh, hh, rw) => Uint8Array.from([...le8(rh), ...le8(hh), ...le8(rw)]);

export const dataFor = (label, vars = {}, attacker) => ({
  keys: { privateKeys: { fundKey: keyFor(label), ...(attacker ? { attackerKey: keyFor(attacker) } : {}) } },
  bytecode: Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, typeof v === 'bigint' || typeof v === 'number' ? num(v) : v])),
});

export function lockingOf(scriptId, label, vars = {}, c = compiler) {
  const r = c.generateBytecode({ scriptId, data: dataFor(label, vars) });
  if (!r.success) throw new Error(scriptId + ': ' + JSON.stringify(r.errors));
  return r.bytecode;
}
// libauth returns the P2SH32 locking bytecode of a p2sh32 script, which is what the CashScript SDK derives for the same arguments.
export const vaultLocking = (label, halvingLength, c = compiler) => lockingOf('vaultRedeem', label, { halvingLength }, c);
export const mintLocking = (label, c = compiler) => lockingOf('mintRedeem', label, {}, c);
export const walletLocking = (label) => encodeLockingBytecodeP2pkh(hash160(pubFor(label)));

const lineOf = { release: sourceMapToLocationData(release.artifact.debug.sourceMap), mint: sourceMapToLocationData(mint.artifact.debug.sourceMap) };
const ctorOps = { release: 2, mint: 1 };
const sourceText = { release: release.artifact.source.split('\n'), mint: mint.artifact.source.split('\n') };

// Runs every input; returns the first failure (with the contract source line when the body has a source map) or ok.
export function verify(transaction, sourceOutputs, contract = 'release') {
  for (let inputIndex = 0; inputIndex < transaction.inputs.length; inputIndex++) {
    const verdict = vm.verify({ sourceOutputs, transaction, inputIndex });
    if (verdict === true) continue;
    const states = vm.debug({ sourceOutputs, transaction, inputIndex });
    const last = states[states.length - 1];
    // the failing state's ip is already past the failing instruction
    const loc = lineOf[contract][last.ip - 1 - ctorOps[contract]];
    const line = loc?.location.start.line;
    return { ok: false, inputIndex, error: String(verdict), line, source: line ? sourceText[contract][line - 1].trim() : undefined };
  }
  return { ok: true };
}

export function build({ inputs, outputs, locktime = 0, version = 2 }) {
  const r = generateTransaction({ inputs, outputs, locktime, version });
  if (!r.success) throw new Error('transaction: ' + JSON.stringify(r.errors));
  return r.transaction;
}
export const hash = (n) => Uint8Array.from({ length: 32 }, (_, i) => (n * 7 + i * 13 + 5) & 0xff);
