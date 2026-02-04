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
import { DraggablePanel } from './DraggablePanel'
import styles from './BuildingInfoPanel.module.css'
import sharedStyles from './PanelShared.module.css'
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
	let diff = 100 - scaled.reduce((sum, value) => sum + value, 0)
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
	let diff = targetOtherTotal - scaled.reduce((sum, value) => sum + value, 0)
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

export const BuildingInfoPanel: React.FC = () => {
	const [isVisible, setIsVisible] = useState(false)
	const [buildingInstance, setBuildingInstance] = useState<BuildingInstance | null>(null)
	const [buildingDefinition, setBuildingDefinition] = useState<BuildingDefinition | null>(null)
	const [errorMessage, setErrorMessage] = useState<string | null>(null)
	const [workerStatus, setWorkerStatus] = useState<string | null>(null)
	const [showDemolishConfirm, setShowDemolishConfirm] = useState(false)
	const [tradeRoute, setTradeRoute] = useState<TradeRouteState | null>(null)
	const [tradeReputation, setTradeReputation] = useState(0)
	const [selectedTradeNodeId, setSelectedTradeNodeId] = useState('')
	const [selectedTradeOfferId, setSelectedTradeOfferId] = useState('')

	const tradeNodes = useMemo(() => {
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
				if (link.type !== 'land') continue
				const neighbor = link.fromId === current ? link.toId : link.toId === current ? link.fromId : null
				if (!neighbor || visited.has(neighbor)) continue
				visited.add(neighbor)
				queue.push(neighbor)
			}
		}
		return nodes.filter(node => node.id !== worldMapData.homeNodeId && visited.has(node.id) && (node.tradeOffers || []).length > 0)
	}, [])

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
			setWorkerStatus(null) // Clear any previous status
			setShowDemolishConfirm(false)
			setIsVisible(true)
			EventBus.emit(UiEvents.Building.Highlight, { buildingInstanceId: data.buildingInstance.id, highlighted: true })
			// Close settler panel if open
			EventBus.emit(UiEvents.Settler.Close)
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
				EventBus.emit(UiEvents.Building.Highlight, { buildingInstanceId: buildingInstance.id, highlighted: false })
				setBuildingInstance(null)
				setBuildingDefinition(null)
			}
		}

		// Listen for close panel event
		const handleClosePanel = () => {
			setIsVisible(false)
			setShowDemolishConfirm(false)
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

		// Check if any settler is moving to this building
		const checkWorkerMovingToBuilding = () => {
			if (buildingInstance) {
				const settlers = populationService.getSettlers()
				const workerMoving = settlers.find(
					s => s.state === SettlerState.MovingToBuilding &&
					s.stateContext.targetId === buildingInstance.id
				)
				if (workerMoving) {
					setWorkerStatus('Worker is moving to building...')
					setErrorMessage(null) // Clear any errors
				}
			}
		}

		// Listen for worker assigned
		const handleWorkerAssigned = (data: { buildingInstanceId: string, settlerId: string }) => {
			if (buildingInstance && buildingInstance.id === data.buildingInstanceId) {
				const isConstruction = buildingInstance.stage === ConstructionStage.CollectingResources || buildingInstance.stage === ConstructionStage.Constructing
				setWorkerStatus(isConstruction ? 'Worker assigned! Construction speeded up.' : 'Worker assigned! Building is now operational.')
				setErrorMessage(null) // Clear any errors
				// Clear status after 3 seconds
				setTimeout(() => setWorkerStatus(null), 3000)
				// Force re-render to update worker count
				setBuildingInstance({ ...buildingInstance })
			}
		}

		// Listen for worker unassigned
		const handleWorkerUnassigned = (data: { settlerId: string }) => {
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
		const handleStorageUpdated = (data: { buildingInstanceId: string, storage: any }) => {
			if (buildingInstance && buildingInstance.id === data.buildingInstanceId) {
				// Force re-render to show updated storage
				setBuildingInstance({ ...buildingInstance })
			}
		}

		// Listen for production updates
		const handleProductionUpdated = (data: { buildingInstanceId: string, production: any }) => {
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
		EventBus.on(UiEvents.Population.SettlerUpdated, checkWorkerMovingToBuilding)
		EventBus.on(UiEvents.Population.WorkerAssigned, handleWorkerAssigned)
		EventBus.on(UiEvents.Population.WorkerUnassigned, handleWorkerUnassigned)
		EventBus.on(UiEvents.Storage.Updated, handleStorageUpdated)
		EventBus.on(UiEvents.Production.Updated, handleProductionUpdated)

		// Check immediately when building is selected
		checkWorkerMovingToBuilding()

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
			EventBus.off(UiEvents.Population.SettlerUpdated, checkWorkerMovingToBuilding)
			EventBus.off(UiEvents.Population.WorkerAssigned, handleWorkerAssigned)
			EventBus.off(UiEvents.Population.WorkerUnassigned, handleWorkerUnassigned)
			EventBus.off(UiEvents.Storage.Updated, handleStorageUpdated)
			EventBus.off(UiEvents.Production.Updated, handleProductionUpdated)
		}
	}, [buildingInstance])

	useEffect(() => {
		if (!buildingInstance || !buildingDefinition?.isTradingPost) {
			setTradeRoute(null)
			return
		}

		tradeService.requestRoutes()
		const route = tradeService.getRoute(buildingInstance.id) || null
		setTradeRoute(route)
		setTradeReputation(tradeService.getReputation(buildingInstance.playerId))

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
	}, [buildingInstance?.id, buildingDefinition?.isTradingPost, tradeNodes])

	useEffect(() => {
		if (!buildingInstance || !buildingDefinition?.isTradingPost) {
			return
		}

		const handleTradeUpdated = () => {
			setTradeRoute(tradeService.getRoute(buildingInstance.id) || null)
			setTradeReputation(tradeService.getReputation(buildingInstance.playerId))
		}

		EventBus.on(UiEvents.Trade.Updated, handleTradeUpdated)
		return () => {
			EventBus.off(UiEvents.Trade.Updated, handleTradeUpdated)
		}
	}, [buildingInstance?.id, buildingInstance?.playerId, buildingDefinition?.isTradingPost])

	const handleCancelConstruction = () => {
		if (buildingInstance && (buildingInstance.stage === ConstructionStage.CollectingResources || buildingInstance.stage === ConstructionStage.Constructing)) {
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
		setBuildingInstance(null)
		setBuildingDefinition(null)
		EventBus.emit(UiEvents.Building.Close)
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

	if (!isVisible || !buildingInstance || !buildingDefinition) {
		return null
	}

	const canCancel = buildingInstance.stage === ConstructionStage.CollectingResources || buildingInstance.stage === ConstructionStage.Constructing
	const isCompleted = buildingInstance.stage === ConstructionStage.Completed
	const canDemolish = isCompleted
	const isConstructing = buildingInstance.stage === ConstructionStage.Constructing
	const isCollectingResources = buildingInstance.stage === ConstructionStage.CollectingResources
	const hasWorkerSlots = buildingDefinition.workerSlots !== undefined
	const canPauseWork = Boolean((productionRecipes.length > 0) || buildingDefinition.harvest || buildingDefinition.farm)
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
	const workingWorkers = assignedWorkers.filter(
		settler => settler.state === SettlerState.Working || settler.state === SettlerState.Harvesting
	)
	const movingWorkers = assignedWorkers.filter(
		settler => settler.state === SettlerState.MovingToBuilding || settler.state === SettlerState.MovingToResource || settler.state === SettlerState.MovingToTool
	)
	const workerCount = assignedWorkers.length
	const queuedWorkers = buildingInstance.pendingWorkers ?? 0
	const maxWorkers = buildingDefinition.workerSlots || 0
	const workerMetaParts: string[] = []
	if (workingWorkers.length > 0) {
		workerMetaParts.push(`${workingWorkers.length} active`)
	}
	if (movingWorkers.length > 0) {
		workerMetaParts.push(`${movingWorkers.length} en route`)
	}
	if (queuedWorkers > 0) {
		workerMetaParts.push(`${queuedWorkers} queued`)
	}
	// Buildings only need workers during Constructing stage (builders) or Completed stage (production workers)
	// During CollectingResources, carriers are automatically requested by the system
	const needsWorkers = buildingInstance.stage === ConstructionStage.Constructing ||
		(isCompleted && hasWorkerSlots && workerCount < maxWorkers)
	const requiredProfessionLabel = isConstructing ? 'builder' : buildingDefinition.requiredProfession
	const hasRequiredProfession = requiredProfessionLabel !== undefined
	const workAreaRadiusTiles = buildingDefinition.farm?.plotRadiusTiles ?? buildingDefinition.harvest?.radiusTiles
	const canSelectWorkArea = isCompleted && typeof workAreaRadiusTiles === 'number' && workAreaRadiusTiles > 0
	const isWarehouse = Boolean(buildingDefinition.isWarehouse)
	const warehouseItemTypes = isWarehouse && buildingDefinition.storageSlots?.length
		? Array.from(new Set(buildingDefinition.storageSlots.map((slot) => slot.itemType))).filter(Boolean)
		: []
	const storageRequests = (buildingInstance.storageRequests ?? warehouseItemTypes) as string[]
	const storageRequestSet = new Set(storageRequests)
	const isTradingPost = Boolean(buildingDefinition.isTradingPost)
	const tradeOffers = selectedTradeNode?.tradeOffers || []
	const tradeStatusLabel = getTradeStatusLabel(tradeRoute?.status)
	const tradePending = Boolean(tradeRoute?.pendingSelection)
	const tradeCountdownMs = tradeRoute?.outboundRemainingMs ?? tradeRoute?.returnRemainingMs ?? tradeRoute?.cooldownRemainingMs
	const tradeCountdownSeconds = typeof tradeCountdownMs === 'number' ? Math.ceil(tradeCountdownMs / 1000) : null
	const currentTradeNode = tradeRoute ? worldMapData.nodes.find(node => node.id === tradeRoute.nodeId) : null

	// Get resource collection progress from building definition costs and collected resources
	const requiredResources = buildingDefinition.costs || []
	const collectedResources = (buildingInstance.collectedResources as Record<string, number>) || {}

	const handleRequestWorker = () => {
		if (buildingInstance) {
			setErrorMessage(null) // Clear previous errors
			setWorkerStatus(null) // Clear previous status
			populationService.requestWorker(buildingInstance.id)
		}
	}

	const handleSelectWorkArea = () => {
		if (buildingInstance) {
			EventBus.emit(UiEvents.Building.WorkAreaSelect, { buildingInstanceId: buildingInstance.id })
		}
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
		[ProfessionType.Woodcutter]: 'Woodcutter',
		[ProfessionType.Miner]: 'Miner',
		[ProfessionType.Metallurgist]: 'Metallurgist',
		[ProfessionType.Farmer]: 'Farmer',
		[ProfessionType.Miller]: 'Miller',
		[ProfessionType.Baker]: 'Baker',
		[ProfessionType.Vendor]: 'Vendor'
	}

	const professionIcons: Record<ProfessionType, string> = {
		[ProfessionType.Carrier]: '👤',
		[ProfessionType.Builder]: '🔨',
		[ProfessionType.Woodcutter]: '🪓',
		[ProfessionType.Miner]: '⛏️',
		[ProfessionType.Metallurgist]: '⚒️',
		[ProfessionType.Farmer]: '🌾',
		[ProfessionType.Miller]: '🌬️',
		[ProfessionType.Baker]: '🥖',
		[ProfessionType.Vendor]: '🛍️'
	}

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

	const handleWorkerClick = (settlerId: string) => {
		EventBus.emit(UiEvents.Settler.Click, { settlerId })
	}

	const handleUnassignWorker = (settlerId: string) => {
		populationService.unassignWorker(settlerId)
	}

	return (
		<DraggablePanel
			icon={buildingDefinition.icon || '🏗️'}
			title={buildingDefinition.name}
			onClose={handleClose}
		>
			<div className={sharedStyles.description}>
				{buildingDefinition.description}
			</div>

			<div className={sharedStyles.info}>
				<div className={sharedStyles.infoRow}>
					<span className={sharedStyles.label}>Status:</span>
					<span className={sharedStyles.value}>
						{isCompleted ? '✅ Completed' : isConstructing ? '🔨 Under Construction' : isCollectingResources ? '📦 Collecting Resources' : '🏗️ Foundation'}
					</span>
				</div>

				{isCollectingResources && requiredResources.length > 0 && (
					<div className={sharedStyles.infoRow}>
						<span className={sharedStyles.label}>Resources:</span>
						<span className={sharedStyles.value}>
							<div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
								{requiredResources.map((cost, index) => {
									const collected = collectedResources[cost.itemType] || 0
									const required = cost.quantity
									const isComplete = collected >= required
									return (
										<div key={index} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
											<ItemEmoji itemType={cost.itemType} />
											<span style={{ color: isComplete ? '#4caf50' : '#fff' }}>
												{collected}/{required} {cost.itemType}
											</span>
										</div>
									)
								})}
							</div>
						</span>
					</div>
				)}

				{buildingInstance.stage === ConstructionStage.Constructing && (
					<div className={sharedStyles.infoRow}>
						<span className={sharedStyles.label}>Construction Progress:</span>
						<span className={sharedStyles.value}>{Math.round(buildingInstance.progress)}%</span>
					</div>
				)}
			</div>

			{(hasWorkerSlots || assignedWorkers.length > 0) && (
				<div className={sharedStyles.info}>
					<div className={sharedStyles.infoRow}>
						<span className={sharedStyles.label}>Workers:</span>
						<span className={sharedStyles.value}>
							{workerCount}
							{workerMetaParts.length > 0 && ` (${workerMetaParts.join(', ')})`}
							{hasWorkerSlots && ` / ${maxWorkers}`}
						</span>
					</div>
					{workerCount > 0 ? (
						<div className={sharedStyles.workerList}>
							{assignedWorkers.map((settler, index) => {
								const problemReason = getWorkerProblemReason(settler)
								return (
									<div key={settler.id} className={sharedStyles.workerRow}>
										<button
											type="button"
											className={sharedStyles.workerRowButton}
											onClick={() => handleWorkerClick(settler.id)}
											title="Open settler details"
										>
											<span className={sharedStyles.workerInfo}>
												<span className={sharedStyles.workerIcon}>{professionIcons[settler.profession]}</span>
												<span className={sharedStyles.workerName} title={settler.id}>
													{professionLabels[settler.profession]} #{index + 1}
												</span>
											</span>
											<span className={sharedStyles.workerMeta}>
												{getWorkerStatusLabel(settler)}
												{problemReason && (
													<span className={sharedStyles.workerDanger} title={problemReason}>⚠️</span>
												)}
											</span>
										</button>
										<button
											type="button"
											className={sharedStyles.workerUnassignButton}
											onClick={() => handleUnassignWorker(settler.id)}
											title="Unassign worker"
										>
											✕
										</button>
									</div>
								)
							})}
						</div>
					) : (
						<div className={sharedStyles.workerHint}>
							{queuedWorkers > 0
								? `${queuedWorkers} worker${queuedWorkers === 1 ? '' : 's'} queued`
								: 'No workers assigned yet'}
						</div>
					)}
				</div>
			)}

			{needsWorkers && (
				<div className={sharedStyles.actions}>
					{hasRequiredProfession && (
						<div className={sharedStyles.infoRow}>
							<span className={sharedStyles.label}>Required Profession:</span>
							<span className={sharedStyles.value}>{requiredProfessionLabel}</span>
						</div>
					)}
					{isConstructing && (
						<div className={sharedStyles.workerHint}>
							🔍 Searching for available builder...
						</div>
					)}
					{isCompleted && hasWorkerSlots && workerCount < maxWorkers && (
						<>
							<button
								className={sharedStyles.requestWorkerButton}
								onClick={handleRequestWorker}
								disabled={workerCount >= maxWorkers}
							>
								Request Worker
							</button>
							{errorMessage && (
								<div className={sharedStyles.errorMessage}>
									⚠️ {errorMessage}
								</div>
							)}
							{workerStatus && !errorMessage && (
								<div className={sharedStyles.workerStatus}>
									{workerStatus}
								</div>
							)}
							{!errorMessage && !workerStatus && (
								<div className={sharedStyles.workerHint}>
									Workers will operate this building
								</div>
							)}
						</>
					)}
				</div>
			)}

			{canCancel && (
				<div className={sharedStyles.actions}>
					<button className={sharedStyles.cancelButton} onClick={handleCancelConstruction}>
						Cancel Construction
					</button>
					<div className={sharedStyles.cancelHint}>
						Resources will be refunded to your inventory
					</div>
				</div>
			)}

			{canDemolish && (
				<div className={sharedStyles.actions}>
					<button className={sharedStyles.cancelButton} onClick={handleDemolishBuilding}>
						Demolish Building
					</button>
					<div className={sharedStyles.cancelHint}>
						Drops 50% of construction costs on the ground
					</div>
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

			{isCompleted && buildingDefinition.storageSlots?.length && (
				<div className={sharedStyles.info}>
					<div className={sharedStyles.infoRow}>
						<span className={sharedStyles.label}>Buffer:</span>
						<span className={sharedStyles.value}>
							<div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
								{bufferItemTypes
									.filter((itemType) => Boolean(itemType))
									.map((itemType) => {
										const capacity = storageService.getStorageCapacity(buildingInstance.id, itemType)
										const quantity = storageService.getItemQuantity(buildingInstance.id, itemType)
										const percentage = capacity > 0 ? Math.round((quantity / capacity) * 100) : 0
										return (
											<div key={itemType} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
												<ItemEmoji itemType={itemType} />
												<span>
													{quantity}/{capacity} {itemType} ({percentage}%)
												</span>
											</div>
										)
									})}
							</div>
						</span>
					</div>
				</div>
			)}

			{isCompleted && isTradingPost && (
				<div className={sharedStyles.info}>
					<div className={sharedStyles.infoRow}>
						<span className={sharedStyles.label}>Trade reputation:</span>
						<span className={sharedStyles.value}>{tradeReputation}</span>
					</div>
					<div className={sharedStyles.infoRow}>
						<span className={sharedStyles.label}>Route status:</span>
						<span className={sharedStyles.value}>
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
				<div className={sharedStyles.info}>
					<div className={sharedStyles.infoRow}>
						<span className={sharedStyles.label}>Auto-deliver (low priority):</span>
						<span className={sharedStyles.value}>
							<div className={sharedStyles.storageToggleList}>
								{warehouseItemTypes.map((itemType) => (
									<label key={itemType} className={sharedStyles.storageToggleRow}>
										<input
											type="checkbox"
											className={sharedStyles.storageToggleCheckbox}
											checked={storageRequestSet.has(itemType)}
											onChange={() => handleStorageRequestToggle(itemType)}
										/>
										<span className={sharedStyles.storageToggleLabel}>
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
				<div className={sharedStyles.info}>
					<div className={sharedStyles.infoRow}>
						<span className={sharedStyles.label}>Production:</span>
						<span className={sharedStyles.value}>
							{(() => {
								const production = productionService.getBuildingProduction(buildingInstance.id)
								const status = production?.status || ProductionStatus.Idle
								const progress = production?.progress || 0
								const isPaused = status === ProductionStatus.Paused
								const currentRecipe = production?.currentRecipe
								const singleRecipe = productionRecipes.length === 1 ? productionRecipes[0] : null

								let statusContent: React.ReactNode
								if (status === ProductionStatus.InProduction) {
									statusContent = (
										<div className={styles.productionStatus}>
											<span>🔄 Producing... {Math.round(progress)}%</span>
											{currentRecipe && productionRecipes.length > 1 && (
												<div className={styles.productionStatusDetail}>
													<span>Current:</span>
													{currentRecipe.outputs.map((output, idx) => (
														<span key={`${output.itemType}-${idx}`} className={styles.productionStatusItem}>
															<ItemEmoji itemType={output.itemType} />
															{output.quantity}x {output.itemType}
														</span>
													))}
												</div>
											)}
											{singleRecipe && (
												<div className={styles.productionStatusDetail}>
													<span>Inputs:</span>
													{singleRecipe.inputs.map((input, idx) => (
														<span key={`${input.itemType}-${idx}`} className={styles.productionStatusItem}>
															<ItemEmoji itemType={input.itemType} />
															{input.quantity}x {input.itemType}
														</span>
													))}
													<span>Outputs:</span>
													{singleRecipe.outputs.map((output, idx) => (
														<span key={`${output.itemType}-${idx}`} className={styles.productionStatusItem}>
															<ItemEmoji itemType={output.itemType} />
															{output.quantity}x {output.itemType}
														</span>
													))}
												</div>
											)}
										</div>
									)
								} else if (status === ProductionStatus.NoInput) {
									statusContent = (
										<div className={styles.productionStatus}>
											<span>⏸️ Waiting for inputs</span>
											{singleRecipe && (
												<div className={styles.productionStatusDetail}>
													{singleRecipe.inputs.map((input, idx) => (
														<span key={`${input.itemType}-${idx}`} className={styles.productionStatusItem}>
															<ItemEmoji itemType={input.itemType} />
															Need {input.quantity}x {input.itemType}
														</span>
													))}
												</div>
											)}
										</div>
									)
								} else if (status === ProductionStatus.NoWorker) {
									statusContent = <span>👷 Needs worker</span>
								} else if (status === ProductionStatus.Paused) {
									statusContent = <span>⏸️ Paused</span>
								} else {
									statusContent = <span>✅ Idle</span>
								}

								return (
									<div className={styles.productionPanel}>
										{statusContent}
										<button
											className={sharedStyles.actionButton}
											onClick={() => buildingService.setProductionPaused(buildingInstance.id, !isPaused)}
										>
											{isPaused ? 'Resume Production' : 'Pause Production'}
										</button>
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
																	<span className={styles.productionPlanTitle}>
																		{recipe.outputs.map((output, idx) => (
																			<span key={`${recipe.id}-out-${idx}`} className={styles.productionPlanItem}>
																				<ItemEmoji itemType={output.itemType} />
																				{output.quantity}x {output.itemType}
																			</span>
																		))}
																	</span>
																</label>
																<span className={styles.productionPlanWeight}>{Math.round(weight)}%</span>
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
															<div className={styles.productionPlanDetails}>
																<div>
																	<span>Inputs:</span>
																	{recipe.inputs.map((input, idx) => (
																		<span key={`${recipe.id}-in-${idx}`} className={styles.productionPlanItem}>
																			<ItemEmoji itemType={input.itemType} />
																			{input.quantity}x {input.itemType}
																		</span>
																	))}
																</div>
																<div>
																	<span>Outputs:</span>
																	{recipe.outputs.map((output, idx) => (
																		<span key={`${recipe.id}-out-detail-${idx}`} className={styles.productionPlanItem}>
																			<ItemEmoji itemType={output.itemType} />
																			{output.quantity}x {output.itemType}
																		</span>
																	))}
																</div>
															</div>
														</div>
													)
												})}
											</div>
										)}
									</div>
								)
							})()}
						</span>
					</div>
				</div>
			)}

			{isCompleted && productionRecipes.length === 0 && canPauseWork && (
				<div className={sharedStyles.info}>
					<div className={sharedStyles.infoRow}>
						<span className={sharedStyles.label}>Work:</span>
						<span className={sharedStyles.value}>
							{(() => {
								const status = productionService.getProductionStatus(buildingInstance.id)
								const isPaused = status === ProductionStatus.Paused
								let statusLabel = '✅ Active'
								if (status === ProductionStatus.Paused) {
									statusLabel = '⏸️ Paused'
								} else if (status === ProductionStatus.NoWorker) {
									statusLabel = '👷 Needs worker'
								}
								return (
									<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
										<span>{statusLabel}</span>
										<button
											className={sharedStyles.actionButton}
											onClick={() => buildingService.setProductionPaused(buildingInstance.id, !isPaused)}
										>
											{isPaused ? 'Resume Work' : 'Pause Work'}
										</button>
									</div>
								)
							})()}
						</span>
					</div>
				</div>
			)}

			{canSelectWorkArea && (
				<div className={sharedStyles.info}>
					<div className={sharedStyles.infoRow}>
						<span className={sharedStyles.label}>Work Area:</span>
						<span className={sharedStyles.value}>
							<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
								<span>Radius: {workAreaRadiusTiles} tiles</span>
								<button
									className={sharedStyles.actionButton}
									onClick={handleSelectWorkArea}
								>
									Select Work Area
								</button>
							</div>
						</span>
					</div>
				</div>
			)}

			{isCompleted && !buildingDefinition.storageSlots?.length && productionRecipes.length === 0 && !buildingDefinition.harvest && !buildingDefinition.farm && (
				<div className={sharedStyles.actions}>
					<div className={sharedStyles.completedMessage}>
						Building is ready for use
					</div>
				</div>
			)}
		</DraggablePanel>
	)
}
