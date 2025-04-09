import { Scene, GameObjects, Input, Physics } from 'phaser'
import { Player } from '../entities/Player'

interface PortalData {
	target: string
	targetX: number
	targetY: number
}

export class PortalManager {
	private scene: Scene
	private player: Player
	private portalZones: Phaser.GameObjects.Zone[] = []
	private portalRects: Phaser.GameObjects.Rectangle[] = []
	private portalKey: Phaser.Input.Keyboard.Key | null = null
	private portalActivatedCallback: ((portalData: PortalData) => void) | null = null

	constructor(scene: Scene, player: Player) {
		this.scene = scene
		this.player = player
		this.initializePortalKey()
	}

	/**
	 * Initialize the portal activation key
	 */
	private initializePortalKey(): void {
		this.portalKey = this.scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.E)
	}

	/**
	 * Update the portal manager
	 */
	public update(): void {
		this.checkPortalActivation()
	}

	/**
	 * Check if the portal activation key is pressed and handle portal activation
	 */
	private checkPortalActivation(): void {
		if (!this.portalKey || !this.portalKey.isDown) return

		// Check if the player is overlapping with any portal zone
		for (const zone of this.portalZones) {
			const portalData = zone.getData('portalData') as PortalData
			if (!portalData) continue

			// Check if the player is overlapping with the zone
			const playerSprite = this.player.getSprite()
			if (!playerSprite) continue

			const playerBounds = playerSprite.getBounds()
			const zoneBounds = zone.getBounds()

			if (Phaser.Geom.Rectangle.Overlaps(playerBounds, zoneBounds)) {
				// Activate the portal
				if (this.portalActivatedCallback) {
					this.portalActivatedCallback(portalData)
				}
				break
			}
		}
	}

	/**
	 * Process portals from the map
	 */
	public processPortals(map: Phaser.Tilemaps.Tilemap): void {
		// Get the portals layer
		const portalsLayer = map.getObjectLayer('portals')
		if (!portalsLayer) return

		// Process each portal
		for (const obj of portalsLayer.objects) {
			try {
				// Create a white semi-transparent rectangle for the portal
				const portalRect = this.scene.add.rectangle(
					obj.x + obj.width/2, 
					obj.y + obj.height/2, 
					obj.width, 
					obj.height,
					0xffffff,
					0.1
				)
				this.portalRects.push(portalRect)

				// Create a zone for the portal
				const zone = this.scene.add.zone(
					obj.x + obj.width/2, 
					obj.y + obj.height/2, 
					obj.width, 
					obj.height
				)
				this.scene.physics.world.enable(zone)
				this.portalZones.push(zone)

				// Store portal data
				const portalData: PortalData = {
					target: obj.properties.find((p: any) => p.name === 'target')?.value || '',
					targetX: obj.properties.find((p: any) => p.name === 'targetX')?.value || 0,
					targetY: obj.properties.find((p: any) => p.name === 'targetY')?.value || 0
				}
				zone.setData('portalData', portalData)

                const sceneData = this.scene.scene.settings.data
                const fromScene = sceneData?.fromScene
        
                // Find a portal that matches the previous scene name
                const matchingPortal = fromScene ? portalsLayer.objects.find(obj => {
                    const portalData = obj.properties?.find(prop => prop.name === 'target')
                    return portalData?.value === fromScene
                }) : null
        
                // If a matching portal is found, position the player at that portal's location
                if (matchingPortal) {
                    // Use the player's sprite container to set position
                    this.player.getSprite().setPosition(matchingPortal.x, matchingPortal.y)
                }

			} catch (error) {
				console.error('Error processing portal:', error)
			}
		}
	}

	/**
	 * Clean up portal resources
	 */
	public cleanup(): void {
		// Clean up portal zones
		for (const zone of this.portalZones) {
			if (zone.body) {
				zone.body.enable = false
			}
			zone.destroy()
		}
		this.portalZones = []

		// Clean up portal rectangles
		for (const rect of this.portalRects) {
			rect.destroy()
		}
		this.portalRects = []

		// Remove the portal key
		if (this.portalKey) {
			this.scene.input.keyboard.removeKey(this.portalKey)
			this.portalKey = null
		}
	}

	/**
	 * Set the callback for when a portal is activated
	 */
	public setPortalActivatedCallback(callback: (portalData: PortalData) => void): void {
		this.portalActivatedCallback = callback
	}
} 