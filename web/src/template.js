// The XO template's own scripts, evaluated in the browser exactly as the engine evaluates a token field expression:
// compileCashAssemblyString from @xo-cash/utils, variables as bigint, $(releaseAmount) in bigint mode, $(nextStateHex) as utf8.
import { compileCashAssemblyString } from '@xo-cash/utils';

export const tick = () => new Promise((r) => setTimeout(r));
export let evaluations = 0;

export function loadTemplate(json) {
  const run = (text, mode, variables) => {
    evaluations++;
    return compileCashAssemblyString({ cashAssemblyText: text, variables, evaluationDecodeMode: mode, templateVariables: json.variables, templateScripts: json.scripts });
  };
  const vars = ({ rh, hh, rw, bh, hl }) => ({ releaseHeight: rh, halvingHeight: hh, currentReward: rw, blockHeight: bh, halvingLength: hl });
  const num = (name) => (s) => BigInt(run('$(' + name + ')', 'bigint', vars(s)));
  return {
    json,
    releaseAmount: num('releaseAmount'),
    crossesHalving: (s) => num('halvingNow')(s) === 1n,
    nextReleaseHeight: num('nextReleaseHeight'),
    nextHalvingHeight: num('nextHalvingHeight'),
    nextReward: num('nextReward'),
    // 24 bytes as hex: release height, halving height, reward, 8 bytes little endian each
    nextStateHex: (s) => run('$(nextStateHex)', 'utf8', vars(s)),
  };
}

// 24 byte commitment hex -> the three numbers
export function decodeState(hex) {
  if (typeof hex !== 'string' || hex.length !== 48) return null;
  const f = (i) => { const b = hex.slice(i * 16, i * 16 + 16).match(/../g).reverse().join(''); return BigInt('0x' + b); };
  return { rh: f(0), hh: f(1), rw: f(2) };
}
