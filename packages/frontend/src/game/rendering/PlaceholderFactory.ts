import { Color3, DynamicTexture, StandardMaterial } from '@babylonjs/core'
import type { Scene, AbstractMesh } from '@babylonjs/core'

interface EmojiMaterialCache {
	material: StandardMaterial
	texture: DynamicTexture
}

export class PlaceholderFactory {
	private emojiCache: Map<string, EmojiMaterialCache> = new Map()
	private scene: Scene
	private readonly placeholderEmissive = new Color3(0.05, 0.05, 0.05)

	constructor(scene: Scene) {
		this.scene = scene
	}

	applyEmoji(mesh: AbstractMesh, emoji: string): void {
		const cached = this.emojiCache.get(emoji)
		if (cached) {
			mesh.material = cached.material
			return
		}

		const size = 128
		const texture = new DynamicTexture(`emoji-${emoji}`, { width: size, height: size }, this.scene, true)
		const context = texture.getContext()
		context.clearRect(0, 0, size, size)
		context.fillStyle = '#ffffff'
		context.fillRect(0, 0, size, size)
		context.textAlign = 'center'
		context.textBaseline = 'middle'
		context.font = "96px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif"
		context.fillText(emoji, size / 2, size / 2)
		texture.update()

		const material = new StandardMaterial(`emoji-mat-${emoji}`, this.scene)
		material.diffuseTexture = texture
		material.specularColor = Color3.Black()
		// Keep placeholders readable while allowing scene lights/shadows to affect them.
		material.emissiveColor = this.placeholderEmissive
		material.disableLighting = false

		this.emojiCache.set(emoji, { material, texture })
		mesh.material = material
	}

	applyTint(mesh: AbstractMesh, hex: string): void {
		const material = new StandardMaterial(`tint-${hex}`, this.scene)
		material.diffuseColor = Color3.FromHexString(hex)
		material.specularColor = Color3.Black()
		material.emissiveColor = this.placeholderEmissive
		material.disableLighting = false
		mesh.material = material
	}
}
