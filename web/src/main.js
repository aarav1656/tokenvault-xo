import './style.css';
import { readChain } from './electrum.js';
import { loadTemplate, decodeState, evaluations } from './template.js';
import { decodeTx, checkLifecycle } from './readback.js';
import { runSchedule, MAX_ROWS } from './schedule.js';
import { stepChart } from './chart.js';

const EXPLORER = {
  chipnet: (t) => 'https://chipnet.chaingraph.cash/tx/' + t,
  mainnet: (t) => 'https://blockchair.com/bitcoin-cash/transaction/' + t,
};
const ACTION_ORDER = ['fundMint', 'mint', 'prepareFeeCoin', 'release', 'finalRelease', 'reclaim', 'sweep'];
// Which covenant function (or plain wallet script) each XO action spends. From template/tokenvault.template.mjs.
const COVENANT = {
  fundMint: 'pays the TokenVault_Mint covenant', mint: 'TokenVault_Mint.mint', prepareFeeCoin: 'fund wallet, p2pkh',
  release: 'TokenVault_Release.release', finalRelease: 'TokenVault_Release.release, end of life', reclaim: 'TokenVault_Mint.spend', sweep: 'fund wallet, p2pkh',
};
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => BigInt(n).toLocaleString('en-US');
const short = (t) => t.slice(0, 8) + '…' + t.slice(-6);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const getJSON = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });

function countTo(el, to) {
  const end = Number(to);
  el.textContent = fmt(to);
  if (reduced || !Number.isSafeInteger(end) || document.visibilityState !== 'visible') return;
  const t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / 800); el.textContent = fmt(Math.round(end * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

async function copy(text, btn) {
  const label = btn.dataset.label ?? (btn.dataset.label = btn.textContent);
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.append(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; } ta.remove();
  }
  btn.dataset.state = ok ? 'done' : 'error';
  btn.textContent = ok ? 'copied' : 'copy failed';
  setTimeout(() => { delete btn.dataset.state; btn.textContent = label; }, 1800);
}

const [manifest, templateJson] = await Promise.all([getJSON('data/manifest.json'), getJSON('data/tokenvault.template.json')]);
const T = loadTemplate(templateJson);
const nets = ['mainnet', 'chipnet'].filter((n) => manifest.networks[n]);
const actionName = (a) => templateJson.actions[a]?.name ?? a;
$('footTemplate').textContent = manifest.template.identifier;

// ---------- 01 proof ----------
const proofRow = (net, tx, i) => `<tr>
  <td class="n">${String(i + 1).padStart(2, '0')}</td>
  <td><span class="act">${esc(actionName(tx.action))}<small>${esc(tx.action)}</small></span></td>
  <td class="what">${esc(templateJson.actions[tx.action]?.description ?? '')}</td>
  <td class="txid"><a href="${EXPLORER[net](tx.txid)}" rel="noopener" title="${tx.txid}">${short(tx.txid)}</a></td>
  <td class="tools"><button class="btn btn--line btn--sm" type="button" data-copy="invitation" data-path="data/invitations/${esc(tx.dir)}/${esc(tx.file)}">copy invitation JSON</button></td>
</tr>`;
const proofTable = (net, txs) => `<table class="ledger"><thead><tr><th scope="col">#</th><th scope="col">action</th><th scope="col">what it does</th><th scope="col">transaction on ${net}</th><th scope="col"><span class="sr">invitation</span></th></tr></thead><tbody>${txs.map((t, i) => proofRow(net, t, i)).join('')}</tbody></table>`;
$('proofNets').innerHTML = nets.map((net) => {
  const d = manifest.networks[net];
  return `<div class="net"><div class="net__head"><h3>${net}</h3><p class="net__meta data">${d.transactions.length} lifecycle transactions · template ${manifest.template.identifier.slice(0, 8)}…${manifest.template.identifier.slice(-4)}</p>
    <button class="btn" type="button" data-copy="template" data-path="data/${esc(manifest.template.file)}">copy template JSON</button></div>
    ${proofTable(net, d.transactions)}
    ${d.recovery?.length ? `<h4 class="label net__sub">recovery paths, same template</h4>${proofTable(net, d.recovery)}` : ''}</div>`;
}).join('');
$('proofNets').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-copy]');
  if (!b) return;
  try { await copy(await fetch(b.dataset.path).then((r) => r.text()), b); } catch { b.dataset.state = 'error'; b.textContent = 'copy failed'; }
});

// ---------- 02 live readback and the hero ----------
const results = {};
let active = nets.find((n) => manifest.networks[n].vault) ?? nets[0];

const outLabel = (action, i) => {
  const tx = templateJson.transactions[templateJson.actions[action]?.transaction];
  const name = tx?.outputs.find((o) => o.outputIndex === i)?.output;
  return templateJson.outputs[name]?.name ?? '';
};
function txRow(tx, i, net) {
  const st = tx.status === 'missing' ? '<span class="badge st st--missing">not found</span>' : tx.status === 'confirmed' ? '<span class="badge st">block ' + tx.block + '</span>' : '<span class="badge st st--mempool">in mempool</span>';
  const outs = (tx.outputs ?? []).map((o) => {
    const label = esc(outLabel(tx.action, o.i) || 'Change');
    if (o.token?.nft) return '<div class="out"><dt>out ' + o.i + '</dt><dd>state NFT · ' + label + '</dd></div>';
    if (o.token) return '<div class="out"><dt>out ' + o.i + '</dt><dd><b>' + fmt(o.token.amount) + '</b> tokens · ' + label + '</dd></div>';
    return '<div class="out"><dt>out ' + o.i + '</dt><dd>' + fmt(o.sats) + ' sats · ' + label + '</dd></div>';
  }).join('');
  const stateOut = (tx.outputs ?? []).find((o) => o.token?.nft);
  const s = stateOut && decodeState(stateOut.token.nft.commitment);
  const state = s ? '<div class="state"><span class="label">state NFT decoded</span>release height <b>' + s.rh + '</b> · halving height <b>' + s.hh + '</b> · reward <b>' + s.rw + '</b> per block</div>' : '';
  const lock = tx.release ? '<div class="state"><span class="label">release</span><b>' + fmt(tx.release.paid) + '</b> tokens up to height <b>' + tx.release.height + '</b></div>' : '';
  const chk = tx.checks.map((c) => '<div class="chk' + (c.ok ? '' : ' is-bad') + '">' + '<span>' + esc(c.text) + '</span></div>').join('');
  return '<li class="tx"><span class="tx__n">' + String(i + 1).padStart(2, '0') + '</span><div class="tx__who"><span class="act">' + esc(actionName(tx.action)) + '<small>' + esc(tx.action) + '</small></span>' + st +
    '<div class="txid"><a href="' + EXPLORER[net](tx.txid) + '" rel="noopener" title="' + tx.txid + '">' + short(tx.txid) + '</a></div></div><dl class="tx__out">' + outs + lock + state + '</dl><div class="tx__chk">' + chk + '</div></li>';
}

function paintNet(net) {
  const r = results[net];
  const host = $('readNets').querySelector('[data-net="' + net + '"]');
  if (!host) return;
  if (r.error) {
    host.innerHTML = '<p class="verdict is-bad">could not reach an electrum server</p><p class="verdict__sub">' + esc(r.error) + '</p><button class="btn btn--line" type="button" data-retry="' + net + '">read again</button>';
    return;
  }
  const { sum, rows, server, tip } = r;
  const found = rows.filter((x) => x.status !== 'missing').length;
  const conf = rows.filter((x) => x.status === 'confirmed').length;
  const bad = rows.flatMap((x) => x.checks.filter((c) => !c.ok).map((c) => actionName(x.action) + ': ' + c.text));
  const verdict = sum
    ? 'locked <b>' + fmt(sum.locked) + '</b>, released <b>' + fmt(sum.released) + '</b> across <b>' + sum.releases + '</b> release' + (sum.releases === 1 ? '' : 's')
    : 'no vault lifecycle listed';
  host.innerHTML = '<p class="verdict' + (bad.length ? ' is-bad' : '') + '" role="status">' + verdict + '</p>' +
    '<p class="verdict__sub">' + found + ' of ' + rows.length + ' transactions found on ' + net + ' through ' + esc(server) + ' at height ' + tip + ' · ' + conf + ' confirmed, ' + (found - conf) + ' in the mempool · ' +
    (bad.length ? 'mismatch: ' + esc(bad[0]) : 'every check below passes, including each release against the template') + '.</p>' +
    '<ol class="txs">' + rows.map((x, i) => (i === r.lifeCount ? '<li class="txs__sub label">recovery paths, same template</li>' : '') + txRow(x, i < r.lifeCount ? i : i - r.lifeCount, net)).join('') + '</ol>';
}

function paintHero() {
  const r = results[active];
  const status = $('heroStatus');
  if (!r) return;
  if (r.error) { status.className = 'status is-bad'; status.textContent = 'No Electrum server answered: ' + r.error + '.'; return; }
  const { sum, rows, server, tip } = r;
  if (!sum) { status.textContent = 'No vault lifecycle is listed for ' + active + '.'; return; }
  countTo($('figLocked'), sum.locked); countTo($('figReleased'), sum.released); countTo($('figReleases'), sum.releases);
  const bad = rows.flatMap((x) => x.checks.filter((c) => !c.ok).map((c) => actionName(x.action) + ': ' + c.text));
  const found = rows.filter((x) => x.status !== 'missing').length;
  status.className = 'status' + (bad.length ? ' is-bad' : '');
  status.textContent = bad.length
    ? 'Mismatch on ' + active + ': ' + bad[0] + '.'
    : 'Read from ' + server + ' at ' + active + ' height ' + tip + ': ' + found + ' of ' + rows.length + ' transactions found, ' + sum.releases + ' of ' + sum.releases + ' releases agree with the template.';
  $('heroCaption').textContent = 'Tokens left in the vault after each release, by block height on ' + active + ', decoded from ' + found + ' transactions. Ticks mark each halving period.';
  $('heroChart').setAttribute('aria-label', 'Vault balance on ' + active + ' falls from ' + fmt(sum.locked) + ' to 0 across ' + sum.releases + ' releases');
  drawHero();
}
function drawHero() { const r = results[active]; if (r?.sum) stepChart($('heroChart'), r.sum); }

async function readNet(net) {
  const d = manifest.networks[net];
  const list = [...d.transactions, ...(d.recovery ?? [])];
  results[net] = null;
  $('readNets').querySelector('[data-net="' + net + '"]').innerHTML = '<p class="verdict" role="status">reading ' + net + '</p><p class="verdict__sub">Asking a public Electrum server for ' + list.length + ' transactions.</p>';
  try {
    const chain = await readChain(net, list.map((t) => t.txid));
    const rows = list.map((t, i) => decodeTx(chain.txs[i], t));
    const life = rows.slice(0, d.transactions.length);
    const sum = d.vault ? await checkLifecycle(life, d.vault, T) : null;
    results[net] = { rows, sum, lifeCount: d.transactions.length, server: chain.servers.join(' and '), tip: chain.tip };
  } catch (e) { results[net] = { error: e.message }; }
  paintNet(net);
  if (net === active) paintHero();
}

$('readNets').innerHTML = nets.map((net) => '<div class="net"><div class="net__head"><h3>' + net + '</h3></div><div data-net="' + net + '"></div></div>').join('');
$('readNets').addEventListener('click', (e) => { const b = e.target.closest('[data-retry]'); if (b) readNet(b.dataset.retry); });

if (nets.length > 1) {
  const sw = $('netSwitch'); sw.hidden = false;
  sw.innerHTML = nets.map((n) => '<button class="btn btn--line btn--sm" type="button" data-net="' + n + '" aria-pressed="' + (n === active) + '">' + n + '</button>').join('');
  sw.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-net]'); if (!b) return;
    active = b.dataset.net; sw.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    paintHero();
  });
}
nets.forEach(readNet);

// ---------- 03 calculator ----------
const vault0 = manifest.networks[active]?.vault;
const inputs = { lock: $('inLock'), reward: $('inReward'), hl: $('inHalving'), start: $('inStart') };
if (vault0) { inputs.lock.value = vault0.lockAmount; inputs.reward.value = vault0.reward; inputs.hl.value = vault0.halvingLength; inputs.start.value = vault0.startHeight; }
const reset = $('calcReset');
const parse = () => {
  const p = {}; const errs = [];
  for (const [k, el] of Object.entries(inputs)) {
    const ok = /^\d{1,15}$/.test(el.value.trim());
    el.setAttribute('aria-invalid', String(!ok));
    if (!ok) errs.push(el.closest('label').firstElementChild.textContent + ' must be a whole number');
    else p[k] = BigInt(el.value.trim());
  }
  if (errs.length) return { errs };
  // the ranges the covenants enforce: TokenVault_Mint.mint and TokenVault_Release.release
  if (p.lock < 1n) errs.push('tokens locked must be at least 1');
  if (p.reward < 1n || p.reward > p.lock) errs.push('reward per block must be between 1 and the tokens locked');
  if (p.hl < 1n || p.hl > 500000000n) errs.push('blocks per halving must be between 1 and 500,000,000');
  if (p.start > 500000000n) errs.push('start height must be at most 500,000,000');
  return errs.length ? { errs } : { p };
};
let token = { cancelled: true };
const rowsEl = $('calcRows');
function rowHtml(r) {
  const hex = r.eol ? '<span class="wait">none: the vault ends</span>' : r.hex ? '<span class="hx" title="release height">' + r.hex.slice(0, 16) + '</span><span class="hx" title="halving height">' + r.hex.slice(16, 32) + '</span><span class="hx" title="reward">' + r.hex.slice(32) + '</span>' : '<span class="wait">evaluating nextStateHex</span>';
  return '<tr class="' + (r.eol ? 'eol' : '') + '"><td class="n">' + r.n + '</td><td>' + r.bh + '<span class="halve">reward ' + r.s.rw + ' per block</span>' + '</td><td class="num big">' + fmt(r.amount) + '</td><td class="hex">' + hex + '</td><td class="num">' + fmt(r.left) + '</td><td>' + (r.eol ? 'yes, the vault ends' : 'no') + '</td></tr>';
}
let calc = null;
async function recalc() {
  token.cancelled = true;
  const { errs, p } = parse();
  const err = $('calcErr');
  reset.hidden = !vault0 || (inputs.lock.value === vault0.lockAmount && inputs.reward.value === vault0.reward && inputs.hl.value === vault0.halvingLength && inputs.start.value === vault0.startHeight);
  if (errs) { err.hidden = false; err.textContent = errs[0] + '.'; return; }
  err.hidden = true;
  const mine = token = { cancelled: false };
  rowsEl.innerHTML = '';
  $('calcSum').textContent = 'Evaluating the template.';
  const t0 = performance.now(), e0 = evaluations;
  const view = [];
  try {
    const out = await runSchedule(T, { lock: p.lock, reward: p.reward, hl: p.hl, start: p.start }, {
      row: (r) => { view.push(r); rowsEl.insertAdjacentHTML('beforeend', rowHtml(r)); },
      hex: (i, hex) => { rowsEl.children[i].outerHTML = rowHtml(view[i]); },
    }, mine);
    if (!out || mine.cancelled) return;
    calc = { p, out };
    const steps = [{ h: Number(p.start), v: Number(p.lock) }, ...out.rows.map((r) => ({ h: Number(r.bh), v: Number(r.left) }))];
    const periods = []; for (const r of out.rows) if (!periods.length || periods.at(-1).h !== Number(r.s.hh)) periods.push({ h: Number(r.s.hh), reward: Number(r.s.rw) });
    $('calcChart').setAttribute('aria-label', 'Schedule: ' + out.rows.length + ' releases, ' + fmt(p.lock) + ' tokens down to ' + fmt(out.remaining));
    stepChart($('calcChart'), { steps, periods });
    calcSpec = { steps, periods };
    $('calcSum').textContent = out.rows.length + ' release' + (out.rows.length === 1 ? '' : 's') + ' pay ' + fmt(out.total) + ' of ' + fmt(p.lock) + ' tokens by height ' + out.rows.at(-1).bh +
      (out.ended ? ', where the vault ends.' : '; ' + fmt(out.remaining) + ' tokens remain after the first ' + MAX_ROWS + ' releases.') +
      ' ' + (evaluations - e0) + ' template evaluations in ' + Math.round(performance.now() - t0) + ' ms.';
  } catch (e) {
    if (mine.cancelled) return;
    err.hidden = false; err.textContent = 'The template rejected these inputs: ' + e.message;
  }
}
let calcSpec = null, timer;
const later = () => { clearTimeout(timer); timer = setTimeout(recalc, 250); };
Object.values(inputs).forEach((el) => el.addEventListener('input', later));
$('calcForm').addEventListener('submit', (e) => e.preventDefault());
if (vault0) { reset.textContent = 'use the ' + active + ' vault read from the chain'; reset.addEventListener('click', () => { inputs.lock.value = vault0.lockAmount; inputs.reward.value = vault0.reward; inputs.hl.value = vault0.halvingLength; inputs.start.value = vault0.startHeight; recalc(); }); }
recalc();

// ---------- 04 migrated ----------
(async () => {
  const sources = await Promise.all(['TokenVault_Mint', 'TokenVault_Release'].map((n) => fetch('data/contracts/' + n + '.cash').then((r) => r.text()).then((text) => ({ n, text }))));
  $('origFuncs').innerHTML = sources.map(({ n, text }) => {
    const c = /contract\s+(\w+)\(([^)]*)\)/.exec(text);
    const fns = [...text.matchAll(/function\s+(\w+)\(([^)]*)\)/g)].map((m) => '<div>' + esc(m[1]) + '(' + esc(m[2]) + ')</div>').join('');
    return '<li><b>' + esc(c[1]) + '</b>(' + esc(c[2].replace(/\s+/g, ' ').trim().replace(/,$/, '')) + ')' + fns + '</li>';
  }).join('');
  $('origSrc').innerHTML = sources.map(({ n, text }, i) => '<details><summary>' + n + '.cash, full source</summary><pre class="src" tabindex="0">' + esc(text) + '</pre></details>').join('');
})();
const onChain = (a) => { for (const net of nets) { const d = manifest.networks[net]; const t = [...d.transactions, ...(d.recovery ?? [])].find((x) => x.action === a); if (t) return { net, t }; } };
$('xoActs').innerHTML = ACTION_ORDER.filter((a) => templateJson.actions[a]).map((a) => {
  const o = onChain(a);
  return '<li><div><span class="act">' + esc(actionName(a)) + '<small>' + a + '</small></span></div><div><p>' + esc(templateJson.actions[a].description) + '</p><span class="acts__fn">' + esc(COVENANT[a]) + '</span></div>' +
    (o ? '<p class="acts__on">on ' + o.net + ': <a class="txid" href="' + EXPLORER[o.net](o.t.txid) + '" rel="noopener">' + short(o.t.txid) + '</a></p>' : '') + '</li>';
}).join('');

let lastW = innerWidth;
addEventListener('resize', () => { if (innerWidth === lastW) return; lastW = innerWidth; drawHero(); if (calcSpec) stepChart($('calcChart'), calcSpec); });
