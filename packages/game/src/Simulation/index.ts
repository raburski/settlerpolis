import { EventManager } from '../events'
import { Receiver } from '../Receiver'
import { SimulationEvents } from './events'
import { SimulationTickData } from './types'
import { Logger } from '../Logs'
import type { SimulationSnapshot } from '../state/types'
import { SimulationState } from './SimulationState'

export class SimulationManager {
	private readonly state: SimulationState

	constructor(
		private event: EventManager,
		private logger: Logger,
		tickIntervalMs: number = 250,
		slowTickIntervalMs: number = 1000,
		verySlowTickIntervalMs: number = 5000
	) {
		this.state = new SimulationState(tickIntervalMs, slowTickIntervalMs, verySlowTickIntervalMs)
	}

	start(): void {
		if (this.state.tickTimer) return
		this.state.tickTimer = setInterval(() => this.tick(), this.state.tickIntervalMs)
		this.logger.log(`[SimulationManager] Started tick loop (${this.state.tickIntervalMs}ms)`)
	}

	stop(): void {
		if (!this.state.tickTimer) return
		clearInterval(this.state.tickTimer)
		this.state.tickTimer = null
		this.logger.log('[SimulationManager] Stopped tick loop')
	}

	setTickInterval(ms: number): void {
		this.state.tickIntervalMs = Math.max(1, ms)
		if (this.state.tickTimer) {
			this.stop()
			this.start()
		}
	}

	getTickInterval(): number {
		return this.state.tickIntervalMs
	}

	getSimulationTimeMs(): number {
		return this.state.simulationTimeMs
	}

	serialize(): SimulationSnapshot {
		return this.state.serialize()
	}

	deserialize(state: SimulationSnapshot): void {
		this.state.deserialize(state)
		this.setTickInterval(state.tickIntervalMs)
	}

	reset(): void {
		this.state.reset()
	}

	private tick(): void {
		const deltaMs = this.state.tickIntervalMs
		this.state.simulationTimeMs += deltaMs

		const tickData: SimulationTickData = {
			deltaMs,
			nowMs: this.state.simulationTimeMs
		}

		this.event.emit(Receiver.All, SimulationEvents.SS.Tick, tickData)

		this.state.slowTickAccumulatorMs += deltaMs
		while (this.state.slowTickAccumulatorMs >= this.state.slowTickIntervalMs) {
			this.state.slowTickAccumulatorMs -= this.state.slowTickIntervalMs
			this.event.emit(Receiver.All, SimulationEvents.SS.SlowTick, {
				deltaMs: this.state.slowTickIntervalMs,
				nowMs: this.state.simulationTimeMs
			} as SimulationTickData)
		}

		this.state.verySlowTickAccumulatorMs += deltaMs
		while (this.state.verySlowTickAccumulatorMs >= this.state.verySlowTickIntervalMs) {
			this.state.verySlowTickAccumulatorMs -= this.state.verySlowTickIntervalMs
			this.event.emit(Receiver.All, SimulationEvents.SS.VerySlowTick, {
				deltaMs: this.state.verySlowTickIntervalMs,
				nowMs: this.state.simulationTimeMs
			} as SimulationTickData)
		}
	}
}

export * from './events'
export * from './types'
