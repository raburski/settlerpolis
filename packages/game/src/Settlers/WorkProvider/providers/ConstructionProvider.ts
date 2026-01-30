import type { WorkProvider, WorkStep } from '../types'
import { WorkStepType, WorkWaitReason } from '../types'
import type { WorkProviderDeps } from '..'
import type { Logger } from '../../../Logs'
import { ConstructionStage } from '../../../Buildings/types'
import { ProfessionType } from '../../../Population/types'

export class ConstructionProvider implements WorkProvider {
	public readonly id: string
	public readonly type = 'construction' as const
	private assigned = new Set<string>()

	constructor(
		buildingInstanceId: string,
		private managers: WorkProviderDeps,
		private logger: Logger
	) {
		this.id = `construction:${buildingInstanceId}`
	}

	assign(settlerId: string): void {
		this.assigned.add(settlerId)
	}

	unassign(settlerId: string): void {
		this.assigned.delete(settlerId)
	}

	pause(settlerId: string): void {
		// no-op
	}

	resume(settlerId: string): void {
		// no-op
	}

	requestNextStep(settlerId: string): WorkStep | null {
		const buildingInstanceId = this.id.replace('construction:', '')
		const building = this.managers.buildings.getBuildingInstance(buildingInstanceId)
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
			return { type: WorkStepType.AcquireTool, profession: ProfessionType.Builder }
		}

		return { type: WorkStepType.Construct, buildingInstanceId: building.id, durationMs: 2000 }
	}
}
