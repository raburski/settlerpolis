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
		Catalog: 'sc:buildings:catalog'
	},
	SS: {
		Tick: 'ss:buildings:tick'
	}
} as const

