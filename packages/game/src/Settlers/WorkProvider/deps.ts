import type { BuildingManager } from '../../Buildings'
import type { PopulationManager } from '../../Population'
import type { MovementManager } from '../../Movement'
import type { LootManager } from '../../Loot'
import type { StorageManager } from '../../Storage'
import type { ResourceNodesManager } from '../../ResourceNodes'
import type { ItemsManager } from '../../Items'
import type { MapManager } from '../../Map'
import type { MapObjectsManager } from '../../MapObjects'
import type { ReservationSystem } from '../../Reservation'
import type { RoadManager } from '../../Roads'
import type { SimulationManager } from '../../Simulation'
import type { NPCManager } from '../../NPC'
import type { WildlifeManager } from '../../Wildlife'

export interface WorkProviderDeps {
	buildings: BuildingManager
	population: PopulationManager
	movement: MovementManager
	loot: LootManager
	storage: StorageManager
	resourceNodes: ResourceNodesManager
	items: ItemsManager
	map: MapManager
	mapObjects: MapObjectsManager
	reservations: ReservationSystem
	roads: RoadManager
	simulation: SimulationManager
	npc: NPCManager
	wildlife: WildlifeManager
}
