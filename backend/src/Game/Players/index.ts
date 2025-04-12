import { EventManager, Event } from '../../events'
import { Player, PlayerJoinData, PlayerMoveData, PlayerTransitionData } from '../../types'
import { Receiver } from '../../Receiver'
import { InventoryManager } from '../Inventory'
import { LootManager } from '../Loot'
import { PICKUP_RANGE } from '../../consts'

interface DropItemData {
	itemId: string
	quantity?: number
}

interface PickupItemData {
	itemId: string
}

const INITIAL_POSITION = {
	scene: 'FarmScene',  // Initial scene
	position: {
		x: 100,  // Initial x position
		y: 300   // Initial y position
	}
}

export class PlayersManager {
	private players = new Map<string, Player>()

	constructor(
		private event: EventManager,
		private inventoryManager: InventoryManager,
		private lootManager: LootManager
	) {
		this.setupEventHandlers()
	}

	getPlayer(playerId: string): Player | undefined {
		return this.players.get(playerId)
	}

	private setupEventHandlers() {
		// Handle initial connection
		this.event.on(Event.Players.CS.Connect, (_, client) => {
			// Send initial scene and position data
			const playerInit = {
				...INITIAL_POSITION,
				playerId: client.id,
			}
			client.emit(Receiver.Sender, Event.Players.SC.Connected, playerInit)
		})

		// Handle client lifecycle
		this.event.onLeft((client) => {
			const player = this.players.get(client.id)
			if (player) {
				this.players.delete(client.id)
				client.emit(Receiver.NoSenderGroup, Event.Players.SC.Left, {})
			}
		})

		// Handle player join
		this.event.on<PlayerJoinData>(Event.Players.CS.Join, (data, client) => {
			const playerId = client.id
			client.setGroup(data.scene)

			this.players.set(playerId, {
				id: playerId,
				position: data.position,
				scene: data.scene,
				appearance: data.appearance
			})

			// Send existing players to new player
			const scenePlayers = Array.from(this.players.values())
				.filter(p => p.scene === data.scene && p.id !== client.id)
				.forEach(player => {
					client.emit(Receiver.Sender, Event.Players.SC.Joined, player)
				})
			
			client.emit(Receiver.NoSenderGroup, Event.Players.SC.Joined, data)
		})

		// Handle player movement
		this.event.on<PlayerMoveData>(Event.Players.CS.Move, (data, client) => {
			const player = this.players.get(client.id)
			if (player) {
				player.position = data
				client.emit(Receiver.NoSenderGroup, Event.Players.SC.Move, data)
			}
		})

		// Handle scene transition
		this.event.on<PlayerTransitionData>(Event.Players.CS.TransitionTo, (data, client) => {
			const playerId = client.id
			const player = this.players.get(playerId)

			if (player) {
				client.emit(Receiver.NoSenderGroup, Event.Players.SC.Left, {})

				player.scene = data.scene
				player.position = data.position

				// Send existing players in new scene to transitioning player
				const scenePlayers = Array.from(this.players.values())
					.filter(p => p.scene === data.scene && p.id !== client.id)
					.forEach(player => {
						client.emit(Receiver.Sender, Event.Players.SC.Joined, player)
					})

				client.emit(Receiver.NoSenderGroup, Event.Players.SC.Joined, data)
			}
		})

		// Handle item drop request
		this.event.on<DropItemData>(Event.Players.CS.DropItem, async (data, client) => {
			// Get player's current position
			const player = this.players.get(client.id)
			if (!player) return

			// Remove item from inventory
			const removedItem = this.inventoryManager.removeItem(client, data.itemId)
			if (!removedItem) return

			// Add item to scene's dropped items
			this.lootManager.dropItem(removedItem, player.position, client)
		})

		// Handle item pickup request
		this.event.on<PickupItemData>(Event.Players.CS.PickupItem, (data, client) => {
			const player = this.players.get(client.id)
			if (!player) return

			const item = this.lootManager.getItem(data.itemId)
			if (!item) return
			
			// Calculate distance between player and item
			const distance = Math.sqrt(
				Math.pow(player.position.x - item.position.x, 2) + 
				Math.pow(player.position.y - item.position.y, 2)
			)

			// Check if player is within pickup range
			if (distance > PICKUP_RANGE) {
				return // Player is too far to pick up the item
			}

			// Remove item from dropped items
			const removedItem = this.lootManager.pickItem(data.itemId, client)
			if (!removedItem) return

			// Add item to player's inventory
			const inventoryItem = {
				id: removedItem.id,
				itemType: removedItem.itemType
			}

			this.inventoryManager.addItem(client, inventoryItem)
		})
	}
} 