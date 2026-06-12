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
        }
    },
    resolve: {
        alias: {
            'Plugins': path.resolve(__dirname, '../Plugins'),
        },
    },
});
