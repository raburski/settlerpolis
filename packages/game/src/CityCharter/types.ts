import type { ItemType } from '../Items/types'
import type { BuildingId, MapId, PlayerId } from '../ids'

export interface CityCharterTierRequirement {
	population?: number
	buildings?: Array<{ buildingId: BuildingId; count: number }>
	resources?: Array<{ itemType: ItemType; quantity: number }>
}

export interface CityCharterBuff {
	id: string
	description?: string
	value?: number
}

export interface CityCharterTier {
	id: string
	name: string
	level?: number
	description?: string
	requirements?: CityCharterTierRequirement
	unlockFlags?: string[]
	buffs?: CityCharterBuff[]
}

export interface CityCharterContent {
	defaultTierId: string
	tiers: CityCharterTier[]
}

export interface CityCharterRequirementStatus {
	allMet: boolean
	population?: { current: number; required: number; met: boolean }
	buildings?: Array<{ buildingId: BuildingId; current: number; required: number; met: boolean }>
	resources?: Array<{ itemType: ItemType; current: number; required: number; met: boolean }>
}

export interface CityCharterStateData {
	playerId: PlayerId
	mapId: MapId
	currentTier: CityCharterTier
	nextTier?: CityCharterTier
	claimedTierIds: string[]
	unlockedFlags: string[]
	currentRequirements: CityCharterRequirementStatus
	nextRequirements?: CityCharterRequirementStatus
	isEligibleForNext: boolean
	currentTierRequirementsMet: boolean
	buffsActive: boolean
}

export interface CityCharterClaimRequest {
	mapId?: MapId
}

export interface CityCharterStateRequest {
	mapId?: MapId
}

export interface CityCharterUnlockFlagsUpdated {
	playerId: PlayerId
	mapId: MapId
	unlockedFlags: string[]
}
