import React, { useState, useEffect, useMemo } from 'react'
import { EventBus } from '../EventBus'
import { Event, BuildingCategory, BuildingDefinition, RoadType } from '@rugged/game'
import { itemService } from '../services/ItemService'
import { cityCharterService } from '../services/CityCharterService'
import styles from './ConstructionPanel.module.css'
import { UiEvents } from '../uiEvents'

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

type ShortcutEntry =
	| { kind: 'building'; id: string }
	| { kind: 'road'; roadType: RoadType }

const SHORTCUT_SLOTS = 8
const SHORTCUT_STORAGE_KEY = 'settlerpolis:construction-shortcuts'
const SHORTCUT_MIME = 'application/x-construction-shortcut'

const isValidRoadType = (value: unknown): value is RoadType =>
	value === RoadType.Dirt || value === RoadType.Stone

const isTypingTarget = (target: EventTarget | null): boolean => {
	if (!target || !(target instanceof HTMLElement)) {
		return false
	}
	const tagName = target.tagName
	return (
		tagName === 'INPUT' ||
		tagName === 'TEXTAREA' ||
		tagName === 'SELECT' ||
		target.isContentEditable
	)
}

const parseShortcutEntry = (value: unknown): ShortcutEntry | null => {
	if (!value || typeof value !== 'object') {
		return null
	}
	if ('kind' in value) {
		const entry = value as { kind?: unknown; id?: unknown; roadType?: unknown }
		if (entry.kind === 'building' && typeof entry.id === 'string') {
			return { kind: 'building', id: entry.id }
		}
		if (entry.kind === 'road' && isValidRoadType(entry.roadType)) {
			return { kind: 'road', roadType: entry.roadType }
		}
	}
	return null
}

const loadShortcuts = (): Array<ShortcutEntry | null> => {
	if (typeof window === 'undefined') {
		return Array.from({ length: SHORTCUT_SLOTS }, () => null)
	}
	try {
		const raw = window.localStorage.getItem(SHORTCUT_STORAGE_KEY)
		if (!raw) {
			return Array.from({ length: SHORTCUT_SLOTS }, () => null)
		}
		const parsed = JSON.parse(raw)
		if (!Array.isArray(parsed)) {
			return Array.from({ length: SHORTCUT_SLOTS }, () => null)
		}
		const normalized = parsed
			.slice(0, SHORTCUT_SLOTS)
			.map((entry) => parseShortcutEntry(entry))
		while (normalized.length < SHORTCUT_SLOTS) {
			normalized.push(null)
		}
		return normalized
	} catch (error) {
		console.warn('[ConstructionPanel] Failed to load shortcuts:', error)
		return Array.from({ length: SHORTCUT_SLOTS }, () => null)
	}
}

export const ConstructionPanel: React.FC = () => {
	const [isVisible, setIsVisible] = useState(true) // Visible by default for Phase A testing
	const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null)
	const [selectedRoadType, setSelectedRoadType] = useState<RoadType | null>(null)
	const [buildings, setBuildings] = useState<BuildingDefinition[]>([])
	const [selectedCategory, setSelectedCategory] = useState<BuildingCategory>(BuildingCategory.Civil)
	const [unlockedFlags, setUnlockedFlags] = useState<string[]>(
		cityCharterService.getState()?.unlockedFlags || []
	)
	const [shortcuts, setShortcuts] = useState<Array<ShortcutEntry | null>>(loadShortcuts)
	const [draggingSlotIndex, setDraggingSlotIndex] = useState<number | null>(null)

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

		const handleConstructionCancelled = () => {
			setSelectedBuilding(null)
		}

		const handleCharterUpdated = (data: { unlockedFlags?: string[] }) => {
			setUnlockedFlags(data.unlockedFlags || [])
		}

		EventBus.on(Event.Buildings.SC.Catalog, handleBuildingCatalog)
		EventBus.on(UiEvents.Construction.Toggle, handleToggle)
		EventBus.on(UiEvents.Construction.Cancel, handleConstructionCancelled)
		EventBus.on(Event.Buildings.SC.Placed, handleBuildingPlaced)
		EventBus.on(UiEvents.Road.Cancelled, handleRoadCancelled)
		EventBus.on(UiEvents.CityCharter.Updated, handleCharterUpdated)
		cityCharterService.requestState()
		
		// Request catalog after a short delay to ensure server is ready
		// This is a fallback in case the catalog wasn't sent on join
		const requestTimeout = setTimeout(() => {
			console.log('[ConstructionPanel] Checking if catalog was received (2s timeout)')
			// This will help debug if catalog was received
		}, 2000)

		return () => {
			clearTimeout(requestTimeout)
			EventBus.off(Event.Buildings.SC.Catalog, handleBuildingCatalog)
			EventBus.off(UiEvents.Construction.Toggle, handleToggle)
			EventBus.off(UiEvents.Construction.Cancel, handleConstructionCancelled)
			EventBus.off(Event.Buildings.SC.Placed, handleBuildingPlaced)
			EventBus.off(UiEvents.Road.Cancelled, handleRoadCancelled)
			EventBus.off(UiEvents.CityCharter.Updated, handleCharterUpdated)
		}
	}, []) // Run once on mount

	const handleBuildingSelect = (buildingId: string) => {
		if (selectedRoadType) {
			EventBus.emit(UiEvents.Road.Cancel, {})
			setSelectedRoadType(null)
		}
		setSelectedBuilding((prev) => {
			if (prev === buildingId) {
				EventBus.emit(UiEvents.Construction.Cancel, {})
				return null
			}
			EventBus.emit(UiEvents.Construction.Select, { buildingId })
			return buildingId
		})
	}

	const handleRoadSelect = (roadType: RoadType) => {
		setSelectedRoadType((prev) => {
			if (prev === roadType) {
				EventBus.emit(UiEvents.Road.Cancel, {})
				return null
			}
			EventBus.emit(UiEvents.Construction.Cancel, {})
			setSelectedBuilding(null)
			EventBus.emit(UiEvents.Road.Select, { roadType })
			return roadType
		})
	}

	const selectedDefinition = selectedBuilding
		? buildings.find((building) => building.id === selectedBuilding) || null
		: null

	const unlockedSet = useMemo(() => new Set(unlockedFlags), [unlockedFlags])
	const isBuildingUnlocked = (building?: BuildingDefinition | null) => {
		if (!building) {
			return false
		}
		if (!building.unlockFlags || building.unlockFlags.length === 0) {
			return true
		}
		return building.unlockFlags.every((flag) => unlockedSet.has(flag))
	}
	const filteredBuildings = buildings.filter((building) => {
		if (building.category !== selectedCategory) {
			return false
		}
		return isBuildingUnlocked(building)
	})

	useEffect(() => {
		if (!selectedBuilding) {
			return
		}
		const building = buildings.find((item) => item.id === selectedBuilding)
		if (!isBuildingUnlocked(building)) {
			setSelectedBuilding(null)
			EventBus.emit(UiEvents.Construction.Cancel, {})
		}
	}, [selectedBuilding, buildings, unlockedSet])

	useEffect(() => {
		if (typeof window === 'undefined') {
			return
		}
		try {
			window.localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(shortcuts))
		} catch (error) {
			console.warn('[ConstructionPanel] Failed to save shortcuts:', error)
		}
	}, [shortcuts])

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!isVisible) {
				return
			}
			if (event.defaultPrevented || event.repeat) {
				return
			}
			if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
				return
			}
			if (isTypingTarget(event.target)) {
				return
			}

			let index = -1
			if (event.code.startsWith('Digit')) {
				index = Number(event.code.replace('Digit', '')) - 1
			} else if (event.code.startsWith('Numpad')) {
				index = Number(event.code.replace('Numpad', '')) - 1
			} else if (event.key >= '1' && event.key <= '8') {
				index = Number(event.key) - 1
			}

			if (index < 0 || index >= SHORTCUT_SLOTS) {
				return
			}

			const entry = shortcuts[index]
			if (!entry) {
				return
			}
			if (entry.kind === 'building') {
				const building = buildings.find((item) => item.id === entry.id)
				if (!building || !isBuildingUnlocked(building)) {
					return
				}
				event.preventDefault()
				handleBuildingSelect(entry.id)
				return
			}
			if (entry.kind === 'road') {
				event.preventDefault()
				handleRoadSelect(entry.roadType)
			}
		}

		window.addEventListener('keydown', handleKeyDown)
		return () => {
			window.removeEventListener('keydown', handleKeyDown)
		}
	}, [buildings, shortcuts, isVisible, unlockedSet, handleBuildingSelect, handleRoadSelect])

	const getShortcutPayload = (entry: ShortcutEntry) => JSON.stringify(entry)

	const readShortcutPayload = (dataTransfer: DataTransfer): ShortcutEntry | null => {
		const raw =
			dataTransfer.getData(SHORTCUT_MIME) ||
			dataTransfer.getData('text/plain')
		if (!raw) {
			return null
		}
		try {
			return parseShortcutEntry(JSON.parse(raw))
		} catch {
			return null
		}
	}

	const setSlotShortcut = (index: number, entry: ShortcutEntry | null) => {
		setShortcuts((prev) => {
			const next = [...prev]
			next[index] = entry
			return next
		})
	}

	const handleSlotDrop = (index: number, entry: ShortcutEntry) => {
		setShortcuts((prev) => {
			const next = [...prev]
			if (draggingSlotIndex === null) {
				next[index] = entry
				return next
			}
			if (draggingSlotIndex === index) {
				return next
			}
			const sourceEntry = next[draggingSlotIndex]
			if (!sourceEntry) {
				next[index] = entry
				return next
			}
			const targetEntry = next[index]
			if (targetEntry) {
				next[draggingSlotIndex] = targetEntry
			} else {
				next[draggingSlotIndex] = null
			}
			next[index] = sourceEntry
			return next
		})
		setDraggingSlotIndex(null)
	}

	if (!isVisible) {
		return null
	}

	return (
		<div className={styles.panel}>
			<div className={styles.topBar}>
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
					<button
						className={`${styles.categoryTab} ${selectedCategory === BuildingCategory.Metalwork ? styles.categoryTabSelected : ''}`}
						onClick={() => setSelectedCategory(BuildingCategory.Metalwork)}
						title="Metalwork"
					>
						⚒️
					</button>
				</div>
				<div className={styles.topSeparator} aria-hidden="true" />
				<div className={styles.shortcutBar}>
					{shortcuts.map((entry, index) => {
						const building = entry?.kind === 'building'
							? buildings.find((item) => item.id === entry.id)
							: null
						const isUnavailable = entry?.kind === 'building' && !building
						const isLocked = entry?.kind === 'building' && !!building && !isBuildingUnlocked(building)
						const isDisabled = isUnavailable || isLocked
						const shortcutIcon = entry?.kind === 'building'
							? building ? (building.icon || '🏗️') : '❓'
							: entry?.kind === 'road'
								? entry.roadType === RoadType.Dirt ? '🟫' : '🪨'
								: null
						const title = entry?.kind === 'building'
							? building
								? isLocked ? `${building.name} (Locked)` : building.name
								: `${entry.id} (Unavailable)`
							: entry?.kind === 'road'
								? entry.roadType === RoadType.Dirt ? 'Dirt road' : 'Stone road'
								: 'Empty slot'

						return (
							<div
								key={index}
								className={`${styles.shortcutSlot} ${!entry ? styles.shortcutSlotEmpty : ''} ${isDisabled ? styles.shortcutSlotDisabled : ''}`}
								title={title}
								draggable={!!entry}
								onClick={() => {
									if (!entry || isDisabled) {
										return
									}
									if (entry.kind === 'building') {
										handleBuildingSelect(entry.id)
										return
									}
									handleRoadSelect(entry.roadType)
								}}
								onDragStart={(event) => {
									if (!entry) {
										return
									}
									event.dataTransfer.setData(SHORTCUT_MIME, getShortcutPayload(entry))
									event.dataTransfer.setData('text/plain', getShortcutPayload(entry))
									event.dataTransfer.effectAllowed = 'move'
									setDraggingSlotIndex(index)
								}}
								onDragEnd={(event) => {
									if (draggingSlotIndex === null) {
										return
									}
									if (event.dataTransfer.dropEffect === 'none') {
										setSlotShortcut(draggingSlotIndex, null)
									}
									setDraggingSlotIndex(null)
								}}
								onDragOver={(event) => {
									event.preventDefault()
									event.dataTransfer.dropEffect = draggingSlotIndex === null ? 'copy' : 'move'
								}}
								onDrop={(event) => {
									event.preventDefault()
									const payload = readShortcutPayload(event.dataTransfer)
									if (!payload) {
										return
									}
									handleSlotDrop(index, payload)
								}}
							>
								<span className={styles.shortcutIndex} aria-hidden="true">
									{index + 1}
								</span>
								{shortcutIcon && (
									<div className={styles.shortcutIcon}>{shortcutIcon}</div>
								)}
							</div>
						)
					})}
				</div>
			</div>
			<div className={styles.topBottomSeparator} aria-hidden="true" />
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
											draggable={true}
											onDragStart={(event) => {
												const payload = getShortcutPayload({ kind: 'road', roadType: RoadType.Dirt })
												event.dataTransfer.setData(SHORTCUT_MIME, payload)
												event.dataTransfer.setData('text/plain', payload)
												event.dataTransfer.effectAllowed = 'copy'
											}}
										>
											<div className={styles.buildingIcon}>🟫</div>
										</div>
										<div
											className={`${styles.buildingItem} ${selectedRoadType === RoadType.Stone ? styles.selected : ''}`}
											onClick={() => handleRoadSelect(RoadType.Stone)}
											title="Stone road"
											draggable={true}
											onDragStart={(event) => {
												const payload = getShortcutPayload({ kind: 'road', roadType: RoadType.Stone })
												event.dataTransfer.setData(SHORTCUT_MIME, payload)
												event.dataTransfer.setData('text/plain', payload)
												event.dataTransfer.effectAllowed = 'copy'
											}}
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
										draggable={true}
										onDragStart={(event) => {
											const payload = getShortcutPayload({ kind: 'building', id: building.id })
											event.dataTransfer.setData(SHORTCUT_MIME, payload)
											event.dataTransfer.setData('text/plain', payload)
											event.dataTransfer.effectAllowed = 'copy'
										}}
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
