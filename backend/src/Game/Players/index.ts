import { EventManager, Event, EventClient } from '../../events'
import { PlayerJoinData, PlayerMovedData, PlayerTransitionData } from '../DataTypes'
import { Receiver } from '../Receiver'

interface PlayerData extends PlayerJoinData {
	id: string
}

export class PlayersManager {
	private players = new Map<string, PlayerData>()

	constructor(private event: EventManager) {
		this.setupEventHandlers()
	}

	getPlayer(clientId: string): PlayerData | undefined {
		return this.players.get(clientId)
	}

	private setupEventHandlers() {
		this.event.onLeft((client) => {
			console.log('Player left:', client.id)
			const player = this.players.get(client.id)
			this.players.delete(client.id)
			if (player) {
				client.emit(Receiver.NoSenderGroup, Event.Players.SC.Left, {})
			}
		})

		this.event.on<PlayerJoinData>(Event.Players.CS.Join, (data, client) => {
			const playerId = client.id
			this.players.set(playerId, {
				id: playerId,
				...data,
			})

			client.setGroup(data.scene)

			const scenePlayers = Array.from(this.players.values())
				.filter(p => p.scene === data.scene && p.id !== client.id)
			client.emit(Receiver.Sender, Event.Players.SC.List, scenePlayers)

			client.emit(Receiver.NoSenderGroup, Event.Players.SC.Joined, data)
		})

		this.event.on<PlayerTransitionData>(Event.Players.CS.TransitionTo, (data, client) => {
			const playerId = client.id
			const player = this.players.get(playerId)

			if (player) {
				client.emit(Receiver.NoSenderGroup, Event.Players.SC.Left, {})

				player.scene = data.scene
				player.position = data.position

				client.setGroup(data.scene)

				const scenePlayers = Array.from(this.players.values())
					.filter(p => p.scene === data.scene && p.id !== client.id)
				client.emit(Receiver.Sender, Event.Players.SC.List, scenePlayers)

				client.emit(Receiver.NoSenderGroup, Event.Players.SC.Joined, data)
			}
		})

		this.event.on<PlayerMovedData>(Event.Players.CS.Moved, (data, client) => {
			const player = this.players.get(client.id)
			if (player) {
				player.position = data
				client.emit(Receiver.NoSenderGroup, Event.Players.CS.Moved, data)
			}
		})
	}
} 