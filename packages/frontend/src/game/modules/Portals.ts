import type { GameScene } from '../scenes/base/GameScene'
import { shouldIgnoreKeyboardEvent } from '../utils/inputGuards'

interface PortalData {
	target: string
	targetX: number
	targetY: number
}

interface PortalZone {
	bounds: { x: number; y: number; width: number; height: number }
	data: PortalData
	name: string
}

export class PortalManager {
	private scene: GameScene
	private player: any
	private portalZones: PortalZone[] = []
	private portalActivatedCallback: ((portalData: PortalData) => void) | null = null
	private currentPortalMessage: string | null = null
	private keyDown: boolean = false
	private boundKeyDown: (event: KeyboardEvent) => void
	private boundKeyUp: (event: KeyboardEvent) => void

	constructor(scene: GameScene, player: any) {
		this.scene = scene
		this.player = player
		this.boundKeyDown = (event) => {
			if (shouldIgnoreKeyboardEvent(event)) {
				return
			}
			if (event.code === 'KeyE') {
				this.keyDown = true
			}
		}
		this.boundKeyUp = (event) => {
			if (event.code === 'KeyE') {
				this.keyDown = false
			}
		}
		window.addEventListener('keydown', this.boundKeyDown)
		window.addEventListener('keyup', this.boundKeyUp)
	}

	public update(): void {
		this.checkPortalOverlap()
		this.checkPortalActivation()
	}

	private checkPortalOverlap(): void {
		let isOverlappingAny = false
		for (const zone of this.portalZones) {
			const playerBounds = this.player.getBounds()
			if (this.rectsOverlap(playerBounds, zone.bounds)) {
				isOverlappingAny = true
				const message = `Press E to enter ${zone.name}`
				if (this.currentPortalMessage !== message) {
					this.currentPortalMessage = message
					this.player.displaySystemMessage?.(message)
				}
				break
			}
		}

		if (!isOverlappingAny && this.currentPortalMessage) {
			this.currentPortalMessage = null
			this.player.displaySystemMessage?.(null)
		}
	}

	private checkPortalActivation(): void {
		if (!this.keyDown) return
		for (const zone of this.portalZones) {
			const playerBounds = this.player.getBounds()
			if (this.rectsOverlap(playerBounds, zone.bounds)) {
				this.portalActivatedCallback?.(zone.data)
				break
			}
		}
	}

	public processPortals(map: { getObjectLayer: (name: string) => { objects: any[] } | null }): void {
		const portalsLayer = map.getObjectLayer('portals')
		if (!portalsLayer) return

		this.portalZones = portalsLayer.objects.map((obj) => {
			const data: PortalData = {
				target: obj.properties?.find((p: any) => p.name === 'target')?.value || '',
				targetX: obj.properties?.find((p: any) => p.name === 'targetX')?.value || 0,
				targetY: obj.properties?.find((p: any) => p.name === 'targetY')?.value || 0
			}
			return {
				bounds: { x: obj.x, y: obj.y - obj.height, width: obj.width, height: obj.height },
				data,
				name: obj.name || data.target
			}
		})
	}

	public cleanup(): void {
		this.portalZones = []
		if (this.currentPortalMessage) {
			this.currentPortalMessage = null
			this.player.displaySystemMessage?.(null)
		}
		window.removeEventListener('keydown', this.boundKeyDown)
		window.removeEventListener('keyup', this.boundKeyUp)
	}

	public setPortalActivatedCallback(callback: (portalData: PortalData) => void): void {
		this.portalActivatedCallback = callback
	}

	private rectsOverlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean {
		return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
	}
}
