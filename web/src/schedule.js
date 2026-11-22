// Release schedule from the XO template's own scripts. The app chooses only the block height each release runs to
// (the end of the current halving period); the amount, the halving test and the next state all come from template scripts.
import { tick } from './template.js';

export const MAX_ROWS = 64;

// hooks.row(row) fires as soon as a row's numbers are known, hooks.hex(index, hex) when its next state commitment is evaluated.
export async function runSchedule(T, { lock, reward, hl, start }, hooks, token) {
  const rows = [];
  let rh = start, hh = start, rw = reward, tokens = lock;
  for (let n = 1; n <= MAX_ROWS; n++) {
    const s = { rh, hh, rw, bh: hh + hl - 1n, hl };
    const amount = T.releaseAmount(s);
    const halving = T.crossesHalving(s);
    const eol = tokens - amount <= 0n;
    const row = { n, bh: s.bh, s, halving, eol, amount: eol ? tokens : amount, left: eol ? 0n : tokens - amount, hex: eol ? null : undefined };
    rows.push(row);
    hooks.row(row, rows);
    if (eol) break;
    rh = T.nextReleaseHeight(s); hh = T.nextHalvingHeight(s); rw = T.nextReward(s); tokens = row.left;
    await tick();
    if (token.cancelled) return null;
  }
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].eol) continue;
    if (token.cancelled) return null;
    rows[i].hex = T.nextStateHex(rows[i].s);
    hooks.hex(i, rows[i].hex);
    await tick();
  }
  const last = rows.at(-1);
  return { rows, ended: last.eol, remaining: last.left, total: rows.reduce((a, r) => a + r.amount, 0n) };
}
