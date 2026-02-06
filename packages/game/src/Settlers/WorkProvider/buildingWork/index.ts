import type { BuildingWorkHandler } from './types'
import { FarmingWorkHandler } from './farming'
import { HarvestWorkHandler } from './harvest'
import { ProductionWorkHandler } from './production'
import { MarketWorkHandler } from './market'
import { FishingWorkHandler } from './fishing'
import { HuntingWorkHandler } from './hunting'

export const BuildingWorkHandlers: BuildingWorkHandler[] = [
	FarmingWorkHandler,
	HarvestWorkHandler,
	FishingWorkHandler,
	HuntingWorkHandler,
	ProductionWorkHandler,
	MarketWorkHandler
]

export * from './types'
