import { BabylonRenderer } from '../rendering/BabylonRenderer'
import { InputManager } from '../input/InputManager'
import { EventBus } from '../EventBus'
import { UiEvents } from '../uiEvents'
import { getHighFidelity, getScrollSensitivityWheelDelta } from '../services/DisplaySettings'

export interface RuntimeScene {
	start(data?: any): void
	update(deltaMs: number): void
	destroy(): void
}

export class GameRuntime {
	public readonly renderer: BabylonRenderer
	public readonly input: InputManager
	public readonly overlayRoot: HTMLDivElement
	private activeScene: RuntimeScene | null = null
	private renderStatsTimer = 0
	private renderStatsEnabled = false
	private readonly handleHighFidelity = (data: { enabled: boolean }) => {
		this.renderer.setHighFidelity(Boolean(data?.enabled))
	}
	private readonly handleScrollSensitivity = (data: { level: number }) => {
		this.renderer.setScrollWheelDeltaPercentage(getScrollSensitivityWheelDelta(data?.level))
	}
	private readonly handleRenderStatsToggle = (data: { enabled: boolean }) => {
		this.renderStatsEnabled = Boolean(data?.enabled)
		if (!this.renderStatsEnabled) {
			this.renderStatsTimer = 0
		}
	}

	constructor(canvas: HTMLCanvasElement) {
		this.renderer = new BabylonRenderer(canvas)
		this.renderer.setHighFidelity(getHighFidelity())
		this.renderer.setScrollWheelDeltaPercentage(getScrollSensitivityWheelDelta())
		this.input = new InputManager(canvas, this.renderer)
		this.overlayRoot = this.createOverlay(canvas)
		EventBus.on(UiEvents.Settings.HighFidelity, this.handleHighFidelity)
		EventBus.on(UiEvents.Settings.ScrollSensitivity, this.handleScrollSensitivity)
		EventBus.on(UiEvents.Debug.RenderStatsToggle, this.handleRenderStatsToggle)
	}

	start(): void {
		this.renderer.start((deltaMs) => {
			this.activeScene?.update(deltaMs)
			this.emitRenderStats(deltaMs)
		})
	}

	setScene(scene: RuntimeScene, data?: any): void {
		if (this.activeScene) {
			this.activeScene.destroy()
		}
		this.activeScene = scene
		this.activeScene.start(data)
	}

	dispose(): void {
		if (this.activeScene) {
			this.activeScene.destroy()
			this.activeScene = null
		}
		EventBus.off(UiEvents.Settings.HighFidelity, this.handleHighFidelity)
		EventBus.off(UiEvents.Settings.ScrollSensitivity, this.handleScrollSensitivity)
		EventBus.off(UiEvents.Debug.RenderStatsToggle, this.handleRenderStatsToggle)
		this.input.dispose()
		this.renderer.dispose()
		this.overlayRoot.remove()
	}

	private createOverlay(canvas: HTMLCanvasElement): HTMLDivElement {
		const parent = canvas.parentElement || document.body
		if (getComputedStyle(parent).position === 'static') {
			parent.style.position = 'relative'
		}
		const overlay = document.createElement('div')
		overlay.id = 'game-overlay'
		overlay.style.position = 'absolute'
		overlay.style.top = '0'
		overlay.style.left = '0'
		overlay.style.width = '100%'
		overlay.style.height = '100%'
		overlay.style.pointerEvents = 'none'
		overlay.style.overflow = 'hidden'
		parent.appendChild(overlay)
		return overlay
	}

	private emitRenderStats(deltaMs: number): void {
		if (!this.renderStatsEnabled) return
		this.renderStatsTimer += deltaMs
		if (this.renderStatsTimer < 250) return
		this.renderStatsTimer = 0
		EventBus.emit(UiEvents.Debug.RenderStats, this.renderer.getRenderStats())
	}
}
