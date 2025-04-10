import { EventManager, Event, EventClient } from '../Event'
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
				// Broadcast player left to all players in the same scene
				client.emit(Receiver.NoSenderGroup, Event.Player.Left, {})
			}
		})

		// Handle player join
		this.event.on<PlayerJoinData>(Event.Player.Join, (data, client) => {
			const playerId = client.id
			this.players.set(playerId, {
				id: playerId,
				...data,
			})

			// Set player's scene as their group
			client.setGroup(data.scene)

			// Send only players from the same scene
			const scenePlayers = Array.from(this.players.values())
				.filter(p => p.scene === data.scene && p.id !== client.id)
			client.emit(Receiver.Sender, Event.Players.List, scenePlayers)

			client.emit(Receiver.NoSenderGroup, Event.Player.Joined, data)
		})

		// Handle scene transition
		this.event.on<PlayerTransitionData>(Event.Player.TransitionTo, (data, client) => {
			const playerId = client.id
			const player = this.players.get(playerId)

			if (player) {
				// First, notify players in the current scene that this player is leaving
				client.emit(Receiver.NoSenderGroup, Event.Player.Left, {})

				// Update player data with new scene and position
				player.scene = data.scene
				player.position = data.position

				// Update player's group to new scene
				client.setGroup(data.scene)

				// Send the current players list for the new scene
				const scenePlayers = Array.from(this.players.values())
					.filter(p => p.scene === data.scene && p.id !== client.id)
				client.emit(Receiver.Sender, Event.Players.List, scenePlayers)

				// Notify players in the new scene that this player has joined
				client.emit(Receiver.NoSenderGroup, Event.Player.Joined, data)
			}
		})

		// Handle player movement
		this.event.on<PlayerMovedData>(Event.Player.Moved, (data, client) => {
			const player = this.players.get(client.id)
			if (player) {
				player.position = data
				client.emit(Receiver.NoSenderGroup, Event.Player.Moved, data)
			}
		})
	}
} 