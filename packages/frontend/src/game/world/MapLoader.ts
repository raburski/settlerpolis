export interface MapLayer {
	name: string
	type: string
	data?: number[]
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

export class MapLoader {
	async load(mapKey: string, mapUrl: string): Promise<LoadedMap> {
		const response = await fetch(mapUrl)
		if (!response.ok) {
			throw new Error(`Failed to load map ${mapKey} from ${mapUrl}`)
		}
		const json = await response.json()
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

		const collisionLayer = data.layers.find((layer) => layer.name === 'collision' && layer.type === 'tilelayer')
		const collisionGrid = this.buildCollisionGrid(collisionLayer, data.width, data.height)
		const objectLayers = new Map<string, any[]>()
		for (const layer of data.layers) {
			if (layer.type === 'objectgroup') {
				objectLayers.set(layer.name, layer.objects || [])
			}
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
