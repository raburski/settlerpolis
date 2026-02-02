import type { BuildingWorkHandler } from './types'
import { FarmingWorkHandler } from './farming'
import { HarvestWorkHandler } from './harvest'
import { ProductionWorkHandler } from './production'
import { MarketWorkHandler } from './market'

export const BuildingWorkHandlers: BuildingWorkHandler[] = [
	FarmingWorkHandler,
	HarvestWorkHandler,
	ProductionWorkHandler,
	MarketWorkHandler
]

export * from './types'
