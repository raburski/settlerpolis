import type { ResourceNodeRenderDefinition } from '@rugged/game'

const RESOURCE_RENDER_URL = '/assets/resource-node-renders.json'
const DEBUG_LOAD_TIMING = String(import.meta.env.VITE_DEBUG_LOAD_TIMING || '').toLowerCase() === 'true'
const perfNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

type Listener = () => void

class ResourceNodeRenderService {
	private renders = new Map<string, ResourceNodeRenderDefinition>()
	private loaded = false
	private loading: Promise<void> | null = null
	private listeners = new Set<Listener>()

	async load(): Promise<void> {
		if (this.loading) return this.loading
		this.loading = this.fetchRenders()
		return this.loading
	}

	isLoaded(): boolean {
		return this.loaded
	}

	getRender(id: string | undefined | null): ResourceNodeRenderDefinition | null {
		if (!id) return null
		return this.renders.get(id) ?? null
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
			const response = await fetch(RESOURCE_RENDER_URL, { cache: 'no-cache' })
			if (!response.ok) {
				this.loaded = true
				return
			}
			const data = await response.json()
			const list = Array.isArray(data)
				? data
				: Array.isArray(data?.resourceNodeRenders)
					? data.resourceNodeRenders
					: []
			this.renders = new Map(
				list
					.filter((entry: ResourceNodeRenderDefinition) => Boolean(entry?.id))
					.map((entry: ResourceNodeRenderDefinition) => [entry.id, entry])
			)
		} catch (error) {
			void error
		} finally {
			this.loaded = true
			this.listeners.forEach((listener) => listener())
			if (DEBUG_LOAD_TIMING) {
				const elapsed = perfNow() - perfStart
				console.info(
					`[Perf] resource-node-renders loaded count=${this.renders.size} time=${elapsed.toFixed(1)}ms`
				)
			}
		}
	}
}

export const resourceNodeRenderService = new ResourceNodeRenderService()
