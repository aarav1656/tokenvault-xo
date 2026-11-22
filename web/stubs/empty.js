// Node-only modules the XO state package imports at load time. The browser build uses IndexedDB, so these are never called.
export default class Unavailable { constructor() { throw new Error('not available in the browser build'); } }
export const verbose = () => ({ Database: class {} });
export const join = (...p) => p.join('/');
export const existsSync = () => false;
export const mkdirSync = () => {};
