import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const stub = fileURLToPath(new URL('./stubs/empty.js', import.meta.url));
const shim = fileURLToPath(new URL('./stubs/shim.js', import.meta.url));
// @xo-cash/state imports native SQLite and Node path modules even for its IndexedDB storage; map them to an inert stub.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias: { 'better-sqlite3': stub, sqlite3: stub, indexeddbshim: shim, 'node:path': stub, path: stub, 'node:fs': stub, fs: stub } },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 4000 },
  define: { global: 'globalThis' },
});
