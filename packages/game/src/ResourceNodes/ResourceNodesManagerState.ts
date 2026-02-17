import type {
	ResourceNodeDefinition,
	ResourceNodeInstance
} from './types'
import type { ResourceNodesSnapshot } from '../state/types'

interface ProspectingJob {
	jobId: string
	mapId: string
	playerId: string
	nodeId: string
	createdAt: number
	assignedSettlerId?: string
}

export class ResourceNodesManagerState {
	public definitions = new Map<string, ResourceNodeDefinition>()
	public nodes = new Map<string, ResourceNodeInstance>()
	public prospectingJobsByMap = new Map<string, ProspectingJob[]>()
	public simulationTimeMs = 0

	public serialize(): ResourceNodesSnapshot {
		return {
			nodes: Array.from(this.nodes.values()).map(node => ({
				...node,
				position: { ...node.position }
			})),
			simulationTimeMs: this.simulationTimeMs,
			prospectingJobsByMap: Array.from(this.prospectingJobsByMap.entries()).map(([mapId, jobs]) => ([
				mapId,
				jobs.map(job => ({ ...job }))
			]))
		}
	}

	public deserialize(state: ResourceNodesSnapshot): void {
		this.nodes.clear()
		this.prospectingJobsByMap.clear()
		for (const node of state.nodes) {
			this.nodes.set(node.id, {
				...node,
				position: { ...node.position }
			})
		}
		this.simulationTimeMs = state.simulationTimeMs
		const jobsByMap = (state as ResourceNodesSnapshot & { prospectingJobsByMap?: Array<[string, ProspectingJob[]]> }).prospectingJobsByMap
		if (Array.isArray(jobsByMap)) {
			for (const [mapId, jobs] of jobsByMap) {
				this.prospectingJobsByMap.set(mapId, jobs.map(job => ({ ...job })))
			}
		}
	}

	public reset(): void {
		this.nodes.clear()
		this.prospectingJobsByMap.clear()
		this.simulationTimeMs = 0
	}
}
