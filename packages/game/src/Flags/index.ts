import { EventManager, EventClient } from '../events'
import { FlagsEvents } from './events'
import { Flag, SetFlagData, UnsetFlagData, FlagScope } from './types'
import { Receiver } from '../Receiver'

export class FlagsManager {
	private flags: Map<string, Flag> = new Map()

	constructor(private event: EventManager) {
		this.setupEventHandlers()
	}

	private setupEventHandlers() {
		// Handle server-to-server flag setting
		this.event.on<SetFlagData>(FlagsEvents.SS.SetFlag, (data, client) => {
			this.setFlag(client, data)
		})

		// Handle server-to-server flag unsetting
		this.event.on<UnsetFlagData>(FlagsEvents.SS.UnsetFlag, (data, client) => {
			this.unsetFlag(client, data)
		})
	}

	/**
	 * Get a unique key for a flag based on its scope and identifiers
	 */
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

	/**
	 * Get all flags matching the specified scope and identifiers
	 */
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

	/**
	 * Get a specific flag by name and scope
	 */
	public getFlag(name: string, scope: FlagScope, playerId?: string, mapId?: string): Flag | undefined {
		const key = this.getFlagKey(name, scope, playerId, mapId)
		return this.flags.get(key)
	}

	/**
	 * Set a flag with the specified name, value, scope, and identifiers
	 */
	public setFlag(client: EventClient, data: SetFlagData): void {
		const { name, value, scope, playerId, mapId } = data
		const key = this.getFlagKey(name, scope, playerId, mapId)
		
		const flag = {
			name,
			value,
			scope,
			playerId,
			mapId
		}
		
		this.flags.set(key, flag)
		
		// Emit FlagSet event
		client.emit(Receiver.All, FlagsEvents.SS.FlagSet, {
			flag,
			key
		})
	}

	/**
	 * Unset a flag with the specified name, scope, and identifiers
	 */
	public unsetFlag(client: EventClient, data: UnsetFlagData): void {
		const { name, scope, playerId, mapId } = data
		const key = this.getFlagKey(name, scope, playerId, mapId)
		
		// Get the flag before deleting it
		const flag = this.flags.get(key)
		
		// Delete the flag
		this.flags.delete(key)
		
		// Emit FlagUnset event if the flag existed
		if (flag) {
			client.emit(Receiver.All, FlagsEvents.SS.FlagUnset, {
				flag,
				key
			})
		}
	}

	/**
	 * Check if a flag exists
	 */
	public hasFlag(name: string, scope: FlagScope, playerId?: string, mapId?: string): boolean {
		const key = this.getFlagKey(name, scope, playerId, mapId)
		return this.flags.has(key)
	}

	/**
	 * Get the value of a flag
	 */
	public getFlagValue(name: string, scope: FlagScope, playerId?: string, mapId?: string): any {
		const flag = this.getFlag(name, scope, playerId, mapId)
		return flag ? flag.value : undefined
	}

	public loadFlags() {
		// TODO: Implement flag loading from content
	}
} 