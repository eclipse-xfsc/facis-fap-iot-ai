import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
export default defineConfig({
    plugins: [vue()],
    // Relative base path so UIBUILDER can serve from /aiInsight/ without broken asset refs
    base: './',
    resolve: {
        alias: { '@': resolve(__dirname, 'src') }
    },
    server: {
        port: 3000,
        proxy: {
            '/api': 'http://localhost:8080'
        }
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        // Ensure index.html works as a standalone SPA entry point
        rollupOptions: {
            input: resolve(__dirname, 'index.html')
        }
    }
});
