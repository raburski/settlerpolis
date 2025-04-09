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
	private additionalAssetsLoader: () => void
	private initCallback: (() => void) | null
	private isLoading: boolean

	constructor(scene: Scene, mapKey: string, mapPath: string, additionalAssetsLoader: () => void) {
		this.scene = scene
		this.mapKey = mapKey
		this.mapPath = mapPath
		this.tilesetObjects = new Map()
		this.assetsLoadedPromise = null
		this.additionalAssetsLoader = additionalAssetsLoader
		this.initCallback = null
		this.isLoading = false
	}

	preload(onInitialize: () => void): void {
		this.initCallback = onInitialize

		// Load the map first to get tileset information
		this.scene.load.tilemapTiledJSON(this.mapKey, this.mapPath)
		
		// We'll load other assets after the tilemap is loaded
		this.scene.load.once('complete', this.onPreloadComplete.bind(this))
	}

	create(): void {
		// If assets are already loaded, initialize immediately
		if (!this.isLoading && this.initCallback) {
			this.initCallback()
		}
		// Otherwise initialization will happen when assets finish loading
	}

	private onPreloadComplete(): void {
		if (this.isLoading) return

		this.isLoading = true
		console.log('Starting asset preload')

		// Get the tilemap data
		const mapData = this.scene.cache.tilemap.get(this.mapKey).data
		
		// Create a promise to track when all assets are loaded
		this.assetsLoadedPromise = new Promise<void>((resolve) => {
			// Load all tilesets referenced in the map
			if (mapData && mapData.tilesets) {
				mapData.tilesets.forEach(tileset => {
					// Extract the image path from the tileset
					const imagePath = tileset.image?.replace('../', '')
					if (!imagePath) return
					const imageKey = imagePath.split('/').pop().split('.')[0]
					
					// Load the tileset image
					this.scene.load.image(imageKey, `assets/${imagePath}`)
					console.log(`Loading tileset: ${imageKey} from assets/${imagePath}`)
				})
			}
			
			// Load any other required assets
			this.additionalAssetsLoader()
			
			// Set up a one-time event listener for when all assets are loaded
			this.scene.load.once('complete', () => {
				console.log('All assets loaded')
				this.isLoading = false
				this.assetsLoadedPromise = null
				resolve()
				
				// Call the initialization callback if provided
				if (this.initCallback) {
					this.initCallback()
				}
			})
			
			// Start loading the assets
			this.scene.load.start()
		})
	}

	loadTilesetObjects(map: Phaser.Tilemaps.Tilemap): void {
		const tilesets = map.tilesets
		
		tilesets.forEach(tileset => {
			const imageName = tileset.name?.split('/').pop()?.split('.')[0]
			// Only handle tilesets that have tiles property (object tilesets)
			if (imageName) {
				const gid = tileset.firstgid
				
				// Load the individual tile image
				this.scene.load.image(imageName, `assets/objects/${imageName}.png`)
				
				// Store the GID mapping
				this.tilesetObjects.set(gid, {
					name: imageName,
					gid: gid,
					width: tileset.tilewidth,
					height: tileset.tileheight
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