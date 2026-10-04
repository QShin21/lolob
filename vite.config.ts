import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3888', '/uploads': 'http://127.0.0.1:3888', '/ws': { target: 'ws://127.0.0.1:3888', ws: true } } }, build: { outDir: 'dist' } });
