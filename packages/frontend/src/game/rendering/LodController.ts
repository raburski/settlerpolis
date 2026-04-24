type LodTargetResolver = (signalValue: number, currentTier: number) => number

type LodControllerOptions = {
	initialTier: number
	stableMs: number
	resolveTier: LodTargetResolver
}

type LodUpdateResult = {
	changed: boolean
	tier: number
	targetTier: number
}

const perfNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

export class LodController {
	private readonly stableMs: number
	private readonly resolveTier: LodTargetResolver
	private currentTier: number
	private pendingTier: number | null = null
	private pendingSinceMs = 0

	constructor(options: LodControllerOptions) {
		this.stableMs = Math.max(0, Number.isFinite(options.stableMs) ? options.stableMs : 0)
		this.resolveTier = options.resolveTier
		this.currentTier = Number.isFinite(options.initialTier) ? Math.max(0, Math.floor(options.initialTier)) : 0
	}

	public getTier(): number {
		return this.currentTier
	}

	public setTier(nextTier: number): void {
		this.currentTier = Number.isFinite(nextTier) ? Math.max(0, Math.floor(nextTier)) : 0
		this.pendingTier = null
		this.pendingSinceMs = 0
	}

	public update(signalValue: number, nowMs: number = perfNow()): LodUpdateResult {
		const targetTier = this.resolveTier(signalValue, this.currentTier)
		if (targetTier === this.currentTier) {
			this.pendingTier = null
			this.pendingSinceMs = 0
			return { changed: false, tier: this.currentTier, targetTier }
		}

		if (this.pendingTier !== targetTier) {
			this.pendingTier = targetTier
			this.pendingSinceMs = nowMs
			return { changed: false, tier: this.currentTier, targetTier }
		}

		if (nowMs - this.pendingSinceMs >= this.stableMs) {
			this.currentTier = targetTier
			this.pendingTier = null
			this.pendingSinceMs = 0
			return { changed: true, tier: this.currentTier, targetTier }
		}

		return { changed: false, tier: this.currentTier, targetTier }
	}
}
