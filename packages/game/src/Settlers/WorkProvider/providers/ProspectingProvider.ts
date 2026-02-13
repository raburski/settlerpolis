import type { WorkProvider, WorkStep } from '../types'
import { WorkProviderType, WorkStepType, WorkWaitReason } from '../types'
import type { WorkProviderDeps } from '..'
import type { Logger } from '../../../Logs'
import { ProfessionType } from '../../../Population/types'

export class ProspectingProvider implements WorkProvider {
	public readonly id: string
	public readonly type = WorkProviderType.Prospecting
	private assigned = new Set<string>()

	constructor(
		private mapId: string,
		private playerId: string,
		private managers: WorkProviderDeps,
		private logger: Logger
	) {
		this.id = `prospecting:${mapId}:${playerId}`
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

	pause(_settlerId: string): void {
		// no-op
	}

	resume(_settlerId: string): void {
		// no-op
	}

	requestNextStep(settlerId: string): WorkStep | null {
		const settler = this.managers.population.getSettler(settlerId)
		if (!settler) {
			return null
		}

		if (settler.mapId !== this.mapId || settler.playerId !== this.playerId) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.NoWork }
		}

		if (settler.profession !== ProfessionType.Prospector) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.WrongProfession }
		}

		const job = this.managers.resourceNodes.claimProspectingJob(this.mapId, this.playerId, settlerId)
		if (!job) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.NoWork }
		}

		return {
			type: WorkStepType.Prospect,
			resourceNodeId: job.nodeId,
			durationMs: job.durationMs
		}
	}
}
