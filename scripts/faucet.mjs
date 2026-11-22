// Usage: node scripts/faucet.mjs <bchtest address> <sats>
import { requestChipnetSats } from '../lib/faucet.mjs';
const [address, sats = '2000000'] = process.argv.slice(2);
if (!address) throw new Error('usage: node scripts/faucet.mjs <bchtest address> <sats>');
const res = await requestChipnetSats(address, sats);
console.log('txid', res.txid, 'fee', res.fee);
