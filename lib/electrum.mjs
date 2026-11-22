// Minimal JSON-RPC over WebSocket to a public Electrum server, used to read the chain without the XO engine.
export const SERVERS = {
  chipnet: ['wss://chipnet.imaginary.cash:50004', 'wss://chipnet.bch.ninja:50004'],
  mainnet: ['wss://electrum.imaginary.cash:50004', 'wss://bch.imaginary.cash:50004', 'wss://bch.loping.net:50004'],
};
export async function rpc(network, method, params = []) {
  let lastError;
  for (const url of SERVERS[network]) {
    try {
      return await new Promise((resolve, reject) => {
        const ws = new WebSocket(url);
        const t = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 20000);
        ws.onopen = () => ws.send(JSON.stringify({ id: 1, method, params }));
        ws.onmessage = (e) => { clearTimeout(t); ws.close(); const m = JSON.parse(e.data); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); };
        ws.onerror = () => { clearTimeout(t); reject(new Error('socket error')); };
      });
    } catch (error) { lastError = error; }
  }
  throw lastError;
}
