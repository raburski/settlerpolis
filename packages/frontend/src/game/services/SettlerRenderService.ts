import type { ProfessionType, SettlerRenderDefinition } from '@rugged/game'

const SETTLER_RENDER_URL = '/assets/settler-renders.json'
const DEBUG_LOAD_TIMING = String(import.meta.env.VITE_DEBUG_LOAD_TIMING || '').toLowerCase() === 'true'
const perfNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

type Listener = () => void

class SettlerRenderService {
	private renders = new Map<ProfessionType, SettlerRenderDefinition>()
	private loaded = false
	private loading: Promise<void> | null = null
	private listeners = new Set<Listener>()
	private debugLogged = false
	private missingLogged = new Set<ProfessionType>()

	private normalizeProfession(profession: ProfessionType | string | null | undefined): ProfessionType {
		return String(profession ?? '')
			.trim()
			.toLowerCase() as ProfessionType
	}

	async load(): Promise<void> {
		if (this.loading) return this.loading
		this.loading = this.fetchRenders()
		return this.loading
	}

	isLoaded(): boolean {
		return this.loaded
	}

	getRender(profession: ProfessionType | undefined | null): SettlerRenderDefinition | null {
		if (!profession) return null
		const key = this.normalizeProfession(profession)
		const render = this.renders.get(key) ?? null
		if (!render && this.loaded && !this.missingLogged.has(key)) {
			this.missingLogged.add(key)
			console.warn('[SettlerRenderService] Missing render for profession', {
				requested: profession,
				normalized: key,
				available: Array.from(this.renders.keys())
			})
		}
		return render
	}

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener)
		return () => {
			this.listeners.delete(listener)
		}
	}

	private async fetchRenders(): Promise<void> {
		const perfStart = DEBUG_LOAD_TIMING ? perfNow() : 0
		try {
			const response = await fetch(SETTLER_RENDER_URL, { cache: 'no-cache' })
			if (!response.ok) {
				console.warn('[SettlerRenderService] Failed to load settler renders', response.status)
				this.loaded = true
				return
			}
			const data = await response.json()
			const list = Array.isArray(data)
				? data
				: Array.isArray(data?.settlerRenders)
					? data.settlerRenders
					: []
			this.renders = new Map(
				list
					.filter((entry: SettlerRenderDefinition) => Boolean(entry?.profession))
					.map((entry: SettlerRenderDefinition) => [this.normalizeProfession(entry.profession), entry])
			)
			if (!this.debugLogged) {
				this.debugLogged = true
				console.info('[SettlerRenderService] Loaded settler renders', {
					count: this.renders.size,
					professions: Array.from(this.renders.keys())
				})
			}
		} catch (error) {
			console.warn('[SettlerRenderService] Failed to parse settler renders', error)
			void error
		} finally {
			this.loaded = true
			this.listeners.forEach((listener) => listener())
			if (DEBUG_LOAD_TIMING) {
				const elapsed = perfNow() - perfStart
				console.info(`[Perf] settler-renders loaded count=${this.renders.size} time=${elapsed.toFixed(1)}ms`)
			}
		}
	}
}

export const settlerRenderService = new SettlerRenderService()
