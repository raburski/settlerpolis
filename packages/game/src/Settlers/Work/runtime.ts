import type { ItemType } from '../../Items/types'
import type { PausedContext } from '../Needs/types'
import type { ProductionRecipe } from '../../Buildings/types'
import type { SettlerId } from '../../ids'
import type { WorkAssignment, WorkProvider, WorkStep } from './types'
import type { SimulationTickData } from '../../Simulation/types'

export interface SettlerWorkRuntimePort {
	getAssignment(settlerId: SettlerId): WorkAssignment | undefined
	getProvider(providerId: string): WorkProvider | undefined
	getNowMs(): number
	refreshWorldDemand(data: SimulationTickData): void
	isSettlerPaused(settlerId: SettlerId): boolean
	pauseAssignment(settlerId: SettlerId, reason?: string): PausedContext | null
	resumeAssignment(settlerId: SettlerId): void
	unassignSettler(settlerId: SettlerId): void
	onStepIssued(settlerId: SettlerId, assignment: WorkAssignment, step: WorkStep): void
	handleProductionCompleted(buildingInstanceId: string, recipe: ProductionRecipe): void
	releaseConstructionInFlight(buildingInstanceId: string, itemType: ItemType, quantity: number): void
	hasPendingLogisticsRequests(): boolean
}
