import { EventManager } from '../events'
import { Receiver } from '../Receiver'
import { SimulationEvents } from './events'
import { SimulationTickData } from './types'
import { Logger } from '../Logs'
import type { SimulationSnapshot } from '../state/types'

export class SimulationManager {
	private tickIntervalMs: number
	private tickTimer: NodeJS.Timeout | null = null
	private simulationTimeMs = 0
	private slowTickAccumulatorMs = 0
	private verySlowTickAccumulatorMs = 0
	private readonly slowTickIntervalMs: number
	private readonly verySlowTickIntervalMs: number

	constructor(
		private event: EventManager,
		private logger: Logger,
		tickIntervalMs: number = 250,
		slowTickIntervalMs: number = 1000,
		verySlowTickIntervalMs: number = 5000
	) {
		this.tickIntervalMs = Math.max(1, tickIntervalMs)
		this.slowTickIntervalMs = Math.max(1, slowTickIntervalMs)
		this.verySlowTickIntervalMs = Math.max(1, verySlowTickIntervalMs)
	}

	start(): void {
		if (this.tickTimer) return
		this.tickTimer = setInterval(() => this.tick(), this.tickIntervalMs)
		this.logger.log(`[SimulationManager] Started tick loop (${this.tickIntervalMs}ms)`)
	}

	stop(): void {
		if (!this.tickTimer) return
		clearInterval(this.tickTimer)
		this.tickTimer = null
		this.logger.log('[SimulationManager] Stopped tick loop')
	}

	setTickInterval(ms: number): void {
		this.tickIntervalMs = Math.max(1, ms)
		if (this.tickTimer) {
			this.stop()
			this.start()
		}
	}

	getTickInterval(): number {
		return this.tickIntervalMs
	}

	getSimulationTimeMs(): number {
		return this.simulationTimeMs
	}

	serialize(): SimulationSnapshot {
		return {
			simulationTimeMs: this.simulationTimeMs,
			tickIntervalMs: this.tickIntervalMs
		}
	}

	deserialize(state: SimulationSnapshot): void {
		this.simulationTimeMs = state.simulationTimeMs
		this.setTickInterval(state.tickIntervalMs)
	}

	reset(): void {
		this.simulationTimeMs = 0
	}

	private tick(): void {
		const deltaMs = this.tickIntervalMs
		this.simulationTimeMs += deltaMs

		const tickData: SimulationTickData = {
			deltaMs,
			nowMs: this.simulationTimeMs
		}

		this.event.emit(Receiver.All, SimulationEvents.SS.Tick, tickData)

		this.slowTickAccumulatorMs += deltaMs
		while (this.slowTickAccumulatorMs >= this.slowTickIntervalMs) {
			this.slowTickAccumulatorMs -= this.slowTickIntervalMs
			this.event.emit(Receiver.All, SimulationEvents.SS.SlowTick, {
				deltaMs: this.slowTickIntervalMs,
				nowMs: this.simulationTimeMs
			} as SimulationTickData)
		}

		this.verySlowTickAccumulatorMs += deltaMs
		while (this.verySlowTickAccumulatorMs >= this.verySlowTickIntervalMs) {
			this.verySlowTickAccumulatorMs -= this.verySlowTickIntervalMs
			this.event.emit(Receiver.All, SimulationEvents.SS.VerySlowTick, {
				deltaMs: this.verySlowTickIntervalMs,
				nowMs: this.simulationTimeMs
			} as SimulationTickData)
		}
	}
}

export * from './events'
export * from './types'
