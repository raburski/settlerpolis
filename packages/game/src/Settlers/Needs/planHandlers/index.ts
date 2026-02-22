import { NeedType } from '../NeedTypes'
import type { NeedPlannerDeps } from '../plannerDeps'
import type { NeedPlanHandler } from './types'
import { HungerNeedPlanHandler } from './hunger'
import { FatigueNeedPlanHandler } from './fatigue'

export const createNeedPlanHandlerMap = (managers: NeedPlannerDeps): Record<NeedType, NeedPlanHandler> => {
	const handlers: NeedPlanHandler[] = [
		new HungerNeedPlanHandler(managers),
		new FatigueNeedPlanHandler(managers)
	]
	return handlers.reduce((map, handler) => {
		map[handler.type] = handler
		return map
	}, {} as Record<NeedType, NeedPlanHandler>)
}

export * from './types'
