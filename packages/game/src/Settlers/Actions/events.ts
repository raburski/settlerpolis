import type { SettlerId } from '../../ids'
import type { ActionQueueContext } from '../../state/types'

export interface ActionQueueCompletedEventData {
	settlerId: SettlerId
	context?: ActionQueueContext
}

export interface ActionQueueFailedEventData {
	settlerId: SettlerId
	context?: ActionQueueContext
	reason: string
}

export const SettlerActionsEvents = {
	SS: {
		QueueCompleted: 'ss:settlers:actions:queue-completed',
		QueueFailed: 'ss:settlers:actions:queue-failed'
	}
} as const
