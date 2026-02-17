import type { Player } from './types'
import type { PlayersSnapshot } from '../state/types'
import type { StartingItem } from '../types'

export class PlayersState {
	public players = new Map<string, Player>()
	public startingItems: StartingItem[] = []
	public connectedClients = new Set<string>()

	/* SERIALISATION */
	public serialize(): PlayersSnapshot {
		return {
			players: Array.from(this.players.values()).map(player => ({
				...player,
				position: { ...player.position },
				equipment: player.equipment ? { ...player.equipment } : player.equipment
			}))
		}
	}

	public deserialize(state: PlayersSnapshot): void {
		this.players.clear()
		for (const player of state.players) {
			this.players.set(player.playerId, {
				...player,
				position: { ...player.position },
				equipment: player.equipment ? { ...player.equipment } : player.equipment
			})
		}
	}

	public reset(): void {
		this.players.clear()
	}
}
