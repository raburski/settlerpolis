import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
    base: './',
    plugins: [
        react(),
    ],
    optimizeDeps: {
        exclude: ['@rugged/game']
    },
    server: {
        port: 8080
    },
    resolve: {
        alias: {
            '@rugged/backend': path.resolve(__dirname, '../packages/backend/src'),
            '@rugged/game': path.resolve(__dirname, '../packages/game/src')
        }
    },
    assetsInclude: ['**/*.json'],
    root: path.resolve(__dirname, '../packages/frontend')
})
