import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  server: { proxy: { '/api': 'http://127.0.0.1:3001' } },
  build: { rollupOptions: { input: { main: resolve('index.html'), events: resolve('events/index.html'), join: resolve('join/index.html'), resources: resolve('resources/index.html') } } }
});
