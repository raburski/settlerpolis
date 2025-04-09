import { Scene } from 'phaser'

export interface TilesetInfo {
	name: string
	image: string
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
		
		this.scene.load.tilemapTiledJSON(this.mapKey, this.mapPath)

		this.scene.load.once('complete', () => {
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
					const imagePath = this.resolveTilesetPath(tileset.image)
					this.scene.load.image(imageKey, `/assets/${imagePath}`)
				} else if (tileset.tiles) {
					tileset.tiles.forEach(tile => {
						if (tile.image) {
							hasAssetsToLoad = true
							const imagePath = this.resolveTilesetPath(tile.image)
							const imageKey = `${tileset.name}_${tile.id}`
							this.scene.load.image(imageKey, `/assets/${imagePath}`)
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
		console.log('ASST MNGR CREATE', this.assetsLoadedPromise)
		const map = this.scene.add.tilemap(this.mapKey)
		this.loadTilesetObjects(map)

		if (this.assetsLoadedPromise) {
			this.assetsLoadedPromise.then(() => {
				console.log('CREATE ASSET via promise')
				this.initCallback()
			})
		} else {
			console.log('CREATE ASSET via normal')
			this.initCallback()
		}
	}

	loadTilesetObjects(map: Phaser.Tilemaps.Tilemap): void {
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
			if (tileset.tiles) {
				tileset.tiles.forEach(tile => {
					const gid = tileset.firstgid + tile.id
					const imageKey = tile.image ? 
						`${tileset.name}_${tile.id}` : 
						tileset.image?.split('/').pop().split('.')[0]

					if (imageKey) {
						this.tilesetObjects.set(gid, {
							name: imageKey,
							image: tile.image || tileset.image || '',
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