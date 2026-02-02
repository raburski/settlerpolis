import { GameManager, EventManager, Event, Receiver } from '@rugged/game'
import type { GameSnapshotV1 } from '@rugged/game'
import { EventBus } from '../EventBus'
import { playerService } from '../services/PlayerService'
import { LocalManager } from "./LocalManager"
import { NetworkEventManager, NetworkManager } from "./NetworkManager"
import { FrontendMapUrlService } from '../services/MapUrlService'
// Initialize BuildingService to start listening to events
import '../services/BuildingService'
// Initialize PopulationService to start listening to events
import '../services/PopulationService'
// Initialize LogisticsService to start listening to events
import '../services/LogisticsService'

const IS_REMOTE_GAME = false
const CONTENT_FOLDER = import.meta.env.VITE_GAME_CONTENT || 'settlerpolis'

// Load content using glob import
const contentModules = import.meta.glob('../../../../../content/*/index.ts', { eager: true })
const contentPath = `../../../../../content/${CONTENT_FOLDER}/index.ts`
const content = contentModules[contentPath]

// Debug: Log content loading
console.log('[Network] Loading content:', {
	contentFolder: CONTENT_FOLDER,
	contentPath,
	availableModules: Object.keys(contentModules),
	contentKeys: content ? Object.keys(content) : 'content is null/undefined',
	hasBuildings: content?.buildings ? `YES (${content.buildings.length})` : 'NO',
	hasFlags: content?.flags ? `YES (${content.flags?.length || 0})` : 'NO'
})

function getNetworkManager(): NetworkEventManager {
	if (IS_REMOTE_GAME) {
		return new NetworkManager('https://hearty-rejoicing-production.up.railway.app')
	} else {
		const silentRoutingLogs = (() => {
			const raw = import.meta.env.VITE_GAME_SILENT_ROUTING_LOGS
			if (raw === undefined) {
				return true
			}
			return String(raw).toLowerCase() === 'true'
		})()
		const localManager = new LocalManager({ silentLogs: silentRoutingLogs })
		const mapUrlService = new FrontendMapUrlService()
		const logAllowlist = (import.meta.env.VITE_GAME_LOG_ALLOWLIST || 'WorkProviderManager')
			.split(',')
			.map((entry: string) => entry.trim())
			.filter(Boolean)
		const gameManager = new GameManager(localManager.server, content, mapUrlService, { logAllowlist })
		const storageKey = `rugged:snapshots:${CONTENT_FOLDER}`
		const loadSnapshots = () => {
			const raw = localStorage.getItem(storageKey)
			if (!raw) {
				return []
			}
			try {
				const parsed = JSON.parse(raw)
				return Array.isArray(parsed) ? parsed : []
			} catch (error) {
				console.warn('[Snapshot] Failed to parse snapshot list', error)
				return []
			}
		}
		const saveSnapshots = (entries: Array<{ name: string, savedAt: number, snapshot: GameSnapshotV1 }>) => {
			localStorage.setItem(storageKey, JSON.stringify(entries))
		}
		const saveSnapshot = (name: string) => {
			const snapshot = gameManager.serialize()
			const trimmed = name?.trim() || 'Quick Save'
			const entries = loadSnapshots()
			const savedAt = Date.now()
			const existingIndex = entries.findIndex((entry) => entry.name === trimmed)
			const nextEntry = { name: trimmed, savedAt, snapshot }
			if (existingIndex >= 0) {
				entries[existingIndex] = nextEntry
			} else {
				entries.push(nextEntry)
			}
			saveSnapshots(entries)
			return snapshot
		}
		const listSnapshots = () => {
			return loadSnapshots().map((entry) => ({ name: entry.name, savedAt: entry.savedAt }))
		}
		const loadSnapshot = (name: string) => {
			const entries = loadSnapshots()
			const entry = entries.find((item) => item.name === name)
			if (!entry) {
				console.warn(`[Snapshot] No snapshot found for "${name}"`)
				return false
			}
			const snapshot = entry.snapshot as GameSnapshotV1
			gameManager.deserialize(snapshot)
			const playerId = playerService.playerId
			const player = snapshot.state.players.players.find(entry => entry.playerId === playerId)
			if (player) {
				const mapUrl = mapUrlService.getMapUrl(player.mapId)
				let resolved = false
				let fallbackTimer: number | undefined
				const handleSceneReady = (data: { mapId?: string }) => {
					if (data?.mapId !== player.mapId) {
						return
					}
					resolved = true
					EventBus.off('ui:scene:ready', handleSceneReady)
					if (fallbackTimer !== undefined) {
						window.clearTimeout(fallbackTimer)
					}
					localManager.client.emit(Receiver.All, Event.Players.CS.Join, {
						position: player.position,
						mapId: player.mapId,
						appearance: player.appearance,
						skipStartingItems: true
					})
				}
				EventBus.on('ui:scene:ready', handleSceneReady)
				fallbackTimer = window.setTimeout(() => {
					if (resolved) {
						return
					}
					EventBus.off('ui:scene:ready', handleSceneReady)
					localManager.client.emit(Receiver.All, Event.Players.CS.Join, {
						position: player.position,
						mapId: player.mapId,
						appearance: player.appearance,
						skipStartingItems: true
					})
				}, 750)
				localManager.server.emit(Receiver.Sender, Event.Map.SC.Load, {
					mapId: player.mapId,
					mapUrl,
					position: player.position,
					suppressAutoJoin: true
				}, player.playerId)
			} else {
				console.warn('[Snapshot] No matching player in snapshot to resync client state')
			}
			return true
		}
		;(window as any).__ruggedSaveSnapshot = saveSnapshot
		;(window as any).__ruggedLoadSnapshot = loadSnapshot
		;(window as any).__ruggedListSnapshots = listSnapshots
		return localManager.client
	}
}

const networkManager = getNetworkManager()
export default networkManager
