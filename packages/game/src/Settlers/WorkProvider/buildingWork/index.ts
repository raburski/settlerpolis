import type { BuildingWorkHandler } from './types'
import { FarmingWorkHandler } from './farming'
import { HarvestWorkHandler } from './harvest'
import { ProductionWorkHandler } from './production'

export const BuildingWorkHandlers: BuildingWorkHandler[] = [
	FarmingWorkHandler,
	HarvestWorkHandler,
	ProductionWorkHandler
]

export * from './types'
