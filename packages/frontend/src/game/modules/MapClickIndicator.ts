import type { GameScene } from '../scenes/base/GameScene'
import type { AbstractMesh } from '@babylonjs/core'
import { Color3, MeshBuilder, StandardMaterial, Vector3 } from '@babylonjs/core'

interface IndicatorEntry {
	mesh: AbstractMesh
	material: StandardMaterial
	createdAtMs: number
	baseY: number
}

const INDICATOR_DURATION_MS = 420

export class MapClickIndicator {
	private readonly scene: GameScene
	private indicators: IndicatorEntry[] = []

	constructor(scene: GameScene) {
		this.scene = scene
	}

	public showAtWorld(world: Vector3 | null): Vector3 | null {
		const tileCenter = this.resolveTileCenterFromWorld(world)
		if (!tileCenter) {
			return null
		}

		const tileSize = this.scene.map?.tileWidth || 32
		const ring = MeshBuilder.CreateTorus(
			`map-rightclick-indicator-${Date.now()}-${this.indicators.length}`,
			{
				diameter: tileSize * 0.65,
				thickness: Math.max(1, tileSize * 0.08),
				tessellation: 48
			},
			this.scene.runtime.renderer.scene
		)
		ring.rotation.x = 0
		ring.position.copyFrom(tileCenter)
		ring.isPickable = false
		ring.checkCollisions = false
		ring.receiveShadows = false

		const material = new StandardMaterial(`map-rightclick-indicator-mat-${Date.now()}`, this.scene.runtime.renderer.scene)
		material.diffuseColor = Color3.FromHexString('#f6d26b')
		material.emissiveColor = Color3.FromHexString('#f6d26b')
		material.disableLighting = true
		material.alpha = 0.9
		ring.material = material

		this.indicators.push({
			mesh: ring,
			material,
			createdAtMs: performance.now(),
			baseY: tileCenter.y
		})

		return tileCenter
	}

	public update(): void {
		if (this.indicators.length === 0) {
			return
		}

		const now = performance.now()
		const keep: IndicatorEntry[] = []
		for (const indicator of this.indicators) {
			const progress = Math.min(1, Math.max(0, (now - indicator.createdAtMs) / INDICATOR_DURATION_MS))
			if (progress >= 1) {
				indicator.mesh.dispose()
				indicator.material.dispose()
				continue
			}
			const scale = 0.35 + (1 - (1 - progress) * (1 - progress)) * 1.1
			indicator.mesh.scaling.set(scale, scale, scale)
			indicator.mesh.position.y = indicator.baseY + progress * 0.25
			indicator.material.alpha = 0.9 * (1 - progress)
			keep.push(indicator)
		}
		this.indicators = keep
	}

	public destroy(): void {
		for (const indicator of this.indicators) {
			indicator.mesh.dispose()
			indicator.material.dispose()
		}
		this.indicators = []
	}

	private resolveTileCenterFromWorld(world: Vector3 | null): Vector3 | null {
		if (!world || !this.scene.map) {
			return null
		}
		const tileWidth = this.scene.map.tileWidth || 32
		const tileHeight = this.scene.map.tileHeight || tileWidth
		const tileX = Math.floor(world.x / tileWidth)
		const tileY = Math.floor(world.z / tileHeight)
		const mapWidthTiles = Math.floor(this.scene.map.widthInPixels / tileWidth)
		const mapHeightTiles = Math.floor(this.scene.map.heightInPixels / tileHeight)
		if (tileX < 0 || tileY < 0 || tileX >= mapWidthTiles || tileY >= mapHeightTiles) {
			return null
		}
		return new Vector3(
			tileX * tileWidth + tileWidth / 2,
			world.y + 0.3,
			tileY * tileHeight + tileHeight / 2
		)
	}
}

