import type { EventManager } from '../events'
import type { Logger } from '../Logs'
import { BaseManager } from '../Managers'
import type { BuildingManager } from '../Buildings'
import type { LootManager } from '../Loot'
import type { StorageManager } from '../Storage'
import type { PopulationManager } from '../Population'
import type { ItemsManager } from '../Items'
import type { ReservationSystem } from '../Reservation'
import type { SettlerActionsManager } from '../Settlers/Actions'
import { NeedsSystem } from './NeedsSystem'
import { NeedPlanner } from './NeedPlanner'
import { NeedInterruptController } from './NeedInterruptController'
import type { NeedsSnapshot } from '../state/types'
import { NeedsManagerState } from './NeedsManagerState'

export interface NeedsDeps {
	event: EventManager
	buildings: BuildingManager
	loot: LootManager
	storage: StorageManager
	population: PopulationManager
	items: ItemsManager
	reservations: ReservationSystem
	actions: SettlerActionsManager
}

export class NeedsManager extends BaseManager<NeedsDeps> {
	public system: NeedsSystem
	public planner: NeedPlanner
	public interrupts: NeedInterruptController
	private readonly state = new NeedsManagerState()

	constructor(
		managers: NeedsDeps,
		logger: Logger
	) {
		super(managers)
		this.system = new NeedsSystem({ population: managers.population }, managers.event)
		this.planner = new NeedPlanner(managers, logger)
		this.interrupts = new NeedInterruptController(managers.event, this.system, this.planner, managers.actions, logger)
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
