import type { SettlerId } from '../../../ids'
import type { WorkProviderDeps } from '..'
import type { WorkProvider, WorkStep } from '../types'
import { WorkProviderType, WorkStepType } from '../types'

const NIGHT_REST_PROVIDER_ID = 'night-rest'

export class NightRestProvider implements WorkProvider {
	public readonly id = NIGHT_REST_PROVIDER_ID
	public readonly type = WorkProviderType.NightRest
	private assigned = new Set<SettlerId>()
	private wakeAtBySettler = new Map<SettlerId, number>()

	constructor(
		private managers: WorkProviderDeps,
		private getNowMs: () => number
	) {}

	assign(settlerId: SettlerId): void {
		this.assigned.add(settlerId)
	}

	unassign(settlerId: SettlerId): void {
		this.assigned.delete(settlerId)
		this.wakeAtBySettler.delete(settlerId)
	}

	pause(_settlerId: SettlerId): void {
		// no-op
	}

	resume(_settlerId: SettlerId): void {
		// no-op
	}

	public setWakeAt(settlerId: SettlerId, wakeAtMs: number): void {
		this.wakeAtBySettler.set(settlerId, Math.max(this.getNowMs() + 1_000, wakeAtMs))
	}

	public reset(): void {
		this.assigned.clear()
		this.wakeAtBySettler.clear()
	}

	requestNextStep(settlerId: SettlerId): WorkStep | null {
		if (!this.assigned.has(settlerId)) {
			return null
		}

		const settler = this.managers.population.getSettler(settlerId)
		if (!settler) {
			return null
		}

		const nowMs = this.getNowMs()
		const wakeAtMs = Math.max(nowMs + 1_000, this.wakeAtBySettler.get(settlerId) ?? (nowMs + 1_000))

		return {
			type: WorkStepType.NightRest,
			houseId: settler.houseId,
			wakeAtMs
		}
	}
}
