import { NEED_CRITICAL_THRESHOLD } from '../../Needs/NeedsState'
import { WorkWaitReason } from '../types'
import { WorkPolicyResultType } from './constants'
import type { WorkPolicy, WorkPolicyContext, WorkPolicyResult } from './types'

export class CriticalNeedsPolicy implements WorkPolicy {
	public readonly id = 'critical-needs'

	public onBeforeStep(ctx: WorkPolicyContext): WorkPolicyResult | null {
		const settler = ctx.managers.population.getSettler(ctx.settlerId)
		if (!settler?.needs) {
			return null
		}
		if (settler.needs.hunger <= NEED_CRITICAL_THRESHOLD || settler.needs.fatigue <= NEED_CRITICAL_THRESHOLD) {
			return { type: WorkPolicyResultType.Block, reason: WorkWaitReason.NeedsCritical }
		}
		return null
	}
}
