import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const buildMsg = () => {
    return {
        name: 'buildmsg',
        buildStart() {
            process.stdout.write(`Building for production...\n`);
        },
        buildEnd() {
            process.stdout.write(`✨ Done ✨\n`);
        }
    };
};

export default defineConfig({
    base: './',
    plugins: [
        react(),
        buildMsg()
    ],
    logLevel: 'warning',
    build: {
        rollupOptions: {},
        minify: 'terser',
        terserOptions: {
            compress: {
                passes: 2
            },
            mangle: true,
            format: {
                comments: false
            }
        }
    },
    resolve: {
        alias: {
            '@rugged/backend': path.resolve(__dirname, '../packages/backend/src'),
            '@rugged/game': path.resolve(__dirname, '../packages/game/src')
        },
        dedupe: ['@babylonjs/core', '@babylonjs/loaders']
    },
    root: path.resolve(__dirname, '../packages/frontend')
});
