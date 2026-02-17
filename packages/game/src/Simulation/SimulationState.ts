import type { SimulationSnapshot } from '../state/types'

export class SimulationState {
	public tickIntervalMs: number
	public tickTimer: NodeJS.Timeout | null = null
	public simulationTimeMs = 0
	public slowTickAccumulatorMs = 0
	public verySlowTickAccumulatorMs = 0
	public readonly slowTickIntervalMs: number
	public readonly verySlowTickIntervalMs: number

	constructor(
		tickIntervalMs: number = 250,
		slowTickIntervalMs: number = 1000,
		verySlowTickIntervalMs: number = 5000
	) {
		this.tickIntervalMs = Math.max(1, tickIntervalMs)
		this.slowTickIntervalMs = Math.max(1, slowTickIntervalMs)
		this.verySlowTickIntervalMs = Math.max(1, verySlowTickIntervalMs)
	}

	/* SERIALISATION */
	public serialize(): SimulationSnapshot {
		return {
			simulationTimeMs: this.simulationTimeMs,
			tickIntervalMs: this.tickIntervalMs
		}
	}

	public deserialize(state: SimulationSnapshot): void {
		this.simulationTimeMs = state.simulationTimeMs
		this.tickIntervalMs = Math.max(1, state.tickIntervalMs)
	}

	public reset(): void {
		this.simulationTimeMs = 0
	}
}
