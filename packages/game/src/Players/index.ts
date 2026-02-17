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
		this.managers.event.on(Event.Players.CS.Connect, this.handlePlayersCSConnect)
		this.managers.event.onLeft(this.handleLifecycleLeft)
		this.managers.event.onJoined(this.handleLifecycleJoined)
		this.managers.event.on<PlayerJoinData>(Event.Players.CS.Join, this.handlePlayersCSJoin)
		this.managers.event.on<PlayerMoveData>(Event.Players.CS.Move, this.handlePlayersCSMove)
		this.managers.event.on<PlayerTransitionData>(Event.Players.CS.TransitionTo, this.handlePlayersCSTransitionTo)
		this.managers.event.on<DropItemData>(Event.Players.CS.DropItem, this.handlePlayersCSDropItem)
		this.managers.event.on<PickupItemData>(Event.Players.CS.PickupItem, this.handlePlayersCSPickupItem)
		this.managers.event.on<EquipItemData>(Event.Players.CS.Equip, this.handlePlayersCSEquip)
		this.managers.event.on<UnequipItemData>(Event.Players.CS.Unequip, this.handlePlayersCSUnequip)
		this.managers.event.on<PlaceObjectData>(Event.Players.CS.Place, this.handlePlayersCSPlace)
	}

	/* EVENT HANDLERS */
	private readonly handlePlayersCSConnect = (_data: unknown, client: EventClient): void => {
		if (this.connectedClients.has(client.id)) {
			return
		}
		this.connectedClients.add(client.id)
		this.logger.debug('[PLAYERS] on CONNECT', client.id)
		client.emit(Receiver.Sender, Event.Players.SC.Connected, { playerId: client.id })
		this.managers.map.loadPlayerMap(client)
	}

	private readonly handleLifecycleLeft = (client: EventClient): void => {
		this.logger.debug('[PLAYERS] on LEFT', client.id)
		this.connectedClients.delete(client.id)
		const player = this.players.get(client.id)
		if (player) {
			this.players.delete(client.id)
			client.emit(Receiver.NoSenderGroup, Event.Players.SC.Left, { playerId: client.id })
		}
	}

	private readonly handleLifecycleJoined = (client: EventClient): void => {
		this.logger.debug('[PLAYERS] on JOINED', client.id)
	}

	private readonly handlePlayersCSJoin = (data: PlayerJoinData, client: EventClient): void => {
		const playerId = client.id
		const existingPlayer = this.players.get(playerId)
		const mapId = data.mapId || this.managers.map.getDefaultMapId()
		client.setGroup(mapId)

		this.players.set(playerId, {
			playerId,
			position: data.position,
			mapId,
			appearance: data.appearance ?? existingPlayer?.appearance,
			equipment: existingPlayer?.equipment ? { ...existingPlayer.equipment } : { ...INITIAL_EQUIPMENT }
		})

		this.sendPlayers(mapId, client)
		client.emit(Receiver.NoSenderGroup, Event.Players.SC.Joined, {
			playerId,
			position: data.position,
			mapId,
			appearance: data.appearance
		})

		if (!data.skipStartingItems) {
			this.spawnStartingItems(data.position, mapId, client)
		}
	}

	private readonly handlePlayersCSMove = (data: PlayerMoveData, client: EventClient): void => {
		const player = this.players.get(client.id)
		if (player) {
			player.position = data
			client.emit(Receiver.NoSenderGroup, Event.Players.SC.Move, data)
		}
	}

	private readonly handlePlayersCSTransitionTo = (data: PlayerTransitionData, client: EventClient): void => {
		const playerId = client.id
		const player = this.players.get(playerId)

		if (player) {
			client.emit(Receiver.NoSenderGroup, Event.Players.SC.Left, {})
			client.setGroup(data.mapId)
			player.mapId = data.mapId
			player.position = data.position
			this.managers.map.loadPlayerMap(client, data.mapId, data.position)
			this.sendPlayers(data.mapId, client)
			client.emit(Receiver.NoSenderGroup, Event.Players.SC.Joined, { playerId, ...data })
		}
	}

	private readonly handlePlayersCSDropItem = async (data: DropItemData, client: EventClient): Promise<void> => {
		const player = this.players.get(client.id)
		if (!player) return

		const removedItem = this.managers.inventory.removeItem(client, data.itemId)
		if (!removedItem) return

		this.managers.loot.dropItem(removedItem, player.position, client)
	}

	private readonly handlePlayersCSPickupItem = (data: PickupItemData, client: EventClient): void => {
		const player = this.players.get(client.id)
		if (!player) return

		const item = this.managers.loot.getItem(data.itemId)
		if (!item) return

		const distance = Math.sqrt(
			Math.pow(player.position.x - item.position.x, 2) +
			Math.pow(player.position.y - item.position.y, 2)
		)

		if (distance > PICKUP_RANGE) {
			return
		}

		if (!this.managers.inventory.hasEmptySlot(client.id)) {
			client.emit(Receiver.Sender, Event.Chat.SC.System, {
				message: "Your inventory is full!"
			})
			return
		}

		const removedItem = this.managers.loot.pickItem(data.itemId, client)
		if (!removedItem) return

		client.emit(Receiver.All, Event.Inventory.SS.Add, {
			id: removedItem.id,
			itemType: removedItem.itemType
		})
	}

	private readonly handlePlayersCSEquip = (data: EquipItemData, client: EventClient): void => {
		const player = this.players.get(client.id)
		if (!player) return

		if (!player.equipment) {
			player.equipment = { ...INITIAL_EQUIPMENT }
		}

		const sourceSlot = this.managers.inventory.getSlotForItem(client.id, data.itemId)
		if (!sourceSlot || !sourceSlot.item) {
			this.logger.debug('Source slot not found or item mismatch')
			return
		}

		const item = this.managers.inventory.removeItem(client, data.itemId)
		if (!item) return

		const itemMeta = this.managers.items.getItemMetadata(item.itemType)
		if (!itemMeta) return

		if (player.equipment[data.slotType]) {
			const oldItem = player.equipment[data.slotType]
			if (oldItem) {
				this.managers.inventory.addItemToPosition(client, oldItem, sourceSlot.position)
			}
		}

		player.equipment[data.slotType] = item
		client.emit(Receiver.Group, Event.Players.SC.Equip, {
			slotType: data.slotType,
			item
		})
	}

	private readonly handlePlayersCSUnequip = (data: UnequipItemData, client: EventClient): void => {
		const player = this.players.get(client.id)
		if (!player || !player.equipment) return

		const equippedItem = player.equipment[data.slotType]
		if (!equippedItem) return

		if (data.targetPosition) {
			const targetSlot = this.managers.inventory.getSlotAtPosition(client.id, data.targetPosition)
			if (targetSlot && !targetSlot.item) {
				this.managers.inventory.addItemToPosition(client, equippedItem, data.targetPosition)
				player.equipment[data.slotType] = null
				client.emit(Receiver.Group, Event.Players.SC.Unequip, {
					slotType: data.slotType,
					item: equippedItem
				})
				return
			}
		}

		const emptySlot = this.managers.inventory.findFirstEmptySlot(client.id)
		if (emptySlot) {
			this.managers.inventory.addItemToPosition(client, equippedItem, emptySlot)
			player.equipment[data.slotType] = null
			client.emit(Receiver.Group, Event.Players.SC.Unequip, {
				slotType: data.slotType,
				item: equippedItem
			})
		} else {
			client.emit(Receiver.Sender, Event.Chat.SC.System, {
				message: "Your inventory is full! Cannot unequip item."
			})
		}
	}

	private readonly handlePlayersCSPlace = (data: PlaceObjectData, client: EventClient): void => {
		this.handlePlace(data, client)
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
	/* METHODS */
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
