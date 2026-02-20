import type { BuildingManager } from '../../Buildings'
import type { LootManager } from '../../Loot'
import type { StorageManager } from '../../Storage'
import type { PopulationManager } from '../../Population'
import type { ItemsManager } from '../../Items'
import type { ReservationSystem } from '../../Reservation'
import type { Logger } from '../../Logs'
import { NeedType } from './NeedTypes'
import type { NeedPlanResult } from './types'
import { FoodSourcePolicy } from './policies/FoodSourcePolicy'
import { BedPolicy } from './policies/BedPolicy'
import { buildEatPlan } from './plans/EatPlan'
import { buildSleepPlan } from './plans/SleepPlan'
import { NeedPlanningFailureReason } from '../failureReasons'

export interface NeedPlannerDeps {
	buildings: BuildingManager
	loot: LootManager
	storage: StorageManager
	population: PopulationManager
	items: ItemsManager
	reservations: ReservationSystem
}

export class NeedPlanner {
	private foodSourcePolicy: FoodSourcePolicy
	private bedPolicy: BedPolicy

	constructor(
		private managers: NeedPlannerDeps,
		private logger: Logger
	) {
		this.foodSourcePolicy = new FoodSourcePolicy(managers)
		this.bedPolicy = new BedPolicy({
			buildings: managers.buildings,
			population: managers.population
		})
	}

	createPlan(settlerId: string, needType: NeedType): NeedPlanResult {
		switch (needType) {
			case NeedType.Hunger: {
				const source = this.foodSourcePolicy.findFoodSource(settlerId)
				if (!source) {
					return { reason: NeedPlanningFailureReason.NoFoodSource }
				}
				return buildEatPlan(settlerId, source, {
					buildings: this.managers.buildings,
					reservations: this.managers.reservations
				})
			}
			case NeedType.Fatigue: {
				const bed = this.bedPolicy.findBed(settlerId)
				if (!bed) {
					return { reason: NeedPlanningFailureReason.NoHome }
				}
				return buildSleepPlan(settlerId, bed, {
					buildings: this.managers.buildings,
					reservations: this.managers.reservations
				})
			}
			default: {
				this.logger.warn(`[NeedPlanner] Unknown need type ${needType}`)
				return { reason: NeedPlanningFailureReason.UnknownNeedType }
			}
		}
	}
}
