import type { SettlerId, WorkAssignmentId } from '../../ids'
import type { WorkAction, WorkAssignment, WorkStep } from './types'
import type { SettlerActionFailureReason } from '../failureReasons'

export enum WorkDispatchReason {
	WorkFlow = 'work_flow',
	WorkerAssigned = 'worker_assigned',
	ImmediateRequest = 'immediate_request',
	ResumeAfterDeserialize = 'resume_after_deserialize'
}

export interface WorkActionCompletedEventData {
	settlerId: SettlerId
	action: WorkAction
}

export interface WorkActionFailedEventData {
	settlerId: SettlerId
	action: WorkAction
	reason: SettlerActionFailureReason
}

export interface WorkStepIssuedEventData {
	settlerId: SettlerId
	step: WorkStep
}

export interface WorkStepCompletedEventData {
	settlerId: SettlerId
	step: WorkStep
}

export interface WorkStepFailedEventData {
	settlerId: SettlerId
	step: WorkStep
	reason: SettlerActionFailureReason
}

export interface WorkAssignmentCreatedEventData {
	assignment: WorkAssignment
}

export interface WorkAssignmentRemovedEventData {
	assignmentId: WorkAssignmentId
	settlerId: SettlerId
}

export interface WorkDispatchRequestedEventData {
	settlerId: SettlerId
	reason: WorkDispatchReason
}

export const WorkProviderEvents = {
	CS: {
		SetLogisticsPriorities: 'cs:work:logistics-priorities'
	},
	SC: {
		LogisticsUpdated: 'sc:work:logistics-updated'
	},
	SS: {
		ActionCompleted: 'ss:work:action-completed',
		ActionFailed: 'ss:work:action-failed',
		StepIssued: 'ss:work:step-issued',
		StepCompleted: 'ss:work:step-completed',
		StepFailed: 'ss:work:step-failed',
		AssignmentCreated: 'ss:work:assignment-created',
		AssignmentRemoved: 'ss:work:assignment-removed',
		DispatchRequested: 'ss:work:dispatch-requested'
	}
} as const
