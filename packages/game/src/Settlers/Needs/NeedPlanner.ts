import type { Logger } from '../../Logs'
import { v4 as uuidv4 } from 'uuid'
import { NeedType } from './NeedTypes'
import type { NeedPlanResult } from './types'
import { NeedPlanningFailureReason } from '../failureReasons'
import { createNeedPlanHandlerMap } from './planHandlers'
import type { NeedPlanHandler } from './planHandlers'
import type { NeedPlannerDeps } from './plannerDeps'

export class NeedPlanner {
	private readonly handlers: Record<NeedType, NeedPlanHandler>

	constructor(
		managers: NeedPlannerDeps,
		private logger: Logger
	) {
		this.handlers = createNeedPlanHandlerMap(managers)
	}

	createPlan(settlerId: string, needType: NeedType): NeedPlanResult {
		const handler = this.handlers[needType]
		if (!handler) {
			this.logger.warn(`[NeedPlanner] Unknown need type ${needType}`)
			return { reason: NeedPlanningFailureReason.UnknownNeedType }
		}
		const result = handler.build(settlerId)
		if (!result.plan) {
			return { reason: result.reason }
		}
		return {
			plan: {
				id: uuidv4(),
				needType,
				actions: result.plan.actions,
				satisfyValue: result.plan.satisfyValue
			}
		}
	}
}

export type { NeedPlannerDeps } from './plannerDeps'
