import { EventManager, Event, EventClient } from '../../events'
import { MapObject, PlaceObjectData, RemoveObjectData, SpawnObjectData, DespawnObjectData } from './types'
import { Receiver } from '../../Receiver'
import { v4 as uuidv4 } from 'uuid'
import { Item } from '../Items/types'
import { ItemsManager } from '../Items'
import { InventoryManager } from '../Inventory'
import { PLACE_RANGE } from '../../consts'
import { EquipmentSlotType, PlayerJoinData, PlayerTransitionData } from '../Players/types'
import { Position } from '../../types'

export class MapObjectsManager {
	// Map of mapName to MapObject[]
	private mapObjectsByMap = new Map<string, Map<string, MapObject>>()

	constructor(
		private event: EventManager,
		private itemsManager: ItemsManager,
		private inventoryManager: InventoryManager
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
			this.sendMapObjectsToClient(client, data.scene)
		})

		// Handle player transitioning to a new scene
		this.event.on<PlayerTransitionData>(Event.Players.CS.TransitionTo, (data, client) => {
			this.sendMapObjectsToClient(client, data.scene)
		})
	}

	private removeObject(data: RemoveObjectData, client: EventClient) {
		const { objectId } = data
		const mapName = client.currentGroup

		// Find the object in the map
		const mapObject = this.getObjectById(objectId)
		if (!mapObject) {
			console.log('Object not found:', objectId)
			return
		}

		// Verify the object is on the current map
		if (mapObject.mapName !== mapName) {
			console.log('Object is not on the current map:', objectId)
			return
		}

		// Add the item to the player's inventory
		this.inventoryManager.addItem(client, mapObject.item)

		// Remove the object from the map
		this.removeObjectFromMap(mapObject.id, mapName)

		// Notify all clients in the same map about the removed object
		this.event.emit(Receiver.Group, Event.MapObjects.SC.Despawn, { objectId }, mapName)

		console.log('Object removed:', mapObject)
	}

	private checkCollision(mapName: string, position: Position, item?: Item): boolean {
		const objects = this.mapObjectsByMap.get(mapName)
		if (!objects) return false

		// Get item metadata to check placement properties
		const itemMetadata = item ? this.itemsManager.getItemMetadata(item.itemType) : null
		const width = itemMetadata?.placement?.size?.width || 1
		const height = itemMetadata?.placement?.size?.height || 1

		// Check each object in the map
		for (const [_, object] of objects) {
			// Get object's metadata to check its placement properties
			const objectMetadata = this.itemsManager.getItemMetadata(object.item.itemType)
			const objectWidth = objectMetadata?.placement?.size?.width || 1
			const objectHeight = objectMetadata?.placement?.size?.height || 1

			// Check if the rectangles overlap
			if (this.doRectanglesOverlap(
				position, width, height,
				object.position, objectWidth, objectHeight
			)) {
				// If either object blocks placement, return true (collision)
				if (itemMetadata?.placement?.blocksPlacement || objectMetadata?.placement?.blocksPlacement) {
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

	public placeObject(playerId: string, data: PlaceObjectData, client: EventClient): boolean {
		// Check for collisions
		const hasCollision = this.checkCollision(client.currentGroup, data.position, data.item)
		if (hasCollision) {
			return false
		}

		// Create the object
		const object = {
			id: uuidv4(),
			item: data.item,
			position: data.position,
			rotation: data.rotation || 0,
			playerId,
			mapName: client.currentGroup,
			metadata: data.metadata,
			createdAt: Date.now()
		}

		// Add to map objects
		this.addObjectToMap(object)

		// Broadcast to all players
		client.emit(Receiver.Group, Event.MapObjects.SC.Spawn, { object })

		return true
	}
} 