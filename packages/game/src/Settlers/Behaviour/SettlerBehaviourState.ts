import type { SettlerId } from '../../ids'
import type { WorkWaitReason } from '../Work/types'

export interface SettlerBehaviourSnapshot {
	movementRecoveryUntil: Array<[SettlerId, number]>
	movementRecoveryReason: Array<[SettlerId, WorkWaitReason]>
	movementFailureCounts: Array<[SettlerId, number]>
	pendingDispatchAtMs: Array<[SettlerId, number]>
}

export class SettlerBehaviourState {
	private movementRecoveryUntil = new Map<SettlerId, number>()
	private movementRecoveryReason = new Map<SettlerId, WorkWaitReason>()
	private movementFailureCounts = new Map<SettlerId, number>()
	private pendingDispatchAtMs = new Map<SettlerId, number>()

	public hasPendingDispatches(): boolean {
		return this.pendingDispatchAtMs.size > 0
	}

	public getPendingDispatchEntries(): IterableIterator<[SettlerId, number]> {
		return this.pendingDispatchAtMs.entries()
	}

	public clearPendingDispatch(settlerId: SettlerId): void {
		this.pendingDispatchAtMs.delete(settlerId)
	}

	public schedulePendingDispatch(settlerId: SettlerId, dispatchAtMs: number): void {
		this.pendingDispatchAtMs.set(settlerId, dispatchAtMs)
	}

	public getMovementRecoveryUntil(settlerId: SettlerId): number | undefined {
		return this.movementRecoveryUntil.get(settlerId)
	}

	public getMovementRecoveryReason(settlerId: SettlerId): WorkWaitReason | undefined {
		return this.movementRecoveryReason.get(settlerId)
	}

	public setMovementRecovery(settlerId: SettlerId, recoveryUntilMs: number, reason: WorkWaitReason): void {
		this.movementRecoveryUntil.set(settlerId, recoveryUntilMs)
		this.movementRecoveryReason.set(settlerId, reason)
	}

	public clearMovementRecovery(settlerId: SettlerId): void {
		this.movementRecoveryUntil.delete(settlerId)
		this.movementRecoveryReason.delete(settlerId)
	}

	public incrementMovementFailureCount(settlerId: SettlerId): number {
		const nextFailureCount = (this.movementFailureCounts.get(settlerId) || 0) + 1
		this.movementFailureCounts.set(settlerId, nextFailureCount)
		return nextFailureCount
	}

	public clearMovementFailureCount(settlerId: SettlerId): void {
		this.movementFailureCounts.delete(settlerId)
	}

	public clearSettlerState(settlerId: SettlerId): void {
		this.clearMovementFailureCount(settlerId)
		this.clearMovementRecovery(settlerId)
		this.clearPendingDispatch(settlerId)
	}

	public serialize(): SettlerBehaviourSnapshot {
		return {
			movementRecoveryUntil: Array.from(this.movementRecoveryUntil.entries()),
			movementRecoveryReason: Array.from(this.movementRecoveryReason.entries()),
			movementFailureCounts: Array.from(this.movementFailureCounts.entries()),
			pendingDispatchAtMs: Array.from(this.pendingDispatchAtMs.entries())
		}
	}

	public deserialize(snapshot: SettlerBehaviourSnapshot): void {
		this.movementRecoveryUntil = new Map(snapshot.movementRecoveryUntil)
		this.movementRecoveryReason = new Map(snapshot.movementRecoveryReason)
		this.movementFailureCounts = new Map(snapshot.movementFailureCounts)
		this.pendingDispatchAtMs = new Map(snapshot.pendingDispatchAtMs)
	}

	public reset(): void {
		this.movementFailureCounts.clear()
		this.movementRecoveryUntil.clear()
		this.movementRecoveryReason.clear()
		this.pendingDispatchAtMs.clear()
	}
}
