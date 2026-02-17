import type { NeedInterruptSnapshot, NeedsSnapshot, NeedsSystemSnapshot } from '../../state/types'

export class NeedsManagerState {
	public needsBySettler: NeedsSnapshot['needsBySettler'] = []
	public lastLevels: NeedsSnapshot['lastLevels'] = []
	public interrupts: NeedInterruptSnapshot[] = []

	public capture(systemSnapshot: NeedsSystemSnapshot, interrupts: NeedInterruptSnapshot[]): void {
		this.needsBySettler = systemSnapshot.needsBySettler.map(([settlerId, state]) => ([
			settlerId,
			{
				hunger: { ...state.hunger },
				fatigue: { ...state.fatigue }
			}
		]))
		this.lastLevels = systemSnapshot.lastLevels.map(([settlerId, levels]) => ([
			settlerId,
			{ ...levels }
		]))
		this.interrupts = interrupts.map(interrupt => ({
			...interrupt,
			pendingNeed: interrupt.pendingNeed ? { ...interrupt.pendingNeed } : interrupt.pendingNeed,
			pausedContext: interrupt.pausedContext ? { ...interrupt.pausedContext } : interrupt.pausedContext,
			cooldowns: { ...interrupt.cooldowns }
		}))
	}

	public serialize(): NeedsSnapshot {
		return {
			needsBySettler: this.needsBySettler.map(([settlerId, state]) => ([
				settlerId,
				{
					hunger: { ...state.hunger },
					fatigue: { ...state.fatigue }
				}
			])),
			lastLevels: this.lastLevels.map(([settlerId, levels]) => ([
				settlerId,
				{ ...levels }
			])),
			interrupts: this.interrupts.map(interrupt => ({
				...interrupt,
				pendingNeed: interrupt.pendingNeed ? { ...interrupt.pendingNeed } : interrupt.pendingNeed,
				pausedContext: interrupt.pausedContext ? { ...interrupt.pausedContext } : interrupt.pausedContext,
				cooldowns: { ...interrupt.cooldowns }
			}))
		}
	}

	public deserialize(state: NeedsSnapshot): void {
		this.needsBySettler = state.needsBySettler.map(([settlerId, needs]) => ([
			settlerId,
			{
				hunger: { ...needs.hunger },
				fatigue: { ...needs.fatigue }
			}
		]))
		this.lastLevels = state.lastLevels.map(([settlerId, levels]) => ([
			settlerId,
			{ ...levels }
		]))
		this.interrupts = state.interrupts.map(interrupt => ({
			...interrupt,
			pendingNeed: interrupt.pendingNeed ? { ...interrupt.pendingNeed } : interrupt.pendingNeed,
			pausedContext: interrupt.pausedContext ? { ...interrupt.pausedContext } : interrupt.pausedContext,
			cooldowns: { ...interrupt.cooldowns }
		}))
	}

	public reset(): void {
		this.needsBySettler = []
		this.lastLevels = []
		this.interrupts = []
	}
}
