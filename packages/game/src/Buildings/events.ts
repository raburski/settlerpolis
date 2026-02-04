export const BuildingsEvents = {
	CS: {
		Place: 'cs:buildings:place',
		Cancel: 'cs:buildings:cancel',
		RequestPreview: 'cs:buildings:request-preview',
		SetProductionPaused: 'cs:buildings:set-production-paused',
		SetProductionPlan: 'cs:buildings:set-production-plan',
		SetGlobalProductionPlan: 'cs:buildings:set-global-production-plan',
		SetWorkArea: 'cs:buildings:set-work-area',
		SetStorageRequests: 'cs:buildings:set-storage-requests'
	},
	SC: {
		Placed: 'sc:buildings:placed',
		Progress: 'sc:buildings:progress',
		Completed: 'sc:buildings:completed',
		Cancelled: 'sc:buildings:cancelled',
		Catalog: 'sc:buildings:catalog',
		ResourcesChanged: 'sc:buildings:resources-changed',     // Resource collection progress changed
		StageChanged: 'sc:buildings:stage-changed',             // Construction stage changed
		WorkAreaUpdated: 'sc:buildings:work-area-updated',
		StorageRequestsUpdated: 'sc:buildings:storage-requests-updated',
		WorkerQueueUpdated: 'sc:buildings:worker-queue-updated',
		ProductionStarted: 'sc:buildings:production-started',
		ProductionStopped: 'sc:buildings:production-stopped',
		ProductionProgress: 'sc:buildings:production-progress',
		ProductionCompleted: 'sc:buildings:production-completed',
		ProductionStatusChanged: 'sc:buildings:production-status-changed',
		ProductionPlanUpdated: 'sc:buildings:production-plan-updated',
		GlobalProductionPlanUpdated: 'sc:buildings:global-production-plan-updated'
	},
	SS: {
		Tick: 'ss:buildings:tick',
		HouseCompleted: 'ss:buildings:house-completed', // Internal event for PopulationManager
		ConstructionCompleted: 'ss:buildings:construction-completed', // Internal event when construction completes (for builder reassignment)
		Removed: 'ss:buildings:removed'
	}
} as const
