import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
export default defineConfig({
    plugins: [vue()],
    // Absolute base path matching the ORCE/uibuilder mount point. The vue-router
    // history needs an absolute base, and asset URLs need to resolve correctly
    // regardless of the current SPA route. Override at build time with
    // `BASE_PATH=/foo/ npm run build` for a different deploy origin.
    // `||` (not `??`) so an empty BASE_PATH falls through to the default rather
    // than producing a broken bundle with no base path.
    base: process.env.BASE_PATH || '/aiInsight/',
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
