export interface IsometricRotationOptions {
	initialStep?: number
	durationMs?: number
	isoDirection?: { x: number; z: number }
	stepCount?: number
}

export interface RotationUpdate {
	alpha: number
	done: boolean
}

export class IsometricRotation {
	private rotationStep: number
	private rotateState: { start: number; end: number; startTime: number; duration: number } | null = null
	private readonly durationMs: number
	private readonly isoDirection: { x: number; z: number }
	private readonly stepCount: number

	constructor(options: IsometricRotationOptions = {}) {
		const {
			initialStep = 0,
			durationMs = 250,
			isoDirection = { x: 1, z: 1 },
			stepCount = 4
		} = options
		this.durationMs = durationMs
		this.isoDirection = isoDirection
		this.stepCount = Math.max(1, Math.round(stepCount))
		this.rotationStep = this.normalizeStep(initialStep)
	}

	getStep(): number {
		return this.rotationStep
	}

	setStep(step: number): void {
		this.rotationStep = this.normalizeStep(step)
	}

	getAlphaForStep(step: number = this.rotationStep): number {
		const radians = (step * Math.PI * 2) / this.stepCount
		const cos = Math.cos(radians)
		const sin = Math.sin(radians)
		const x = this.isoDirection.x * cos - this.isoDirection.z * sin
		const z = this.isoDirection.x * sin + this.isoDirection.z * cos
		return this.normalizeAngle(Math.atan2(z, x))
	}

	rotateBySteps(stepDelta: number, currentAlpha: number, now: number = Date.now()): void {
		const active = this.computeRotation(now)
		const startAlpha = active ? active.alpha : currentAlpha
		if (stepDelta !== 0) {
			this.rotationStep = this.normalizeStep(this.rotationStep + stepDelta)
		}
		const targetAlpha = this.getAlphaForStep(this.rotationStep)
		const delta = this.shortestAngleDelta(startAlpha, targetAlpha)
		this.rotateState = {
			start: startAlpha,
			end: startAlpha + delta,
			startTime: now,
			duration: this.durationMs
		}
	}

	update(now: number = Date.now()): RotationUpdate | null {
		const result = this.computeRotation(now)
		if (!result) return null
		if (result.done) {
			this.rotateState = null
		}
		return result
	}

	isRotating(): boolean {
		return Boolean(this.rotateState)
	}

	private computeRotation(now: number): RotationUpdate | null {
		if (!this.rotateState) return null
		const { start, end, startTime, duration } = this.rotateState
		const elapsed = now - startTime
		const t = Math.min(1, elapsed / duration)
		const eased = t * t * (3 - 2 * t)
		const alpha = start + (end - start) * eased
		return {
			alpha: this.normalizeAngle(alpha),
			done: t >= 1
		}
	}

	private normalizeStep(step: number): number {
		const mod = step % this.stepCount
		return mod < 0 ? mod + this.stepCount : mod
	}

	private normalizeAngle(value: number): number {
		const twoPi = Math.PI * 2
		let next = value % twoPi
		if (next < 0) next += twoPi
		return next
	}

	private shortestAngleDelta(from: number, to: number): number {
		const fromNorm = this.normalizeAngle(from)
		const toNorm = this.normalizeAngle(to)
		let delta = toNorm - fromNorm
		if (delta > Math.PI) delta -= Math.PI * 2
		if (delta < -Math.PI) delta += Math.PI * 2
		return delta
	}
}
