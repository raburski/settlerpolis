import type { BuildingInstance, BuildingDefinition, SocialVenueType } from '../../../Buildings/types'
import { ConstructionStage } from '../../../Buildings/types'
import { calculateDistance } from '../../../utils'
import type { DayPhase } from '../../../Time/types'
import type { WorkProvider, WorkStep } from '../types'
import { WorkProviderType, WorkStepType, WorkWaitReason } from '../types'
import type { WorkProviderDeps } from '..'

const SOCIAL_PROVIDER_ID = 'social'
const SOCIAL_MAX_TRAVEL_TILES = 32
const SOCIAL_VENUE_FULL_RETRY_BLOCK_MS = 6_000

interface SocialVenueCandidate {
	building: BuildingInstance
	definition: BuildingDefinition
	venueType: SocialVenueType
	targetPosition: { x: number, y: number }
	distanceTiles: number
}

export class SocialProvider implements WorkProvider {
	public readonly id = SOCIAL_PROVIDER_ID
	public readonly type = WorkProviderType.Social
	private assigned = new Set<string>()
	private blockedVenueBySettler = new Map<string, { buildingInstanceId: string, untilMs: number }>()
	private requestCountBySettler = new Map<string, number>()

	constructor(
		private managers: WorkProviderDeps,
		private getNowMs: () => number,
		private getDayPhase: () => DayPhase,
		private getDayStamp: () => string
	) {}

	assign(settlerId: string): void {
		this.assigned.add(settlerId)
	}

	unassign(settlerId: string): void {
		this.assigned.delete(settlerId)
		this.blockedVenueBySettler.delete(settlerId)
		this.requestCountBySettler.delete(settlerId)
	}

	pause(_settlerId: string): void {
		// no-op
	}

	resume(_settlerId: string): void {
		// no-op
	}

	public onVenueFull(settlerId: string, buildingInstanceId: string): void {
		this.blockedVenueBySettler.set(settlerId, {
			buildingInstanceId,
			untilMs: this.getNowMs() + SOCIAL_VENUE_FULL_RETRY_BLOCK_MS
		})
	}

	public onSocialStepCompleted(settlerId: string): void {
		this.blockedVenueBySettler.delete(settlerId)
	}

	public resetDailyState(): void {
		this.requestCountBySettler.clear()
	}

	public reset(): void {
		this.assigned.clear()
		this.blockedVenueBySettler.clear()
		this.requestCountBySettler.clear()
	}

	requestNextStep(settlerId: string): WorkStep | null {
		if (this.getDayPhase() !== 'evening') {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.VenueClosed }
		}

		const settler = this.managers.population.getSettler(settlerId)
		if (!settler) {
			return null
		}

		const candidates = this.collectVenueCandidates(settler.id)
		if (candidates.length === 0) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.NoSocialVenue }
		}

		const blocked = this.blockedVenueBySettler.get(settlerId)
		const nowMs = this.getNowMs()
		const available = blocked && blocked.untilMs > nowMs
			? candidates.filter(candidate => candidate.building.id !== blocked.buildingInstanceId)
			: candidates

		const pool = available.length > 0 ? available : candidates
		const selected = this.pickBestVenue(settlerId, pool)
		if (!selected) {
			return { type: WorkStepType.Wait, reason: WorkWaitReason.NoSocialVenue }
		}
		const tileSize = this.getTileSize(settler.mapId)
		const estimatedTravelMs = Math.round((selected.distanceTiles * tileSize / Math.max(1, settler.speed)) * 1000)
		const dwellTimeMs = Math.max(1000, this.getRemainingEveningDurationMs() - estimatedTravelMs)

		return {
			type: WorkStepType.SocialVisit,
			buildingInstanceId: selected.building.id,
			targetPosition: selected.targetPosition,
			dwellTimeMs
		}
	}

	private collectVenueCandidates(settlerId: string): SocialVenueCandidate[] {
		const settler = this.managers.population.getSettler(settlerId)
		if (!settler) {
			return []
		}

		const tileSize = this.getTileSize(settler.mapId)
		const maxDistancePx = SOCIAL_MAX_TRAVEL_TILES * tileSize
		const venues: SocialVenueCandidate[] = []

		for (const building of this.managers.buildings.getAllBuildings()) {
			if (building.mapId !== settler.mapId || building.playerId !== settler.playerId) {
				continue
			}
			if (building.stage !== ConstructionStage.Completed) {
				continue
			}

			const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
			if (!definition) {
				continue
			}
			if (!this.isEligibleVenue(definition, building.buildingId)) {
				continue
			}

			const access = this.managers.buildings.getBuildingAccessPoints(building.id)
			const targetPosition = access?.center ?? access?.entry ?? building.position
			const distancePx = calculateDistance(settler.position, targetPosition)
			if (distancePx > maxDistancePx) {
				continue
			}

			venues.push({
				building,
				definition,
				venueType: this.resolveVenueType(definition, building.buildingId),
				targetPosition,
				distanceTiles: distancePx / tileSize
			})
		}

		return venues
	}

	private isEligibleVenue(definition: BuildingDefinition, _buildingId: string): boolean {
		if (definition.spawnsSettlers) {
			return false
		}
		if (!definition.socialVenue) {
			return false
		}
		const outsideSlots = Math.max(0, definition.occupancy?.outsideSlots?.count ?? 0)
		const insideCapacity = Math.max(0, definition.occupancy?.insideCapacity ?? 0)
		const totalCapacity = Math.max(
			0,
			definition.occupancy?.totalCapacity ?? (outsideSlots + insideCapacity)
		)
		return totalCapacity > 0 && (outsideSlots > 0 || insideCapacity > 0)
	}

	private resolveVenueType(definition: BuildingDefinition, _buildingId: string): SocialVenueType {
		return definition.socialVenue?.venueType || 'civic'
	}

	private pickBestVenue(settlerId: string, venues: SocialVenueCandidate[]): SocialVenueCandidate | null {
		if (venues.length === 0) {
			return null
		}
		const dayStamp = this.getDayStamp()
		const currentRequest = (this.requestCountBySettler.get(settlerId) || 0) + 1
		this.requestCountBySettler.set(settlerId, currentRequest)

		let best: SocialVenueCandidate | null = null
		let bestScore = Number.NEGATIVE_INFINITY

		for (const venue of venues) {
			const preference = this.getPreferenceWeight(settlerId, venue.venueType)
			const jitter = this.getJitter(`${settlerId}:${venue.building.id}:${dayStamp}:${currentRequest}`)
			const distancePenalty = venue.distanceTiles * 0.08
			const score = preference * 2 + jitter - distancePenalty

			if (score > bestScore) {
				best = venue
				bestScore = score
			}
		}

		return best
	}

	private getPreferenceWeight(settlerId: string, venueType: SocialVenueType): number {
		const hash = this.hashToUnit(`${settlerId}:pref:${venueType}`)
		return 0.35 + hash * 0.65
	}

	private getJitter(seed: string): number {
		return this.hashToUnit(seed) * 0.5 - 0.25
	}

	private hashToUnit(seed: string): number {
		let hash = 2166136261
		for (let i = 0; i < seed.length; i++) {
			hash ^= seed.charCodeAt(i)
			hash = Math.imul(hash, 16777619)
		}
		const normalized = (hash >>> 0) / 4294967295
		return Number.isFinite(normalized) ? normalized : 0
	}

	private getTileSize(mapId: string): number {
		const map = this.managers.map.getMap(mapId)
		return map?.tiledMap?.tilewidth || 32
	}

	private getRemainingEveningDurationMs(): number {
		const time = this.managers.time.getCurrentTime()
		const currentMinute = time.hours * 60 + time.minutes
		const eveningEndMinute = 21 * 60
		const remainingMinutes = Math.max(1, eveningEndMinute - currentMinute)
		const msPerMinute = Math.max(100, this.managers.time.getTimeSpeed())
		return remainingMinutes * msPerMinute
	}
}
