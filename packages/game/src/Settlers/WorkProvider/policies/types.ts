import { WorkPolicyPhase, WorkPolicyResultType } from './constants'
import type { WorkAction, WorkAssignment, WorkStep, WorkWaitReason } from '../types'
import type { WorkProviderDeps } from '../deps'

export interface WorkPolicyContext {
	settlerId: string
	assignment: WorkAssignment
	managers: WorkProviderDeps
	simulationTimeMs: number
}

export type WorkPolicyResult =
	| { type: WorkPolicyResultType.Block, reason: WorkWaitReason }
	| { type: WorkPolicyResultType.Enqueue, actions: WorkAction[], onComplete?: () => void, onFail?: (reason: string) => void }

export { WorkPolicyResultType, WorkPolicyPhase }

export interface WorkPolicy {
	id: string
	onBeforeStep?(ctx: WorkPolicyContext): WorkPolicyResult | null
	onNoStep?(ctx: WorkPolicyContext): WorkPolicyResult | null
	onWaitStep?(ctx: WorkPolicyContext, step: WorkStep): WorkPolicyResult | null
}
