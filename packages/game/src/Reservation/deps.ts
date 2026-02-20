import type { BuildingManager } from '../Buildings'
import type { LootManager } from '../Loot'
import type { MapManager } from '../Map'
import type { NPCManager } from '../NPC'
import type { PopulationManager } from '../Population'
import type { ResourceNodesManager } from '../ResourceNodes'
import type { SimulationManager } from '../Simulation'
import type { StorageManager } from '../Storage'

export interface ReservationSystemDeps {
	storage: StorageManager
	loot: LootManager
	resourceNodes: ResourceNodesManager
	population: PopulationManager
	buildings: BuildingManager
	map: MapManager
	npc: NPCManager
	simulation: SimulationManager
}
