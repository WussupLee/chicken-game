import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: 'client',
  build: { outDir: '../dist', emptyOutDir: true, rollupOptions: { input: { game: path.resolve('client/index.html'), studio: path.resolve('client/studio.html') } } },
  server: { proxy: { '/socket.io': { target: 'http://localhost:3000', ws: true }, '/api': 'http://localhost:3000' } }
});
