export const ProductionEvents = {
	CS: {
		StartProduction: 'cs:production:start-production',
		StopProduction: 'cs:production:stop-production'
	},
	SC: {
		ProductionStarted: 'sc:production:production-started',
		ProductionStopped: 'sc:production:production-stopped',
		ProductionProgress: 'sc:production:production-progress',
		ProductionCompleted: 'sc:production:production-completed',
		StatusChanged: 'sc:production:status-changed'      // no_input, in_production, idle, no_worker
	},
	SS: {
		ProductionTick: 'ss:production:production-tick'    // Internal production processing tick
	}
} as const

