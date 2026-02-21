import type { SettlerAction } from '../Actions/types'
import type { NeedLevel, NeedPriority, NeedType } from './NeedTypes'
import type { NeedPlanFailureReason } from '../failureReasons'

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
	reason: NeedPlanFailureReason
}

export interface NeedPlan {
	id: string
	needType: NeedType
	actions: SettlerAction[]
	satisfyValue?: number
}

export interface NeedInterruptPlanRequest {
	settlerId: string
	needType: NeedType
	priority: NeedPriority
	plan: NeedPlan
}

export interface NeedActionPlan {
	actions: SettlerAction[]
	satisfyValue?: number
}

export interface NeedActionPlanResult {
	plan?: NeedActionPlan
	reason?: NeedPlanFailureReason
}

export interface NeedPlanResult {
	plan?: NeedPlan
	reason?: NeedPlanFailureReason
}
