import type { WorkAction } from '../Work/types'
import type { NeedLevel, NeedPriority, NeedType } from './NeedTypes'

export interface NeedThresholdEventData {
	settlerId: string
	needType: NeedType
	value: number
	level?: NeedLevel
}

export interface NeedInterruptEventData {
	settlerId: string
	needType: NeedType
	level: NeedPriority
}

export interface NeedSatisfiedEventData {
	settlerId: string
	needType: NeedType
	value: number
}

export interface NeedPlanCreatedEventData {
	settlerId: string
	needType: NeedType
	planId: string
}

export interface NeedPlanFailedEventData {
	settlerId: string
	needType: NeedType
	reason: string
}

export interface PausedContext {
	assignmentId?: string
	providerId?: string
	providerType?: string
}

export interface NeedPlan {
	id: string
	needType: NeedType
	actions: WorkAction[]
	satisfyValue?: number
	releaseReservations?: () => void
}

export interface NeedPlanResult {
	plan?: NeedPlan
	reason?: string
}
