import type { Scene, GameObjects } from 'phaser'
import type { RoadTile } from '@rugged/game'
import { RoadType } from '@rugged/game'

const ROAD_COLORS: Record<RoadType, number> = {
	[RoadType.None]: 0x000000,
	[RoadType.Dirt]: 0xb58a58,
	[RoadType.Stone]: 0x8a8a8a
}

export class RoadOverlay {
	private graphics: GameObjects.Graphics
	private tileSize: number
	private tiles = new Map<string, RoadTile>()
	private pendingTiles = new Map<string, RoadTile>()

	constructor(scene: Scene, tileSize: number) {
		this.tileSize = tileSize
		this.graphics = scene.add.graphics()
		this.graphics.setDepth(5)
	}

	public setTiles(tiles: RoadTile[]): void {
		this.tiles.clear()
		for (const tile of tiles) {
			this.tiles.set(this.key(tile.x, tile.y), tile)
		}
		this.redraw()
	}

	public applyUpdates(tiles: RoadTile[]): void {
		for (const tile of tiles) {
			const key = this.key(tile.x, tile.y)
			if (tile.roadType === RoadType.None) {
				this.tiles.delete(key)
				continue
			}
			this.tiles.set(key, tile)
		}
		this.redraw()
	}

	public setPendingTiles(tiles: RoadTile[]): void {
		this.pendingTiles.clear()
		for (const tile of tiles) {
			if (tile.roadType === RoadType.None) {
				continue
			}
			this.pendingTiles.set(this.key(tile.x, tile.y), tile)
		}
		this.redraw()
	}

	public applyPendingUpdates(tiles: RoadTile[]): void {
		for (const tile of tiles) {
			const key = this.key(tile.x, tile.y)
			if (tile.roadType === RoadType.None) {
				this.pendingTiles.delete(key)
				continue
			}
			this.pendingTiles.set(key, tile)
		}
		this.redraw()
	}

	public destroy(): void {
		this.graphics.destroy()
	}

	private redraw(): void {
		this.graphics.clear()
		for (const tile of this.tiles.values()) {
			const color = ROAD_COLORS[tile.roadType] || ROAD_COLORS[RoadType.Dirt]
			const x = tile.x * this.tileSize
			const y = tile.y * this.tileSize
			this.graphics.fillStyle(color, 0.85)
			this.graphics.fillRect(x, y, this.tileSize, this.tileSize)
			this.graphics.lineStyle(1, 0x2e2a24, 0.4)
			this.graphics.strokeRect(x + 0.5, y + 0.5, this.tileSize - 1, this.tileSize - 1)
		}

		for (const tile of this.pendingTiles.values()) {
			const color = ROAD_COLORS[tile.roadType] || ROAD_COLORS[RoadType.Dirt]
			const x = tile.x * this.tileSize
			const y = tile.y * this.tileSize
			this.graphics.fillStyle(color, 0.35)
			this.graphics.fillRect(x, y, this.tileSize, this.tileSize)
			this.graphics.lineStyle(1, 0xffffff, 0.5)
			this.graphics.strokeRect(x + 1, y + 1, this.tileSize - 2, this.tileSize - 2)
		}
	}

	private key(x: number, y: number): string {
		return `${x},${y}`
	}
}
