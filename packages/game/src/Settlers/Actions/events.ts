import type { SettlerId } from '../../ids'
import type { ActionQueueContext } from '../../state/types'
import type { SettlerActionFailureReason } from '../failureReasons'

export interface ActionQueueCompletedEventData {
	settlerId: SettlerId
	context?: ActionQueueContext
}

export interface ActionQueueFailedEventData {
	settlerId: SettlerId
	context?: ActionQueueContext
	reason: SettlerActionFailureReason
}

export const SettlerActionsEvents = {
	SS: {
		QueueCompleted: 'ss:settlers:actions:queue-completed',
		QueueFailed: 'ss:settlers:actions:queue-failed'
	}
} as const
