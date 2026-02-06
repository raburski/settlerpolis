export interface MapLayer {
	name: string
	type: string
	data?: number[]
	encoding?: string
	objects?: any[]
	width?: number
	height?: number
}

export interface MapTileset {
	firstGid: number
	name?: string
	image: string
	imageWidth: number
	imageHeight: number
	tileWidth: number
	tileHeight: number
	tileCount?: number
	columns: number
	margin: number
	spacing: number
}

export interface MapData {
	key: string
	width: number
	height: number
	tileWidth: number
	tileHeight: number
	layers: MapLayer[]
	tilesets: MapTileset[]
}

export interface LoadedMap {
	data: MapData
	collisionGrid: boolean[][]
	objectLayers: Map<string, any[]>
}

const DEBUG_LOAD_TIMING = String(import.meta.env.VITE_DEBUG_LOAD_TIMING || '').toLowerCase() === 'true'
const perfNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

const decodeRle = (encoded: number[], total: number): number[] => {
	const decoded = new Array<number>(total)
	let offset = 0
	for (let i = 0; i < encoded.length; i += 2) {
		if (offset >= total) break
		const value = encoded[i] ?? 0
		const count = encoded[i + 1] ?? 0
		if (count <= 0) continue
		const end = Math.min(total, offset + count)
		decoded.fill(value, offset, end)
		offset = end
	}
	if (offset < total) {
		decoded.fill(0, offset)
	}
	return decoded
}

const decodeLayerData = (layers: MapLayer[], width: number, height: number) => {
	const total = width * height
	for (const layer of layers) {
		if (layer.type !== 'tilelayer' || layer.encoding !== 'rle' || !Array.isArray(layer.data)) continue
		layer.data = decodeRle(layer.data, total)
		delete (layer as any).encoding
	}
}

export class MapLoader {
	async load(mapKey: string, mapUrl: string): Promise<LoadedMap> {
		const perfStart = DEBUG_LOAD_TIMING ? perfNow() : 0
		const response = await fetch(mapUrl)
		if (!response.ok) {
			throw new Error(`Failed to load map ${mapKey} from ${mapUrl}`)
		}
		const afterFetch = DEBUG_LOAD_TIMING ? perfNow() : 0
		const json = await response.json()
		const afterParse = DEBUG_LOAD_TIMING ? perfNow() : 0
		const tilesets: MapTileset[] = (json.tilesets || [])
			.filter((tileset: any) => Boolean(tileset?.image))
			.map((tileset: any) => ({
				firstGid: tileset.firstgid,
				name: tileset.name,
				image: tileset.image,
				imageWidth: tileset.imagewidth,
				imageHeight: tileset.imageheight,
				tileWidth: tileset.tilewidth,
				tileHeight: tileset.tileheight,
				tileCount: tileset.tilecount,
				columns: tileset.columns,
				margin: tileset.margin || 0,
				spacing: tileset.spacing || 0
			}))
		const data: MapData = {
			key: mapKey,
			width: json.width,
			height: json.height,
			tileWidth: json.tilewidth,
			tileHeight: json.tileheight,
			layers: json.layers || [],
			tilesets
		}

		decodeLayerData(data.layers, data.width, data.height)
		const afterDecode = DEBUG_LOAD_TIMING ? perfNow() : 0

		const collisionLayer = data.layers.find((layer) => layer.name === 'collision' && layer.type === 'tilelayer')
		const collisionGrid = this.buildCollisionGrid(collisionLayer, data.width, data.height)
		const objectLayers = new Map<string, any[]>()
		for (const layer of data.layers) {
			if (layer.type === 'objectgroup') {
				objectLayers.set(layer.name, layer.objects || [])
			}
		}

		if (DEBUG_LOAD_TIMING) {
			const fetchMs = afterFetch - perfStart
			const parseMs = afterParse - afterFetch
			const decodeMs = afterDecode - afterParse
			const totalMs = afterDecode - perfStart
			console.info(
				`[Perf] map-load key=${mapKey} fetch=${fetchMs.toFixed(1)}ms parse=${parseMs.toFixed(
					1
				)}ms decode=${decodeMs.toFixed(1)}ms total=${totalMs.toFixed(1)}ms`
			)
		}

		return { data, collisionGrid, objectLayers }
	}

	private buildCollisionGrid(layer: MapLayer | undefined, width: number, height: number): boolean[][] {
		const grid: boolean[][] = Array.from({ length: height }, () => Array(width).fill(false))
		if (!layer?.data) return grid
		for (let index = 0; index < layer.data.length; index += 1) {
			const value = layer.data[index]
			if (!value) continue
			const row = Math.floor(index / width)
			const col = index % width
			if (row >= 0 && row < height && col >= 0 && col < width) {
				grid[row][col] = true
			}
		}
		return grid
	}
}
