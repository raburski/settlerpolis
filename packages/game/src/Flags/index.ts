import { EventManager, EventClient } from '../events'
import { FlagsEvents } from './events'
import { Flag, SetFlagData, UnsetFlagData, FlagScope } from './types'
import { Receiver } from '../Receiver'
import { Logger } from '../Logs'
import type { FlagsSnapshot } from '../state/types'
import { FlagsState } from './FlagsState'

export class FlagsManager {
	private readonly state = new FlagsState()

	constructor(
		private event: EventManager,
		private logger: Logger
	) {
		this.setupEventHandlers()
	}

	private setupEventHandlers() {
		this.event.on<SetFlagData>(FlagsEvents.SS.SetFlag, this.handleFlagsSSSetFlag)
		this.event.on<UnsetFlagData>(FlagsEvents.SS.UnsetFlag, this.handleFlagsSSUnsetFlag)
	}

	/* EVENT HANDLERS */
	private readonly handleFlagsSSSetFlag = (data: SetFlagData, client: EventClient): void => {
		this.setFlag(client, data)
	}

	private readonly handleFlagsSSUnsetFlag = (data: UnsetFlagData, client: EventClient): void => {
		this.unsetFlag(client, data)
	}

	/* METHODS */

	/**
	 * Get all flags matching the specified scope and identifiers
	 */
	public getFlags(scope: FlagScope, playerId?: string, mapId?: string): Flag[] {
		return this.state.getFlags(scope, playerId, mapId)
	}

	/**
	 * Get a specific flag by name and scope
	 */
	public getFlag(name: string, scope: FlagScope, playerId?: string, mapId?: string): Flag | undefined {
		return this.state.getFlag(name, scope, playerId, mapId)
	}

	/**
	 * Set a flag with the specified name, value, scope, and identifiers
	 */
	public setFlag(client: EventClient, data: SetFlagData): void {
		const { key, flag } = this.state.setFlag(data)
		
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
		const { key, flag } = this.state.unsetFlag(data)
		
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
		return this.state.hasFlag(name, scope, playerId, mapId)
	}

	/**
	 * Get the value of a flag
	 */
	public getFlagValue(name: string, scope: FlagScope, playerId?: string, mapId?: string): any {
		return this.state.getFlagValue(name, scope, playerId, mapId)
	}

	public loadFlags() {
		// TODO: Implement flag loading from content
	}

	serialize(): FlagsSnapshot {
		return this.state.serialize()
	}

	deserialize(state: FlagsSnapshot): void {
		this.state.deserialize(state)
	}

	reset(): void {
		this.state.reset()
	}
}
