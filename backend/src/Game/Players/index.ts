import { EventManager, Event, EventClient } from '../../events'
import { Player, PlayerJoinData, PlayerMoveData, PlayerAttackData, PlayerPlaceData, EquipmentSlotType, EquipItemData, UnequipItemData } from './types'
import { Receiver } from '../../Receiver'
import { InventoryManager } from '../Inventory'
import { LootManager } from '../Loot'
import { PICKUP_RANGE, PLACE_RANGE } from '../../consts'
import { ItemsManager } from '../Items'
import { MapObjectsManager } from '../MapObjects'
import { PlaceObjectData } from '../MapObjects/types'
import { Position } from '../../types'
import { v4 as uuidv4 } from 'uuid'

// Define missing types
interface PlayerTransitionData {
	scene: string
	position: Position
}

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

const INITIAL_EQUIPMENT: Record<EquipmentSlotType, null> = {
	[EquipmentSlotType.Hand]: null
}

export class PlayersManager {
	private players = new Map<string, Player>()

	constructor(
		private event: EventManager,
		private inventoryManager: InventoryManager,
		private lootManager: LootManager,
		private itemsManager: ItemsManager,
		private mapObjectsManager: MapObjectsManager
	) {
		this.setupEventHandlers()
	}

	getPlayer(playerId: string): Player | undefined {
		return this.players.get(playerId)
	}

	private setupEventHandlers() {
		// Handle initial connection
		this.event.on(Event.Players.CS.Connect, (_, client) => {
			console.log('[PLAYERS] on CONNECT', client.id)
			// Send initial scene and position data
			const playerInit = {
				...INITIAL_POSITION,
				playerId: client.id,
			}
			client.emit(Receiver.Sender, Event.Players.SC.Connected, playerInit)
		})

		// Handle client lifecycle
		this.event.onLeft((client) => {
			console.log('[PLAYERS] on LEFT', client.id)
			const player = this.players.get(client.id)
			if (player) {
				this.players.delete(client.id)
				client.emit(Receiver.NoSenderGroup, Event.Players.SC.Left, { playerId: client.id })
			}
		})
		
		this.event.onJoined((client) => {
			console.log('[PLAYERS] on JOINED', client.id)
		})

		// Handle player join
		this.event.on<PlayerJoinData>(Event.Players.CS.Join, (data, client) => {
			const playerId = client.id
			client.setGroup(data.scene)

			this.players.set(playerId, {
				playerId,
				position: data.position,
				scene: data.scene,
				appearance: data.appearance,
				equipment: { ...INITIAL_EQUIPMENT }
			})

			// Send existing players to new player
			this.sendPlayers(data.scene, client)
			
			client.emit(Receiver.NoSenderGroup, Event.Players.SC.Joined, { playerId, ...data })
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
				client.setGroup(data.scene)

				player.scene = data.scene
				player.position = data.position

				// Send existing players in new scene to transitioning player
				this.sendPlayers(data.scene, client)

				client.emit(Receiver.NoSenderGroup, Event.Players.SC.Joined, { playerId, ...data })
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

			// Check if player has an empty slot in their inventory
			if (!this.inventoryManager.hasEmptySlot(client.id)) {
				client.emit(Receiver.Sender, Event.Chat.SC.System, { 
					message: "Your inventory is full!" 
				})
				return
			}

			// Remove item from dropped items
			const removedItem = this.lootManager.pickItem(data.itemId, client)
			if (!removedItem) return

			// Add item to player's inventory
			const inventoryItem = {
				id: removedItem.id,
				itemType: removedItem.itemType
			}

			client.emit(Receiver.All, Event.Inventory.SS.Add, inventoryItem)
		})

		// Handle item equip request
		this.event.on<EquipItemData>(Event.Players.CS.Equip, (data, client) => {
			const player = this.players.get(client.id)
			if (!player) return

			// Initialize equipment if not exists
			if (!player.equipment) {
				player.equipment = { ...INITIAL_EQUIPMENT }
			}

			// Find the source slot of the item being equipped
			const sourceSlot = this.inventoryManager.getSlotForItem(client.id, data.itemId)
			if (!sourceSlot || !sourceSlot.item) {
				console.log('Source slot not found or item mismatch')
				return
			}

			// Remove item from inventory
			const item = this.inventoryManager.removeItem(client, data.itemId)
			if (!item) return

			// Get item metadata to check if it's equippable
			const itemMeta = this.itemsManager.getItemMetadata(item.itemType)
			if (!itemMeta) return

			// If there's already an item in the slot, move it to the source position
			if (player.equipment[data.slotType]) {
				const oldItem = player.equipment[data.slotType]
				if (oldItem) {
					// Add the old item to the source position
					this.inventoryManager.addItemToPosition(client, oldItem, sourceSlot.position)
				}
			}

			// Equip the new item
			player.equipment[data.slotType] = item

			// Notify client about the equip with full item data
			client.emit(Receiver.Group, Event.Players.SC.Equip, {
				slotType: data.slotType,
				item: item
			})
		})

		// Handle item unequip request
		this.event.on<UnequipItemData>(Event.Players.CS.Unequip, (data, client) => {
			const player = this.players.get(client.id)
			if (!player || !player.equipment) return

			// Get the equipped item
			const equippedItem = player.equipment[data.slotType]
			if (!equippedItem) return

			// If a target position is provided, try to add the item to that slot
			if (data.targetPosition) {
				// Check if the target slot is empty
				const targetSlot = this.inventoryManager.getSlotAtPosition(client.id, data.targetPosition)
				if (targetSlot && !targetSlot.item) {
					// Add the item to the target slot
					this.inventoryManager.addItemToPosition(client, equippedItem, data.targetPosition)
					
					// Clear the equipment slot
					player.equipment[data.slotType] = null
					
					// Notify client about the unequip
					client.emit(Receiver.Group, Event.Players.SC.Unequip, {
						slotType: data.slotType,
						item: equippedItem
					})
					return
				}
			}
			
			// If no target position or target slot is occupied, try to find an empty slot
			const emptySlot = this.inventoryManager.findFirstEmptySlot(client.id)
			if (emptySlot) {
				// Found an empty slot, add the item there
				this.inventoryManager.addItemToPosition(client, equippedItem, emptySlot)
				
				// Clear the equipment slot
				player.equipment[data.slotType] = null
				
				// Notify client about the unequip
				client.emit(Receiver.Group, Event.Players.SC.Unequip, {
					slotType: data.slotType,
					item: equippedItem
				})
			} else {
				// Inventory is full, notify the client
				client.emit(Receiver.Sender, Event.Chat.SC.System, { 
					message: "Your inventory is full! Cannot unequip item." 
				})
			}
		})

		// Handle place request
		this.event.on<PlaceObjectData>(Event.Players.CS.Place, this.handlePlace.bind(this))
	}

	private handlePlace = (data: PlaceObjectData, client: EventClient) => {
		const player = this.players.get(client.id)
		if (!player) return

		// Check if player has equipment
		if (!player.equipment) {
			console.log('Player has no equipment:', player.playerId)
			return
		}

		// Check if player has an item in their hand
		const item = player.equipment[EquipmentSlotType.Hand]
		if (!item) {
			console.log('No item in hand:', player.playerId)
			return
		}

		// Create place data with the item
		const placeData: PlaceObjectData = {
			position: data.position,
			rotation: data.rotation,
			metadata: data.metadata,
			item
		}

		// Try to place the object
		const success = this.mapObjectsManager.placeObject(player.playerId, placeData, client)

		if (success) {
			// Remove item from player's equipment
			player.equipment[EquipmentSlotType.Hand] = null

			// Notify client about the unequip
			client.emit(Receiver.Sender, Event.Players.SC.Unequip, {
				slotType: EquipmentSlotType.Hand,
				item
			})
		}
	}

	/**
	 * Sends player data and equipment information to a client for all players in a scene
	 * @param scene The scene to get players from
	 * @param client The client to send data to
	 */
	private sendPlayers(scene: string, client: EventClient) {
		const scenePlayers = Array.from(this.players.values())
			.filter(p => p.scene === scene && p.playerId !== client.id)
			.forEach(player => {
				client.emit(Receiver.Sender, Event.Players.SC.Joined, player)
				
				// Send equipment data for each player if they have items equipped
				if (player.equipment) {
					Object.entries(player.equipment).forEach(([slotType, item]) => {
						if (item) {
							client.emit(Receiver.Sender, Event.Players.SC.Equip, {
								sourcePlayerId: player.playerId,
								slotType: slotType as EquipmentSlotType,
								item: item
							})
						}
					})
				}
			})
	}
} 