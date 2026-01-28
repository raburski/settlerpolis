import { EventManager } from '../events'
import { Receiver } from '../Receiver'
import { SimulationEvents } from './events'
import { SimulationTickData } from './types'
import { Logger } from '../Logs'

export class SimulationManager {
	private tickIntervalMs: number
	private tickTimer: NodeJS.Timeout | null = null
	private simulationTimeMs = 0

	constructor(
		private event: EventManager,
		private logger: Logger,
		tickIntervalMs: number = 250
	) {
		this.tickIntervalMs = Math.max(1, tickIntervalMs)
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

	private tick(): void {
		const deltaMs = this.tickIntervalMs
		this.simulationTimeMs += deltaMs

		const tickData: SimulationTickData = {
			deltaMs,
			nowMs: this.simulationTimeMs
		}

		this.event.emit(Receiver.All, SimulationEvents.SS.Tick, tickData)
	}
}

export * from './events'
export * from './types'
