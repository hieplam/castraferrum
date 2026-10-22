import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { loadDotEnv, readPort } from './server/config.ts';

loadDotEnv();
const root = fileURLToPath(new URL('.', import.meta.url));
const version = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version;
const apiPort = readPort(process.env, 'LOOPS_PORT', 7070);

// The UI lives in web/; the build goes to dist/web so Fastify serves it on the API port (7070).
export default defineConfig({
  root: fileURLToPath(new URL('./web', import.meta.url)),
  plugins: [react()],
  // The version Settings shows (spec 4.9): the package.json version, fixed at build time.
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: {
    outDir: fileURLToPath(new URL('./dist/web', import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5180,
    strictPort: true,
    fs: { allow: [root] },
    proxy: { '/api': { target: `http://127.0.0.1:${apiPort}` } },
  },
});
