// Decodes raw transactions with libauth and runs the same checks as scripts/verify.mjs, plus a comparison of every release
// with what the XO template computes from the previous state NFT.
import { decodeTransactionBch, hexToBin, binToHex, hashTransaction } from '@bitauth/libauth';
import { decodeState, tick } from './template.js';

const tokenOf = (o) => o.token && { category: binToHex(o.token.category), amount: o.token.amount, nft: o.token.nft && { commitment: binToHex(o.token.nft.commitment) } };

export function decodeTx(entry, manifestTx) {
  const row = { ...manifestTx, status: 'missing', checks: [] };
  if (!entry.hex) { row.checks.push({ ok: false, text: 'not found on any Electrum server asked' }); return row; }
  const bin = hexToBin(entry.hex);
  const tx = decodeTransactionBch(bin);
  if (typeof tx === 'string') { row.checks.push({ ok: false, text: 'raw bytes do not decode: ' + tx }); return row; }
  row.status = entry.block ? 'confirmed' : 'mempool';
  row.block = entry.block;
  row.locktime = tx.locktime;
  row.inputs = tx.inputs.length;
  row.outputs = tx.outputs.map((o, i) => ({ i, sats: o.valueSatoshis, token: tokenOf(o) }));
  const id = hashTransaction(bin);
  row.checks.push(id === manifestTx.txid ? { ok: true, text: 'bytes hash to the listed txid' } : { ok: false, text: 'bytes hash to ' + id + ', not the listed txid' });
  return row;
}

const fail = (row, text) => row.checks.push({ ok: false, text });
const pass = (row, text) => row.checks.push({ ok: true, text });

// Walks the lifecycle in order. vault = { category, lockAmount, reward, halvingLength, startHeight } from the mint invitation.
export async function checkLifecycle(rows, vault, T) {
  let locked = 0n, released = 0n, releases = 0, tokens = 0n, state = null;
  const steps = [];          // chart points: { h, v }
  const periods = [];        // halving ticks: { h, reward }
  const sameState = (a, b) => a && b && a.rh === b.rh && a.hh === b.hh && a.rw === b.rw;
  for (const row of rows) {
    if (row.status === 'missing') continue;
    const o = row.outputs;
    if (row.action === 'mint') {
      locked = o[0]?.token?.amount ?? 0n;
      tokens = locked;
      state = decodeState(o[1]?.token?.nft?.commitment);
      row.state = state;
      if (vault) {
        o[0]?.token?.category === vault.category ? pass(row, 'token category is the funding transaction') : fail(row, 'token category differs from the invitation');
        locked === BigInt(vault.lockAmount) ? pass(row, 'locked supply equals the invitation lock amount') : fail(row, 'locked supply differs from the invitation');
        sameState(state, { rh: BigInt(vault.startHeight), hh: BigInt(vault.startHeight), rw: BigInt(vault.reward) }) ? pass(row, 'state NFT holds start height, start height, reward') : fail(row, 'state NFT differs from the invitation');
      }
      if (state) { steps.push({ h: Number(state.rh), v: Number(locked) }); periods.push({ h: Number(state.hh), reward: Number(state.rw) }); }
    } else if ((row.action === 'release' || row.action === 'finalRelease') && state && vault) {
      releases++;
      const pay = o[0]?.token?.amount ?? 0n;
      released += pay;
      const s = { rh: state.rh, hh: state.hh, rw: state.rw, bh: BigInt(row.locktime), hl: BigInt(vault.halvingLength) };
      row.release = { height: row.locktime, paid: pay };
      await tick();
      const want = T.releaseAmount(s);
      if (row.action === 'release') {
        const left = o[1]?.token?.amount ?? 0n;
        const next = decodeState(o[2]?.token?.nft?.commitment);
        row.state = next;
        pay === want ? pass(row, 'template releaseAmount = ' + want + ', the chain paid ' + pay) : fail(row, 'template says ' + want + ', the chain paid ' + pay);
        left === tokens - pay ? pass(row, 'vault keeps ' + left + ' = ' + tokens + ' - ' + pay) : fail(row, 'vault keeps ' + left + ', expected ' + (tokens - pay));
        await tick();
        const hex = T.nextStateHex(s);
        row.templateHex = hex;
        hex === o[2]?.token?.nft?.commitment ? pass(row, 'template nextStateHex equals the state NFT on chain') : fail(row, 'template nextStateHex ' + hex + ' differs from the chain');
        o[0]?.token?.category === vault.category ? pass(row, 'paid tokens are the vault category') : fail(row, 'paid tokens are another category');
        tokens = left;
        state = next;
        if (next) { steps.push({ h: row.locktime, v: Number(left) }); if (next.hh > BigInt(periods.at(-1).h)) periods.push({ h: Number(next.hh), reward: Number(next.rw) }); }
      } else {
        pay === tokens ? pass(row, 'pays every token that is left (' + pay + ')') : fail(row, 'pays ' + pay + ', ' + tokens + ' were left');
        want >= tokens ? pass(row, 'template releaseAmount ' + want + ' covers the ' + tokens + ' left, so the vault ends') : fail(row, 'template releaseAmount ' + want + ' is below the ' + tokens + ' left');
        o.length === 1 ? pass(row, 'one output: no vault output remains') : fail(row, 'outputs remain after the final release');
        tokens = 0n;
        steps.push({ h: row.locktime, v: 0 });
        row.state = null;
      }
    }
  }
  const ok = rows.every((r) => r.status !== 'missing' && r.checks.every((c) => c.ok)) && locked > 0n && released === locked;
  return { locked, released, releases, ok, steps, periods };
}
