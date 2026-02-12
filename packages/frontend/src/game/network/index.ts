import { GameManager, EventManager, Event, Receiver } from '@rugged/game'
import type { GameSnapshotV1 } from '@rugged/game'
import { EventBus } from '../EventBus'
import { playerService } from '../services/PlayerService'
import { LocalManager } from "./LocalManager"
import { WorkerManager } from "./WorkerManager"
import { NetworkEventManager, NetworkManager } from "./NetworkManager"
import { FrontendMapUrlService } from '../services/MapUrlService'
import { UiEvents } from '../uiEvents'
// Initialize BuildingService to start listening to events
import '../services/BuildingService'
// Initialize PopulationService to start listening to events
import '../services/PopulationService'
// Initialize LogisticsService to start listening to events
import '../services/LogisticsService'
// Initialize CityCharterService to start listening to events
import '../services/CityCharterService'
// Initialize ReputationService to start listening to events
import '../services/ReputationService'
import { resourceNodeRenderService } from '../services/ResourceNodeRenderService'
import { itemRenderService } from '../services/ItemRenderService'

const IS_REMOTE_GAME = false
const CONTENT_FOLDER = import.meta.env.VITE_GAME_CONTENT || 'settlerpolis'
const USE_WORKER = String(import.meta.env.VITE_GAME_USE_WORKER || 'true').toLowerCase() === 'true'

void resourceNodeRenderService.load()
void itemRenderService.load()

// Load content using glob import
const contentModules = import.meta.glob('../../../../../content/*/index.ts', { eager: true })
const contentPath = `../../../../../content/${CONTENT_FOLDER}/index.ts`
const content = contentModules[contentPath]
const cloneContentForWorker = (source: any) => {
	try {
		return JSON.parse(JSON.stringify(source))
	} catch (error) {
		console.warn('[Network] Failed to serialize content for worker, falling back to empty content', error)
		return {}
	}
}

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
		const mapBaseUrl = '/assets/maps/'
		const mapUrlService = new FrontendMapUrlService(mapBaseUrl)
		const logAllowlist = (import.meta.env.VITE_GAME_LOG_ALLOWLIST || 'WorkProviderManager')
			.split(',')
			.map((entry: string) => entry.trim())
			.filter(Boolean)
		const localManager = USE_WORKER ? null : new LocalManager({ silentLogs: silentRoutingLogs })
		const workerManager = USE_WORKER
			? new WorkerManager({
				content: cloneContentForWorker(content),
				mapBaseUrl,
				logAllowlist,
				silentLogs: silentRoutingLogs
			})
			: null
		const gameManager = USE_WORKER || !localManager
			? null
			: new GameManager(localManager.server, content, mapUrlService, { logAllowlist })
		const clientManager = (workerManager ? workerManager.client : localManager?.client) as NetworkEventManager
		const serverManager = workerManager ? workerManager.server : localManager?.server
		const storageKey = `rugged:snapshots:${CONTENT_FOLDER}`
		type SnapshotMetadata = { name: string, savedAt: number }
		type SnapshotEntry = SnapshotMetadata & { snapshot: GameSnapshotV1 }
		type StoredSnapshot = SnapshotEntry & { key: string, contentFolder: string }

		const SNAPSHOT_DB_NAME = 'rugged-snapshots'
		const SNAPSHOT_DB_VERSION = 1
		const SNAPSHOT_STORE = 'snapshots'

		const snapshotKey = (name: string) => `${CONTENT_FOLDER}:${name}`

		const isQuotaExceededError = (error: unknown) => {
			if (!error || typeof error !== 'object') {
				return false
			}
			const details = error as { name?: string, code?: number, message?: string }
			return details.name === 'QuotaExceededError'
				|| details.name === 'NS_ERROR_DOM_QUOTA_REACHED'
				|| details.code === 22
				|| details.code === 1014
				|| (typeof details.message === 'string' && details.message.toLowerCase().includes('quota'))
		}

		const parseSnapshotEntries = (raw: string | null): SnapshotEntry[] => {
			if (!raw) {
				return []
			}
			try {
				const parsed = JSON.parse(raw)
				if (!Array.isArray(parsed)) {
					return []
				}
				return parsed
					.filter((entry) => entry && typeof entry.name === 'string' && typeof entry.savedAt === 'number')
					.map((entry) => ({
						name: String(entry.name),
						savedAt: Number(entry.savedAt),
						snapshot: entry.snapshot as GameSnapshotV1
					}))
			} catch (error) {
				console.warn('[Snapshot] Failed to parse snapshot list', error)
				return []
			}
		}

		const loadSnapshotsFromLocalStorage = () => parseSnapshotEntries(localStorage.getItem(storageKey))
		const loadMetadataFromLocalStorage = (): SnapshotMetadata[] => {
			return loadSnapshotsFromLocalStorage().map((entry) => ({
				name: entry.name,
				savedAt: entry.savedAt
			}))
		}
		const saveMetadataToLocalStorage = (entries: SnapshotMetadata[]) => {
			try {
				localStorage.setItem(storageKey, JSON.stringify(entries))
			} catch (error) {
				console.warn('[Snapshot] Failed to persist snapshot metadata', error)
			}
		}

		const saveSnapshotsLegacy = (entries: SnapshotEntry[]) => {
			let next = [...entries]
			while (true) {
				try {
					localStorage.setItem(storageKey, JSON.stringify(next))
					return next
				} catch (error) {
					if (!isQuotaExceededError(error)) {
						throw error
					}
					if (next.length === 0) {
						break
					}
					next = [...next].sort((a, b) => a.savedAt - b.savedAt).slice(1)
				}
			}
			try {
				localStorage.setItem(storageKey, JSON.stringify([]))
			} catch (error) {
				console.warn('[Snapshot] Failed to reset snapshot storage after quota error', error)
			}
			throw new Error('Not enough local storage to save snapshot')
		}

		let snapshotDbPromise: Promise<IDBDatabase> | null = null
		let snapshotDbAvailable: boolean | null = null

		const openSnapshotDb = () => {
			if (snapshotDbPromise) {
				return snapshotDbPromise
			}
			if (typeof indexedDB === 'undefined') {
				return Promise.reject(new Error('IndexedDB is not available'))
			}
			snapshotDbPromise = new Promise((resolve, reject) => {
				const request = indexedDB.open(SNAPSHOT_DB_NAME, SNAPSHOT_DB_VERSION)
				request.onupgradeneeded = () => {
					const db = request.result
					if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
						const store = db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'key' })
						store.createIndex('contentFolder', 'contentFolder', { unique: false })
					} else {
						const store = request.transaction?.objectStore(SNAPSHOT_STORE)
						if (store && !store.indexNames.contains('contentFolder')) {
							store.createIndex('contentFolder', 'contentFolder', { unique: false })
						}
					}
				}
				request.onsuccess = () => resolve(request.result)
				request.onerror = () => reject(request.error ?? new Error('Failed to open snapshot database'))
				request.onblocked = () => {
					console.warn('[Snapshot] Snapshot database upgrade blocked')
				}
			})
			return snapshotDbPromise
		}

		const ensureSnapshotDbAvailable = async () => {
			if (snapshotDbAvailable !== null) {
				return snapshotDbAvailable
			}
			try {
				await openSnapshotDb()
				snapshotDbAvailable = true
			} catch (error) {
				snapshotDbAvailable = false
				console.warn('[Snapshot] IndexedDB unavailable, falling back to localStorage', error)
			}
			return snapshotDbAvailable
		}

		const waitForTransaction = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve()
			tx.onerror = () => reject(tx.error ?? new Error('Snapshot transaction failed'))
			tx.onabort = () => reject(tx.error ?? new Error('Snapshot transaction aborted'))
		})

		const idbPutSnapshot = async (entry: SnapshotEntry) => {
			const db = await openSnapshotDb()
			const tx = db.transaction(SNAPSHOT_STORE, 'readwrite')
			const store = tx.objectStore(SNAPSHOT_STORE)
			store.put({
				key: snapshotKey(entry.name),
				contentFolder: CONTENT_FOLDER,
				name: entry.name,
				savedAt: entry.savedAt,
				snapshot: entry.snapshot
			} as StoredSnapshot)
			await waitForTransaction(tx)
		}

		const idbGetSnapshot = async (name: string): Promise<SnapshotEntry | null> => {
			const db = await openSnapshotDb()
			return new Promise((resolve, reject) => {
				const tx = db.transaction(SNAPSHOT_STORE, 'readonly')
				const store = tx.objectStore(SNAPSHOT_STORE)
				const request = store.get(snapshotKey(name))
				request.onsuccess = () => {
					const result = request.result as StoredSnapshot | undefined
					if (!result) {
						resolve(null)
						return
					}
					resolve({
						name: result.name,
						savedAt: result.savedAt,
						snapshot: result.snapshot
					})
				}
				request.onerror = () => reject(request.error ?? new Error('Failed to load snapshot'))
			})
		}

		const idbListSnapshots = async (): Promise<SnapshotMetadata[]> => {
			const db = await openSnapshotDb()
			return new Promise((resolve, reject) => {
				const tx = db.transaction(SNAPSHOT_STORE, 'readonly')
				const store = tx.objectStore(SNAPSHOT_STORE)
				const useIndex = store.indexNames.contains('contentFolder')
				const request = useIndex
					? store.index('contentFolder').getAll(IDBKeyRange.only(CONTENT_FOLDER))
					: store.getAll()
				request.onsuccess = () => {
					const items = (request.result as StoredSnapshot[]) ?? []
					const filtered = useIndex ? items : items.filter((item) => item.contentFolder === CONTENT_FOLDER)
					resolve(filtered.map((item) => ({ name: item.name, savedAt: item.savedAt })))
				}
				request.onerror = () => reject(request.error ?? new Error('Failed to list snapshots'))
			})
		}

		let legacyMigrationPromise: Promise<void> | null = null
		const ensureLegacyMigration = async () => {
			if (legacyMigrationPromise) {
				return legacyMigrationPromise
			}
			legacyMigrationPromise = (async () => {
				if (!(await ensureSnapshotDbAvailable())) {
					return
				}
				const legacyEntries = loadSnapshotsFromLocalStorage()
				const hasSnapshots = legacyEntries.some((entry) => entry.snapshot)
				if (!hasSnapshots) {
					return
				}
				try {
					for (const entry of legacyEntries) {
						if (entry.snapshot) {
							await idbPutSnapshot(entry)
						}
					}
					localStorage.removeItem(storageKey)
					saveMetadataToLocalStorage(legacyEntries.map((entry) => ({
						name: entry.name,
						savedAt: entry.savedAt
					})))
				} catch (error) {
					console.warn('[Snapshot] Failed to migrate legacy snapshots', error)
				}
			})()
			return legacyMigrationPromise
		}

		const upsertMetadata = (entries: SnapshotMetadata[], entry: SnapshotMetadata) => {
			const next = [...entries]
			const existingIndex = next.findIndex((item) => item.name === entry.name)
			if (existingIndex >= 0) {
				next[existingIndex] = entry
			} else {
				next.push(entry)
			}
			return next
		}

		const saveSnapshot = async (name: string) => {
			const snapshot = workerManager
				? await workerManager.requestSnapshot()
				: gameManager?.serialize()
			if (!snapshot) {
				throw new Error('Snapshot unavailable')
			}
			const trimmed = name?.trim() || 'Quick Save'
			const savedAt = Date.now()
			const nextEntry: SnapshotEntry = { name: trimmed, savedAt, snapshot }

			await ensureLegacyMigration()
			if (await ensureSnapshotDbAvailable()) {
				try {
					await idbPutSnapshot(nextEntry)
					const nextMetadata = upsertMetadata(loadMetadataFromLocalStorage(), { name: trimmed, savedAt })
					saveMetadataToLocalStorage(nextMetadata)
					return snapshot
				} catch (error) {
					console.warn('[Snapshot] Failed to save snapshot to IndexedDB, falling back to localStorage', error)
				}
			}
			const entries = loadSnapshotsFromLocalStorage()
			const existingIndex = entries.findIndex((entry) => entry.name === trimmed)
			if (existingIndex >= 0) {
				entries[existingIndex] = nextEntry
			} else {
				entries.push(nextEntry)
			}
			saveSnapshotsLegacy(entries)
			return snapshot
		}
		const listSnapshots = async () => {
			await ensureLegacyMigration()
			if (await ensureSnapshotDbAvailable()) {
				try {
					const metadata = await idbListSnapshots()
					saveMetadataToLocalStorage(metadata)
					return metadata
				} catch (error) {
					console.warn('[Snapshot] Failed to list snapshots from IndexedDB', error)
				}
			}
			return loadMetadataFromLocalStorage()
		}
		const loadSnapshot = async (name: string) => {
			await ensureLegacyMigration()
			let entry: SnapshotEntry | null = null
			if (await ensureSnapshotDbAvailable()) {
				try {
					entry = await idbGetSnapshot(name)
				} catch (error) {
					console.warn('[Snapshot] Failed to load snapshot from IndexedDB', error)
				}
			}
			if (!entry) {
				const legacyEntries = loadSnapshotsFromLocalStorage()
				entry = legacyEntries.find((item) => item.name === name) ?? null
			}
			if (!entry || !entry.snapshot) {
				console.warn(`[Snapshot] No snapshot found for "${name}"`)
				return false
			}
			const snapshot = entry.snapshot as GameSnapshotV1
			if (workerManager) {
				await workerManager.loadSnapshot(snapshot)
			} else {
				gameManager?.deserialize(snapshot)
			}
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
					EventBus.off(UiEvents.Scene.Ready, handleSceneReady)
					if (fallbackTimer !== undefined) {
						window.clearTimeout(fallbackTimer)
					}
					clientManager.emit(Receiver.All, Event.Players.CS.Join, {
						position: player.position,
						mapId: player.mapId,
						appearance: player.appearance,
						skipStartingItems: true
					})
				}
				EventBus.on(UiEvents.Scene.Ready, handleSceneReady)
				fallbackTimer = window.setTimeout(() => {
					if (resolved) {
						return
					}
					EventBus.off(UiEvents.Scene.Ready, handleSceneReady)
					clientManager.emit(Receiver.All, Event.Players.CS.Join, {
						position: player.position,
						mapId: player.mapId,
						appearance: player.appearance,
						skipStartingItems: true
					})
				}, 750)
				if (workerManager) {
					EventBus.emit(Event.Map.SC.Load, {
						mapId: player.mapId,
						mapUrl,
						position: player.position,
						suppressAutoJoin: true
					})
				} else {
					serverManager?.emit(Receiver.Sender, Event.Map.SC.Load, {
						mapId: player.mapId,
						mapUrl,
						position: player.position,
						suppressAutoJoin: true
					}, player.playerId)
				}
			} else {
				console.warn('[Snapshot] No matching player in snapshot to resync client state')
			}
			return true
		}
		;(window as any).__ruggedSaveSnapshot = saveSnapshot
		;(window as any).__ruggedLoadSnapshot = loadSnapshot
		;(window as any).__ruggedListSnapshots = listSnapshots
		return clientManager
	}
}

const networkManager = getNetworkManager()
export default networkManager
