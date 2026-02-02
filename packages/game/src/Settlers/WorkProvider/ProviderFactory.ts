import type { WorkProviderDeps } from './deps'
import type { Logger } from '../../Logs'
import { ProviderRegistry } from './ProviderRegistry'
import { BuildingProvider } from './providers/BuildingProvider'
import { ConstructionProvider } from './providers/ConstructionProvider'
import { RoadProvider } from './providers/RoadProvider'
import type { LogisticsProvider } from './providers/LogisticsProvider'
import type { BuildingInstanceId, MapId, PlayerId } from '../../ids'

export class ProviderFactory {
	private buildingProviders = new Map<BuildingInstanceId, BuildingProvider>()
	private constructionProviders = new Map<BuildingInstanceId, ConstructionProvider>()
	private roadProviders = new Map<string, RoadProvider>()

	constructor(
		private managers: WorkProviderDeps,
		private registry: ProviderRegistry,
		private logger: Logger,
		private logisticsProvider: LogisticsProvider
	) {}

	getBuilding(buildingInstanceId: BuildingInstanceId): BuildingProvider | null {
		const building = this.managers.buildings.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return null
		}
		let provider = this.buildingProviders.get(buildingInstanceId)
		if (!provider) {
			provider = new BuildingProvider(
				buildingInstanceId,
				this.managers,
				this.logisticsProvider,
				this.logger
			)
			this.buildingProviders.set(buildingInstanceId, provider)
			this.registry.register(provider)
		}
		return provider
	}

	getConstruction(buildingInstanceId: BuildingInstanceId): ConstructionProvider | null {
		const building = this.managers.buildings.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return null
		}
		let provider = this.constructionProviders.get(buildingInstanceId)
		if (!provider) {
			provider = new ConstructionProvider(
				buildingInstanceId,
				this.managers,
				this.logger
			)
			this.constructionProviders.set(buildingInstanceId, provider)
			this.registry.register(provider)
		}
		return provider
	}

	getRoad(mapId: MapId, playerId: PlayerId): RoadProvider {
		const key = `${mapId}:${playerId}`
		let provider = this.roadProviders.get(key)
		if (!provider) {
			provider = new RoadProvider(mapId, playerId, this.managers, this.logger)
			this.roadProviders.set(key, provider)
			this.registry.register(provider)
		}
		return provider
	}

	clear(): void {
		this.buildingProviders.clear()
		this.constructionProviders.clear()
		this.roadProviders.clear()
	}
}
