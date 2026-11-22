// Reads transactions from a public Electrum server over WebSocket: the same endpoints and calls as lib/electrum.mjs
// (blockchain.transaction.get, blockchain.transaction.get_merkle, blockchain.headers.subscribe), batched on one socket.
export const SERVERS = {
  chipnet: ['wss://chipnet.imaginary.cash:50004', 'wss://chipnet.bch.ninja:50004'],
  mainnet: ['wss://electrum.imaginary.cash:50004', 'wss://bch.imaginary.cash:50004', 'wss://bch.loping.net:50004'],
};

function ask(url, calls, ms = 20000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const out = new Array(calls.length);
    let left = calls.length;
    const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, ms);
    ws.onopen = () => calls.forEach(([method, params], id) => ws.send(JSON.stringify({ id, method, params })));
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (typeof m.id !== 'number' || out[m.id]) return;
      out[m.id] = m.error ? { error: m.error.message ?? JSON.stringify(m.error) } : { result: m.result };
      if (--left === 0) { clearTimeout(timer); ws.close(); resolve(out); }
    };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('socket error')); };
    ws.onclose = () => { if (left > 0) { clearTimeout(timer); reject(new Error('socket closed')); } };
  });
}

// Asks the servers in order until every transaction is found (mempools differ between servers).
// Returns { servers, tip, txs: [{ txid, hex?, error?, block?, server? }] }; block is a height when confirmed, undefined while in the mempool.
export async function readChain(network, txids) {
  const have = new Array(txids.length), errors = [], servers = [];
  let tip, last;
  for (const url of SERVERS[network]) {
    const need = txids.map((_, i) => i).filter((i) => !have[i]);
    if (!need.length) break;
    try {
      const r = await ask(url, [['blockchain.headers.subscribe', []], ...need.flatMap((i) => [['blockchain.transaction.get', [txids[i], false]], ['blockchain.transaction.get_merkle', [txids[i]]]])]);
      const server = new URL(url).hostname;
      servers.push(server);
      tip = Math.max(tip ?? 0, r[0].result?.height ?? 0) || undefined;
      need.forEach((i, k) => {
        const hex = r[1 + 2 * k].result;
        if (hex) have[i] = { txid: txids[i], hex, block: r[2 + 2 * k].result?.block_height, server };
        else errors[i] = r[1 + 2 * k].error;
      });
    } catch (e) { last = e; }
  }
  if (!servers.length) throw last;
  return { servers, tip, txs: txids.map((txid, i) => have[i] ?? { txid, error: errors[i] }) };
}
