import type { BuildingWorkHandler } from './types'
import { HarvestWorkHandler } from './harvest'
import { ProductionWorkHandler } from './production'

export const BuildingWorkHandlers: BuildingWorkHandler[] = [
	HarvestWorkHandler,
	ProductionWorkHandler
]

export * from './types'
