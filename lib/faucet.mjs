// chipnet.bch.ninja faucet: proof of work, no login. Only the address leaves this machine.
import { createHash } from 'node:crypto';
const base = 'https://chipnet.bch.ninja/api/';
const api = async (path, body) => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(path + ' ' + r.status + ' ' + (j.error ?? JSON.stringify(j)));
  return j;
};
export async function requestChipnetSats(address, sats = '2000000') {
  const ch = await api('challenge', { address, sats: String(sats) });
  const target = BigInt('0x' + ch.target);
  for (let nonce = 0n; ; nonce++) {
    if (BigInt('0x' + createHash('sha256').update(ch.payload + ':' + nonce).digest('hex')) <= target) {
      return api('claim', { payload: ch.payload, signature: ch.signature, nonce: nonce.toString() });
    }
    if (Date.now() > ch.expires) throw new Error('challenge expired, request fewer sats');
  }
}
