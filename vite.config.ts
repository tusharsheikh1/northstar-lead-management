import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API runs on :3000 and is proxied so the session cookie stays same-origin.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': { target: process.env.API_URL ?? 'http://localhost:3000', changeOrigin: false } } },
  preview: { proxy: { '/api': { target: process.env.API_URL ?? 'http://localhost:3000', changeOrigin: false } } },
});
