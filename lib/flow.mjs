// One XO invitation from first commit to broadcast. Every transaction this project makes goes through here.
import { hexToBin } from '@bitauth/libauth';
import { serializeInvitation } from '@xo-cash/utils';
import { writeFileSync, mkdirSync } from 'node:fs';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const outpoint = (u) => ({ outpointTransactionHash: hexToBin(u.outpointTransactionHash), outpointIndex: u.outpointIndex });

export async function waitFor(fn, what, ms = 240000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timeout waiting for ' + what);
    await sleep(3000);
  }
}

export function saveInvitation(dir, name, invitation) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(dir + '/' + name + '.xo.json', serializeInvitation(invitation) + '\n');
}

// params: templateIdentifier, action, intent, variables [{variableIdentifier, value}], inputs [{...outpoint, inputIdentifier?}],
// outputs [identifier], locktime, change (add change before signing), broadcast, role
export async function runAction(engine, p) {
  const role = p.role ?? 'fund';
  const variables = (p.variables ?? []).map((v) => ({ variableIdentifier: v.variableIdentifier, roleIdentifier: role, value: v.value }));
  const created = await engine.createInvitation({
    templateIdentifier: p.templateIdentifier, actionIdentifier: p.action, intent: p.intent,
    variables, inputs: p.inputs ?? [], transactionLocktime: p.locktime,
  });
  const id = created.invitation.invitationIdentifier;
  if (p.outputs?.length) await engine.appendInvitation(id, { templateIdentifier: p.templateIdentifier, actionIdentifier: p.action, outputs: p.outputs.map((outputIdentifier) => ({ outputIdentifier })) });
  const missing = await engine.listMissingRequirements(id);
  if (missing.templateRequirements && JSON.stringify(missing.templateRequirements) !== '{}' && p.verbose) console.log('missing', JSON.stringify(missing, (k, v) => (typeof v === 'bigint' ? v.toString() : v)));
  if (p.change) await engine.addChangeToInvitation(id);
  for (const index of await engine.listOwnInputIndexes(id)) await engine.signInvitation(id, index);
  const preview = await engine.buildInvitationTransactionFromMergedCommit(id);
  if (!p.broadcast) return { id, preview };
  try {
    const { builtTransaction, storedInvitation } = await engine.executeAction(id, { broadcastTransaction: true });
    return { id, preview, txid: builtTransaction.transactionHash, invitation: storedInvitation.invitation };
  } catch (error) {
    // Engine bug (FINDINGS.md 1): after a good broadcast Electrum may already have removed the spent coin, and clearing its
    // reservation throws. The broadcast result is stored before that throw, so read the invitation back and check it.
    if (error?.name !== 'UnspentOutputNotFoundInStoreError') {
      writeFileSync('/tmp/xo-failed-tx.hex', preview.serializedTransaction);
      throw error;
    }
    const stored = await engine.getInvitation(id);
    const broadcast = JSON.stringify(stored.invitation, (k, v) => (typeof v === 'bigint' ? v.toString() : v)).includes('broadcast');
    if (!broadcast) throw error;
    return { id, preview, txid: preview.transactionHash, invitation: stored.invitation, reservationClearFailed: true };
  }
}
