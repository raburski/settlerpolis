import React, { useState, useEffect } from 'react'
import { EventBus } from '../EventBus'
import { Event, BuildingDefinition } from '@rugged/game'
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
	const [buildings, setBuildings] = useState<BuildingDefinition[]>([])

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

		EventBus.on(Event.Buildings.SC.Catalog, handleBuildingCatalog)
		EventBus.on('ui:construction:toggle', handleToggle)
		EventBus.on(Event.Buildings.SC.Placed, handleBuildingPlaced)
		
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
		}
	}, []) // Run once on mount

	const handleBuildingSelect = (buildingId: string) => {
		setSelectedBuilding(buildingId)
		// Emit event for Phaser scene to show placement ghost
		EventBus.emit('ui:construction:select', { buildingId })
	}

	const handleCancelSelection = () => {
		setSelectedBuilding(null)
		EventBus.emit('ui:construction:cancel', {})
	}

	if (!isVisible) {
		return null
	}

	return (
		<div className={styles.panel}>
			<div className={styles.header}>
				<h3>Construction</h3>
				{selectedBuilding && (
					<button onClick={handleCancelSelection} className={styles.cancelButton}>
						Cancel
					</button>
				)}
			</div>
			<div className={styles.buildingsList}>
				{buildings.length === 0 ? (
					<div className={styles.emptyState}>
						<p>No buildings available</p>
						<p className={styles.emptyHint}>Waiting for building catalog...</p>
					</div>
				) : (
					buildings.map(building => (
						<div
							key={building.id}
							className={`${styles.buildingItem} ${selectedBuilding === building.id ? styles.selected : ''}`}
							onClick={() => handleBuildingSelect(building.id)}
						>
							<div className={styles.buildingIcon}>{building.icon || '🏗️'}</div>
							<div className={styles.buildingInfo}>
								<div className={styles.buildingName}>{building.name}</div>
								<div className={styles.buildingDescription}>{building.description}</div>
								<div className={styles.buildingCosts}>
									{building.costs.map((cost, index) => (
										<span key={index} className={styles.cost}>
											{cost.quantity}x <ItemEmoji itemType={cost.itemType} />
										</span>
									))}
								</div>
							</div>
						</div>
					))
				)}
			</div>
		</div>
	)
}
