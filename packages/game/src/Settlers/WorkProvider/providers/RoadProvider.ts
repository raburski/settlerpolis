import type { WorkProvider, WorkStep } from '../types'
import { WorkProviderType, WorkStepType, WorkWaitReason } from '../types'
import type { WorkProviderDeps } from '..'
import type { Logger } from '../../../Logs'
import { ProfessionType } from '../../../Population/types'

export class RoadProvider implements WorkProvider {
	public readonly id: string
	public readonly type = WorkProviderType.Road
	private assigned = new Set<string>()

	constructor(
		private mapName: string,
		private playerId: string,
		private managers: WorkProviderDeps,
		private logger: Logger
	) {
		this.id = `road:${mapName}:${playerId}`
	}

	assign(settlerId: string): void {
		this.assigned.add(settlerId)
	}

	unassign(settlerId: string): void {
		this.assigned.delete(settlerId)
		const job = this.managers.roads.getJobForSettler(settlerId)
		if (job) {
			this.managers.roads.releaseJob(job.jobId)
		}
	}

	pause(settlerId: string): void {
		// no-op
	}

	resume(settlerId: string): void {
		// no-op
	}

	requestNextStep(settlerId: string): WorkStep | null {
		const settler = this.managers.population.getSettler(settlerId)
		if (!settler) {
			return null
		}

		if (settler.mapName !== this.mapName || settler.playerId !== this.playerId) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.NoWork }
		}

		if (settler.profession !== ProfessionType.Builder) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.WrongProfession }
		}

		const currentJob = this.managers.roads.getJobForSettler(settlerId)
		const job = currentJob ?? this.managers.roads.claimJob(this.mapName, this.playerId, settlerId)
		if (!job) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.NoWork }
		}

		return {
			type: WorkStepType.BuildRoad,
			jobId: job.jobId,
			position: job.position,
			roadType: job.roadType,
			durationMs: job.durationMs
		}
	}
}
