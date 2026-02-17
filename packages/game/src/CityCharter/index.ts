import { EventManager, Event, EventClient } from '../events'
import { CityCharterEvents } from './events'
import {
	CityCharterContent,
	CityCharterTier,
	CityCharterRequirementStatus,
	CityCharterStateData,
	CityCharterUnlockFlagsUpdated
} from './types'
import { Receiver } from '../Receiver'
import { Logger } from '../Logs'
import { BaseManager } from '../Managers'
import { SimulationEvents } from '../Simulation/events'
import type { SimulationTickData } from '../Simulation/types'
import type { PopulationManager } from '../Population'
import type { BuildingManager } from '../Buildings'
import type { StorageManager } from '../Storage'
import { ConstructionStage } from '../Buildings/types'
import type { CityCharterSnapshot } from '../state/types'
import type { PlayerJoinData, PlayerTransitionData } from '../Players/types'
import type { MapId, PlayerId } from '../ids'
import { CityCharterManagerState, type CityCharterState } from './CityCharterManagerState'

export interface CityCharterDeps {
	event: EventManager
	population: PopulationManager
	buildings: BuildingManager
	storage: StorageManager
}

type RequirementsContext = {
	population: number
	buildingCounts: Map<string, number>
	resourceTotals: Record<string, number>
}

export class CityCharterManager extends BaseManager<CityCharterDeps> {
	private readonly state = new CityCharterManagerState()
	private readonly TICK_INTERVAL_MS = 1000

	constructor(
		managers: CityCharterDeps,
		private logger: Logger
	) {
		super(managers)
		this.setupEventHandlers()
	}

	private setupEventHandlers(): void {
		this.managers.event.on(SimulationEvents.SS.Tick, this.handleSimulationSSTick)
		this.managers.event.on<PlayerJoinData>(Event.Players.CS.Join, this.handlePlayersCSJoin)
		this.managers.event.on<PlayerTransitionData>(Event.Players.CS.TransitionTo, this.handlePlayersCSTransitionTo)
		this.managers.event.on(CityCharterEvents.CS.Claim, this.handleCityCharterCSClaim)
		this.managers.event.on(CityCharterEvents.CS.RequestState, this.handleCityCharterCSRequestState)
	}

	/* EVENT HANDLERS */
	private readonly handleSimulationSSTick = (data: SimulationTickData): void => {
		this.handleSimulationTick(data)
	}

	private readonly handlePlayersCSJoin = (data: PlayerJoinData, client: EventClient): void => {
		const mapId = data.mapId || client.currentGroup
		this.ensureState(client.id, mapId)
		this.sendStateToClient(client, mapId)
	}

	private readonly handlePlayersCSTransitionTo = (data: PlayerTransitionData, client: EventClient): void => {
		const mapId = data.mapId || client.currentGroup
		this.ensureState(client.id, mapId)
		this.sendStateToClient(client, mapId)
	}

	private readonly handleCityCharterCSClaim = (data: { mapId?: string }, client: EventClient): void => {
		const mapId = data?.mapId || client.currentGroup
		this.claimNextTier(client, mapId)
	}

	private readonly handleCityCharterCSRequestState = (data: { mapId?: string }, client: EventClient): void => {
		const mapId = data?.mapId || client.currentGroup
		this.ensureState(client.id, mapId)
		this.sendStateToClient(client, mapId)
	}

	/* METHODS */
	public loadCharters(content: CityCharterContent): void {
		this.state.tiers = (content.tiers || []).map((tier, index) => ({
			...tier,
			level: typeof tier.level === 'number' ? tier.level : index
		}))
		this.state.tiersById.clear()
		this.state.tiers.forEach(tier => this.state.tiersById.set(tier.id, tier))
		this.state.defaultTierId = content.defaultTierId

		if (!this.state.defaultTierId || !this.state.tiersById.has(this.state.defaultTierId)) {
			this.state.defaultTierId = this.state.tiers[0]?.id ?? null
			if (!this.state.defaultTierId) {
				this.logger.warn('[CityCharter] No tiers configured; charter system will be inactive.')
				return
			}
			this.logger.warn(`[CityCharter] Default tier missing; falling back to ${this.state.defaultTierId}`)
		}

		for (const state of this.state.states.values()) {
			this.rebuildUnlockFlags(state)
			this.refreshState(state.playerId, state.mapId, true)
			this.emitUnlockFlagsUpdated(state)
		}
	}

	private handleSimulationTick(data: SimulationTickData): void {
		this.state.tickAccumulatorMs += data.deltaMs
		if (this.state.tickAccumulatorMs < this.TICK_INTERVAL_MS) {
			return
		}
		this.state.tickAccumulatorMs -= this.TICK_INTERVAL_MS
		for (const state of this.state.states.values()) {
			this.refreshState(state.playerId, state.mapId, true)
		}
	}

	private getStateKey(playerId: PlayerId, mapId: MapId): string {
		return `${playerId}:${mapId}`
	}

	private ensureState(playerId: PlayerId, mapId: MapId): CityCharterState | null {
		const key = this.getStateKey(playerId, mapId)
		const existing = this.state.states.get(key)
		if (existing) {
			return existing
		}

		if (!this.state.defaultTierId) {
			this.logger.warn('[CityCharter] Cannot create state; no default tier configured.')
			return null
		}

		const baseTier = this.state.tiersById.get(this.state.defaultTierId)
		if (!baseTier) {
			this.logger.warn(`[CityCharter] Default tier not found: ${this.state.defaultTierId}`)
			return null
		}

		const claimedTierIds = [baseTier.id]
		const unlockedFlags = this.buildUnlockFlags(claimedTierIds)
		const state: CityCharterState = {
			playerId,
			mapId,
			currentTierId: baseTier.id,
			claimedTierIds,
			unlockedFlags,
			currentTierRequirementsMet: true,
			buffsActive: true,
			isEligibleForNext: false
		}
		this.state.states.set(key, state)
		this.refreshState(playerId, mapId, false)
		this.emitUnlockFlagsUpdated(state)
		return state
	}

	private getTierIndex(tierId: string): number {
		return this.state.tiers.findIndex(tier => tier.id === tierId)
	}

	private getNextTier(tierId: string): CityCharterTier | undefined {
		const index = this.getTierIndex(tierId)
		if (index < 0) {
			return undefined
		}
		return this.state.tiers[index + 1]
	}

	private buildUnlockFlags(claimedTierIds: string[]): string[] {
		const flags = new Set<string>()
		for (const tierId of claimedTierIds) {
			const tier = this.state.tiersById.get(tierId)
			if (!tier?.unlockFlags) {
				continue
			}
			for (const flag of tier.unlockFlags) {
				flags.add(flag)
			}
		}
		return Array.from(flags)
	}

	private rebuildUnlockFlags(state: CityCharterState): void {
		const nextFlags = this.buildUnlockFlags(state.claimedTierIds)
		const currentSet = new Set(state.unlockedFlags)
		const nextSet = new Set(nextFlags)
		if (currentSet.size === nextSet.size) {
			let unchanged = true
			for (const flag of nextSet) {
				if (!currentSet.has(flag)) {
					unchanged = false
					break
				}
			}
			if (unchanged) {
				return
			}
		}
		state.unlockedFlags = Array.from(nextSet)
	}

	private buildRequirementsContext(mapId: MapId, playerId: PlayerId): RequirementsContext {
		const settlers = this.managers.population.getSettlers().filter(
			settler => settler.mapId === mapId && settler.playerId === playerId
		)
		const population = settlers.length
		const buildingCounts = new Map<string, number>()
		for (const building of this.managers.buildings.getAllBuildings()) {
			if (building.mapId !== mapId || building.playerId !== playerId) {
				continue
			}
			if (building.stage !== ConstructionStage.Completed) {
				continue
			}
			buildingCounts.set(
				building.buildingId,
				(buildingCounts.get(building.buildingId) || 0) + 1
			)
		}
		const resourceTotals = this.managers.storage.getTotalsForPlayerMap(mapId, playerId)
		return { population, buildingCounts, resourceTotals }
	}

	private evaluateTier(
		tier: CityCharterTier | undefined,
		context: RequirementsContext
	): CityCharterRequirementStatus {
		if (!tier?.requirements) {
			return { allMet: true }
		}

		const status: CityCharterRequirementStatus = { allMet: true }
		const requirements = tier.requirements

		if (typeof requirements.population === 'number') {
			const current = context.population
			const required = requirements.population
			const met = current >= required
			status.population = { current, required, met }
			if (!met) {
				status.allMet = false
			}
		}

		if (requirements.buildings && requirements.buildings.length > 0) {
			status.buildings = requirements.buildings.map(entry => {
				const current = context.buildingCounts.get(entry.buildingId) || 0
				const required = entry.count
				const met = current >= required
				if (!met) {
					status.allMet = false
				}
				return { buildingId: entry.buildingId, current, required, met }
			})
		}

		if (requirements.resources && requirements.resources.length > 0) {
			status.resources = requirements.resources.map(entry => {
				const current = context.resourceTotals[entry.itemType] || 0
				const required = entry.quantity
				const met = current >= required
				if (!met) {
					status.allMet = false
				}
				return { itemType: entry.itemType, current, required, met }
			})
		}

		return status
	}

	private buildStateData(
		state: CityCharterState,
		currentRequirements: CityCharterRequirementStatus,
		nextRequirements?: CityCharterRequirementStatus
	): CityCharterStateData {
		const currentTier = this.state.tiersById.get(state.currentTierId)
		if (!currentTier) {
			throw new Error(`[CityCharter] Missing tier: ${state.currentTierId}`)
		}
		const nextTier = this.getNextTier(state.currentTierId)

		return {
			playerId: state.playerId,
			mapId: state.mapId,
			currentTier,
			nextTier,
			claimedTierIds: [...state.claimedTierIds],
			unlockedFlags: [...state.unlockedFlags],
			currentRequirements,
			nextRequirements,
			isEligibleForNext: state.isEligibleForNext,
			currentTierRequirementsMet: state.currentTierRequirementsMet,
			buffsActive: state.buffsActive
		}
	}

	private refreshState(playerId: PlayerId, mapId: MapId, emitIfChanged: boolean): void {
		const state = this.ensureState(playerId, mapId)
		if (!state) {
			return
		}
		const context = this.buildRequirementsContext(mapId, playerId)
		const currentTier = this.state.tiersById.get(state.currentTierId)
		if (!currentTier) {
			this.logger.warn(`[CityCharter] Missing current tier ${state.currentTierId} for ${playerId}`)
			return
		}
		const currentRequirements = this.evaluateTier(currentTier, context)
		const nextTier = this.getNextTier(state.currentTierId)
		const nextRequirements = nextTier ? this.evaluateTier(nextTier, context) : undefined

		const currentMet = currentRequirements.allMet
		const buffsActive = currentMet
		const eligibleForNext = Boolean(nextRequirements?.allMet)

		const stateChanged =
			currentMet !== state.currentTierRequirementsMet ||
			buffsActive !== state.buffsActive ||
			eligibleForNext !== state.isEligibleForNext

		state.currentTierRequirementsMet = currentMet
		state.buffsActive = buffsActive
		state.isEligibleForNext = eligibleForNext

		if (emitIfChanged && stateChanged) {
			const payload = this.buildStateData(state, currentRequirements, nextRequirements)
			this.managers.event.emit(Receiver.Client, CityCharterEvents.SC.Updated, payload, state.playerId)
		}
	}

	private sendStateToClient(client: EventClient, mapId: MapId): void {
		const state = this.ensureState(client.id, mapId)
		if (!state) {
			return
		}
		const context = this.buildRequirementsContext(mapId, client.id)
		const currentTier = this.state.tiersById.get(state.currentTierId)
		if (!currentTier) {
			this.logger.warn(`[CityCharter] Missing current tier ${state.currentTierId} for ${client.id}`)
			return
		}
		const currentRequirements = this.evaluateTier(currentTier, context)
		const nextTier = this.getNextTier(state.currentTierId)
		const nextRequirements = nextTier ? this.evaluateTier(nextTier, context) : undefined
		state.currentTierRequirementsMet = currentRequirements.allMet
		state.buffsActive = currentRequirements.allMet
		state.isEligibleForNext = Boolean(nextRequirements?.allMet)
		const payload = this.buildStateData(state, currentRequirements, nextRequirements)
		client.emit(Receiver.Sender, CityCharterEvents.SC.State, payload)
	}

	private emitUnlockFlagsUpdated(state: CityCharterState): void {
		const payload: CityCharterUnlockFlagsUpdated = {
			playerId: state.playerId,
			mapId: state.mapId,
			unlockedFlags: [...state.unlockedFlags]
		}
		this.managers.event.emit(Receiver.All, CityCharterEvents.SS.UnlockFlagsUpdated, payload)
	}

	private claimNextTier(client: EventClient, mapId: MapId): void {
		const state = this.ensureState(client.id, mapId)
		if (!state) {
			return
		}
		const nextTier = this.getNextTier(state.currentTierId)
		if (!nextTier) {
			return
		}
		const context = this.buildRequirementsContext(mapId, client.id)
		const nextRequirements = this.evaluateTier(nextTier, context)
		if (!nextRequirements.allMet) {
			return
		}

		state.currentTierId = nextTier.id
		if (!state.claimedTierIds.includes(nextTier.id)) {
			state.claimedTierIds.push(nextTier.id)
		}
		state.unlockedFlags = this.buildUnlockFlags(state.claimedTierIds)
		this.emitUnlockFlagsUpdated(state)

		this.refreshState(client.id, mapId, false)
		const currentTier = this.state.tiersById.get(state.currentTierId)
		if (!currentTier) {
			return
		}
		const currentRequirements = this.evaluateTier(currentTier, context)
		const updatedNextTier = this.getNextTier(state.currentTierId)
		const updatedNextRequirements = updatedNextTier ? this.evaluateTier(updatedNextTier, context) : undefined
		state.currentTierRequirementsMet = currentRequirements.allMet
		state.buffsActive = currentRequirements.allMet
		state.isEligibleForNext = Boolean(updatedNextRequirements?.allMet)
		const payload = this.buildStateData(state, currentRequirements, updatedNextRequirements)
		this.managers.event.emit(Receiver.Client, CityCharterEvents.SC.Updated, payload, client.id)
	}

	public serialize(): CityCharterSnapshot {
		return this.state.serialize()
	}

	public deserialize(snapshot: CityCharterSnapshot): void {
		this.state.deserialize(snapshot)
		for (const state of this.state.states.values()) {
			this.rebuildUnlockFlags(state)
			this.emitUnlockFlagsUpdated(state)
		}
		for (const state of this.state.states.values()) {
			this.refreshState(state.playerId, state.mapId, false)
		}
	}

	public reset(): void {
		this.state.reset()
	}
}

export * from './CityCharterManagerState'
