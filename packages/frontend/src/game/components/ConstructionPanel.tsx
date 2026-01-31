import React, { useState, useEffect } from 'react'
import { EventBus } from '../EventBus'
import { Event, BuildingCategory, BuildingDefinition, RoadType } from '@rugged/game'
import { itemService } from '../services/ItemService'
import styles from './ConstructionPanel.module.css'

// Try to load content - this is a fallback, server catalog is primary source
const CONTENT_FOLDER = import.meta.env.VITE_GAME_CONTENT || 'settlerpolis'
let content: any = null
try {
	const contentModules = import.meta.glob('../../../../../content/*/index.ts', { eager: true })
	const contentPath = `../../../../../content/${CONTENT_FOLDER}/index.ts`
	content = contentModules[contentPath]
	console.log('[ConstructionPanel] Content import attempt:', {
		contentFolder: CONTENT_FOLDER,
		contentPath,
		contentModulesKeys: Object.keys(contentModules),
		content: content
	})
} catch (error) {
	console.warn('[ConstructionPanel] Failed to load content directly:', error)
}

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

export const ConstructionPanel: React.FC = () => {
	const [isVisible, setIsVisible] = useState(true) // Visible by default for Phase A testing
	const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null)
	const [selectedRoadType, setSelectedRoadType] = useState<RoadType | null>(null)
	const [buildings, setBuildings] = useState<BuildingDefinition[]>([])
	const [selectedCategory, setSelectedCategory] = useState<BuildingCategory>(BuildingCategory.Civil)

	useEffect(() => {
		// Try to load buildings from content first (fallback)
		console.log('[ConstructionPanel] Loading buildings, content:', content)
		if (content?.buildings && Array.isArray(content.buildings) && content.buildings.length > 0) {
			console.log('[ConstructionPanel] Found buildings in content:', content.buildings.length, 'buildings')
			setBuildings(content.buildings)
		} else {
			console.warn('[ConstructionPanel] No buildings found in content, waiting for server catalog')
			console.warn('[ConstructionPanel] Content object:', content)
			console.warn('[ConstructionPanel] Content.buildings:', content?.buildings)
		}

		// Listen for building catalog from server (primary source)
		const handleBuildingCatalog = (data: { buildings: BuildingDefinition[] }) => {
			console.log('[ConstructionPanel] ✅ Received building catalog from server:', data.buildings?.length || 0, 'buildings')
			if (data.buildings && Array.isArray(data.buildings) && data.buildings.length > 0) {
				setBuildings(data.buildings)
			} else {
				console.warn('[ConstructionPanel] ⚠️ Received empty catalog or invalid data:', data)
			}
		}

		// Listen for construction panel toggle
		const handleToggle = () => {
			setIsVisible(prev => !prev)
		}

		// Listen for building placement events
		const handleBuildingPlaced = () => {
			setSelectedBuilding(null)
		}

		const handleRoadCancelled = () => {
			setSelectedRoadType(null)
		}

		EventBus.on(Event.Buildings.SC.Catalog, handleBuildingCatalog)
		EventBus.on('ui:construction:toggle', handleToggle)
		EventBus.on(Event.Buildings.SC.Placed, handleBuildingPlaced)
		EventBus.on('ui:road:cancelled', handleRoadCancelled)
		
		// Request catalog after a short delay to ensure server is ready
		// This is a fallback in case the catalog wasn't sent on join
		const requestTimeout = setTimeout(() => {
			console.log('[ConstructionPanel] Checking if catalog was received (2s timeout)')
			// This will help debug if catalog was received
		}, 2000)

		return () => {
			clearTimeout(requestTimeout)
			EventBus.off(Event.Buildings.SC.Catalog, handleBuildingCatalog)
			EventBus.off('ui:construction:toggle', handleToggle)
			EventBus.off(Event.Buildings.SC.Placed, handleBuildingPlaced)
			EventBus.off('ui:road:cancelled', handleRoadCancelled)
		}
	}, []) // Run once on mount

	const handleBuildingSelect = (buildingId: string) => {
		if (selectedRoadType) {
			EventBus.emit('ui:road:cancel', {})
			setSelectedRoadType(null)
		}
		setSelectedBuilding((prev) => {
			if (prev === buildingId) {
				EventBus.emit('ui:construction:cancel', {})
				return null
			}
			EventBus.emit('ui:construction:select', { buildingId })
			return buildingId
		})
	}

	const handleRoadSelect = (roadType: RoadType) => {
		setSelectedRoadType((prev) => {
			if (prev === roadType) {
				EventBus.emit('ui:road:cancel', {})
				return null
			}
			EventBus.emit('ui:construction:cancel', {})
			setSelectedBuilding(null)
			EventBus.emit('ui:road:select', { roadType })
			return roadType
		})
	}

	const selectedDefinition = selectedBuilding
		? buildings.find((building) => building.id === selectedBuilding) || null
		: null

	const filteredBuildings = buildings.filter((building) => building.category === selectedCategory)

	useEffect(() => {
		if (selectedBuilding && !filteredBuildings.some(building => building.id === selectedBuilding)) {
			setSelectedBuilding(null)
			EventBus.emit('ui:construction:cancel', {})
		}
	}, [selectedBuilding, filteredBuildings])

	useEffect(() => {
		if (selectedRoadType && selectedCategory !== BuildingCategory.Infrastructure) {
			setSelectedRoadType(null)
			EventBus.emit('ui:road:cancel', {})
		}
	}, [selectedCategory, selectedRoadType])

	if (!isVisible) {
		return null
	}

	return (
		<div className={styles.panel}>
			<div className={styles.categoryTabs}>
				<button
					className={`${styles.categoryTab} ${selectedCategory === BuildingCategory.Infrastructure ? styles.categoryTabSelected : ''}`}
					onClick={() => setSelectedCategory(BuildingCategory.Infrastructure)}
					title="Infrastructure"
				>
					🛣️
				</button>
				<button
					className={`${styles.categoryTab} ${selectedCategory === BuildingCategory.Civil ? styles.categoryTabSelected : ''}`}
					onClick={() => setSelectedCategory(BuildingCategory.Civil)}
					title="Civil"
				>
					🏠
				</button>
				<button
					className={`${styles.categoryTab} ${selectedCategory === BuildingCategory.Storage ? styles.categoryTabSelected : ''}`}
					onClick={() => setSelectedCategory(BuildingCategory.Storage)}
					title="Storage"
				>
					📦
				</button>
				<button
					className={`${styles.categoryTab} ${selectedCategory === BuildingCategory.Food ? styles.categoryTabSelected : ''}`}
					onClick={() => setSelectedCategory(BuildingCategory.Food)}
					title="Food"
				>
					🌾
				</button>
				<button
					className={`${styles.categoryTab} ${selectedCategory === BuildingCategory.Industry ? styles.categoryTabSelected : ''}`}
					onClick={() => setSelectedCategory(BuildingCategory.Industry)}
					title="Industry"
				>
					🏭
				</button>
			</div>
			<div className={styles.content}>
				<div className={styles.leftColumn}>
					<div className={styles.buildingsList}>
						{selectedCategory !== BuildingCategory.Infrastructure && filteredBuildings.length === 0 ? (
							<div className={styles.emptyState}>
								<p>No buildings in this category</p>
								<p className={styles.emptyHint}>
									Waiting for building catalog...
								</p>
							</div>
						) : (
							<>
								{selectedCategory === BuildingCategory.Infrastructure && (
									<>
										<div
											className={`${styles.buildingItem} ${selectedRoadType === RoadType.Dirt ? styles.selected : ''}`}
											onClick={() => handleRoadSelect(RoadType.Dirt)}
											title="Dirt road"
										>
											<div className={styles.buildingIcon}>🟫</div>
										</div>
										<div
											className={`${styles.buildingItem} ${selectedRoadType === RoadType.Stone ? styles.selected : ''}`}
											onClick={() => handleRoadSelect(RoadType.Stone)}
											title="Stone road"
										>
											<div className={styles.buildingIcon}>🪨</div>
										</div>
									</>
								)}
								{filteredBuildings.map(building => (
									<div
										key={building.id}
										className={`${styles.buildingItem} ${selectedBuilding === building.id ? styles.selected : ''}`}
										onClick={() => handleBuildingSelect(building.id)}
										title={building.description || building.name}
									>
										<div className={styles.buildingIcon}>{building.icon || '🏗️'}</div>
									</div>
								))}
							</>
						)}
					</div>
				</div>
				<div className={styles.separator} aria-hidden="true" />
				<div className={styles.detailPanel}>
					{selectedDefinition ? (
						<>
							<div className={styles.detailIcon}>{selectedDefinition.icon || '🏗️'}</div>
							<div className={styles.detailName}>{selectedDefinition.name}</div>
							<div className={styles.detailCosts}>
								{selectedDefinition.costs.map((cost, index) => (
									<span key={index} className={styles.cost}>
										{cost.quantity}x <ItemEmoji itemType={cost.itemType} />
									</span>
								))}
							</div>
						</>
					) : selectedRoadType ? (
						<>
							<div className={styles.detailIcon}>{selectedRoadType === RoadType.Dirt ? '🟫' : '🪨'}</div>
							<div className={styles.detailName}>{selectedRoadType === RoadType.Dirt ? 'Dirt road' : 'Stone road'}</div>
							<div className={styles.detailCosts}>
								{selectedRoadType === RoadType.Dirt ? (
									<span className={styles.cost}>No cost</span>
								) : (
									<span className={styles.cost}>1x <ItemEmoji itemType="stone" /> / tile</span>
								)}
							</div>
						</>
					) : (
						<div className={styles.detailEmpty}>Select a building or road</div>
					)}
				</div>
			</div>
		</div>
	)
}
