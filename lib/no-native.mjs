// Node only: @xo-cash/state imports the native sqlite modules at load time even with IndexedDB storage.
// Map them to an inert module so no native addon has to be built. Storage is fake-indexeddb (pure JS).
import { register } from 'node:module';
const inert = 'data:text/javascript,' + encodeURIComponent('export default class Inert{constructor(){throw new Error("sqlite storage unavailable, use StorageType.INDEXEDDB")}};export const verbose=()=>({Database:class{}});');
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,n){if(s==='sqlite3'||s==='better-sqlite3')return{url:${JSON.stringify(inert)},shortCircuit:true};return n(s,c)}`));
