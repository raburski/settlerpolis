import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'
import { generateBuildingsModule } from '../packages/frontend/scripts/buildings-module.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const contentRoot = path.resolve(__dirname, '../content')
const gameContent = process.env.VITE_GAME_CONTENT || 'settlerpolis'
const contentDir = path.join(contentRoot, gameContent)

const buildingsModulePlugin = () => ({
    name: 'buildings-module-generator',
    configureServer(server) {
        const result = generateBuildingsModule(contentDir)
        if (result?.success) {
            // Keep output in sync for editor edits.
            server.watcher.add(result.buildingsJsonPath)
            console.log(`Generated buildings module at ${result.buildingsModulePath}`)
        }

        server.watcher.on('change', (file) => {
            if (file !== result?.buildingsJsonPath) return
            const next = generateBuildingsModule(contentDir)
            if (next?.success) {
                server.ws.send({ type: 'full-reload' })
            }
        })
    }
})

// https://vitejs.dev/config/
export default defineConfig({
    base: './',
    plugins: [
        react(),
        buildingsModulePlugin(),
    ],
    optimizeDeps: {
        exclude: ['@rugged/game']
    },
    server: {
        port: 8080,
        fs: {
            allow: [path.resolve(__dirname, '..')]
        }
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
