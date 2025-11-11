export const PopulationEvents = {
	CS: {
		RequestWorker: 'cs:population:request-worker', // Request worker for building (automatic assignment)
		UnassignWorker: 'cs:population:unassign-worker', // Unassign settler from job
		RequestList: 'cs:population:request-list', // Request full population state (settlers list + statistics)
	},
	SC: {
		SettlerSpawned: 'sc:population:settler-spawned', // Settler was spawned
		SettlerUpdated: 'sc:population:settler-updated', // Settler state/data updated (e.g., state change, position, target)
		WorkerAssigned: 'sc:population:worker-assigned', // Worker assigned to job (after arriving at building)
		WorkerUnassigned: 'sc:population:worker-unassigned', // Worker unassigned
		WorkerRequestFailed: 'sc:population:worker-request-failed', // Worker request failed (no available settler/tool)
		List: 'sc:population:list', // Full population state (settlers list + statistics) sent to client on join or request
		StatsUpdated: 'sc:population:stats-updated', // Population statistics updated (headcount, by profession, idle/working counts)
		ProfessionChanged: 'sc:population:profession-changed', // Settler profession changed (e.g., from tool pickup)
	},
	SS: {
		SpawnTick: 'ss:population:spawn-tick', // Internal tick for house spawning
		JobTick: 'ss:population:job-tick', // Internal tick for job processing
		// Note: MovementTick, PickupItem, ArrivedAtBuilding removed - MovementManager handles these via MovementEvents.SS.PathComplete (with target info)
	}
} as const

