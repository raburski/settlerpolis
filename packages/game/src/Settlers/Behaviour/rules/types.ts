import type { SettlerActionsManager } from '../../Actions'
import type { SettlerId } from '../../../ids'
import type { SettlerBehaviourDeps } from '../deps'
import type { SettlerWorkManager } from '../../Work'
import type { WorkAssignment, WorkProvider, WorkStep } from '../../Work/types'
import type { SettlerBehaviourState } from '../SettlerBehaviourState'

export enum BehaviourRuleResult {
	Continue = 'continue',
	Stop = 'stop'
}

export interface BehaviourDispatchRuleContext {
	settlerId: SettlerId
	nowMs: number
	managers: SettlerBehaviourDeps
	work: SettlerWorkManager
	actionsManager: SettlerActionsManager
	state: SettlerBehaviourState
	dispatchNextStep: (settlerId: SettlerId) => void
	assignment?: WorkAssignment
	provider?: WorkProvider
	step?: WorkStep | null
}

export interface BehaviourDispatchRule {
	id: string
	apply(context: BehaviourDispatchRuleContext): BehaviourRuleResult
	reset?(): void
}
