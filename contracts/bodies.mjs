// Compiled bodies of the two original contracts (foldingcash/smart-contracts, cashc 0.10.0-next.5 artifacts in this folder).
// Redeem script = constructor arguments (last argument pushed first) followed by the body, as the CashScript SDK builds it.
import { readFileSync } from 'node:fs';
import { asmToScript, scriptToBytecode } from '@cashscript/utils';
import { binToHex } from '@bitauth/libauth';

const load = (name) => {
  const artifact = JSON.parse(readFileSync(new URL('./TokenVault_' + name + '.artifact.json', import.meta.url), 'utf8'));
  return { artifact, bodyHex: binToHex(scriptToBytecode(asmToScript(artifact.bytecode))) };
};
export const release = load('Release');
export const mint = load('Mint');
