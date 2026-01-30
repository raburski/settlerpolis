export type PendingTransportRequest =
	| {
			id: string
			type: 'collect'
			buildingInstanceId: string
			itemType: string
			priority: number
			requestedAt: number
	  }
	| {
			id: string
			type: 'direct'
			sourceBuildingInstanceId: string
			targetBuildingInstanceId: string
			itemType: string
			quantity: number
			priority: number
			requestedAt: number
	  }

export type DispatchResult = 'assigned' | 'keep' | 'drop'

export interface JobQueueContext {
	getSimulationTimeMs: () => number
	tryDispatch: (request: PendingTransportRequest) => DispatchResult
}

export class JobQueue {
	private pendingRequests: PendingTransportRequest[] = []
	private pendingRequestKeys = new Set<string>()

	constructor(private context: JobQueueContext) {}

	public enqueueCollect(buildingInstanceId: string, itemType: string, priority: number): void {
		const key = `collect:${buildingInstanceId}:${itemType}`
		if (this.pendingRequestKeys.has(key)) {
			return
		}

		this.pendingRequestKeys.add(key)
		this.pendingRequests.push({
			id: this.buildRequestId(),
			type: 'collect',
			buildingInstanceId,
			itemType,
			priority,
			requestedAt: this.context.getSimulationTimeMs()
		})
	}

	public enqueueDirect(
		sourceBuildingInstanceId: string,
		targetBuildingInstanceId: string,
		itemType: string,
		quantity: number,
		priority: number
	): void {
		const key = `direct:${sourceBuildingInstanceId}:${targetBuildingInstanceId}:${itemType}`
		if (this.pendingRequestKeys.has(key)) {
			return
		}

		this.pendingRequestKeys.add(key)
		this.pendingRequests.push({
			id: this.buildRequestId(),
			type: 'direct',
			sourceBuildingInstanceId,
			targetBuildingInstanceId,
			itemType,
			quantity,
			priority,
			requestedAt: this.context.getSimulationTimeMs()
		})
	}

	public dispatchPending(): void {
		if (this.pendingRequests.length === 0) {
			return
		}

		const sorted = [...this.pendingRequests].sort((a, b) => {
			if (b.priority !== a.priority) {
				return b.priority - a.priority
			}
			return a.requestedAt - b.requestedAt
		})

		const handledIds = new Set<string>()
		for (const request of sorted) {
			if (handledIds.has(request.id)) {
				continue
			}

			const result = this.context.tryDispatch(request)
			if (result === 'assigned' || result === 'drop') {
				handledIds.add(request.id)
			}
		}

		if (handledIds.size === 0) {
			return
		}

		this.pendingRequests = this.pendingRequests.filter(req => !handledIds.has(req.id))
		for (const request of sorted) {
			if (handledIds.has(request.id)) {
				this.pendingRequestKeys.delete(this.getRequestKey(request))
			}
		}
	}

	public hasPendingRequestForBuilding(buildingInstanceId: string, itemType?: string): boolean {
		if (itemType) {
			if (this.pendingRequestKeys.has(`collect:${buildingInstanceId}:${itemType}`)) {
				return true
			}
			for (const key of this.pendingRequestKeys) {
				if (!key.startsWith('direct:')) {
					continue
				}
				const [, sourceId, targetId, keyItemType] = key.split(':')
				if (keyItemType !== itemType) {
					continue
				}
				if (sourceId === buildingInstanceId || targetId === buildingInstanceId) {
					return true
				}
			}
			return false
		}

		for (const key of this.pendingRequestKeys) {
			const parts = key.split(':')
			if (parts.length < 3) {
				continue
			}
			if (parts[0] === 'collect' && parts[1] === buildingInstanceId) {
				return true
			}
			if (parts[0] === 'direct') {
				const sourceId = parts[1]
				const targetId = parts[2]
				if (sourceId === buildingInstanceId || targetId === buildingInstanceId) {
					return true
				}
			}
		}
		return false
	}

	private getRequestKey(request: PendingTransportRequest): string {
		if (request.type === 'collect') {
			return `collect:${request.buildingInstanceId}:${request.itemType}`
		}
		return `direct:${request.sourceBuildingInstanceId}:${request.targetBuildingInstanceId}:${request.itemType}`
	}

	private buildRequestId(): string {
		return `${Date.now()}-${Math.random().toString(36).slice(2)}`
	}
}
