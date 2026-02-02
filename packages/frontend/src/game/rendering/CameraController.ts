import type { BabylonRenderer } from './BabylonRenderer'
import type { InputManager, PointerState } from '../input/InputManager'

interface PanState {
	startX: number
	startZ: number
	endX: number
	endZ: number
	startTime: number
	duration: number
}

interface ShakeState {
	endTime: number
	intensity: number
}

export class CameraController {
	public scrollX = 0
	public scrollY = 0
	public centerX = 0
	public centerY = 0
	private renderer: BabylonRenderer
	private followTarget: { x: number; y: number } | null = null
	private followOffset: { x: number; y: number } = { x: 0, y: 0 }
	private panState: PanState | null = null
	private shakeState: ShakeState | null = null
	private fadeOverlay: HTMLDivElement | null = null
	private dragInput: InputManager | null = null
	private dragLastWorld: { x: number; y: number } | null = null
	private dragStartWorld: { x: number; y: number } | null = null
	private dragStartTarget: { x: number; y: number } | null = null
	private dragStartFollowOffset: { x: number; y: number } | null = null
	private rotateState: { start: number; end: number; startTime: number; duration: number } | null = null
	private readonly rotationStorageKey = 'rugged:camera-rotation-step'
	private rotationStep: number = 0
	private readonly isoDirection = { x: 1, y: 1, z: 1 }

	constructor(renderer: BabylonRenderer, overlayRoot: HTMLDivElement) {
		this.renderer = renderer
		this.restoreRotation()
		this.renderer.camera.alpha = this.getAlphaForStep(this.rotationStep)
		this.createFadeOverlay(overlayRoot)
		this.updateSize()
		window.addEventListener('resize', this.updateSize)
	}

	setBounds(x: number, z: number, width: number, height: number): void {
		this.renderer.setCameraBounds(x, z, x + width, z + height)
	}

	startFollow(target: { x: number; y: number }): void {
		this.followTarget = target
		this.followOffset = { x: 0, y: 0 }
	}

	stopFollow(): void {
		this.followTarget = null
	}

	panBy(deltaX: number, deltaY: number): void {
		if (this.followTarget) {
			this.followOffset.x += deltaX
			this.followOffset.y += deltaY
		} else {
			this.renderer.setCameraTarget(
				this.renderer.camera.target.x + deltaX,
				this.renderer.camera.target.z + deltaY
			)
		}
	}

	rotateByDegrees(degrees: number): void {
		const now = Date.now()
		if (this.rotateState) {
			this.applyRotation(now)
		}
		const startAlpha = this.renderer.camera.alpha
		const duration = 250
		if (degrees !== 0) {
			const stepDelta = degrees > 0 ? 1 : -1
			this.rotationStep = this.normalizeStep(this.rotationStep + stepDelta)
		}
		const targetAlpha = this.getAlphaForStep(this.rotationStep)
		const delta = this.shortestAngleDelta(startAlpha, targetAlpha)
		this.rotateState = {
			start: startAlpha,
			end: startAlpha + delta,
			startTime: now,
			duration
		}
	}

	private normalizeAngle(value: number): number {
		const twoPi = Math.PI * 2
		let next = value % twoPi
		if (next < 0) next += twoPi
		return next
	}

	getWorldPoint(screenX: number, screenY: number): { x: number; y: number } {
		const world = this.renderer.screenToWorld(screenX, screenY)
		if (!world) {
			return { x: 0, y: 0 }
		}
		return { x: world.x, y: world.z }
	}

	fade(duration: number = 1000): void {
		if (!this.fadeOverlay) return
		this.fadeOverlay.style.transition = `opacity ${duration}ms ease`
		this.fadeOverlay.style.opacity = '1'
	}

	fadeIn(duration: number = 1000): void {
		if (!this.fadeOverlay) return
		this.fadeOverlay.style.transition = `opacity ${duration}ms ease`
		this.fadeOverlay.style.opacity = '0'
	}

	pan(x: number, y: number, duration: number = 1000): void {
		const targetX = x
		const targetZ = y
		this.panState = {
			startX: this.renderer.camera.target.x,
			startZ: this.renderer.camera.target.z,
			endX: targetX,
			endZ: targetZ,
			startTime: Date.now(),
			duration
		}
	}

	shake(duration: number = 500, intensity: number = 0.01): void {
		this.shakeState = {
			endTime: Date.now() + duration,
			intensity
		}
	}

	update(): void {
		this.updateRotation()
		if (this.panState) {
			const now = Date.now()
			const elapsed = now - this.panState.startTime
			const t = Math.min(1, elapsed / this.panState.duration)
			const nextX = this.panState.startX + (this.panState.endX - this.panState.startX) * t
			const nextZ = this.panState.startZ + (this.panState.endZ - this.panState.startZ) * t
			this.renderer.setCameraTarget(nextX, nextZ)
			if (t >= 1) {
				this.panState = null
			}
			return
		}

		if (this.followTarget) {
			this.renderer.setCameraTarget(
				this.followTarget.x + this.followOffset.x,
				this.followTarget.y + this.followOffset.y
			)
		}

		if (this.shakeState) {
			if (Date.now() >= this.shakeState.endTime) {
				this.shakeState = null
				return
			}
			const offsetX = (Math.random() - 0.5) * 2 * this.shakeState.intensity * 100
			const offsetZ = (Math.random() - 0.5) * 2 * this.shakeState.intensity * 100
			this.renderer.setCameraTarget(
				this.renderer.camera.target.x + offsetX,
				this.renderer.camera.target.z + offsetZ
			)
		}
	}

	destroy(): void {
		this.disableDragPan()
		window.removeEventListener('resize', this.updateSize)
		if (this.fadeOverlay) {
			this.fadeOverlay.remove()
			this.fadeOverlay = null
		}
	}

	enableDragPan(input: InputManager): void {
		if (this.dragInput) {
			this.disableDragPan()
		}
		this.dragInput = input
		this.dragInput.on('pointerdown', this.handleDragStart)
		this.dragInput.on('pointermove', this.handleDragMove)
		this.dragInput.on('pointerup', this.handleDragEnd)
	}

	disableDragPan(): void {
		if (!this.dragInput) return
		this.dragInput.off('pointerdown', this.handleDragStart)
		this.dragInput.off('pointermove', this.handleDragMove)
		this.dragInput.off('pointerup', this.handleDragEnd)
		this.dragInput = null
		this.dragLastWorld = null
	}

	private handleDragStart = (pointer: PointerState) => {
		if (pointer.button !== 0) return
		if (pointer.world) {
			this.dragLastWorld = { x: pointer.world.x, y: pointer.world.z }
			this.dragStartWorld = { x: pointer.world.x, y: pointer.world.z }
		} else {
			this.dragLastWorld = null
			this.dragStartWorld = null
		}
		this.dragStartTarget = {
			x: this.renderer.camera.target.x,
			y: this.renderer.camera.target.z
		}
		this.dragStartFollowOffset = { x: this.followOffset.x, y: this.followOffset.y }
	}

	private handleDragMove = (pointer: PointerState) => {
		if (!pointer.isDown || !pointer.isDragging) return
		if (!pointer.world) return
		if (!this.dragStartWorld || !this.dragStartTarget) {
			this.dragStartWorld = { x: pointer.world.x, y: pointer.world.z }
			this.dragStartTarget = {
				x: this.renderer.camera.target.x,
				y: this.renderer.camera.target.z
			}
			this.dragStartFollowOffset = { x: this.followOffset.x, y: this.followOffset.y }
			return
		}

		const deltaX = this.dragStartWorld.x - pointer.world.x
		const deltaY = this.dragStartWorld.y - pointer.world.z

		if (this.followTarget) {
			const base = this.dragStartFollowOffset || { x: 0, y: 0 }
			this.followOffset.x = base.x + deltaX
			this.followOffset.y = base.y + deltaY
		} else {
			this.renderer.setCameraTarget(
				this.dragStartTarget.x + deltaX,
				this.dragStartTarget.y + deltaY
			)
		}
	}

	private handleDragEnd = (_pointer: PointerState) => {
		void _pointer
		this.dragLastWorld = null
		this.dragStartWorld = null
		this.dragStartTarget = null
		this.dragStartFollowOffset = null
	}

	private updateRotation(): void {
		if (this.rotateState) {
			this.applyRotation(Date.now())
			return
		}
		this.renderer.camera.alpha = this.getAlphaForStep(this.rotationStep)
	}

	private applyRotation(now: number): void {
		if (!this.rotateState) return
		const { start, end, startTime, duration } = this.rotateState
		const elapsed = now - startTime
		const t = Math.min(1, elapsed / duration)
		const eased = t * t * (3 - 2 * t)
		const alpha = start + (end - start) * eased
		this.renderer.camera.alpha = this.normalizeAngle(alpha)
		if (t >= 1) {
			this.persistRotation()
			this.rotateState = null
		}
	}

	private persistRotation(): void {
		try {
			window.localStorage.setItem(this.rotationStorageKey, String(this.rotationStep))
		} catch {
			// ignore storage failures
		}
	}

	private restoreRotation(): void {
		try {
			const raw = window.localStorage.getItem(this.rotationStorageKey)
			if (raw) {
				const value = Number(raw)
				if (Number.isFinite(value)) {
					this.rotationStep = this.normalizeStep(Math.round(value))
				}
			}
			this.renderer.camera.alpha = this.getAlphaForStep(this.rotationStep)
		} catch {
			// ignore storage failures
		}
	}

	private normalizeStep(step: number): number {
		const mod = step % 4
		return mod < 0 ? mod + 4 : mod
	}

	private getAlphaForStep(step: number): number {
		const radians = (step * Math.PI) / 2
		const cos = Math.cos(radians)
		const sin = Math.sin(radians)
		const x = this.isoDirection.x * cos - this.isoDirection.z * sin
		const z = this.isoDirection.x * sin + this.isoDirection.z * cos
		return this.normalizeAngle(Math.atan2(z, x))
	}

	private shortestAngleDelta(from: number, to: number): number {
		const fromNorm = this.normalizeAngle(from)
		const toNorm = this.normalizeAngle(to)
		let delta = toNorm - fromNorm
		if (delta > Math.PI) delta -= Math.PI * 2
		if (delta < -Math.PI) delta += Math.PI * 2
		return delta
	}

	private createFadeOverlay(overlayRoot: HTMLDivElement): void {
		const overlay = document.createElement('div')
		overlay.style.position = 'absolute'
		overlay.style.top = '0'
		overlay.style.left = '0'
		overlay.style.width = '100%'
		overlay.style.height = '100%'
		overlay.style.background = '#000'
		overlay.style.opacity = '0'
		overlay.style.pointerEvents = 'none'
		overlay.style.transition = 'opacity 300ms ease'
		overlayRoot.appendChild(overlay)
		this.fadeOverlay = overlay
	}

	private updateSize = () => {
		this.centerX = this.renderer.engine.getRenderWidth() / 2
		this.centerY = this.renderer.engine.getRenderHeight() / 2
	}
}
