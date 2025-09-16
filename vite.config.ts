// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      api: path.resolve(__dirname, 'src/api'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist'
  },
  server: {
    port: 5173
  }
});

