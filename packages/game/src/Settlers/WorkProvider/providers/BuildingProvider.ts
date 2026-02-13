import type { WorkProvider, WorkStep } from '../types'
import type { WorkProviderDeps } from '..'
import type { LogisticsProvider } from './LogisticsProvider'
import type { Logger } from '../../../Logs'
import { ConstructionStage } from '../../../Buildings/types'
import { ProfessionType } from '../../../Population/types'
import { WorkProviderType, WorkStepType, WorkWaitReason } from '../types'
import { BuildingWorkHandlers } from '../buildingWork'

export class BuildingProvider implements WorkProvider {
	public readonly id: string
	public readonly type = WorkProviderType.Building
	private assigned = new Set<string>()

	constructor(
		buildingInstanceId: string,
		private managers: WorkProviderDeps,
		private logistics: LogisticsProvider,
		private logger: Logger
	) {
		this.id = buildingInstanceId
	}

	assign(settlerId: string): void {
		this.assigned.add(settlerId)
	}

	unassign(settlerId: string): void {
		this.assigned.delete(settlerId)
		const job = this.managers.resourceNodes.getProspectingJobForSettler(settlerId)
		if (job) {
			this.managers.resourceNodes.releaseProspectingJob(job.jobId)
		}
	}

	pause(settlerId: string): void {
		// no-op for now
	}

	resume(settlerId: string): void {
		// no-op for now
	}

	requestNextStep(settlerId: string): WorkStep | null {
		const building = this.managers.buildings.getBuildingInstance(this.id)
		if (!building) {
			return null
		}

		const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
		if (!definition) {
			return null
		}

		const settler = this.managers.population.getSettler(settlerId)
		if (!settler) {
			return null
		}

		if (building.stage === ConstructionStage.Completed && this.managers.buildings.isProductionPaused(building.id)) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.Paused }
		}

		const requiredProfession = definition.requiredProfession as ProfessionType | undefined
		if (requiredProfession && settler.profession !== requiredProfession) {
			if (settler.profession === ProfessionType.Carrier) {
				return { type: WorkStepType.AcquireTool, profession: requiredProfession }
			}
			return { type: WorkStepType.Wait, reason: WorkWaitReason.WrongProfession }
		}

		if (building.stage !== ConstructionStage.Completed) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.BuildingNotReady }
		}

		for (const handler of BuildingWorkHandlers) {
			if (!handler.canHandle(definition)) {
				continue
			}
			const step = handler.getNextStep({
				building,
				definition,
				settler,
				managers: this.managers,
				logistics: this.logistics,
				logger: this.logger
			})
			if (step) {
				return step
			}
		}

		return { type: WorkStepType.Wait, reason: WorkWaitReason.NoWork }
	}
}
