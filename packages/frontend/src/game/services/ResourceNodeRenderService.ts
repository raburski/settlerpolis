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

	getRenderModel(id: string | undefined | null, seedKey?: string | number): ResourceNodeRenderModel | null {
		const definition = this.getRender(id)
		return resolveResourceNodeRender(definition, seedKey)
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

type ResourceNodeRenderModel = {
	modelSrc: string
	transform?: {
		rotation?: { x: number; y: number; z: number }
		scale?: { x: number; y: number; z: number }
		elevation?: number
		offset?: { x: number; y: number; z: number }
	}
	weight?: number
}

function resolveResourceNodeRender(
	definition: ResourceNodeRenderDefinition | null,
	seedKey?: string | number
): ResourceNodeRenderModel | null {
	if (!definition) return null
	const variants = Array.isArray(definition.renders)
		? definition.renders.filter((entry) => Boolean(entry?.modelSrc))
		: []
	if (variants.length > 0) {
		if (variants.length === 1) {
			return variants[0]
		}
		const weights = variants.map((entry) => normalizeWeight(entry.weight))
		const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
		if (totalWeight <= 0) {
			return variants[0]
		}
		const target = getSeededFraction(seedKey) * totalWeight
		let cursor = 0
		for (let i = 0; i < variants.length; i += 1) {
			cursor += weights[i]
			if (target <= cursor) {
				return variants[i]
			}
		}
		return variants[variants.length - 1]
	}
	if (definition.render?.modelSrc) {
		return definition.render
	}
	return null
}

function normalizeWeight(weight?: number): number {
	if (typeof weight !== 'number' || !Number.isFinite(weight)) return 1
	if (weight <= 0) return 0
	return weight
}

function getSeededFraction(seedKey?: string | number): number {
	if (seedKey === undefined || seedKey === null) {
		return Math.random()
	}
	const seed = typeof seedKey === 'string' ? seedKey : String(seedKey)
	const hash = fnv1a(seed)
	return hash / 0x100000000
}

function fnv1a(input: string): number {
	let hash = 0x811c9dc5
	for (let i = 0; i < input.length; i += 1) {
		hash ^= input.charCodeAt(i)
		hash = Math.imul(hash, 0x01000193)
	}
	return hash >>> 0
}
