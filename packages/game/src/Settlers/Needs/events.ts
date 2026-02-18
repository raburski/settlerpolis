export const NeedsEvents = {
	SS: {
		NeedBecameUrgent: 'ss:needs:became-urgent',
		NeedBecameCritical: 'ss:needs:became-critical',
		NeedSatisfied: 'ss:needs:satisfied',
		NeedInterruptRequested: 'ss:needs:interrupt-requested',
		NeedInterruptStarted: 'ss:needs:interrupt-started',
		NeedInterruptEnded: 'ss:needs:interrupt-ended',
		NeedPlanCreated: 'ss:needs:plan-created',
		NeedPlanFailed: 'ss:needs:plan-failed'
	}
} as const
