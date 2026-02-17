import { EventManager, Event, EventClient } from '../events'
import { Player, PlayerJoinData, PlayerMoveData, EquipmentSlotType, EquipItemData, UnequipItemData, EquipmentSlot } from './types'
import { Receiver } from '../Receiver'
import type { InventoryManager } from '../Inventory'
import type { LootManager } from '../Loot'
import { PICKUP_RANGE, PLACE_RANGE } from '../consts'
import type { ItemsManager } from '../Items'
import type { MapObjectsManager } from '../MapObjects'
import { PlaceObjectData } from '../MapObjects/types'
import { Position, StartingItem } from '../types'
import { Item } from '../Items/types'
import { v4 as uuidv4 } from 'uuid'
import type { MapManager } from '../Map'
import { Logger } from '../Logs'
import { BaseManager } from '../Managers'
import type { PlayersSnapshot } from '../state/types'

// Define missing types
interface PlayerTransitionData {
	mapId: string
	position: Position
}

interface DropItemData {
	itemId: string
	quantity?: number
}

interface PickupItemData {
	itemId: string
}

const INITIAL_EQUIPMENT: Record<EquipmentSlotType, null> = {
	[EquipmentSlot.Hand]: null
}

export interface PlayersDeps {
	event: EventManager
	inventory: InventoryManager
	loot: LootManager
	items: ItemsManager
	mapObjects: MapObjectsManager
	map: MapManager
}

export class PlayersManager extends BaseManager<PlayersDeps> {
	private players = new Map<string, Player>()
	private startingItems: StartingItem[] = []
	private connectedClients = new Set<string>()

	constructor(
		managers: PlayersDeps,
		startingItems: StartingItem[],
		private logger: Logger
	) {
		super(managers)
		this.startingItems = startingItems || []
		this.setupEventHandlers()
	}

	getPlayer(playerId: string): Player | undefined {
		return this.players.get(playerId)
	}

	// Spawn starting items at player start location
	private spawnStartingItems(playerPosition: Position, mapId: string, client: EventClient): void {
		if (this.startingItems.length === 0) {
			return // No starting items configured
		}

		const TILE_SIZE = 32

		this.startingItems.forEach((startingItem) => {
			// Check if item type exists
			if (!this.managers.items.itemExists(startingItem.itemType)) {
				this.logger.warn(`Starting item type ${startingItem.itemType} does not exist, skipping spawn`)
				return
			}

			// Create item
			const item: Item = {
				id: uuidv4(),
				itemType: startingItem.itemType
			}

			// Calculate position with offset
			let offsetX = 0
			let offsetY = 0

			if (startingItem.offset) {
				// Check if offset is tile-based or pixel-based
				const isTileBased = 'tileBased' in startingItem.offset 
					? startingItem.offset.tileBased !== false // Default to true if tileBased property exists
					: true // Default to tile-based if no tileBased property

				offsetX = startingItem.offset.x || 0
				offsetY = startingItem.offset.y || 0

				// Convert tiles to pixels if tile-based
				if (isTileBased) {
					offsetX *= TILE_SIZE
					offsetY *= TILE_SIZE
				}
			}

			const itemPosition: Position = {
				x: playerPosition.x + offsetX,
				y: playerPosition.y + offsetY
			}

			// Drop item on the map using LootManager
			const quantity = startingItem.quantity ?? 1
			this.managers.loot.dropItem(item, itemPosition, client, quantity)
			
			this.logger.debug(`Spawned starting item ${startingItem.itemType} at position (${itemPosition.x}, ${itemPosition.y}) for player ${client.id}`)
		})
	}

	private setupEventHandlers() {
		// Handle initial connection
		this.managers.event.on(Event.Players.CS.Connect, (_, client) => {
			if (this.connectedClients.has(client.id)) {
				return
			}
			this.connectedClients.add(client.id)
			this.logger.debug('[PLAYERS] on CONNECT', client.id)
			
			// Only send player ID initially
			const playerInit = {
				playerId: client.id,
			}
			client.emit(Receiver.Sender, Event.Players.SC.Connected, playerInit)
			
			// Let the map manager handle everything about map loading and initial position
			this.managers.map.loadPlayerMap(client)
		})

		// Handle client lifecycle
		this.managers.event.onLeft((client) => {
			this.logger.debug('[PLAYERS] on LEFT', client.id)
			this.connectedClients.delete(client.id)
			const player = this.players.get(client.id)
			if (player) {
				this.players.delete(client.id)
				client.emit(Receiver.NoSenderGroup, Event.Players.SC.Left, { playerId: client.id })
			}
		})
		
		this.managers.event.onJoined((client) => {
			this.logger.debug('[PLAYERS] on JOINED', client.id)
		})

		// Handle player join
		this.managers.event.on<PlayerJoinData>(Event.Players.CS.Join, (data, client) => {
			const playerId = client.id
			const existingPlayer = this.players.get(playerId)
			
			// Use mapId from the data, or get default from MapManager
			const mapId = data.mapId || this.managers.map.getDefaultMapId()
			client.setGroup(mapId)

			this.players.set(playerId, {
				playerId,
				position: data.position,
				mapId,  // Use mapId instead of scene
				appearance: data.appearance ?? existingPlayer?.appearance,
				equipment: existingPlayer?.equipment ? { ...existingPlayer.equipment } : { ...INITIAL_EQUIPMENT }
			})

			// Send existing players to new player
			this.sendPlayers(mapId, client)
			
			client.emit(Receiver.NoSenderGroup, Event.Players.SC.Joined, { 
				playerId, 
				position: data.position,
				mapId,
				appearance: data.appearance 
			})

			// Spawn starting items at player start location unless explicitly skipped
			if (!data.skipStartingItems) {
				this.spawnStartingItems(data.position, mapId, client)
			}
		})

		// Handle player movement
		this.managers.event.on<PlayerMoveData>(Event.Players.CS.Move, (data, client) => {
			const player = this.players.get(client.id)
			if (player) {
				player.position = data
				client.emit(Receiver.NoSenderGroup, Event.Players.SC.Move, data)
			}
		})

		// Handle scene transition
		this.managers.event.on<PlayerTransitionData>(Event.Players.CS.TransitionTo, (data, client) => {
			const playerId = client.id
			const player = this.players.get(playerId)

			if (player) {
				client.emit(Receiver.NoSenderGroup, Event.Players.SC.Left, {})
				client.setGroup(data.mapId)

				player.mapId = data.mapId
				player.position = data.position

				// Use map manager to load the new map with the provided position
				this.managers.map.loadPlayerMap(client, data.mapId, data.position)

				// Send existing players in new map to transitioning player
				this.sendPlayers(data.mapId, client)

				client.emit(Receiver.NoSenderGroup, Event.Players.SC.Joined, { playerId, ...data })
			}
		})

		// Handle item drop request
		this.managers.event.on<DropItemData>(Event.Players.CS.DropItem, async (data, client) => {
			// Get player's current position
			const player = this.players.get(client.id)
			if (!player) return

			// Remove item from inventory
			const removedItem = this.managers.inventory.removeItem(client, data.itemId)
			if (!removedItem) return

			// Add item to scene's dropped items
			this.managers.loot.dropItem(removedItem, player.position, client)
		})

		// Handle item pickup request
		this.managers.event.on<PickupItemData>(Event.Players.CS.PickupItem, (data, client) => {
			const player = this.players.get(client.id)
			if (!player) return

			const item = this.managers.loot.getItem(data.itemId)
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
			if (!this.managers.inventory.hasEmptySlot(client.id)) {
				client.emit(Receiver.Sender, Event.Chat.SC.System, { 
					message: "Your inventory is full!" 
				})
				return
			}

			// Remove item from dropped items
			const removedItem = this.managers.loot.pickItem(data.itemId, client)
			if (!removedItem) return

			// Add item to player's inventory
			const inventoryItem = {
				id: removedItem.id,
				itemType: removedItem.itemType
			}

			client.emit(Receiver.All, Event.Inventory.SS.Add, inventoryItem)
		})

		// Handle item equip request
		this.managers.event.on<EquipItemData>(Event.Players.CS.Equip, (data, client) => {
			const player = this.players.get(client.id)
			if (!player) return

			// Initialize equipment if not exists
			if (!player.equipment) {
				player.equipment = { ...INITIAL_EQUIPMENT }
			}

			// Find the source slot of the item being equipped
			const sourceSlot = this.managers.inventory.getSlotForItem(client.id, data.itemId)
			if (!sourceSlot || !sourceSlot.item) {
				this.logger.debug('Source slot not found or item mismatch')
				return
			}

			// Remove item from inventory
			const item = this.managers.inventory.removeItem(client, data.itemId)
			if (!item) return

			// Get item metadata to check if it's equippable
			const itemMeta = this.managers.items.getItemMetadata(item.itemType)
			if (!itemMeta) return

			// If there's already an item in the slot, move it to the source position
			if (player.equipment[data.slotType]) {
				const oldItem = player.equipment[data.slotType]
				if (oldItem) {
					// Add the old item to the source position
					this.managers.inventory.addItemToPosition(client, oldItem, sourceSlot.position)
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
		this.managers.event.on<UnequipItemData>(Event.Players.CS.Unequip, (data, client) => {
			const player = this.players.get(client.id)
			if (!player || !player.equipment) return

			// Get the equipped item
			const equippedItem = player.equipment[data.slotType]
			if (!equippedItem) return

			// If a target position is provided, try to add the item to that slot
			if (data.targetPosition) {
				// Check if the target slot is empty
				const targetSlot = this.managers.inventory.getSlotAtPosition(client.id, data.targetPosition)
				if (targetSlot && !targetSlot.item) {
					// Add the item to the target slot
					this.managers.inventory.addItemToPosition(client, equippedItem, data.targetPosition)
					
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
			const emptySlot = this.managers.inventory.findFirstEmptySlot(client.id)
			if (emptySlot) {
				// Found an empty slot, add the item there
				this.managers.inventory.addItemToPosition(client, equippedItem, emptySlot)
				
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
		this.managers.event.on<PlaceObjectData>(Event.Players.CS.Place, this.handlePlace.bind(this))
	}

	private handlePlace = (data: PlaceObjectData, client: EventClient) => {
		const player = this.players.get(client.id)
		if (!player) return

		// Check if player has equipment
		if (!player.equipment) {
			this.logger.debug('Player has no equipment:', player.playerId)
			return
		}

		// Check if player has an item in their hand
		const item = player.equipment[EquipmentSlot.Hand]
		if (!item) {
			this.logger.debug('No item in hand:', player.playerId)
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
		const placedObject = this.managers.mapObjects.placeObject(player.playerId, placeData, client)

		if (placedObject) {
			// Remove item from player's equipment
			player.equipment[EquipmentSlot.Hand] = null

			// Notify client about the unequip
			client.emit(Receiver.Sender, Event.Players.SC.Unequip, {
				slotType: EquipmentSlot.Hand,
				item
			})
		}
	}

	/**
	 * Sends player data and equipment information to a client for all players in a scene
	 * @param mapId The map ID to get players from
	 * @param client The client to send data to
	 */
	private sendPlayers(mapId: string, client: EventClient) {
		const mapPlayers = Array.from(this.players.values())
			.filter(p => p.mapId === mapId && p.playerId !== client.id)
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

	serialize(): PlayersSnapshot {
		return {
			players: Array.from(this.players.values()).map(player => ({
				...player,
				position: { ...player.position },
				equipment: player.equipment ? { ...player.equipment } : player.equipment
			}))
		}
	}

	deserialize(state: PlayersSnapshot): void {
		this.players.clear()
		for (const player of state.players) {
			this.players.set(player.playerId, {
				...player,
				position: { ...player.position },
				equipment: player.equipment ? { ...player.equipment } : player.equipment
			})
		}
	}

	reset(): void {
		this.players.clear()
	}
} 
