import { RoadType } from './types'
import type { RoadData } from './types'
import type { RoadsSnapshot, RoadJobSnapshot } from '../state/types'

interface RoadJob {
	jobId: string
	mapId: string
	playerId: string
	tileX: number
	tileY: number
	roadType: RoadType
	createdAt: number
	assignedSettlerId?: string
}

export class RoadManagerState {
	public roadsByMap = new Map<string, RoadData>()
	public jobsByMap = new Map<string, RoadJob[]>()
	public simulationTimeMs = 0

	public serialize(): RoadsSnapshot {
		return {
			roadsByMap: Array.from(this.roadsByMap.entries()),
			jobsByMap: Array.from(this.jobsByMap.entries()).map(([mapId, jobs]) => ([
				mapId,
				jobs.map(job => ({
					jobId: job.jobId,
					mapId: job.mapId,
					playerId: job.playerId,
					tileX: job.tileX,
					tileY: job.tileY,
					roadType: job.roadType,
					createdAt: job.createdAt,
					assignedSettlerId: job.assignedSettlerId
				} as RoadJobSnapshot))
			])),
			simulationTimeMs: this.simulationTimeMs
		}
	}

	public deserialize(state: RoadsSnapshot): void {
		this.roadsByMap = new Map(state.roadsByMap)
		this.jobsByMap.clear()
		for (const [mapId, jobs] of state.jobsByMap) {
			this.jobsByMap.set(mapId, jobs.map(job => ({
				jobId: job.jobId,
				mapId: job.mapId,
				playerId: job.playerId,
				tileX: job.tileX,
				tileY: job.tileY,
				roadType: job.roadType,
				createdAt: job.createdAt,
				assignedSettlerId: job.assignedSettlerId
			})))
		}
		this.simulationTimeMs = state.simulationTimeMs
	}

	public reset(): void {
		this.roadsByMap.clear()
		this.jobsByMap.clear()
		this.simulationTimeMs = 0
	}
}
