import type { NeedType } from '../NeedTypes'
import type { NeedActionPlanResult } from '../types'

export interface NeedPlanHandler {
	type: NeedType
	build(settlerId: string): NeedActionPlanResult
}
