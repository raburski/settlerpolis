import { Flag, FlagScope, SetFlagData, UnsetFlagData } from './types'
import type { FlagsSnapshot } from '../state/types'

export class FlagsState {
	public flags: Map<string, Flag> = new Map()

	private getFlagKey(name: string, scope: FlagScope, playerId?: string, mapId?: string): string {
		switch (scope) {
			case FlagScope.Player:
				return `player:${playerId}:${name}`
			case FlagScope.Map:
				return `map:${mapId}:${name}`
			case FlagScope.Global:
				return `global:${name}`
			default:
				return `${scope}:${name}`
		}
	}

	/* SETTERS / GETTERS */
	public getFlags(scope: FlagScope, playerId?: string, mapId?: string): Flag[] {
		const result: Flag[] = []

		for (const flag of this.flags.values()) {
			if (flag.scope === scope) {
				if (scope === FlagScope.Player && flag.playerId === playerId) {
					result.push(flag)
				} else if (scope === FlagScope.Map && flag.mapId === mapId) {
					result.push(flag)
				} else if (scope === FlagScope.Global) {
					result.push(flag)
				}
			}
		}

		return result
	}

	public getFlag(name: string, scope: FlagScope, playerId?: string, mapId?: string): Flag | undefined {
		const key = this.getFlagKey(name, scope, playerId, mapId)
		return this.flags.get(key)
	}

	public setFlag(data: SetFlagData): { key: string, flag: Flag } {
		const { name, value, scope, playerId, mapId } = data
		const key = this.getFlagKey(name, scope, playerId, mapId)
		const flag: Flag = {
			name,
			value,
			scope,
			playerId,
			mapId
		}
		this.flags.set(key, flag)
		return { key, flag }
	}

	public unsetFlag(data: UnsetFlagData): { key: string, flag?: Flag } {
		const { name, scope, playerId, mapId } = data
		const key = this.getFlagKey(name, scope, playerId, mapId)
		const flag = this.flags.get(key)
		this.flags.delete(key)
		return { key, flag }
	}

	public hasFlag(name: string, scope: FlagScope, playerId?: string, mapId?: string): boolean {
		const key = this.getFlagKey(name, scope, playerId, mapId)
		return this.flags.has(key)
	}

	public getFlagValue(name: string, scope: FlagScope, playerId?: string, mapId?: string): any {
		const flag = this.getFlag(name, scope, playerId, mapId)
		return flag ? flag.value : undefined
	}

	/* SERIALISATION */
	public serialize(): FlagsSnapshot {
		return {
			flags: Array.from(this.flags.values()).map(flag => ({ ...flag }))
		}
	}

	public deserialize(state: FlagsSnapshot): void {
		this.flags.clear()
		for (const flag of state.flags) {
			const key = this.getFlagKey(flag.name, flag.scope, flag.playerId, flag.mapId)
			this.flags.set(key, { ...flag })
		}
	}

	public reset(): void {
		this.flags.clear()
	}
}
