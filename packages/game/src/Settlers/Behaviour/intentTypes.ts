import type { SettlerAction } from '../Actions/types'
import type { ActionQueueContext } from '../../state/types'
import type { SettlerState } from '../../Population/types'
import type { WorkWaitReason } from '../Work/types'

export enum BehaviourIntentType {
	EnqueueActions = 'ENQUEUE_ACTIONS',
	PauseAssignment = 'PAUSE_ASSIGNMENT',
	ResumeAssignment = 'RESUME_ASSIGNMENT',
	SetWaitState = 'SET_WAIT_STATE',
	RequestDispatch = 'REQUEST_DISPATCH'
}

export enum BehaviourIntentPriority {
	Critical = 400,
	High = 300,
	Normal = 200,
	Low = 100
}

export enum EnqueueActionsReason {
	NeedPlan = 'NEED_PLAN',
	WorkStep = 'WORK_STEP',
	NavigationYield = 'NAVIGATION_YIELD'
}

export enum PauseAssignmentReason {
	NeedInterrupt = 'NEED_INTERRUPT',
	NavigationYield = 'NAVIGATION_YIELD',
	DomainRule = 'DOMAIN_RULE'
}

export enum ResumeAssignmentReason {
	NeedInterruptEnded = 'NEED_INTERRUPT_ENDED',
	RecoveryCompleted = 'RECOVERY_COMPLETED'
}

export enum SetWaitStateReason {
	WaitingForDispatch = 'WAITING_FOR_DISPATCH',
	RecoveringMovement = 'RECOVERING_MOVEMENT',
	ClearWait = 'CLEAR_WAIT'
}

export enum RequestDispatchReason {
	QueueCompleted = 'QUEUE_COMPLETED',
	ProviderAssigned = 'PROVIDER_ASSIGNED',
	Recovery = 'RECOVERY',
	Immediate = 'IMMEDIATE',
	ResumeAfterDeserialize = 'RESUME_AFTER_DESERIALIZE'
}

export type BehaviourIntent =
	| {
		type: BehaviourIntentType.EnqueueActions
		priority: BehaviourIntentPriority
		settlerId: string
		actions: SettlerAction[]
		context?: ActionQueueContext
		completionToken?: string
		reason: EnqueueActionsReason
	}
	| {
		type: BehaviourIntentType.PauseAssignment
		priority: BehaviourIntentPriority
		settlerId: string
		reason: PauseAssignmentReason
	}
	| {
		type: BehaviourIntentType.ResumeAssignment
		priority: BehaviourIntentPriority
		settlerId: string
		reason: ResumeAssignmentReason
	}
	| {
		type: BehaviourIntentType.SetWaitState
		priority: BehaviourIntentPriority
		settlerId: string
		reason: SetWaitStateReason
		waitReason?: WorkWaitReason
		state?: SettlerState
	}
	| {
		type: BehaviourIntentType.RequestDispatch
		priority: BehaviourIntentPriority
		settlerId: string
		reason: RequestDispatchReason
		atMs?: number
	}
