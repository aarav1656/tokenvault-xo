// Runs every input of a serialized transaction through the BCH 2026 VM against known source outputs.
import { createVirtualMachineBch2026, decodeTransactionBch, hexToBin, binToHex, disassembleBytecodeBch, hash256, decodeAuthenticationInstructions } from '@bitauth/libauth';

export function verifyTransaction(txHex, sourceOutputs) {
  const transaction = decodeTransactionBch(hexToBin(txHex));
  if (typeof transaction === 'string') throw new Error(transaction);
  const vm = createVirtualMachineBch2026();
  return transaction.inputs.map((_, inputIndex) => {
    const result = vm.verify({ sourceOutputs, transaction, inputIndex });
    return typeof result === 'string' ? { inputIndex, ok: false, error: result } : { inputIndex, ok: true };
  });
}

// P2SH32 locking bytecode for the redeem script found as the last push of an unlocking script.
export function p2sh32FromUnlocking(unlockingBytecode) {
  const ins = decodeAuthenticationInstructions(unlockingBytecode);
  const last = ins[ins.length - 1];
  const redeem = last.data;
  return { redeem, lockingBytecode: Uint8Array.from([0xaa, 0x20, ...hash256(redeem), 0x87]) };
}

export function debugInput(txHex, sourceOutputs, inputIndex) {
  const transaction = decodeTransactionBch(hexToBin(txHex));
  const vm = createVirtualMachineBch2026();
  const states = vm.debug({ sourceOutputs, transaction, inputIndex });
  const last = states[states.length - 1];
  const ip = last.ip;
  return { steps: states.length, error: last.error, ip, stack: last.stack.map((s) => binToHex(s)), script: last.controlStack };
}
