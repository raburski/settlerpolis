import type { EventManager } from '../../events'
import type { Logger } from '../../Logs'
import { BaseManager } from '../../Managers'
import type { BuildingManager } from '../../Buildings'
import type { LootManager } from '../../Loot'
import type { StorageManager } from '../../Storage'
import type { PopulationManager } from '../../Population'
import type { ItemsManager } from '../../Items'
import type { ReservationSystem } from '../../Reservation'
import { NeedsSystem } from './NeedsSystem'
import { NeedPlanner } from './NeedPlanner'
import { NeedInterruptController } from './NeedInterruptController'
import type { NeedsBehaviourApi } from './NeedInterruptController'
import type { NeedsSnapshot } from '../../state/types'
import { NeedsManagerState } from './NeedsManagerState'
import type { SimulationTickData } from '../../Simulation/types'

export interface NeedsDeps {
	event: EventManager
	buildings: BuildingManager
	loot: LootManager
	storage: StorageManager
	population: PopulationManager
	items: ItemsManager
	reservations: ReservationSystem
	behaviour: NeedsBehaviourApi
}

export class SettlerNeedsManager extends BaseManager<NeedsDeps> {
	private readonly system: NeedsSystem
	private readonly planner: NeedPlanner
	private readonly interrupts: NeedInterruptController
	private readonly state = new NeedsManagerState()

	constructor(
		managers: NeedsDeps,
		logger: Logger
	) {
		super(managers)
		this.system = new NeedsSystem({ population: managers.population }, managers.event)
		this.planner = new NeedPlanner(managers, logger)
		this.interrupts = new NeedInterruptController(managers.event, this.system, this.planner, managers.behaviour, logger)
	}

	public update(data: SimulationTickData): void {
		this.system.update(data)
		this.interrupts.update(data)
	}

	serialize(): NeedsSnapshot {
		const systemSnapshot = this.system.serialize()
		this.state.capture(systemSnapshot, this.interrupts.serialize())
		return this.state.serialize()
	}

	deserialize(state: NeedsSnapshot): void {
		this.state.deserialize(state)
		this.system.deserialize({
			needsBySettler: this.state.needsBySettler,
			lastLevels: this.state.lastLevels
		})
		this.interrupts.deserialize(this.state.interrupts)
	}

	reset(): void {
		this.system.reset()
		this.interrupts.reset()
		this.state.reset()
	}
}

export * from './NeedTypes'
export * from './NeedMeter'
export * from './NeedsManagerState'
export * from './NeedsState'
export * from './events'
export * from './types'
