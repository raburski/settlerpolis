import type { EventManager } from '../events'
import type { Logger } from '../Logs'
import { BaseManager } from '../Managers'
import type { BuildingManager } from '../Buildings'
import type { LootManager } from '../Loot'
import type { StorageManager } from '../Storage'
import type { PopulationManager } from '../Population'
import type { ItemsManager } from '../Items'
import type { ReservationSystem } from '../Reservation'
import type { WorkProviderManager } from '../Settlers/WorkProvider'
import { NeedsSystem } from './NeedsSystem'
import { NeedPlanner } from './NeedPlanner'
import { NeedInterruptController } from './NeedInterruptController'

export interface NeedsDeps {
	buildings: BuildingManager
	loot: LootManager
	storage: StorageManager
	population: PopulationManager
	items: ItemsManager
	reservations: ReservationSystem
	work: WorkProviderManager
}

export class NeedsManager extends BaseManager<NeedsDeps> {
	public system: NeedsSystem
	public planner: NeedPlanner
	public interrupts: NeedInterruptController

	constructor(
		managers: NeedsDeps,
		event: EventManager,
		logger: Logger
	) {
		super(managers)
		this.system = new NeedsSystem({ population: managers.population }, event)
		this.planner = new NeedPlanner(managers, logger)
		this.interrupts = new NeedInterruptController(event, this.system, this.planner, managers.work, logger)
	}
}

export * from './NeedTypes'
export * from './NeedMeter'
export * from './NeedsState'
export * from './events'
export * from './types'
