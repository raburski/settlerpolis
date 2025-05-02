import { Scene } from 'phaser'

export interface TilesetInfo {
	name: string
	image: string
	url: string
	gid: number
	width: number
	height: number
}

export class AssetManager {
	private scene: Scene
	private mapKey: string
	private mapPath: string
	private tilesetObjects: Map<number, TilesetInfo>
	private assetsLoadedPromise: Promise<void> | null
	private initCallback: () => void
	private isLoading: boolean

	constructor(scene: Scene, mapKey: string, mapPath: string, initCallback: () => void) {
		this.scene = scene
		this.mapKey = mapKey
		this.mapPath = mapPath
		this.tilesetObjects = new Map()
		this.assetsLoadedPromise = null
		this.initCallback = initCallback
		this.isLoading = false
		console.log(`[AssetManager] Initialized with map: ${mapKey}`)
	}

	private resolveTilesetPath(relativePath: string): string {
		if (relativePath.startsWith('../')) {
			relativePath = relativePath.substring(3)
		}
		return relativePath
	}

	preload(): void {
		this.isLoading = true
		
		// Load map using the provided mapPath
		console.log(`[AssetManager] Loading map from: ${this.mapPath}`)
		this.scene.load.tilemapTiledJSON(this.mapKey, this.mapPath)

		this.scene.load.once('complete', () => {
			// Extract tileset objects first
			const mapData = this.scene.cache.tilemap.get(this.mapKey)
			if (mapData) {
				this.loadTilesetObjects() // Extract and store tileset info first
			}
			
			// Then preload the tilesets with the stored URLs
			this.assetsLoadedPromise = this.preloadTilesets()
		})
	}

	private preloadTilesets(): Promise<void> {
		return new Promise((resolve) => {
			const mapData = this.scene.cache.tilemap.get(this.mapKey)
			if (!mapData) {
				console.error(`[AssetManager] No map data found for key: ${this.mapKey}`)
				resolve()
				return
			}

			const tilesets = mapData.data.tilesets
			if (!tilesets) {
				console.error(`[AssetManager] No tilesets found in map data`)
				resolve()
				return
			}

			let hasAssetsToLoad = false

			// Queue all assets first
			tilesets.forEach(tileset => {
				if (tileset.image) {
					hasAssetsToLoad = true
					const imageKey = tileset.image.split('/').pop().split('.')[0]
					
					// Get the tileset info which should include the url
					const firstGid = tileset.firstgid
					const tilesetInfo = this.tilesetObjects.get(firstGid)
					
					// Use the stored url if available, otherwise fall back to default
					const imagePath = tilesetInfo?.url || this.resolveTilesetPath(tileset.image)
					console.log('[Assets] load image', imagePath)
					this.scene.load.image(imageKey, imagePath)
				} else if (tileset.tiles) {
					tileset.tiles.forEach(tile => {
						if (tile.image) {
							hasAssetsToLoad = true
							const imageKey = `${tileset.name}_${tile.id}`
							
							// Get the tileset info which should include the url
							const gid = tileset.firstgid + tile.id
							const tilesetInfo = this.tilesetObjects.get(gid)
							
							// Use the stored url if available, otherwise fall back to default
							const imagePath = tilesetInfo?.url || this.resolveTilesetPath(tile.image)
							this.scene.load.image(imageKey, imagePath)
						}
					})
				}
			})

			if (!hasAssetsToLoad) {
				this.isLoading = false
				resolve()
				return
			}

			// Listen for completion of all queued assets
			this.scene.load.once('complete', () => {
				this.isLoading = false
				resolve()
			})

			this.scene.load.start()
		})
	}

	create(): void {
		const map = this.scene.add.tilemap(this.mapKey)
		
		if (this.assetsLoadedPromise) {
			this.assetsLoadedPromise.then(() => {
				this.initCallback()
			})
		} else {
			this.initCallback()
		}
	}

	loadTilesetObjects(): void {
		const mapData = this.scene.cache.tilemap.get(this.mapKey)
		if (!mapData) {
			console.error(`[AssetManager] No map data found for tileset objects`)
			return
		}

		const tilesets = mapData.data.tilesets
		if (!tilesets) {
			console.error(`[AssetManager] No tilesets found for tileset objects`)
			return
		}
		
		tilesets.forEach(tileset => {
			// Store the main tileset with its URL
			if (tileset.image) {
				const imageKey = tileset.image.split('/').pop().split('.')[0]
				const url = tileset.url || `/assets/maps/${this.resolveTilesetPath(tileset.image)}`
				
				this.tilesetObjects.set(tileset.firstgid, {
					name: imageKey,
					image: tileset.image,
					url: url,
					gid: tileset.firstgid,
					width: tileset.tilewidth,
					height: tileset.tileheight
				})
			}
			
			if (tileset.tiles) {
				tileset.tiles.forEach(tile => {
					const gid = tileset.firstgid + tile.id
					const imageKey = tile.image ? 
						`${tileset.name}_${tile.id}` : 
						tileset.image?.split('/').pop().split('.')[0]

					// Extract URL or use default
					let url = '/assets/maps/'
					if (tile.image) {
						url = tile.url || `/assets/maps/${this.resolveTilesetPath(tile.image)}`
					} else if (tileset.image) {
						url = tileset.url || `/assets/maps/${this.resolveTilesetPath(tileset.image)}`
					}

					if (imageKey) {
						this.tilesetObjects.set(gid, {
							name: imageKey,
							image: tile.image || tileset.image || '',
							url: url,
							gid: gid,
							width: tile.imagewidth || tileset.tilewidth,
							height: tile.imageheight || tileset.tileheight
						})
					}
				})
			}
		})
	}

	getTilesetObjects(): Map<number, TilesetInfo> {
		return this.tilesetObjects
	}

	isAssetLoadingInProgress(): boolean {
		return this.isLoading
	}
} 