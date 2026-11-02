import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { normalizeApiBaseUrl } from './src/services/api-url.js';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  envPrefix: [],
  define: {
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(normalizeApiBaseUrl(loadEnv(mode, process.cwd(), 'VITE_API_BASE_URL').VITE_API_BASE_URL)),
  },
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
  },
}));
