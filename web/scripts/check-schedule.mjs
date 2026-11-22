// Runnable check: the release schedule the page renders (template scripts, via src/schedule.js) equals an independent model
// written from the CashScript source (as test/scenarios.mjs does). Exits 1 on any difference.
// Usage: node web/scripts/check-schedule.mjs [path/to/template.json]
import { readFileSync } from 'node:fs';
import { loadTemplate } from '../src/template.js';
import { runSchedule } from '../src/schedule.js';

const le8 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b.toString('hex'); };
function model(lock, reward, hl, start) {
  const rows = []; let rh = start, hh = start, rw = reward, tokens = lock;
  for (let n = 1; n <= 64; n++) {
    const bh = hh + hl - 1n; let nrh = bh, nhh = hh, nrw = rw, rel = (bh - rh + 1n) * rw;
    if (bh - hh + 1n >= hl) { nrh = hh + hl; nhh = nrh; nrw = rw / 2n > 1n ? rw / 2n : 1n; rel = (nrh - rh) * rw; }
    const eol = tokens - rel <= 0n;
    rows.push({ bh, amount: eol ? tokens : rel, left: eol ? 0n : tokens - rel, hex: eol ? null : le8(nrh) + le8(nhh) + le8(nrw), eol });
    if (eol) break;
    tokens -= rel; rh = nrh; hh = nhh; rw = nrw;
  }
  return rows;
}

const T = loadTemplate(JSON.parse(readFileSync(process.argv[2] ?? new URL('../public/data/tokenvault.template.json', import.meta.url), 'utf8')));
let bad = 0;
for (const [lock, reward, hl, start] of [[60n, 8n, 4n, 300183n], [1000n, 16n, 10n, 123456n], [7n, 7n, 1n, 0n], [500n, 3n, 5n, 99n]]) {
  const got = await runSchedule(T, { lock, reward, hl, start }, { row() {}, hex() {} }, { cancelled: false });
  const want = model(lock, reward, hl, start).slice(0, 64);
  const same = got.rows.length === want.length && want.every((w, i) => got.rows[i].bh === w.bh && got.rows[i].amount === w.amount && got.rows[i].left === w.left && got.rows[i].hex === (w.hex ?? null) && got.rows[i].eol === w.eol);
  console.log(same ? 'ok  ' : 'FAIL', 'lock', lock, 'reward', reward, 'halving', hl, 'start', start, 'rows', got.rows.length);
  if (!same) bad++;
}
process.exit(bad ? 1 : 0);
