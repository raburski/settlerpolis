import type { WorkProvider, WorkStep } from '../types'
import { WorkProviderType, WorkStepType, WorkWaitReason } from '../types'
import type { WorkProviderDeps } from '..'
import type { Logger } from '../../../Logs'
import { ConstructionStage } from '../../../Buildings/types'
import { ProfessionType } from '../../../Population/types'
import type { BuildingInstance } from '../../../Buildings/types'
import type { Position } from '../../../types'
import { findNearestWalkableTileOutsideFootprint } from '../../../Buildings/utils'

const CONSTRUCTION_WORK_CYCLE_MIN_MS = 1000
const CONSTRUCTION_WORK_CYCLE_MAX_MS = 3000
const CONSTRUCTION_EXIT_SEARCH_RADIUS_TILES = 4

const getRandomWorkCycleDuration = (): number => {
	const span = CONSTRUCTION_WORK_CYCLE_MAX_MS - CONSTRUCTION_WORK_CYCLE_MIN_MS
	return CONSTRUCTION_WORK_CYCLE_MIN_MS + Math.floor(Math.random() * (span + 1))
}

export class ConstructionProvider implements WorkProvider {
	public readonly id: string
	public readonly type = WorkProviderType.Construction
	private assigned = new Set<string>()
	private buildingInstanceId: string

	constructor(
		buildingInstanceId: string,
		private managers: WorkProviderDeps,
		private logger: Logger
	) {
		this.id = `construction:${buildingInstanceId}`
		this.buildingInstanceId = buildingInstanceId
	}

	assign(settlerId: string): void {
		this.assigned.add(settlerId)
	}

	unassign(settlerId: string): void {
		this.assigned.delete(settlerId)
		this.managers.buildings.setConstructionWorkerActive(this.buildingInstanceId, settlerId, false)
	}

	pause(settlerId: string): void {
		// no-op
	}

	resume(settlerId: string): void {
		// no-op
	}

	requestUnassignStep(settlerId: string): WorkStep | null {
		const building = this.managers.buildings.getBuildingInstance(this.buildingInstanceId)
		if (!building) {
			return null
		}
		const settler = this.managers.population.getSettler(settlerId)
		const currentPosition = settler?.position ?? building.position
		const exitPosition = this.findConstructionExitPosition(building, currentPosition)
		if (!exitPosition) {
			return null
		}
		return { type: WorkStepType.StepAway, targetPosition: exitPosition }
	}

	requestNextStep(settlerId: string): WorkStep | null {
		const building = this.managers.buildings.getBuildingInstance(this.buildingInstanceId)
		if (!building) {
			return null
		}

		if (building.stage !== ConstructionStage.Constructing) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.NotConstructing }
		}

		const settler = this.managers.population.getSettler(settlerId)
		if (!settler) {
			return null
		}

		if (settler.profession !== ProfessionType.Builder) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.WrongProfession }
		}

		return { type: WorkStepType.Construct, buildingInstanceId: building.id, durationMs: getRandomWorkCycleDuration() }
	}

	private findConstructionExitPosition(building: BuildingInstance, reference: Position): { x: number; y: number } | null {
		const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
		const map = this.managers.map.getMap(building.mapId)
		if (!definition || !map) {
			return null
		}
		return findNearestWalkableTileOutsideFootprint(
			building,
			definition,
			map,
			reference,
			CONSTRUCTION_EXIT_SEARCH_RADIUS_TILES
		)
	}
}
