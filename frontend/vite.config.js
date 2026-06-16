import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        host: true,
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

