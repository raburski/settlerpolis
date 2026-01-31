export const WorkProviderEvents = {
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
		AssignmentRemoved: 'ss:work:assignment-removed'
	}
} as const
