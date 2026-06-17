import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        host: true,
        allowedHosts: ['docker-desktop.tail72d9a0.ts.net'],
        watch: {
            usePolling: true,
        },
        proxy: {
            '/api': {
                target: 'http://backend:5001',
                changeOrigin: true,
            }
        }
    },
    resolve: {
        alias: {
            'Plugins': path.resolve(__dirname, './src/Plugins'),
        },
    },
});

