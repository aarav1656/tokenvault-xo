// A falling step chart on a block-height rail: tokens left in the vault after each release, with a tick at every halving.
// steps: [{ h, v }] (first entry is the start), periods: [{ h, reward }]. Every number is drawn from data; nothing is decorative.
const fmt = (n) => Number(n).toLocaleString('en-US');

export function stepChart(el, { steps, periods }) {
  if (!steps?.length) { el.innerHTML = ''; return; }
  const W = Math.max(280, el.clientWidth || 640);
  const H = W < 520 ? 250 : 330;
  const m = { l: 44, r: 16, t: 28, b: 60 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const h0 = steps[0].h, h1 = Math.max(steps.at(-1).h, h0 + 1);
  const vmax = Math.max(steps[0].v, 1);
  const x = (h) => m.l + ((h - h0) / (h1 - h0)) * pw;
  const y = (v) => m.t + (1 - v / vmax) * ph;
  const f = (n) => Math.round(n * 10) / 10;

  let line = 'M' + f(x(steps[0].h)) + ' ' + f(y(steps[0].v));
  for (const s of steps.slice(1)) line += ' H' + f(x(s.h)) + ' V' + f(y(s.v));
  const area = line + ' V' + f(y(0)) + ' H' + f(x(h0)) + ' Z';

  let g = '';
  for (const v of [...new Set([0, Math.round(vmax / 2), vmax])]) g += '<line class="grid" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + f(y(v)) + '" y2="' + f(y(v)) + '"/><text x="' + (m.l - 8) + '" y="' + f(y(v) + 4) + '" text-anchor="end">' + fmt(v) + '</text>';
  g += '<text class="ax" x="' + m.l + '" y="' + (m.t - 12) + '">tokens left</text>';

  const marks = [...periods.map((p, i) => ({ h: p.h, a: i === 0 ? 'start' : 'halving', b: p.reward + ' per block' })), { h: h1, a: 'last release', b: '' }];
  let edge = -1e9;
  const yb = y(0);
  g += '<line class="rail" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + f(yb) + '" y2="' + f(yb) + '"/>';
  marks.forEach((t, i) => {
    if (t.h < h0 || t.h > h1) return;
    const tx = x(t.h);
    g += '<line class="tick" x1="' + f(tx) + '" x2="' + f(tx) + '" y1="' + f(y(vmax)) + '" y2="' + f(yb + 10) + '" stroke-dasharray="' + (i === 0 || t.a === 'last release' ? '0' : '2 4') + '"/>';
    const text = t.a + (t.b ? ' · ' + t.b : ''), tw = Math.max(text.length * 5.6, String(t.h).length * 7);
    const anchor = tx < m.l + 36 ? 'start' : tx > W - m.r - 36 ? 'end' : 'middle';
    const left = anchor === 'start' ? tx : anchor === 'end' ? tx - tw : tx - tw / 2;
    if (left < edge + 10 && t.a !== 'start') return;
    edge = left + tw;
    g += '<text class="hl" x="' + f(tx) + '" y="' + f(yb + 26) + '" text-anchor="' + anchor + '">' + t.h + '</text><text x="' + f(tx) + '" y="' + f(yb + 40) + '" text-anchor="' + anchor + '">' + text + '</text>';
  });
  g += '<text class="ax" x="' + (W - m.r) + '" y="' + (H - 4) + '" text-anchor="end">block height</text>';

  let marksSvg = '<rect class="dot" x="' + f(x(h0) - 4) + '" y="' + f(y(steps[0].v) - 4) + '" width="8" height="8"/>';
  steps.slice(1).forEach((s, i) => {
    const prev = steps[i].v, hgt = y(s.v) - y(prev);
    marksSvg += '<rect class="dot" x="' + f(x(s.h) - 4) + '" y="' + f(y(s.v) - 4) + '" width="8" height="8"/>';
    if (hgt > 16) marksSvg += '<text class="drop" x="' + f(x(s.h) - 8) + '" y="' + f(y(prev) + hgt / 2 + 4) + '" text-anchor="end">-' + fmt(prev - s.v) + '</text>';
  });

  el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" aria-hidden="true">' + (steps.length > 1 ? '<path class="area" d="' + area + '"/>' : '') + g + '<g class="reveal"><path class="step" d="' + line + '"/>' + marksSvg + '</g></svg>';
  el.classList.remove('is-drawn'); void el.offsetWidth; el.classList.add('is-drawn');
}
