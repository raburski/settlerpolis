export const BuildingsEvents = {
	CS: {
		Place: 'cs:buildings:place',
		Cancel: 'cs:buildings:cancel',
		RequestPreview: 'cs:buildings:request-preview'
	},
	SC: {
		Placed: 'sc:buildings:placed',
		Progress: 'sc:buildings:progress',
		Completed: 'sc:buildings:completed',
		Cancelled: 'sc:buildings:cancelled',
		Catalog: 'sc:buildings:catalog',
		ResourcesChanged: 'sc:buildings:resources-changed',     // Resource collection progress changed
		StageChanged: 'sc:buildings:stage-changed'              // Construction stage changed
	},
	SS: {
		Tick: 'ss:buildings:tick',
		HouseCompleted: 'ss:buildings:house-completed', // Internal event for PopulationManager
		ConstructionCompleted: 'ss:buildings:construction-completed' // Internal event when construction completes (for builder reassignment)
	}
} as const

