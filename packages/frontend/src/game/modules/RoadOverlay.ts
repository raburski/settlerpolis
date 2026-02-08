import type { RoadTile } from '@rugged/game'
import { RoadType } from '@rugged/game'
import type { AbstractMesh } from '@babylonjs/core'
import { Color3, StandardMaterial } from '@babylonjs/core'
import type { GameScene } from '../scenes/base/GameScene'

const ROAD_COLORS: Record<RoadType, string> = {
	[RoadType.None]: '#000000',
	[RoadType.Dirt]: '#b58a58',
	[RoadType.Stone]: '#8a8a8a'
}

interface RoadMeshEntry {
	tile: RoadTile
	mesh: AbstractMesh
}

export class RoadOverlay {
	private scene: GameScene
	private tileSize: number
	private tiles = new Map<string, RoadMeshEntry>()
	private pendingTiles = new Map<string, RoadMeshEntry>()
	private highlightTiles = new Map<string, RoadMeshEntry>()
	private materialCache = new Map<string, StandardMaterial>()

	constructor(scene: GameScene, tileSize: number) {
		this.scene = scene
		this.tileSize = tileSize
	}

	public setTiles(tiles: RoadTile[]): void {
		this.clearMeshes(this.tiles)
		this.tiles.clear()
		for (const tile of tiles) {
			this.upsert(tile, this.tiles, 0.9)
		}
	}

	public applyUpdates(tiles: RoadTile[]): void {
		for (const tile of tiles) {
			const key = this.key(tile.x, tile.y)
			if (tile.roadType === RoadType.None) {
				this.disposeEntry(this.tiles.get(key))
				this.tiles.delete(key)
				continue
			}
			this.upsert(tile, this.tiles, 0.9)
		}
	}

	public setPendingTiles(tiles: RoadTile[]): void {
		this.clearMeshes(this.pendingTiles)
		this.pendingTiles.clear()
		for (const tile of tiles) {
			if (tile.roadType === RoadType.None) continue
			this.upsert(tile, this.pendingTiles, 0.3)
		}
	}

	public applyPendingUpdates(tiles: RoadTile[]): void {
		for (const tile of tiles) {
			const key = this.key(tile.x, tile.y)
			if (tile.roadType === RoadType.None) {
				this.disposeEntry(this.pendingTiles.get(key))
				this.pendingTiles.delete(key)
				continue
			}
			this.upsert(tile, this.pendingTiles, 0.3)
		}
	}

	public update(): void {
		// no-op
	}

	public getRoadTiles(): RoadTile[] {
		return Array.from(this.tiles.values()).map((entry) => entry.tile)
	}

	public hasRoadAt(tileX: number, tileY: number): boolean {
		return this.tiles.has(this.key(tileX, tileY))
	}

	public hasPendingRoadAt(tileX: number, tileY: number): boolean {
		return this.pendingTiles.has(this.key(tileX, tileY))
	}

	public setHighlightTiles(tiles: Array<{ x: number; y: number }>, color: string = '#6fbf6a', alpha: number = 0.45): void {
		this.clearMeshes(this.highlightTiles)
		this.highlightTiles.clear()
		if (tiles.length === 0) return

		const height = 0.25
		const yOffset = 1.05
		for (const tile of tiles) {
			const key = this.key(tile.x, tile.y)
			const size = { width: this.tileSize, length: this.tileSize, height }
			const mesh = this.scene.runtime.renderer.createBox(`road-highlight-${key}`, size)
			const centerX = tile.x * this.tileSize + this.tileSize / 2
			const centerY = tile.y * this.tileSize + this.tileSize / 2
			this.scene.runtime.renderer.setMeshPosition(mesh, centerX, yOffset, centerY)
			mesh.isPickable = false
			mesh.material = this.getHighlightMaterial(color, alpha)
			this.highlightTiles.set(key, { tile: { x: tile.x, y: tile.y, roadType: RoadType.None }, mesh })
		}
	}

	public clearHighlightTiles(): void {
		this.clearMeshes(this.highlightTiles)
		this.highlightTiles.clear()
	}

	public destroy(): void {
		this.clearMeshes(this.tiles)
		this.clearMeshes(this.pendingTiles)
		this.clearMeshes(this.highlightTiles)
		this.tiles.clear()
		this.pendingTiles.clear()
		this.highlightTiles.clear()
		this.materialCache.forEach((material) => material.dispose())
		this.materialCache.clear()
	}

	private upsert(tile: RoadTile, target: Map<string, RoadMeshEntry>, height: number): void {
		const key = this.key(tile.x, tile.y)
		const existing = target.get(key)
		if (existing) {
			existing.tile = tile
			const alpha = target === this.pendingTiles ? 0.5 : 1
			this.applyMaterial(existing.mesh, tile.roadType, alpha)
			return
		}

		const size = { width: this.tileSize, length: this.tileSize, height }
		const mesh = this.scene.runtime.renderer.createBox(`road-${key}`, size)
		const centerX = tile.x * this.tileSize + this.tileSize / 2
		const centerY = tile.y * this.tileSize + this.tileSize / 2
		this.scene.runtime.renderer.setMeshPosition(mesh, centerX, height / 2, centerY)
		const alpha = target === this.pendingTiles ? 0.5 : 1
		this.applyMaterial(mesh, tile.roadType, alpha)
		target.set(key, { tile, mesh })
	}

	private applyMaterial(mesh: AbstractMesh, roadType: RoadType, alpha: number): void {
		const color = ROAD_COLORS[roadType] || ROAD_COLORS[RoadType.Dirt]
		const cacheKey = `${roadType}:${alpha}`
		let material = this.materialCache.get(cacheKey)
		if (!material) {
			material = new StandardMaterial(`road-${cacheKey}`, this.scene.runtime.renderer.scene)
			material.diffuseColor = Color3.FromHexString(color)
			material.specularColor = Color3.Black()
			material.alpha = alpha
			this.materialCache.set(cacheKey, material)
		}
		mesh.material = material
	}

	private getHighlightMaterial(color: string, alpha: number): StandardMaterial {
		const cacheKey = `highlight:${color}:${alpha}`
		let material = this.materialCache.get(cacheKey)
		if (!material) {
			material = new StandardMaterial(`road-${cacheKey}`, this.scene.runtime.renderer.scene)
			material.diffuseColor = Color3.FromHexString(color)
			material.specularColor = Color3.Black()
			material.alpha = alpha
			this.materialCache.set(cacheKey, material)
		}
		return material
	}

	private clearMeshes(target: Map<string, RoadMeshEntry>): void {
		target.forEach((entry) => entry.mesh.dispose())
	}

	private disposeEntry(entry?: RoadMeshEntry): void {
		entry?.mesh.dispose()
	}

	private key(x: number, y: number): string {
		return `${x},${y}`
	}
}
