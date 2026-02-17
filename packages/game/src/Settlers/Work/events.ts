export enum WorkDispatchReason {
	WorkFlow = 'work_flow',
	ContextResumed = 'context_resumed',
	WorkerAssigned = 'worker_assigned',
	ImmediateRequest = 'immediate_request',
	ResumeAfterDeserialize = 'resume_after_deserialize'
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
