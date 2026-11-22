// Engine bootstrap shared by every script: pure-JS IndexedDB, network from argument, mnemonic from the environment.
import 'fake-indexeddb/auto';
import { Engine, XO_SUPPORTED_NETWORKS } from '@xo-cash/engine';
import { StorageType } from '@xo-cash/state';
import { hexToBin, lockingBytecodeToCashAddress } from '@bitauth/libauth';
import { tokenVaultTemplate } from '../template/tokenvault.template.mjs';

export const NETWORKS = { chipnet: XO_SUPPORTED_NETWORKS.chipnet, mainnet: XO_SUPPORTED_NETWORKS.mainnet };
export const PREFIX = { chipnet: 'bchtest', mainnet: 'bitcoincash' };

export async function openEngine(network, template = tokenVaultTemplate) {
  const mnemonic = process.env['XO_' + network.toUpperCase() + '_MNEMONIC'];
  if (!mnemonic) throw new Error('XO_' + network.toUpperCase() + '_MNEMONIC missing: run node scripts/keygen.mjs');
  const engine = await Engine.create(mnemonic, { network: NETWORKS[network], storageType: StorageType.INDEXEDDB });
  const { templateIdentifier } = await engine.importTemplate(template);
  await engine.setDefaultPolicies({ change: { templateIdentifier }, receive: { templateIdentifier }, address: { templateIdentifier } });
  return { engine, templateIdentifier };
}

export const toAddress = (network, lockingBytecodeHex, tokenSupport = false) => {
  const a = lockingBytecodeToCashAddress({ bytecode: hexToBin(lockingBytecodeHex), prefix: PREFIX[network], tokenSupport });
  return typeof a === 'string' ? a : a.address;
};

// Confirmed transactions need their block header verified before the engine accepts them. On chipnet the verification walks
// the chain from a checkpoint on every start (FINDINGS.md 2), so wait for it before reading coins.
export async function waitForHeaders(engine, ms = 600000) {
  const end = Date.now() + ms;
  for (;;) {
    const s = await engine.getChainStatus();
    if (s.verifiedHeight >= s.currentHeight - 2) return s;
    if (Date.now() > end) throw new Error('header verification stuck at ' + JSON.stringify(s));
    await new Promise((r) => setTimeout(r, 2000));
  }
}
