import type { ItemType } from '../../Items/types'
import type { PausedContext } from '../Needs/types'
import type { ProductionRecipe } from '../../Buildings/types'
import type { SettlerId } from '../../ids'
import type { WorkPolicyPhase } from './policies/constants'
import type { WorkAssignment, WorkProvider, WorkStep } from './types'

export interface SettlerWorkRuntimePort {
	getAssignment(settlerId: SettlerId): WorkAssignment | undefined
	getProvider(providerId: string): WorkProvider | undefined
	getNowMs(): number
	getPauseState(): {
		pauseRequests: Map<SettlerId, { reason: string }>
		pausedContexts: Map<SettlerId, PausedContext | null>
	}
	requestPause(settlerId: SettlerId): void
	unassignSettler(settlerId: SettlerId): void
	applyPolicy(phase: WorkPolicyPhase, settlerId: SettlerId, assignment: WorkAssignment, step?: WorkStep): boolean
	updateProductionForStep(assignment: WorkAssignment, step: WorkStep): void
	handleProductionCompleted(buildingInstanceId: string, recipe: ProductionRecipe): void
	releaseConstructionInFlight(buildingInstanceId: string, itemType: ItemType, quantity: number): void
	hasPendingLogisticsRequests(): boolean
}
