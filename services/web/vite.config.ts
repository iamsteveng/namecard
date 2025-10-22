import path from 'path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const resolvedPort = Number.parseInt(process.env['VITE_PORT'] ?? process.env['PORT'] ?? '3000', 10);
const serverPort = Number.isFinite(resolvedPort) ? resolvedPort : 3000;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@namecard/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    port: serverPort,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
