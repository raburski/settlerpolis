import React, { useState, useEffect, useMemo } from 'react'
import { EventBus } from '../EventBus'
import { Event, BuildingInstance, BuildingDefinition, ConstructionStage, Settler, SettlerState, ProfessionType, ProductionStatus, WorkerRequestFailureReason, TradeRouteStatus } from '@rugged/game'
import type { TradeRouteState, ProductionRecipe, ProductionPlan } from '@rugged/game'
import { buildingService } from '../services/BuildingService'
import { populationService } from '../services/PopulationService'
import { itemService } from '../services/ItemService'
import { storageService } from '../services/StorageService'
import { productionService } from '../services/ProductionService'
import { tradeService } from '../services/TradeService'
import { reputationService } from '../services/ReputationService'
import { ProgressBarRow } from './ProgressBarRow'
import { StorageResourceTile } from './StorageResourceTile'
import styles from './BuildingInfoPanel.module.css'
import confirmStyles from './ConfirmDialog.module.css'
import { UiEvents } from '../uiEvents'
import { worldMapData, type WorldMapNodeTradeOffer } from '../worldmap/data'

// Component to display item emoji that reactively updates when metadata loads
const ItemEmoji: React.FC<{ itemType: string }> = ({ itemType }) => {
	const [emoji, setEmoji] = useState<string>(itemType)

	useEffect(() => {
		// Try to get immediately
		const itemMetadata = itemService.getItemType(itemType)
		if (itemMetadata?.emoji) {
			setEmoji(itemMetadata.emoji)
		}

		// Subscribe to updates
		const unsubscribe = itemService.subscribeToItemMetadata(itemType, (metadata) => {
			if (metadata?.emoji) {
				setEmoji(metadata.emoji)
			}
		})

		return unsubscribe
	}, [itemType])

	return <>{emoji}</>
}

const getTradeStatusLabel = (status?: TradeRouteStatus) => {
	if (!status) return 'Idle'
	switch (status) {
		case TradeRouteStatus.Loading:
			return 'Loading goods'
		case TradeRouteStatus.Ready:
			return 'Ready to dispatch'
		case TradeRouteStatus.Outbound:
			return 'Outbound'
		case TradeRouteStatus.AtDestination:
			return 'At destination'
		case TradeRouteStatus.Returning:
			return 'Returning'
		case TradeRouteStatus.Unloading:
			return 'Unloading'
		case TradeRouteStatus.Cooldown:
			return 'Cooldown'
		default:
			return 'Idle'
	}
}

const formatTradeOffer = (offer: WorldMapNodeTradeOffer) => {
	return `${offer.offerQuantity} ${offer.offerItem} → ${offer.receiveQuantity} ${offer.receiveItem}`
}

type TradeRouteType = 'land' | 'sea'

const resolveTradeRouteType = (definition?: BuildingDefinition | null): TradeRouteType | null => {
	if (!definition) {
		return null
	}
	if (definition.tradeRouteType) {
		return definition.tradeRouteType
	}
	if (definition.isTradingPost) {
		return 'land'
	}
	return null
}

const buildRecipeId = (recipe: ProductionRecipe, index: number) => {
	const outputs = recipe.outputs?.map(output => output.itemType).filter(Boolean).join('+')
	if (outputs && outputs.length > 0) {
		return outputs
	}
	return `recipe-${index}`
}

const normalizeProductionRecipes = (definition?: BuildingDefinition): Array<ProductionRecipe & { id: string }> => {
	if (!definition) {
		return []
	}
	const recipes = definition.productionRecipes && definition.productionRecipes.length > 0
		? definition.productionRecipes
		: (definition.productionRecipe ? [definition.productionRecipe] : [])
	if (recipes.length === 0) {
		return []
	}
	const seen = new Set<string>()
	return recipes.map((recipe, index) => {
		let id = recipe.id ?? buildRecipeId(recipe, index)
		if (seen.has(id)) {
			id = `${id}-${index}`
		}
		seen.add(id)
		return { ...recipe, id }
	})
}

const buildDefaultPlan = (recipes: Array<ProductionRecipe & { id: string }>, defaults?: ProductionPlan): ProductionPlan => {
	const plan: ProductionPlan = {}
	for (const recipe of recipes) {
		const weight = defaults?.[recipe.id]
		plan[recipe.id] = typeof weight === 'number' && Number.isFinite(weight) ? weight : 1
	}
	return plan
}

const normalizePlanForUi = (plan: ProductionPlan | undefined, recipeIds: string[]): ProductionPlan => {
	if (recipeIds.length === 0) {
		return {}
	}
	const normalized: ProductionPlan = {}
	const enabledIds = recipeIds.filter(id => (plan?.[id] ?? 0) > 0)

	if (enabledIds.length === 0) {
		const base = Math.floor(100 / recipeIds.length)
		let remainder = 100 - base * recipeIds.length
		recipeIds.forEach((id) => {
			const add = remainder > 0 ? 1 : 0
			normalized[id] = base + add
			if (remainder > 0) {
				remainder -= 1
			}
		})
		return normalized
	}

	const totalEnabled = enabledIds.reduce((sum, id) => sum + (plan?.[id] ?? 0), 0)
	const scaled = enabledIds.map(id => {
		const raw = plan?.[id] ?? 0
		return totalEnabled > 0 ? Math.round((raw / totalEnabled) * 100) : 0
	})
	const diff = 100 - scaled.reduce((sum, value) => sum + value, 0)
	if (diff !== 0 && scaled.length > 0) {
		scaled[0] = Math.max(0, scaled[0] + diff)
	}
	enabledIds.forEach((id, index) => {
		normalized[id] = scaled[index]
	})
	recipeIds.forEach((id) => {
		if (!normalized[id]) {
			normalized[id] = 0
		}
	})
	return normalized
}

const adjustPlanWeights = (plan: ProductionPlan, recipeIds: string[], recipeId: string, nextWeight: number): ProductionPlan => {
	const clampedWeight = Math.max(0, Math.min(100, nextWeight))
	const enabledIds = recipeIds.filter(id => (plan[id] ?? 0) > 0 || id === recipeId)

	if (enabledIds.length <= 1) {
		const singlePlan: ProductionPlan = {}
		recipeIds.forEach(id => {
			singlePlan[id] = id === recipeId ? 100 : 0
		})
		return singlePlan
	}

	const otherIds = enabledIds.filter(id => id !== recipeId)
	const targetOtherTotal = Math.max(0, 100 - clampedWeight)
	const otherTotal = otherIds.reduce((sum, id) => sum + (plan[id] ?? 0), 0)

	const nextPlan: ProductionPlan = {}
	recipeIds.forEach(id => {
		nextPlan[id] = 0
	})
	nextPlan[recipeId] = clampedWeight

	if (otherIds.length === 0) {
		return nextPlan
	}

	if (otherTotal <= 0) {
		const base = Math.floor(targetOtherTotal / otherIds.length)
		let remainder = targetOtherTotal - base * otherIds.length
		otherIds.forEach(id => {
			const add = remainder > 0 ? 1 : 0
			nextPlan[id] = base + add
			if (remainder > 0) {
				remainder -= 1
			}
		})
		return nextPlan
	}

	const scaled = otherIds.map(id => Math.round(((plan[id] ?? 0) / otherTotal) * targetOtherTotal))
	const diff = targetOtherTotal - scaled.reduce((sum, value) => sum + value, 0)
	if (diff !== 0 && scaled.length > 0) {
		scaled[0] = Math.max(0, scaled[0] + diff)
	}
	otherIds.forEach((id, index) => {
		nextPlan[id] = Math.max(0, scaled[index])
	})

	return nextPlan
}

interface BuildingInfoData {
	buildingInstance: BuildingInstance
	buildingDefinition: BuildingDefinition
}

const OCCUPANCY_TILE_SIZE_PX = 32
const OCCUPANCY_BOUNDS_PADDING_TILES = 1
const OCCUPANCY_ARRIVAL_DISTANCE_PX = 24
const OCCUPANCY_TARGET_TYPE = 'occupancy_slot'

const getOccupancyCapacity = (definition: BuildingDefinition): number => {
	const configured = definition.occupancy
	if (!configured) {
		return 0
	}
	if (typeof configured.totalCapacity === 'number' && configured.totalCapacity > 0) {
		return configured.totalCapacity
	}
	const inside = typeof configured.insideCapacity === 'number' ? Math.max(0, configured.insideCapacity) : 0
	const outside = typeof configured.outsideSlots?.count === 'number' ? Math.max(0, configured.outsideSlots.count) : 0
	return inside + outside
}

const isPositionNearBuilding = (
	position: { x: number, y: number },
	building: BuildingInstance,
	definition: BuildingDefinition
): boolean => {
	const padding = OCCUPANCY_BOUNDS_PADDING_TILES * OCCUPANCY_TILE_SIZE_PX
	const minX = building.position.x - padding
	const minY = building.position.y - padding
	const maxX = building.position.x + definition.footprint.width * OCCUPANCY_TILE_SIZE_PX + padding
	const maxY = building.position.y + definition.footprint.height * OCCUPANCY_TILE_SIZE_PX + padding
	return position.x >= minX && position.x <= maxX && position.y >= minY && position.y <= maxY
}

export const BuildingInfoPanel: React.FC = () => {
	const [isVisible, setIsVisible] = useState(false)
	const [buildingInstance, setBuildingInstance] = useState<BuildingInstance | null>(null)
	const [buildingDefinition, setBuildingDefinition] = useState<BuildingDefinition | null>(null)
	const [errorMessage, setErrorMessage] = useState<string | null>(null)
	const [showDemolishConfirm, setShowDemolishConfirm] = useState(false)
	const [tradeRoute, setTradeRoute] = useState<TradeRouteState | null>(null)
	const [reputation, setReputation] = useState(0)
	const [selectedTradeNodeId, setSelectedTradeNodeId] = useState('')
	const [selectedTradeOfferId, setSelectedTradeOfferId] = useState('')
	const [populationVersion, setPopulationVersion] = useState(0)
	const [isWorkAreaSelecting, setIsWorkAreaSelecting] = useState(false)

	const tradeRouteType = useMemo(() => resolveTradeRouteType(buildingDefinition), [buildingDefinition])

	const tradeNodes = useMemo(() => {
		if (!tradeRouteType) {
			return []
		}
		const links = worldMapData.links || []
		const nodes = worldMapData.nodes || []
		if (links.length === 0 || nodes.length === 0) {
			return []
		}
		const visited = new Set<string>([worldMapData.homeNodeId])
		const queue = [worldMapData.homeNodeId]
		while (queue.length > 0) {
			const current = queue.shift()
			if (!current) continue
			for (const link of links) {
				if (link.type !== tradeRouteType) continue
				const neighbor = link.fromId === current ? link.toId : link.toId === current ? link.fromId : null
				if (!neighbor || visited.has(neighbor)) continue
				visited.add(neighbor)
				queue.push(neighbor)
			}
		}
		return nodes.filter(node => node.id !== worldMapData.homeNodeId && visited.has(node.id) && (node.tradeOffers || []).length > 0)
	}, [tradeRouteType])

	const selectedTradeNode = tradeNodes.find(node => node.id === selectedTradeNodeId)
	const productionRecipes = useMemo(() => normalizeProductionRecipes(buildingDefinition || undefined), [buildingDefinition])
	const productionRecipeIds = useMemo(() => productionRecipes.map(recipe => recipe.id), [productionRecipes])
	const defaultProductionPlan = useMemo(
		() => buildDefaultPlan(productionRecipes, buildingDefinition?.productionPlanDefaults),
		[productionRecipes, buildingDefinition]
	)
	const globalProductionPlan = buildingDefinition ? buildingService.getGlobalProductionPlan(buildingDefinition.id) : undefined
	const useGlobalProductionPlan = buildingInstance?.useGlobalProductionPlan !== false
	const baseProductionPlan = useMemo(() => {
		if (productionRecipeIds.length === 0) {
			return {}
		}
		if (!buildingInstance || !buildingDefinition) {
			return defaultProductionPlan
		}
		if (useGlobalProductionPlan) {
			return globalProductionPlan || defaultProductionPlan
		}
		return buildingInstance.productionPlan || globalProductionPlan || defaultProductionPlan
	}, [productionRecipeIds, buildingInstance, buildingDefinition, useGlobalProductionPlan, globalProductionPlan, defaultProductionPlan])
	const uiProductionPlan = useMemo(
		() => normalizePlanForUi(baseProductionPlan, productionRecipeIds),
		[baseProductionPlan, productionRecipeIds]
	)
	const defaultUiPlan = useMemo(
		() => normalizePlanForUi(defaultProductionPlan, productionRecipeIds),
		[defaultProductionPlan, productionRecipeIds]
	)

	useEffect(() => {
		// Listen for building selection
		const handleBuildingSelect = (data: BuildingInfoData) => {
			if (buildingInstance && buildingInstance.id !== data.buildingInstance.id) {
				EventBus.emit(UiEvents.Building.Highlight, { buildingInstanceId: buildingInstance.id, highlighted: false })
			}
			setBuildingInstance(data.buildingInstance)
			setBuildingDefinition(data.buildingDefinition)
			setErrorMessage(null) // Clear any previous errors
			setShowDemolishConfirm(false)
			setIsWorkAreaSelecting(false)
			setIsVisible(true)
			EventBus.emit(UiEvents.Building.Highlight, { buildingInstanceId: data.buildingInstance.id, highlighted: true })
		}

		// Listen for building updates (progress, completion, cancellation)
		const handleBuildingProgress = (data: { buildingInstanceId: string, progress: number, stage: string }) => {
			if (buildingInstance && buildingInstance.id === data.buildingInstanceId) {
				const updated = buildingService.getBuildingInstance(data.buildingInstanceId)
				if (updated) {
					// Service now returns a new object reference, but we'll create a new one just to be safe
					setBuildingInstance({ ...updated })
				}
			}
		}

		const handleBuildingCompleted = (data: { building: BuildingInstance }) => {
			if (buildingInstance && buildingInstance.id === data.building.id) {
				setBuildingInstance(data.building)
			}
		}

		const handleBuildingCancelled = (data: { buildingInstanceId: string }) => {
			if (buildingInstance && buildingInstance.id === data.buildingInstanceId) {
				setIsVisible(false)
				setShowDemolishConfirm(false)
				setIsWorkAreaSelecting(false)
				EventBus.emit(UiEvents.Building.Highlight, { buildingInstanceId: buildingInstance.id, highlighted: false })
				setBuildingInstance(null)
				setBuildingDefinition(null)
			}
		}

		// Listen for close panel event
		const handleClosePanel = () => {
			setIsVisible(false)
			setShowDemolishConfirm(false)
			setIsWorkAreaSelecting(false)
			if (buildingInstance) {
				EventBus.emit(UiEvents.Building.Highlight, { buildingInstanceId: buildingInstance.id, highlighted: false })
			}
			setBuildingInstance(null)
			setBuildingDefinition(null)
		}

		// Listen for worker request failures
		const handleWorkerRequestFailed = (data: { reason: WorkerRequestFailureReason, buildingInstanceId: string }) => {
			if (buildingInstance && buildingInstance.id === data.buildingInstanceId) {
				// Map reason to user-friendly message
				let message = 'Failed to assign worker'
				switch (data.reason) {
					case WorkerRequestFailureReason.NoAvailableWorker:
						message = 'No available settler. Build a house to spawn settlers!'
						break
					case WorkerRequestFailureReason.NoBuilderAvailable:
						message = 'No idle builder available. Promote a settler with a hammer.'
						break
					case WorkerRequestFailureReason.NoSuitableProfession:
						message = 'No idle settler with required profession. Promote one in the Population panel.'
						break
					case WorkerRequestFailureReason.NoAvailableTool:
						message = 'No tool available to change profession. Drop a tool (hammer/axe/cart) on the map!'
						break
					case WorkerRequestFailureReason.BuildingNotFound:
						message = 'Building not found'
						break
					case WorkerRequestFailureReason.BuildingDefinitionNotFound:
						message = 'Building definition not found'
						break
					case WorkerRequestFailureReason.BuildingDoesNotNeedWorkers:
						message = 'Building does not need workers'
						break
					case WorkerRequestFailureReason.BuildingNotUnderConstruction:
						message = 'Building is not under construction'
						break
					case WorkerRequestFailureReason.BuildingCompleted:
						message = 'Building is already completed'
						break
					default:
						message = `Worker request failed: ${data.reason}`
				}
				setErrorMessage(message)
				// Clear error after 5 seconds
				setTimeout(() => setErrorMessage(null), 5000)
			}
		}

		const handlePopulationSettlerUpdated = () => {
			if (buildingInstance) {
				setPopulationVersion((prev) => prev + 1)
			}
		}

		// Listen for worker assigned
		const handleWorkerAssigned = (data: { buildingInstanceId: string }) => {
			if (buildingInstance && buildingInstance.id === data.buildingInstanceId) {
				setErrorMessage(null) // Clear any errors
				// Force re-render to update worker count
				setBuildingInstance({ ...buildingInstance })
			}
		}

		// Listen for worker unassigned
			const handleWorkerUnassigned = () => {
				if (buildingInstance) {
					// Force re-render to update worker count
					setBuildingInstance({ ...buildingInstance })
				}
			}

		// Listen for resources changed
		const handleResourcesChanged = (data: { buildingInstanceId: string, itemType: string, quantity: number, requiredQuantity: number }) => {
			if (buildingInstance && buildingInstance.id === data.buildingInstanceId) {
				const updated = buildingService.getBuildingInstance(data.buildingInstanceId)
				if (updated) {
					// Create a new object reference to force React re-render
					setBuildingInstance({ ...updated })
				}
			}
		}

		// Listen for stage changed
		const handleStageChanged = (data: { buildingInstanceId: string, stage: string }) => {
			if (buildingInstance && buildingInstance.id === data.buildingInstanceId) {
				const updated = buildingService.getBuildingInstance(data.buildingInstanceId)
				if (updated) {
					// Create a new object reference to force React re-render
					setBuildingInstance({ ...updated })
				}
			}
		}

		// Listen for building updated event from service (for reactive updates)
		const handleBuildingUpdated = (data: { buildingInstanceId: string, building: BuildingInstance }) => {
			if (buildingInstance && buildingInstance.id === data.buildingInstanceId) {
				// Update with the new building object from service (already a new reference)
				setBuildingInstance(data.building)
			}
		}

		// Listen for storage updates
		const handleStorageUpdated = (data: { buildingInstanceId: string, storage: unknown }) => {
			if (buildingInstance && buildingInstance.id === data.buildingInstanceId) {
				// Force re-render to show updated storage
				setBuildingInstance({ ...buildingInstance })
			}
		}

		// Listen for production updates
		const handleProductionUpdated = (data: { buildingInstanceId: string, production: unknown }) => {
			if (buildingInstance && buildingInstance.id === data.buildingInstanceId) {
				// Force re-render to show updated production
				setBuildingInstance({ ...buildingInstance })
			}
		}

		EventBus.on(UiEvents.Building.Select, handleBuildingSelect)
		EventBus.on(Event.Buildings.SC.Progress, handleBuildingProgress)
		EventBus.on(Event.Buildings.SC.Completed, handleBuildingCompleted)
		EventBus.on(Event.Buildings.SC.Cancelled, handleBuildingCancelled)
		EventBus.on(Event.Buildings.SC.ResourcesChanged, handleResourcesChanged)
		EventBus.on(Event.Buildings.SC.StageChanged, handleStageChanged)
		EventBus.on(UiEvents.Building.Updated, handleBuildingUpdated)
		EventBus.on(UiEvents.Building.Close, handleClosePanel)
		EventBus.on(UiEvents.Population.WorkerRequestFailed, handleWorkerRequestFailed)
			EventBus.on(UiEvents.Population.SettlerUpdated, handlePopulationSettlerUpdated)
		EventBus.on(UiEvents.Population.WorkerAssigned, handleWorkerAssigned)
		EventBus.on(UiEvents.Population.WorkerUnassigned, handleWorkerUnassigned)
		EventBus.on(UiEvents.Storage.Updated, handleStorageUpdated)
		EventBus.on(UiEvents.Production.Updated, handleProductionUpdated)

		return () => {
			EventBus.off(UiEvents.Building.Select, handleBuildingSelect)
			EventBus.off(Event.Buildings.SC.Progress, handleBuildingProgress)
			EventBus.off(Event.Buildings.SC.Completed, handleBuildingCompleted)
			EventBus.off(Event.Buildings.SC.Cancelled, handleBuildingCancelled)
			EventBus.off(Event.Buildings.SC.ResourcesChanged, handleResourcesChanged)
			EventBus.off(Event.Buildings.SC.StageChanged, handleStageChanged)
			EventBus.off(UiEvents.Building.Updated, handleBuildingUpdated)
			EventBus.off(UiEvents.Building.Close, handleClosePanel)
			EventBus.off(UiEvents.Population.WorkerRequestFailed, handleWorkerRequestFailed)
				EventBus.off(UiEvents.Population.SettlerUpdated, handlePopulationSettlerUpdated)
			EventBus.off(UiEvents.Population.WorkerAssigned, handleWorkerAssigned)
			EventBus.off(UiEvents.Population.WorkerUnassigned, handleWorkerUnassigned)
			EventBus.off(UiEvents.Storage.Updated, handleStorageUpdated)
			EventBus.off(UiEvents.Production.Updated, handleProductionUpdated)
		}
	}, [buildingInstance])

	useEffect(() => {
		if (!buildingInstance || !tradeRouteType) {
			setTradeRoute(null)
			return
		}

		tradeService.requestRoutes()
		const route = tradeService.getRoute(buildingInstance.id) || null
		setTradeRoute(route)
		reputationService.requestState()
		setReputation(reputationService.getReputation(buildingInstance.playerId))

		if (route) {
			setSelectedTradeNodeId(route.nodeId)
			setSelectedTradeOfferId(route.offerId)
			return
		}

		const firstNode = tradeNodes.find(node => (node.tradeOffers || []).length > 0)
		if (firstNode) {
			setSelectedTradeNodeId(firstNode.id)
			setSelectedTradeOfferId(firstNode.tradeOffers?.[0]?.id || '')
		}
	}, [buildingInstance?.id, tradeRouteType, tradeNodes])

	useEffect(() => {
		if (!buildingInstance || !tradeRouteType) {
			return
		}

		const handleTradeUpdated = () => {
			setTradeRoute(tradeService.getRoute(buildingInstance.id) || null)
		}

		EventBus.on(UiEvents.Trade.Updated, handleTradeUpdated)
		return () => {
			EventBus.off(UiEvents.Trade.Updated, handleTradeUpdated)
		}
	}, [buildingInstance?.id, buildingInstance?.playerId, tradeRouteType])

	useEffect(() => {
		if (!buildingInstance || !tradeRouteType) {
			return
		}

		const handleReputationUpdated = () => {
			setReputation(reputationService.getReputation(buildingInstance.playerId))
		}

		EventBus.on(UiEvents.Reputation.Updated, handleReputationUpdated)
		return () => {
			EventBus.off(UiEvents.Reputation.Updated, handleReputationUpdated)
		}
	}, [buildingInstance?.playerId, tradeRouteType])

	useEffect(() => {
		if (!buildingInstance) {
			setIsWorkAreaSelecting(false)
			return
		}

		const handleWorkAreaSelect = (data: { buildingInstanceId: string }) => {
			setIsWorkAreaSelecting(data.buildingInstanceId === buildingInstance.id)
		}
		const handleWorkAreaCancel = () => {
			setIsWorkAreaSelecting(false)
		}

		EventBus.on(UiEvents.Building.WorkAreaSelect, handleWorkAreaSelect)
		EventBus.on(UiEvents.Building.WorkAreaCancel, handleWorkAreaCancel)

		return () => {
			EventBus.off(UiEvents.Building.WorkAreaSelect, handleWorkAreaSelect)
			EventBus.off(UiEvents.Building.WorkAreaCancel, handleWorkAreaCancel)
		}
	}, [buildingInstance?.id])

	const handleCancelConstruction = () => {
		if (buildingInstance && (
			buildingInstance.stage === ConstructionStage.ClearingSite ||
			buildingInstance.stage === ConstructionStage.CollectingResources ||
			buildingInstance.stage === ConstructionStage.Constructing
		)) {
			EventBus.emit(Event.Buildings.CS.Cancel, {
				buildingInstanceId: buildingInstance.id
			})
		}
	}

	const handleDemolishBuilding = () => {
		if (buildingInstance && buildingInstance.stage === ConstructionStage.Completed) {
			setShowDemolishConfirm(true)
		}
	}

	const handleConfirmDemolish = () => {
		if (buildingInstance && buildingInstance.stage === ConstructionStage.Completed) {
			EventBus.emit(Event.Buildings.CS.Cancel, {
				buildingInstanceId: buildingInstance.id
			})
		}
		setShowDemolishConfirm(false)
	}

	const handleCancelDemolish = () => {
		setShowDemolishConfirm(false)
	}

	const handleTradeNodeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
		const nextNodeId = event.target.value
		setSelectedTradeNodeId(nextNodeId)
		const nextNode = tradeNodes.find(node => node.id === nextNodeId)
		const nextOffer = nextNode?.tradeOffers?.[0]?.id || ''
		setSelectedTradeOfferId(nextOffer)
	}

	const handleTradeOfferChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
		setSelectedTradeOfferId(event.target.value)
	}

	const handleSetTradeRoute = () => {
		if (!buildingInstance || !selectedTradeNodeId || !selectedTradeOfferId) return
		tradeService.setRoute(buildingInstance.id, selectedTradeNodeId, selectedTradeOfferId)
	}

	const handleCancelTradeRoute = () => {
		if (!buildingInstance) return
		tradeService.cancelRoute(buildingInstance.id)
	}

	const handleClose = () => {
		if (buildingInstance) {
			EventBus.emit(UiEvents.Building.Highlight, { buildingInstanceId: buildingInstance.id, highlighted: false })
		}
		setIsVisible(false)
		setShowDemolishConfirm(false)
		setIsWorkAreaSelecting(false)
		setBuildingInstance(null)
		setBuildingDefinition(null)
		EventBus.emit(UiEvents.Building.Close)
	}

	const handleFocusBuilding = () => {
		if (!buildingInstance) {
			return
		}
		EventBus.emit(UiEvents.Camera.Focus, {
			x: buildingInstance.position.x,
			y: buildingInstance.position.y,
			duration: 650,
			mapId: buildingInstance.mapId
		})
	}

	const bufferItemTypes = useMemo(() => {
		if (!buildingDefinition || !buildingInstance) {
			return []
		}
		const slotTypes = (buildingDefinition.storageSlots || []).map(slot => slot.itemType).filter(Boolean)
		if (slotTypes.includes('*')) {
			return Object.keys(storageService.getStorageItems(buildingInstance.id))
		}
		return Array.from(new Set(slotTypes))
	}, [buildingDefinition, buildingInstance])
	const occupancyCapacity = useMemo(
		() => (buildingDefinition ? getOccupancyCapacity(buildingDefinition) : 0),
		[buildingDefinition]
	)
	const currentOccupancy = useMemo(() => {
		if (!buildingInstance || !buildingDefinition || occupancyCapacity <= 0) {
			return 0
		}
		const presentSettlerIds = new Set<string>()
		for (const settler of populationService.getSettlers()) {
			if (settler.mapId !== buildingInstance.mapId || settler.playerId !== buildingInstance.playerId) {
				continue
			}
			if (settler.stateContext.insideBuildingId === buildingInstance.id) {
				presentSettlerIds.add(settler.id)
				continue
			}
			if (settler.buildingId === buildingInstance.id && isPositionNearBuilding(settler.position, buildingInstance, buildingDefinition)) {
				presentSettlerIds.add(settler.id)
				continue
			}
			if (settler.stateContext.targetType !== OCCUPANCY_TARGET_TYPE || !settler.stateContext.targetPosition) {
				continue
			}
			if (!isPositionNearBuilding(settler.stateContext.targetPosition, buildingInstance, buildingDefinition)) {
				continue
			}
			const dx = settler.position.x - settler.stateContext.targetPosition.x
			const dy = settler.position.y - settler.stateContext.targetPosition.y
			if ((dx * dx + dy * dy) <= (OCCUPANCY_ARRIVAL_DISTANCE_PX * OCCUPANCY_ARRIVAL_DISTANCE_PX)) {
				presentSettlerIds.add(settler.id)
			}
		}
		return Math.min(occupancyCapacity, presentSettlerIds.size)
	}, [buildingInstance, buildingDefinition, occupancyCapacity, populationVersion])

	if (!isVisible || !buildingInstance || !buildingDefinition) {
		return null
	}

	const canCancel = (
		buildingInstance.stage === ConstructionStage.ClearingSite ||
		buildingInstance.stage === ConstructionStage.CollectingResources ||
		buildingInstance.stage === ConstructionStage.Constructing
	)
	const isCompleted = buildingInstance.stage === ConstructionStage.Completed
	const isClearingSite = buildingInstance.stage === ConstructionStage.ClearingSite
	const canDemolish = isCompleted
	const isConstructing = buildingInstance.stage === ConstructionStage.Constructing
	const isCollectingResources = buildingInstance.stage === ConstructionStage.CollectingResources
	const hasWorkerSlots = buildingDefinition.workerSlots !== undefined
	const canPauseWork = Boolean((productionRecipes.length > 0) || buildingDefinition.harvest || buildingDefinition.farm)
	const workStatus = canPauseWork ? productionService.getProductionStatus(buildingInstance.id) : ProductionStatus.Idle
	const isWorkPaused = workStatus === ProductionStatus.Paused
	const handlePlanUpdate = (nextPlan: ProductionPlan) => {
		if (!buildingInstance || !buildingDefinition) {
			return
		}
		if (useGlobalProductionPlan) {
			buildingService.setGlobalProductionPlan(buildingDefinition.id, nextPlan)
			return
		}
		buildingService.setProductionPlan(buildingInstance.id, nextPlan, false)
	}

	const handlePlanWeightChange = (recipeId: string, nextWeight: number) => {
		if (productionRecipeIds.length === 0) {
			return
		}
		const nextPlan = adjustPlanWeights(uiProductionPlan, productionRecipeIds, recipeId, nextWeight)
		handlePlanUpdate(nextPlan)
	}

	const handlePlanToggle = (recipeId: string) => {
		if (productionRecipeIds.length === 0) {
			return
		}
		const currentWeight = uiProductionPlan[recipeId] ?? 0
		if (currentWeight > 0) {
			handlePlanUpdate(adjustPlanWeights(uiProductionPlan, productionRecipeIds, recipeId, 0))
			return
		}
		const fallback = Math.max(1, defaultUiPlan[recipeId] ?? Math.round(100 / Math.max(1, productionRecipeIds.length)))
		handlePlanUpdate(adjustPlanWeights(uiProductionPlan, productionRecipeIds, recipeId, fallback))
	}

	const handleUseGlobalToggle = () => {
		if (!buildingInstance || !buildingDefinition) {
			return
		}
		if (useGlobalProductionPlan) {
			buildingService.setProductionPlan(buildingInstance.id, uiProductionPlan, false)
			return
		}
		buildingService.setProductionPlan(buildingInstance.id, undefined, true)
	}
	const settlers = populationService.getSettlers()
	const assignedWorkers = settlers.filter(
		settler => settler.buildingId === buildingInstance.id && Boolean(settler.stateContext.assignmentId)
	)
	const workerCount = assignedWorkers.length
	const queuedWorkers = buildingInstance.pendingWorkers ?? 0
	const maxWorkers = buildingDefinition.workerSlots || 0
	// Buildings only need workers during Constructing stage (builders) or Completed stage (production workers)
	// During CollectingResources, carriers are automatically requested by the system
	const needsWorkers = buildingInstance.stage === ConstructionStage.Constructing ||
		(isCompleted && hasWorkerSlots && workerCount < maxWorkers)
	const canRequestWorker = needsWorkers && isCompleted && hasWorkerSlots && workerCount < maxWorkers
	const showWorkforceSection = needsWorkers || assignedWorkers.length > 0 || (hasWorkerSlots && maxWorkers > 0)
	const requiredProfessionLabel = isConstructing ? 'builder' : buildingDefinition.requiredProfession
	const hasRequiredProfession = requiredProfessionLabel !== undefined
	const workforceSlotCount = isConstructing
		? Math.max(1, workerCount + (queuedWorkers > 0 ? 1 : 0))
		: (hasWorkerSlots ? maxWorkers : workerCount)
	const emptyWorkerSlots = Math.max(0, workforceSlotCount - workerCount)
	const emptyWorkerStatusLabel = isConstructing
		? (queuedWorkers > 0 ? '⏳ Queued' : '🔍 Searching')
		: 'Open slot'
	const workforceHeaderMeta = workforceSlotCount > 0
		? `${workerCount} / ${workforceSlotCount}`
		: `${workerCount}`
	const workAreaRadiusTiles = buildingDefinition.farm?.plotRadiusTiles ?? buildingDefinition.harvest?.radiusTiles
	const canSelectWorkArea = isCompleted && typeof workAreaRadiusTiles === 'number' && workAreaRadiusTiles > 0
	const isWarehouse = Boolean(buildingDefinition.isWarehouse)
	const isHouse = Boolean(buildingDefinition.spawnsSettlers)
	const houseCapacity = Math.max(0, buildingDefinition.maxOccupants ?? occupancyCapacity)
	const houseInhabitants = isHouse
		? settlers.filter(settler => settler.houseId === buildingInstance.id)
		: []
	const hasDestructiveAction = canDemolish || canCancel
	const warehouseItemTypes = isWarehouse && buildingDefinition.storageSlots?.length
		? Array.from(new Set(buildingDefinition.storageSlots.map((slot) => slot.itemType))).filter(Boolean)
		: []
	const storageRequests = (buildingInstance.storageRequests ?? warehouseItemTypes) as string[]
	const storageRequestSet = new Set(storageRequests)
	const isTradingRouteBuilding = Boolean(tradeRouteType)
	const tradeOffers = selectedTradeNode?.tradeOffers || []
	const tradeStatusLabel = getTradeStatusLabel(tradeRoute?.status)
	const tradePending = Boolean(tradeRoute?.pendingSelection)
	const tradeCountdownMs = tradeRoute?.outboundRemainingMs ?? tradeRoute?.returnRemainingMs ?? tradeRoute?.cooldownRemainingMs
	const tradeCountdownSeconds = typeof tradeCountdownMs === 'number' ? Math.ceil(tradeCountdownMs / 1000) : null
	const currentTradeNode = tradeRoute ? worldMapData.nodes.find(node => node.id === tradeRoute.nodeId) : null

	// Get resource collection progress from building definition costs and collected resources
	const requiredResources = buildingDefinition.costs || []
	const collectedResources = (buildingInstance.collectedResources as Record<string, number>) || {}
	const completedConstructionMaterials = requiredResources.reduce((count, cost) => (
		(collectedResources[cost.itemType] || 0) >= cost.quantity ? count + 1 : count
	), 0)
	const hasConstructionMaterials = isCollectingResources && requiredResources.length > 0
	const isConstructionInProgress = buildingInstance.stage === ConstructionStage.Constructing
	const showOverview = !isCompleted || hasConstructionMaterials || isConstructionInProgress || occupancyCapacity > 0
	const constructionProgressPercent = Math.round(buildingInstance.progress)

	const handleRequestWorker = () => {
		if (buildingInstance) {
			setErrorMessage(null) // Clear previous errors
			populationService.requestWorker(buildingInstance.id)
		}
	}

	const handleSelectWorkArea = () => {
		if (buildingInstance && isWorkAreaSelecting) {
			EventBus.emit(UiEvents.Building.WorkAreaCancel, {})
			return
		}
		if (buildingInstance) {
			EventBus.emit(UiEvents.Building.WorkAreaSelect, { buildingInstanceId: buildingInstance.id })
		}
	}

	const handleTogglePauseWork = () => {
		if (!isCompleted || !canPauseWork) {
			return
		}
		buildingService.setProductionPaused(buildingInstance.id, !isWorkPaused)
	}

	const handleStorageRequestToggle = (itemType: string) => {
		const current = (buildingInstance.storageRequests ?? warehouseItemTypes) as string[]
		const next = new Set(current)
		if (next.has(itemType)) {
			next.delete(itemType)
		} else {
			next.add(itemType)
		}
		const updated = Array.from(next)
		buildingService.setStorageRequests(buildingInstance.id, updated)
		setBuildingInstance({ ...buildingInstance, storageRequests: updated })
	}

	const professionLabels: Record<ProfessionType, string> = {
		[ProfessionType.Carrier]: 'Carrier',
		[ProfessionType.Builder]: 'Builder',
		[ProfessionType.Prospector]: 'Prospector',
		[ProfessionType.Woodcutter]: 'Woodcutter',
		[ProfessionType.Miner]: 'Miner',
		[ProfessionType.Metallurgist]: 'Metallurgist',
		[ProfessionType.Farmer]: 'Farmer',
		[ProfessionType.Fisher]: 'Fisher',
		[ProfessionType.Miller]: 'Miller',
		[ProfessionType.Baker]: 'Baker',
		[ProfessionType.Vendor]: 'Vendor',
		[ProfessionType.Hunter]: 'Hunter'
	}

	const professionIcons: Record<ProfessionType, string> = {
		[ProfessionType.Carrier]: '👤',
		[ProfessionType.Builder]: '🔨',
		[ProfessionType.Prospector]: '🧭',
		[ProfessionType.Woodcutter]: '🪓',
		[ProfessionType.Miner]: '⛏️',
		[ProfessionType.Metallurgist]: '⚒️',
		[ProfessionType.Farmer]: '🌾',
		[ProfessionType.Fisher]: '🎣',
		[ProfessionType.Miller]: '🌬️',
		[ProfessionType.Baker]: '🥖',
		[ProfessionType.Vendor]: '🛍️',
		[ProfessionType.Hunter]: '🏹'
	}
	const requiredProfessionIcon = hasRequiredProfession
		? (professionIcons[requiredProfessionLabel as ProfessionType] || '👤')
		: '👤'
	const requiredProfessionName = hasRequiredProfession
		? `${requiredProfessionLabel.charAt(0).toUpperCase()}${requiredProfessionLabel.slice(1)}`
		: 'Worker'

	const formatWaitReason = (reason?: string): string | null => {
		if (!reason) {
			return null
		}
		const withSpaces = reason.replace(/_/g, ' ')
		return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1)
	}

	const getWorkerStatusLabel = (settler: Settler): string => {
		switch (settler.state) {
			case SettlerState.Idle:
				return '🟢 Idle'
			case SettlerState.Spawned:
				return '✨ Spawned'
			case SettlerState.Assigned:
				return '📌 Assigned'
			case SettlerState.Moving:
				return '🚶 Moving'
			case SettlerState.MovingToTool:
				return '🚶 Moving to Tool'
			case SettlerState.MovingToBuilding:
				return '🚶 Moving to Building'
			case SettlerState.MovingHome:
				return '🏠 Going Home'
			case SettlerState.Working:
				return '🔨 Working'
			case SettlerState.WaitingForWork:
				return `⏳ Waiting${settler.stateContext.waitReason ? ` (${formatWaitReason(settler.stateContext.waitReason)})` : ''}`
			case SettlerState.Packing:
				return '📦 Packing'
			case SettlerState.Unpacking:
				return '📦 Unpacking'
			case SettlerState.MovingToItem:
				return '🚶 Moving to Item'
			case SettlerState.MovingToResource:
				return '🚶 Moving to Resource'
			case SettlerState.Harvesting:
				return '⛏️ Harvesting'
			case SettlerState.Prospecting:
				return '🧭 Prospecting'
			case SettlerState.CarryingItem:
				return '📦 Carrying Item'
			case SettlerState.AssignmentFailed:
				return '❌ Assignment Failed'
			default:
				return '❓ Unknown'
		}
	}

	const getWorkerProblemReason = (settler: Settler): string | null => {
		if (settler.state === SettlerState.AssignmentFailed) {
			return settler.stateContext.errorReason || 'Assignment failed'
		}
		if (settler.stateContext.errorReason) {
			return settler.stateContext.errorReason
		}
		return null
	}

	const renderRecipeFlow = (recipe: ProductionRecipe): React.ReactNode => {
		const primaryInput = recipe.inputs?.[0]
		const secondaryInput = recipe.inputs?.[1]
		const primaryOutput = recipe.outputs?.[0]

		if (!primaryInput || !primaryOutput) {
			return null
		}

		return (
			<div className={styles.productionRecipeFlow}>
				<div className={styles.productionFlowTile}>
					<StorageResourceTile
						itemType={primaryInput.itemType}
						amountText={`${primaryInput.quantity}x`}
					/>
				</div>
				{secondaryInput ? <span className={styles.productionFlowSymbol}>+</span> : null}
				{secondaryInput ? (
					<div className={styles.productionFlowTile}>
						<StorageResourceTile
							itemType={secondaryInput.itemType}
							amountText={`${secondaryInput.quantity}x`}
						/>
					</div>
				) : null}
				<span className={styles.productionFlowSymbol}>➡️</span>
				<div className={styles.productionFlowTile}>
					<StorageResourceTile
						itemType={primaryOutput.itemType}
						amountText={`${primaryOutput.quantity}x`}
					/>
				</div>
			</div>
		)
	}

	const handleWorkerClick = (settlerId: string) => {
		EventBus.emit(UiEvents.Settler.Click, { settlerId })
	}

	const handleUnassignWorker = (settlerId: string) => {
		populationService.unassignWorker(settlerId)
	}

	const buildingStatusLabel = isConstructing
			? '🔨 Under Construction'
			: isCollectingResources
				? '📦 Collecting Resources'
				: isClearingSite
					? '🪓 Clearing Site'
					: '🏗️ Foundation'
	const overviewStatusLabel = isCompleted ? 'Operational' : buildingStatusLabel

	return (
		<div className={styles.panel}>
			<div className={styles.header}>
				<div className={styles.titleWrap}>
					<span className={styles.titleIcon}>{buildingDefinition.icon || '🏗️'}</span>
					<div>
						<h3 className={styles.title}>{buildingDefinition.name}</h3>
					</div>
				</div>
				<div className={styles.headerActions}>
					<button
						type="button"
						className={styles.headerIconButton}
						onClick={handleFocusBuilding}
						aria-label="Focus building"
						title="Focus building"
					>
						🎯
					</button>
					{canSelectWorkArea ? (
						<button
							type="button"
							className={`${styles.headerIconButton} ${isWorkAreaSelecting ? styles.headerIconButtonActive : ''}`}
							onClick={handleSelectWorkArea}
							aria-label={isWorkAreaSelecting ? 'Cancel work area selection' : 'Select work area'}
							title={isWorkAreaSelecting ? 'Cancel work area selection' : 'Select work area'}
						>
							🗺
						</button>
					) : null}
					{isCompleted && canPauseWork ? (
						<button
							type="button"
							className={`${styles.headerIconButton} ${isWorkPaused ? styles.headerIconButtonActive : ''}`}
							onClick={handleTogglePauseWork}
							aria-label={isWorkPaused ? 'Resume work' : 'Pause work'}
							title={isWorkPaused ? 'Resume work' : 'Pause work'}
						>
							{isWorkPaused ? '▶' : '⏸'}
						</button>
					) : null}
					{hasDestructiveAction ? (
						<>
							<span className={styles.headerActionDivider} aria-hidden="true" />
							<button
								type="button"
								className={`${styles.headerIconButton} ${styles.headerIconButtonDanger}`}
								onClick={canDemolish ? handleDemolishBuilding : handleCancelConstruction}
								aria-label={canDemolish ? 'Demolish building' : 'Cancel construction'}
								title={canDemolish ? 'Demolish building' : 'Cancel construction'}
							>
								🗑
							</button>
							<span className={styles.headerActionDivider} aria-hidden="true" />
						</>
					) : null}
					<button
						type="button"
						className={styles.closeButton}
						onClick={handleClose}
						aria-label="Close building panel"
					>
						×
					</button>
				</div>
			</div>

			<div className={styles.content}>
			{showOverview && (
				<div className={styles.info}>
					<div className={styles.sectionTitle}>Overview</div>
					<div className={styles.infoRow}>
						<span className={styles.label}>Status:</span>
						<span className={styles.value}>{overviewStatusLabel}</span>
					</div>

					{hasConstructionMaterials && (
						<>
							<div className={styles.infoRow}>
								<span className={styles.label}>Materials:</span>
								<span className={styles.value}>{completedConstructionMaterials}/{requiredResources.length} ready</span>
							</div>
							<div className={styles.materialsGrid}>
								{requiredResources.map((cost) => {
									const collected = collectedResources[cost.itemType] || 0
									const required = cost.quantity
									return (
										<StorageResourceTile
											key={`${cost.itemType}-${required}`}
											itemType={cost.itemType}
											amountText={`${collected}/${required}`}
											isComplete={collected >= required}
										/>
									)
								})}
							</div>
						</>
					)}

					{isConstructionInProgress && (
						<div className={styles.progressRow}>
							<ProgressBarRow
								label="Construction Progress"
								percent={constructionProgressPercent}
								valueLabel={`${constructionProgressPercent}%`}
							/>
						</div>
					)}

					{occupancyCapacity > 0 && (
						<div className={styles.infoRow}>
							<span className={styles.label}>Occupancy:</span>
							<span className={styles.value}>
								{currentOccupancy} / {occupancyCapacity}
							</span>
						</div>
					)}
				</div>
			)}

			{showWorkforceSection && (
				<div className={styles.info}>
					<div className={styles.sectionHeaderRow}>
						<div className={styles.sectionTitle}>Workforce</div>
						<div className={styles.sectionHeaderMeta}>{workforceHeaderMeta}</div>
					</div>
					<div className={styles.workerList}>
						{assignedWorkers.map((settler, index) => {
							const problemReason = getWorkerProblemReason(settler)
							return (
								<div key={settler.id} className={styles.workerRow}>
									<button
										type="button"
										className={styles.workerRowButton}
										onClick={() => handleWorkerClick(settler.id)}
										title="Open settler details"
									>
										<span className={styles.workerInfo}>
											<span className={styles.workerIcon}>{professionIcons[settler.profession]}</span>
											<span className={styles.workerName} title={settler.id}>
												{professionLabels[settler.profession]} #{index + 1}
											</span>
										</span>
										<span className={styles.workerMeta}>
											{getWorkerStatusLabel(settler)}
											{problemReason && (
												<span className={styles.workerDanger} title={problemReason}>⚠️</span>
											)}
										</span>
									</button>
									<button
										type="button"
										className={styles.workerUnassignButton}
										onClick={() => handleUnassignWorker(settler.id)}
										title="Unassign worker"
									>
										✕
									</button>
								</div>
							)
						})}
						{Array.from({ length: emptyWorkerSlots }).map((_, index) => (
							<div key={`empty-slot-${index}`} className={styles.workerRow}>
								<div className={`${styles.workerRowButton} ${styles.workerRowPlaceholder}`}>
									<span className={styles.workerInfo}>
										<span className={styles.workerIcon}>{requiredProfessionIcon}</span>
										<span className={styles.workerName}>
											{requiredProfessionName} slot
										</span>
									</span>
									<span className={styles.workerMeta}>{emptyWorkerStatusLabel}</span>
								</div>
								{canRequestWorker ? (
									<button
										type="button"
										className={styles.workerAssignButton}
										onClick={handleRequestWorker}
										title="Request worker"
									>
										+
									</button>
								) : null}
							</div>
						))}
					</div>

					{errorMessage && (
						<div className={styles.errorMessage}>
							⚠️ {errorMessage}
						</div>
					)}
				</div>
			)}

			{isCompleted && isHouse && (
				<div className={styles.info}>
					<div className={styles.sectionHeaderRow}>
						<div className={styles.sectionTitle}>Residents</div>
						<div className={styles.sectionHeaderMeta}>
							{houseInhabitants.length}
							{houseCapacity > 0 ? ` / ${houseCapacity}` : ''}
						</div>
					</div>
					{houseInhabitants.length > 0 ? (
						<div className={styles.workerList}>
							{houseInhabitants.map((settler, index) => (
								<div key={settler.id} className={styles.workerRow}>
									<button
										type="button"
										className={styles.workerRowButton}
										onClick={() => handleWorkerClick(settler.id)}
										title="Open settler details"
									>
										<span className={styles.workerInfo}>
											<span className={styles.workerIcon}>{professionIcons[settler.profession]}</span>
											<span className={styles.workerName} title={settler.id}>
												{professionLabels[settler.profession]} #{index + 1}
											</span>
										</span>
										<span className={styles.workerMeta}>{getWorkerStatusLabel(settler)}</span>
									</button>
								</div>
							))}
						</div>
					) : (
						<div className={styles.workerHint}>No residents yet</div>
					)}
				</div>
			)}

			{showDemolishConfirm && (
				<div className={confirmStyles.overlay} onClick={handleCancelDemolish}>
					<div className={confirmStyles.modal} onClick={(event) => event.stopPropagation()}>
						<div className={confirmStyles.titleRow}>
							<span className={confirmStyles.icon}>⚠️</span>
							<h2>Demolish {buildingDefinition.name}?</h2>
						</div>
						<p className={confirmStyles.message}>
							This will permanently remove the building and drop 50% of its construction costs on the ground.
						</p>
						<div className={confirmStyles.actions}>
							<button
								type="button"
								className={confirmStyles.cancelButton}
								onClick={handleCancelDemolish}
							>
								Keep Building
							</button>
							<button
								type="button"
								className={confirmStyles.confirmButton}
								onClick={handleConfirmDemolish}
							>
								Demolish
							</button>
						</div>
					</div>
				</div>
			)}

			{isCompleted && isTradingRouteBuilding && (
				<div className={styles.info}>
					<div className={styles.sectionTitle}>Trade</div>
					<div className={styles.infoRow}>
						<span className={styles.label}>Reputation:</span>
						<span className={styles.value}>{reputation}</span>
					</div>
					<div className={styles.infoRow}>
						<span className={styles.label}>Route status:</span>
						<span className={styles.value}>
							{tradeStatusLabel}
							{tradeCountdownSeconds !== null ? ` (${tradeCountdownSeconds}s)` : ''}
						</span>
					</div>
					<div className={styles.tradeControls}>
						{tradeNodes.length === 0 ? (
							<div className={styles.tradeHint}>No reachable trade nodes yet.</div>
						) : (
							<>
								<label className={styles.tradeLabel} htmlFor="trade-destination">Destination</label>
								<select
									id="trade-destination"
									className={styles.tradeSelect}
									value={selectedTradeNodeId}
									onChange={handleTradeNodeChange}
								>
									{!selectedTradeNodeId && (
										<option value="" disabled>
											Select a destination...
										</option>
									)}
									{tradeNodes.map((node) => (
										<option key={node.id} value={node.id}>
											{node.label}
										</option>
									))}
								</select>
								<label className={styles.tradeLabel} htmlFor="trade-offer">Offer</label>
								<select
									id="trade-offer"
									className={styles.tradeSelect}
									value={selectedTradeOfferId}
									onChange={handleTradeOfferChange}
								>
									{!selectedTradeOfferId && (
										<option value="" disabled>
											Select an offer...
										</option>
									)}
									{tradeOffers.map((offer) => (
										<option key={offer.id} value={offer.id}>
											{formatTradeOffer(offer)}
										</option>
									))}
								</select>
								<div className={styles.tradeButtons}>
									<button
										type="button"
										className={styles.tradeButton}
										onClick={handleSetTradeRoute}
										disabled={!selectedTradeNodeId || !selectedTradeOfferId}
									>
										{tradeRoute ? 'Queue Route' : 'Set Route'}
									</button>
									{tradeRoute ? (
										<button
											type="button"
											className={styles.tradeButtonSecondary}
											onClick={handleCancelTradeRoute}
										>
											Clear
										</button>
									) : null}
								</div>
							</>
						)}
						{tradeRoute ? (
							<div className={styles.tradeHint}>
								Current: {currentTradeNode?.label || tradeRoute.nodeId} · {formatTradeOffer(tradeRoute.offer)}
							</div>
						) : (
							<div className={styles.tradeHint}>
								Select a destination to begin trading.
							</div>
						)}
						{tradePending ? (
							<div className={styles.tradeHint}>
								Route change queued after current shipment.
							</div>
						) : null}
					</div>
				</div>
			)}

			{isCompleted && isWarehouse && warehouseItemTypes.length > 0 && (
				<div className={styles.info}>
					<div className={styles.sectionTitle}>Logistics</div>
					<div className={styles.infoRow}>
						<span className={styles.label}>Auto-deliver (low priority):</span>
						<span className={styles.value}>
							<div className={styles.storageToggleList}>
								{warehouseItemTypes.map((itemType) => (
									<label key={itemType} className={styles.storageToggleRow}>
										<input
											type="checkbox"
											className={styles.storageToggleCheckbox}
											checked={storageRequestSet.has(itemType)}
											onChange={() => handleStorageRequestToggle(itemType)}
										/>
										<span className={styles.storageToggleLabel}>
											<ItemEmoji itemType={itemType} />
											<span>{itemType}</span>
										</span>
									</label>
								))}
							</div>
						</span>
					</div>
				</div>
			)}

			{isCompleted && productionRecipes.length > 0 && (
				<div className={styles.info}>
					{(() => {
						const production = productionService.getBuildingProduction(buildingInstance.id)
						const status = production?.status || ProductionStatus.Idle
						const progress = production?.progress || 0
						const currentRecipe = production?.currentRecipe
						const singleRecipe = productionRecipes.length === 1 ? productionRecipes[0] : null

						const statusLabel = (() => {
							if (status === ProductionStatus.InProduction) {
								return `🔄 ${Math.round(progress)}%`
							}
							if (status === ProductionStatus.NoInput) {
								return '⏸ Waiting inputs'
							}
							if (status === ProductionStatus.NoWorker) {
								return '👷 Needs worker'
							}
							if (status === ProductionStatus.Paused) {
								return '⏸ Paused'
							}
							return 'Idle'
						})()

						return (
							<>
								<div className={styles.sectionHeaderRow}>
									<div className={styles.sectionTitle}>Production</div>
									<div className={styles.sectionHeaderMeta}>{statusLabel}</div>
								</div>
								<div className={styles.productionBody}>
									<div className={styles.productionPanel}>
										{status === ProductionStatus.InProduction && (currentRecipe || singleRecipe) && (
											<div className={styles.productionStatusDetail}>
												{renderRecipeFlow((currentRecipe || singleRecipe) as ProductionRecipe)}
											</div>
										)}
										{status === ProductionStatus.NoInput && singleRecipe && (
											<div className={styles.productionStatusDetail}>
												{renderRecipeFlow(singleRecipe)}
											</div>
										)}
										{productionRecipes.length > 1 && (
											<div className={styles.productionPlan}>
												<label className={styles.productionPlanGlobal}>
													<input
														type="checkbox"
														checked={useGlobalProductionPlan}
														onChange={handleUseGlobalToggle}
													/>
													<span>Use global weights</span>
												</label>
												{productionRecipes.map((recipe) => {
													const weight = uiProductionPlan[recipe.id] ?? 0
													const isEnabled = weight > 0
													return (
														<div key={recipe.id} className={styles.productionPlanRecipe}>
															<div className={styles.productionPlanHeader}>
																<label className={styles.productionPlanToggle}>
																	<input
																		type="checkbox"
																		checked={isEnabled}
																		onChange={() => handlePlanToggle(recipe.id)}
																	/>
																	<span>Enabled</span>
																</label>
																<span className={styles.productionPlanWeight}>{Math.round(weight)}%</span>
															</div>
															<div className={styles.productionPlanFlow}>
																{renderRecipeFlow(recipe)}
															</div>
															<input
																type="range"
																min={0}
																max={100}
																step={1}
																value={Math.round(weight)}
																disabled={!isEnabled}
																onChange={(event) => handlePlanWeightChange(recipe.id, Number(event.target.value))}
																className={styles.productionPlanSlider}
															/>
														</div>
													)
												})}
											</div>
										)}
									</div>
								</div>
							</>
						)
					})()}
				</div>
			)}

			{isCompleted && buildingDefinition.storageSlots?.length && (
				<div className={styles.info}>
					<div className={styles.sectionTitle}>Storage</div>
					<div className={styles.storageGrid}>
						{bufferItemTypes
							.filter((itemType) => Boolean(itemType))
							.map((itemType) => {
								const capacity = storageService.getStorageCapacity(buildingInstance.id, itemType)
								const quantity = storageService.getItemQuantity(buildingInstance.id, itemType)
								return (
									<StorageResourceTile
										key={itemType}
										itemType={itemType}
										amountText={`${quantity}/${capacity}`}
										isComplete={capacity > 0 && quantity >= capacity}
									/>
								)
							})}
					</div>
				</div>
			)}

			{isCompleted && !buildingDefinition.storageSlots?.length && productionRecipes.length === 0 && !buildingDefinition.harvest && !buildingDefinition.farm && (
				<div className={styles.actions}>
					<div className={styles.completedMessage}>
						Building is ready for use
					</div>
				</div>
			)}
			</div>
		</div>
	)
}
