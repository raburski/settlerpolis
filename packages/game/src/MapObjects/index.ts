import { EventManager, Event, EventClient } from '../events'
import { MapObject, PlaceObjectData, RemoveObjectData, SpawnObjectData, DespawnObjectData } from './types'
import { Receiver } from '../Receiver'
import { v4 as uuidv4 } from 'uuid'
import { Item } from '../Items/types'
import { ItemsManager } from '../Items'
import { InventoryManager } from '../Inventory'
import { PLACE_RANGE } from '../consts'
import { EquipmentSlotType, PlayerJoinData, PlayerTransitionData } from '../Players/types'
import { Position } from '../types'
import { Logger } from '../Logs'

export class MapObjectsManager {
	// Map of mapName to MapObject[]
	private mapObjectsByMap = new Map<string, Map<string, MapObject>>()

	constructor(
		private event: EventManager,
		private itemsManager: ItemsManager,
		private inventoryManager: InventoryManager,
		private logger: Logger
	) {
		this.setupEventHandlers()
	}

	private setupEventHandlers() {
		// Handle removing objects from the world
		this.event.on<RemoveObjectData>(Event.MapObjects.CS.Remove, (data, client) => {
			this.removeObject(data, client)
		})

		// Handle player joining a map to send existing objects
		this.event.on<PlayerJoinData>(Event.Players.CS.Join, (data, client) => {
			this.sendMapObjectsToClient(client, data.mapId)
		})

		// Handle player transitioning to a new scene
		this.event.on<PlayerTransitionData>(Event.Players.CS.TransitionTo, (data, client) => {
			this.sendMapObjectsToClient(client, data.mapId)
		})
	}

	private removeObject(data: RemoveObjectData, client: EventClient) {
		const { objectId } = data
		const mapName = client.currentGroup

		// Find the object in the map
		const mapObject = this.getObjectById(objectId)
		if (!mapObject) {
			this.logger.debug('Object not found:', objectId)
			return
		}

		// Verify the object is on the current map
		if (mapObject.mapName !== mapName) {
			this.logger.debug('Object is not on the current map:', objectId)
			return
		}

		// Add the item to the player's inventory
		this.inventoryManager.addItem(client, mapObject.item)

		// Remove the object from the map
		this.removeObjectFromMap(mapObject.id, mapName)

		// Notify all clients in the same map about the removed object
		this.event.emit(Receiver.Group, Event.MapObjects.SC.Despawn, { objectId }, mapName)

		this.logger.debug('Object removed:', mapObject)
	}

	private checkCollision(mapName: string, position: Position, item?: Item, metadata?: Record<string, any>): boolean {
		const objects = this.mapObjectsByMap.get(mapName)
		if (!objects) return false

		// Convert tile-based sizes to pixel-based sizes (assuming 32x32 tiles)
		// TODO: Get actual tile size from MapManager
		const TILE_SIZE = 32

		// Get item size - check if it's a building with footprint in metadata
		let width: number
		let height: number
		let footprint: { width: number, height: number } | undefined = undefined
		
		if (metadata?.footprint) {
			// Building: use footprint from metadata (convert tiles to pixels)
			footprint = metadata.footprint
			width = metadata.footprint.width * TILE_SIZE
			height = metadata.footprint.height * TILE_SIZE
		} else {
			// Regular item: use placement size from metadata (convert tiles to pixels)
			const itemMetadata = item ? this.itemsManager.getItemMetadata(item.itemType) : null
			const placementWidth = itemMetadata?.placement?.size?.width || 1
			const placementHeight = itemMetadata?.placement?.size?.height || 1
			width = placementWidth * TILE_SIZE
			height = placementHeight * TILE_SIZE
		}

		// Check each object in the map
		for (const [_, object] of objects) {
			// Get object's size - check if it's a building with footprint in metadata
			let objectWidth: number
			let objectHeight: number

			if (object.metadata?.footprint) {
				// Building: use footprint from metadata (convert tiles to pixels)
				objectWidth = object.metadata.footprint.width * TILE_SIZE
				objectHeight = object.metadata.footprint.height * TILE_SIZE
			} else {
				// Regular item: use placement size from metadata (convert tiles to pixels)
				const objectMetadata = this.itemsManager.getItemMetadata(object.item.itemType)
				const placementWidth = objectMetadata?.placement?.size?.width || 1
				const placementHeight = objectMetadata?.placement?.size?.height || 1
				objectWidth = placementWidth * TILE_SIZE
				objectHeight = placementHeight * TILE_SIZE
			}

			// Check if the rectangles overlap
			if (this.doRectanglesOverlap(
				position, width, height,
				object.position, objectWidth, objectHeight
			)) {
				// If either object blocks placement, return true (collision)
				const itemMetadata = item ? this.itemsManager.getItemMetadata(item.itemType) : null
				const objectMetadata = this.itemsManager.getItemMetadata(object.item.itemType)
				const blocksPlacement = itemMetadata?.placement?.blocksPlacement || 
				                       objectMetadata?.placement?.blocksPlacement ||
				                       object.metadata?.buildingId // Buildings always block placement
				
				if (blocksPlacement) {
					return true
				}
			}
		}

		return false
	}

	private doRectanglesOverlap(
		pos1: Position, width1: number, height1: number,
		pos2: Position, width2: number, height2: number
	): boolean {
		// Check if one rectangle is to the left of the other
		if (pos1.x + width1 <= pos2.x || pos2.x + width2 <= pos1.x) {
			return false
		}

		// Check if one rectangle is above the other
		if (pos1.y + height1 <= pos2.y || pos2.y + height2 <= pos1.y) {
			return false
		}

		return true
	}

	private addObjectToMap(mapObject: MapObject) {
		const { mapName, id } = mapObject
		
		// Get or create the map's object collection
		let mapObjects = this.mapObjectsByMap.get(mapName)
		if (!mapObjects) {
			mapObjects = new Map<string, MapObject>()
			this.mapObjectsByMap.set(mapName, mapObjects)
		}
		
		// Add the object to the map
		mapObjects.set(id, mapObject)
	}

	private removeObjectFromMap(objectId: string, mapName: string) {
		const mapObjects = this.mapObjectsByMap.get(mapName)
		if (mapObjects) {
			mapObjects.delete(objectId)
			
			// Clean up empty map collections
			if (mapObjects.size === 0) {
				this.mapObjectsByMap.delete(mapName)
			}
		}
	}

	// Public method to remove an object without adding it to inventory
	// Useful for building cancellation where refunds are handled separately
	public removeObjectById(objectId: string, mapName: string): boolean {
		const mapObject = this.getObjectById(objectId)
		if (!mapObject) {
			return false
		}

		if (mapObject.mapName !== mapName) {
			return false
		}

		// Remove the object from the map
		this.removeObjectFromMap(objectId, mapName)

		// Notify all clients in the same map about the removed object
		this.event.emit(Receiver.Group, Event.MapObjects.SC.Despawn, { objectId }, mapName)

		return true
	}

	private getMapObjects(mapName: string): Map<string, MapObject> | undefined {
		return this.mapObjectsByMap.get(mapName)
	}

	public sendMapObjectsToClient(client: EventClient, map?: string) {
		const mapName = map || client.currentGroup
		const mapObjects = this.getMapObjects(mapName)
		
		if (mapObjects && mapObjects.size > 0) {
			// Send each object to the client
			for (const object of mapObjects.values()) {
				client.emit(Receiver.Sender, Event.MapObjects.SC.Spawn, { object })
			}
		}
	}

	// Get all map objects for a specific map
	public getAllObjectsForMap(mapName: string): MapObject[] {
		const mapObjects = this.getMapObjects(mapName)
		return mapObjects ? Array.from(mapObjects.values()) : []
	}

	// Get all map objects across all maps
	public getAllObjects(): MapObject[] {
		const allObjects: MapObject[] = []
		
		for (const mapObjects of this.mapObjectsByMap.values()) {
			allObjects.push(...Array.from(mapObjects.values()))
		}
		
		return allObjects
	}

	// Get a specific map object by ID
	public getObjectById(objectId: string): MapObject | undefined {
		// Search through all maps for the object
		for (const mapObjects of this.mapObjectsByMap.values()) {
			const object = mapObjects.get(objectId)
			if (object) return object
		}
		
		return undefined
	}

	public placeObject(playerId: string, data: PlaceObjectData, client: EventClient): MapObject | null {
		// Check for collisions (pass metadata so buildings can use footprint)
		const hasCollision = this.checkCollision(client.currentGroup, data.position, data.item, data.metadata)
		if (hasCollision) {
			this.logger.debug(`Collision detected at position:`, data.position)
			return null
		}

		// Create the object
		const object: MapObject = {
			id: uuidv4(),
			item: data.item,
			position: data.position,
			rotation: data.rotation || 0,
			playerId,
			mapName: client.currentGroup,
			metadata: data.metadata
		}

		// Add to map objects
		this.addObjectToMap(object)

		// Broadcast to all players
		client.emit(Receiver.Group, Event.MapObjects.SC.Spawn, { object })

		return object
	}
} 