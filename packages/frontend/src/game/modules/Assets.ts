import { MapLoader, type LoadedMap } from '../world/MapLoader'

export class AssetManager {
	private mapKey: string
	private mapPath: string
	private initCallback: () => void
	private loader: MapLoader
	private loadedMap: LoadedMap | null = null
	private isLoading: boolean = false

	constructor(mapKey: string, mapPath: string, initCallback: () => void) {
		this.mapKey = mapKey
		this.mapPath = mapPath
		this.initCallback = initCallback
		this.loader = new MapLoader()
	}

	preload(): void {
		this.isLoading = true
		this.loader
			.load(this.mapKey, this.mapPath)
			.then((loaded) => {
				this.loadedMap = loaded
				this.isLoading = false
				this.initCallback()
			})
			.catch((error) => {
				console.error('[AssetManager] Failed to load map', error)
				this.isLoading = false
			})
	}

	getLoadedMap(): LoadedMap | null {
		return this.loadedMap
	}

	isAssetLoadingInProgress(): boolean {
		return this.isLoading
	}
}
