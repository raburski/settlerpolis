import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styles from './EditorApp.module.css'
import { EditorPlacement, EditorScene, StorageSlot } from './EditorScene'

type Vec2 = { x: number; y: number }

type Vec3 = { x: number; y: number; z: number }

type ResourceNodeRenderVariant = {
	modelSrc: string
	weight?: number
	transform?: {
		rotation?: Vec3
		scale?: Vec3
		elevation?: number
	}
}

type ResourceNodeRenderVariantState = {
	modelSrc: string
	weight: number
	rotationDeg: Vec3
	scale: Vec3
	elevation: number
}

type ResourceNodeRenderDefinition = {
	id: string
	footprint?: { width: number; height?: number; length?: number }
	render?: {
		modelSrc?: string
		transform?: {
			rotation?: Vec3
			scale?: Vec3
			elevation?: number
		}
	}
	renders?: ResourceNodeRenderVariant[]
}

type ItemRenderVariant = {
	modelSrc: string
	weight?: number
	transform?: {
		rotation?: Vec3
		scale?: Vec3
		elevation?: number
	}
}

type ItemRenderVariantState = {
	modelSrc: string
	weight: number
	rotationDeg: Vec3
	scale: Vec3
	elevation: number
}

type ItemRenderDefinition = {
	id: string
	footprint?: { width: number; height?: number; length?: number }
	render?: {
		modelSrc?: string
		transform?: {
			rotation?: Vec3
			scale?: Vec3
			elevation?: number
		}
	}
	renders?: ItemRenderVariant[]
}

type BuildingRenderVariant = {
	modelSrc: string
	weight?: number
	transform?: {
		rotation?: Vec3
		scale?: Vec3
		elevation?: number
	}
}

type BuildingRenderVariantState = {
	modelSrc: string
	weight: number
	rotationDeg: Vec3
	scale: Vec3
	elevation: number
}

const DEFAULT_ASSET_ID = 'building_model'
const DEFAULT_ASSET_PATH = ''
const CONTENT_FOLDER = import.meta.env.VITE_GAME_CONTENT || 'settlerpolis'
const contentModules = import.meta.glob('../../../../content/*/index.ts', { eager: true })
const content = contentModules[`../../../../content/${CONTENT_FOLDER}/index.ts`]

export function EditorApp() {
	const sceneRef = useRef<EditorScene | null>(null)
	const [editorMode, setEditorMode] = useState<'building' | 'resource' | 'item'>('building')
	const [assetId, setAssetId] = useState(DEFAULT_ASSET_ID)
	const [assetPath, setAssetPath] = useState(DEFAULT_ASSET_PATH)
	const [footprint, setFootprint] = useState({ width: 2, length: 2 })
	const [position, setPosition] = useState<Vec2>({ x: 0, y: 0 })
	const [rotationDeg, setRotationDeg] = useState<Vec3>({ x: 0, y: 0, z: 0 })
	const [scale, setScale] = useState<Vec3>({ x: 1, y: 1, z: 1 })
	const [elevation, setElevation] = useState(0)
	const [entryPoint, setEntryPoint] = useState<Vec2 | null>(null)
	const [centerPoint, setCenterPoint] = useState<Vec2 | null>(null)
	const [accessTiles, setAccessTiles] = useState<Vec2[]>([])
	const [blockedTiles, setBlockedTiles] = useState<Vec2[]>([])
	const [loadError, setLoadError] = useState<string | null>(null)
	const [resourceAssetPath, setResourceAssetPath] = useState(DEFAULT_ASSET_PATH)
	const [resourceFootprint, setResourceFootprint] = useState({ width: 1, length: 1 })
	const [resourcePosition, setResourcePosition] = useState<Vec2>({ x: 0, y: 0 })
	const [resourceRotationDeg, setResourceRotationDeg] = useState<Vec3>({ x: 0, y: 0, z: 0 })
	const [resourceScale, setResourceScale] = useState<Vec3>({ x: 1, y: 1, z: 1 })
	const [resourceElevation, setResourceElevation] = useState(0)
	const [resourceLoadError, setResourceLoadError] = useState<string | null>(null)
	const [itemAssetPath, setItemAssetPath] = useState(DEFAULT_ASSET_PATH)
	const [itemFootprint, setItemFootprint] = useState({ width: 1, length: 1 })
	const [itemPosition, setItemPosition] = useState<Vec2>({ x: 0, y: 0 })
	const [itemRotationDeg, setItemRotationDeg] = useState<Vec3>({ x: 0, y: 0, z: 0 })
	const [itemScale, setItemScale] = useState<Vec3>({ x: 1, y: 1, z: 1 })
	const [itemElevation, setItemElevation] = useState(0)
	const [itemLoadError, setItemLoadError] = useState<string | null>(null)
	const [showHelp, setShowHelp] = useState(false)
	const [pickMode, setPickMode] = useState<'position' | 'entry' | 'center' | 'access' | 'blocked'>('position')
	const [assetOptions, setAssetOptions] = useState<string[]>([])
	const [assetIndexError, setAssetIndexError] = useState<string | null>(null)
	const [selectedAsset, setSelectedAsset] = useState('')
	const [selectedResourceAsset, setSelectedResourceAsset] = useState('')
	const [selectedItemAsset, setSelectedItemAsset] = useState('')
	const [assetOpen, setAssetOpen] = useState(false)
	const [selectedBuildingId, setSelectedBuildingId] = useState('')
	const [definitionDraft, setDefinitionDraft] = useState<Record<string, any> | null>(null)
	const [selectedResourceId, setSelectedResourceId] = useState('')
	const [selectedItemId, setSelectedItemId] = useState('')
	const [storageSlots, setStorageSlots] = useState<StorageSlot[]>([])
	const [storageOpen, setStorageOpen] = useState(false)
	const [footprintOpen, setFootprintOpen] = useState(false)
	const [entryCenterOpen, setEntryCenterOpen] = useState(false)
	const [accessBlockedOpen, setAccessBlockedOpen] = useState(false)
	const [transformOpen, setTransformOpen] = useState(false)
	const [manualTransparent, setManualTransparent] = useState(false)
	const [isEditingFields, setIsEditingFields] = useState(false)
	const [sceneReady, setSceneReady] = useState(false)
	const [buildingsFileHandle, setBuildingsFileHandle] = useState<FileSystemFileHandle | null>(null)
	const [fileStatus, setFileStatus] = useState('')
	const [resourceFileHandle, setResourceFileHandle] = useState<FileSystemFileHandle | null>(null)
	const [resourceFileStatus, setResourceFileStatus] = useState('')
	const [resourceRenderDefinitions, setResourceRenderDefinitions] = useState<ResourceNodeRenderDefinition[]>([])
	const [resourceRenderError, setResourceRenderError] = useState<string | null>(null)
	const [resourceModelVariants, setResourceModelVariants] = useState<ResourceNodeRenderVariantState[]>([])
	const [activeResourceVariantIndex, setActiveResourceVariantIndex] = useState<number | null>(null)
	const [itemFileHandle, setItemFileHandle] = useState<FileSystemFileHandle | null>(null)
	const [itemFileStatus, setItemFileStatus] = useState('')
	const [itemRenderDefinitions, setItemRenderDefinitions] = useState<ItemRenderDefinition[]>([])
	const [itemRenderError, setItemRenderError] = useState<string | null>(null)
	const [itemModelVariants, setItemModelVariants] = useState<ItemRenderVariantState[]>([])
	const [activeItemVariantIndex, setActiveItemVariantIndex] = useState<number | null>(null)
	const [buildingModelVariants, setBuildingModelVariants] = useState<BuildingRenderVariantState[]>([])
	const [activeBuildingVariantIndex, setActiveBuildingVariantIndex] = useState<number | null>(null)
	const hasDefinition = Boolean(definitionDraft)
	const supportsFilePicker = typeof window !== 'undefined' && 'showOpenFilePicker' in window
	const isBuildingMode = editorMode === 'building'
	const isResourceMode = editorMode === 'resource'
	const isItemMode = editorMode === 'item'
	const activeFootprint = isResourceMode ? resourceFootprint : isItemMode ? itemFootprint : footprint
	const activePosition = isResourceMode ? resourcePosition : isItemMode ? itemPosition : position
	const activeLoadError = isResourceMode ? resourceLoadError : isItemMode ? itemLoadError : loadError

	const buildingDefinitions = useMemo(() => {
		const definitions = (content as { buildings?: Array<Record<string, any>> })?.buildings
		return Array.isArray(definitions) ? definitions : []
	}, [])

	const resourceDefinitions = useMemo(() => {
		const definitions = (content as { resourceNodeDefinitions?: Array<Record<string, any>> })?.resourceNodeDefinitions
		return Array.isArray(definitions) ? definitions : []
	}, [])


	const itemOptions = useMemo(() => {
		const items = (content as { items?: Array<Record<string, any>> })?.items
		if (!Array.isArray(items)) return []
		return items
			.map((item) => ({
				id: String(item.id ?? ''),
				label: String(item.name ?? item.id ?? ''),
				emoji: typeof item.emoji === 'string' ? item.emoji : ''
			}))
			.filter((item) => item.id)
	}, [])

	const itemEmojiMap = useMemo(() => {
		const map = new Map<string, string>()
		itemOptions.forEach((item) => {
			if (item.id) {
				map.set(item.id, item.emoji || '')
			}
		})
		return map
	}, [itemOptions])

	const itemRenderMap = useMemo(() => {
		const map = new Map<string, ItemRenderDefinition>()
		itemRenderDefinitions.forEach((definition) => {
			if (definition?.id) {
				map.set(definition.id, definition)
			}
		})
		return map
	}, [itemRenderDefinitions])

	const previewStorageSlots = useMemo(() => {
		if (itemRenderMap.size === 0) {
			return storageSlots
		}
		return storageSlots.map((slot) => {
			const definition = itemRenderMap.get(slot.itemType)
			if (!definition) return slot
			const render = resolveItemPreviewRender(definition)
			if (!render) return slot
			return { ...slot, render }
		})
	}, [itemRenderMap, storageSlots])

	const handleSceneReady = useCallback((scene: EditorScene | null) => {
		sceneRef.current = scene
		setSceneReady(Boolean(scene))
		if (!scene) return
	}, [])

	const toggleTileOffset = useCallback((tiles: Vec2[], next: Vec2) => {
		const rounded = { x: Math.round(next.x), y: Math.round(next.y) }
		const key = `${rounded.x},${rounded.y}`
		const exists = tiles.some((tile) => `${Math.round(tile.x)},${Math.round(tile.y)}` === key)
		if (exists) {
			return tiles.filter((tile) => `${Math.round(tile.x)},${Math.round(tile.y)}` !== key)
		}
		return [...tiles, rounded]
	}, [])

	useEffect(() => {
		const scene = sceneRef.current
		if (!scene) return
		scene.setPickHandler((gridPosition) => {
			if (isResourceMode) {
				setResourcePosition(gridPosition)
				return
			}
			if (isItemMode) {
				setItemPosition(gridPosition)
				return
			}
			if (pickMode === 'entry') {
				setEntryPoint({
					x: gridPosition.x - position.x + 0.5,
					y: gridPosition.y - position.y + 0.5
				})
				setPickMode('position')
				return
			}
			if (pickMode === 'center') {
				setCenterPoint({
					x: gridPosition.x - position.x + 0.5,
					y: gridPosition.y - position.y + 0.5
				})
				setPickMode('position')
				return
			}
			if (pickMode === 'access') {
				const offset = {
					x: gridPosition.x - position.x,
					y: gridPosition.y - position.y
				}
				setAccessTiles((prev) => toggleTileOffset(prev, offset))
				return
			}
			if (pickMode === 'blocked') {
				const offset = {
					x: gridPosition.x - position.x,
					y: gridPosition.y - position.y
				}
				setBlockedTiles((prev) => toggleTileOffset(prev, offset))
				return
			}
			setPosition(gridPosition)
		})
	}, [isItemMode, isResourceMode, pickMode, position.x, position.y, toggleTileOffset])

	const rotationRad = useMemo(
		() => ({
			x: toRadians(rotationDeg.x),
			y: toRadians(rotationDeg.y),
			z: toRadians(rotationDeg.z)
		}),
		[rotationDeg]
	)

	const resourceRotationRad = useMemo(
		() => ({
			x: toRadians(resourceRotationDeg.x),
			y: toRadians(resourceRotationDeg.y),
			z: toRadians(resourceRotationDeg.z)
		}),
		[resourceRotationDeg]
	)

	const itemRotationRad = useMemo(
		() => ({
			x: toRadians(itemRotationDeg.x),
			y: toRadians(itemRotationDeg.y),
			z: toRadians(itemRotationDeg.z)
		}),
		[itemRotationDeg]
	)

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented) return
			const target = event.target as HTMLElement | null
			if (target) {
				const tagName = target.tagName.toLowerCase()
				if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable) {
					return
				}
			}
			if (event.code !== 'KeyQ' && event.code !== 'KeyE') return
			const stepDelta = event.code === 'KeyQ' ? -1 : 1
			sceneRef.current?.rotateCamera(stepDelta)
			event.preventDefault()
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [])

	const placement: EditorPlacement = useMemo(() => {
		if (isResourceMode) {
			return {
				footprint: resourceFootprint,
				position: resourcePosition,
				rotation: resourceRotationRad,
				scale: resourceScale,
				elevation: resourceElevation,
				storageSlots: [],
				entryPoint: null,
				centerPoint: null,
				accessTiles: [],
				blockedTiles: []
			}
		}
		if (isItemMode) {
			return {
				footprint: itemFootprint,
				position: itemPosition,
				rotation: itemRotationRad,
				scale: itemScale,
				elevation: itemElevation,
				storageSlots: [],
				entryPoint: null,
				centerPoint: null,
				accessTiles: [],
				blockedTiles: []
			}
		}
		return {
			footprint,
			position,
			rotation: rotationRad,
			scale,
			elevation,
			storageSlots: previewStorageSlots,
			entryPoint,
			centerPoint,
			accessTiles,
			blockedTiles
		}
	}, [
		isItemMode,
		isResourceMode,
		itemElevation,
		itemFootprint,
		itemPosition,
		itemRotationRad,
		itemScale,
		resourceElevation,
		resourceFootprint,
		resourcePosition,
		resourceRotationRad,
		resourceScale,
		footprint,
		position,
		rotationRad,
		scale,
		elevation,
		previewStorageSlots,
		entryPoint,
		centerPoint,
		accessTiles,
		blockedTiles
	])

	useEffect(() => {
		sceneRef.current?.updatePlacement(placement)
	}, [placement])

	useEffect(() => {
		if ((isResourceMode || isItemMode) && pickMode !== 'position') {
			setPickMode('position')
		}
	}, [isItemMode, isResourceMode, pickMode])

	const isAutoTransparent = isEditingFields || pickMode === 'entry' || pickMode === 'center'
	const isTransparent = manualTransparent || isAutoTransparent

	useEffect(() => {
		if (!sceneReady) return
		sceneRef.current?.setAssetOpacity(isTransparent ? 0.3 : 1)
	}, [isTransparent, sceneReady])

	const handleLoadAsset = useCallback(async (nextPath?: string) => {
		const normalized = normalizeAssetPath(nextPath ?? assetPath)
		setAssetPath(normalized)
		if (!normalized) {
			setLoadError(null)
			await sceneRef.current?.loadAsset('')
			return
		}
		if (!sceneRef.current) return
		try {
			setLoadError(null)
			await sceneRef.current.loadAsset(normalized)
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to load asset'
			setLoadError(message)
		}
	}, [assetPath])

	const handleLoadResourceAsset = useCallback(async (nextPath?: string) => {
		const normalized = normalizeAssetPath(nextPath ?? resourceAssetPath)
		setResourceAssetPath(normalized)
		if (!normalized) {
			setResourceLoadError(null)
			await sceneRef.current?.loadAsset('')
			return
		}
		if (!sceneRef.current) return
		try {
			setResourceLoadError(null)
			await sceneRef.current.loadAsset(normalized)
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to load asset'
			setResourceLoadError(message)
		}
	}, [resourceAssetPath])

	const handleLoadItemAsset = useCallback(async (nextPath?: string) => {
		const normalized = normalizeAssetPath(nextPath ?? itemAssetPath)
		setItemAssetPath(normalized)
		if (!normalized) {
			setItemLoadError(null)
			await sceneRef.current?.loadAsset('')
			return
		}
		if (!sceneRef.current) return
		try {
			setItemLoadError(null)
			await sceneRef.current.loadAsset(normalized)
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to load asset'
			setItemLoadError(message)
		}
	}, [itemAssetPath])

	useEffect(() => {
		if (!sceneReady) return
		if (isResourceMode) {
			void handleLoadResourceAsset(resourceAssetPath)
			return
		}
		if (isItemMode) {
			void handleLoadItemAsset(itemAssetPath)
			return
		}
		void handleLoadAsset(assetPath)
	}, [
		assetPath,
		handleLoadAsset,
		handleLoadItemAsset,
		handleLoadResourceAsset,
		isItemMode,
		isResourceMode,
		itemAssetPath,
		resourceAssetPath,
		sceneReady
	])

	const handleAddStorageSlot = useCallback(() => {
		const defaultItem = itemOptions[0]?.id || ''
		const emoji = itemEmojiMap.get(defaultItem) || ''
		setStorageSlots((prev) => [
			...prev,
			{
				itemType: defaultItem,
				offset: { x: 0, y: 0 },
				emoji
			}
		])
	}, [itemEmojiMap, itemOptions])

	const handleAddBuildingVariant = useCallback(() => {
		const nextVariant: BuildingRenderVariantState = {
			modelSrc: '',
			weight: 1,
			rotationDeg: { x: 0, y: 0, z: 0 },
			scale: { x: 1, y: 1, z: 1 },
			elevation: 0
		}
		const next = [...buildingModelVariants, nextVariant]
		setBuildingModelVariants(next)
		setActiveBuildingVariantIndex(next.length - 1)
		setSelectedAsset('')
		setAssetPath('')
	}, [buildingModelVariants])

	const updateBuildingVariant = useCallback(
		(index: number, updates: Partial<BuildingRenderVariantState>) => {
			setBuildingModelVariants((prev) =>
				prev.map((entry, entryIndex) => {
					if (entryIndex !== index) return entry
					return { ...entry, ...updates }
				})
			)
		},
		[]
	)

	const selectBuildingVariant = useCallback(
		(index: number) => {
			const variant = buildingModelVariants[index]
			if (!variant) return
			setActiveBuildingVariantIndex(index)
			setRotationDeg(variant.rotationDeg)
			setScale(variant.scale)
			setElevation(variant.elevation)
			const modelSrc = variant.modelSrc || ''
			setAssetPath(modelSrc)
			if (modelSrc) {
				if (assetOptions.includes(modelSrc)) {
					setSelectedAsset(modelSrc)
				} else {
					setSelectedAsset('')
				}
				void handleLoadAsset(modelSrc)
			} else {
				setSelectedAsset('')
			}
		},
		[assetOptions, buildingModelVariants, handleLoadAsset]
	)

	const removeBuildingVariant = useCallback(
		(index: number) => {
			const next = buildingModelVariants.filter((_, entryIndex) => entryIndex !== index)
			setBuildingModelVariants(next)
			if (next.length === 0) {
				setActiveBuildingVariantIndex(null)
				setSelectedAsset('')
				setRotationDeg({ x: 0, y: 0, z: 0 })
				setScale({ x: 1, y: 1, z: 1 })
				setElevation(0)
				void handleLoadAsset('')
				return
			}
			if (activeBuildingVariantIndex === null) {
				setActiveBuildingVariantIndex(null)
				return
			}
			let nextIndex = activeBuildingVariantIndex
			if (index === activeBuildingVariantIndex) {
				nextIndex = Math.min(activeBuildingVariantIndex, next.length - 1)
			} else if (index < activeBuildingVariantIndex) {
				nextIndex = Math.max(0, activeBuildingVariantIndex - 1)
			}
			setActiveBuildingVariantIndex(nextIndex)
			const variant = next[nextIndex]
			if (variant) {
				setRotationDeg(variant.rotationDeg)
				setScale(variant.scale)
				setElevation(variant.elevation)
				const modelSrc = variant.modelSrc || ''
				setAssetPath(modelSrc)
				if (modelSrc) {
					if (assetOptions.includes(modelSrc)) {
						setSelectedAsset(modelSrc)
					} else {
						setSelectedAsset('')
					}
					void handleLoadAsset(modelSrc)
				} else {
					setSelectedAsset('')
				}
			}
		},
		[
			activeBuildingVariantIndex,
			assetOptions,
			buildingModelVariants,
			handleLoadAsset
		]
	)

	const updateActiveBuildingRotation = useCallback(
		(updates: Partial<Vec3>) => {
			if (activeBuildingVariantIndex === null) {
				setRotationDeg((prev) => ({ ...prev, ...updates }))
				return
			}
			setRotationDeg((prev) => {
				const next = { ...prev, ...updates }
				updateBuildingVariant(activeBuildingVariantIndex, { rotationDeg: next })
				return next
			})
		},
		[activeBuildingVariantIndex, updateBuildingVariant]
	)

	const updateActiveBuildingScale = useCallback(
		(updates: Partial<Vec3>) => {
			if (activeBuildingVariantIndex === null) {
				setScale((prev) => ({ ...prev, ...updates }))
				return
			}
			setScale((prev) => {
				const next = { ...prev, ...updates }
				updateBuildingVariant(activeBuildingVariantIndex, { scale: next })
				return next
			})
		},
		[activeBuildingVariantIndex, updateBuildingVariant]
	)

	const updateActiveBuildingElevation = useCallback(
		(value: number) => {
			if (activeBuildingVariantIndex === null) {
				setElevation(value)
				return
			}
			setElevation(value)
			updateBuildingVariant(activeBuildingVariantIndex, { elevation: value })
		},
		[activeBuildingVariantIndex, updateBuildingVariant]
	)

	const handleAddResourceVariant = useCallback(() => {
		const nextVariant: ResourceNodeRenderVariantState = {
			modelSrc: '',
			weight: 1,
			rotationDeg: { x: 0, y: 0, z: 0 },
			scale: { x: 1, y: 1, z: 1 },
			elevation: 0
		}
		const next = [...resourceModelVariants, nextVariant]
		setResourceModelVariants(next)
		setActiveResourceVariantIndex(next.length - 1)
		setSelectedResourceAsset('')
		setResourceAssetPath('')
	}, [resourceModelVariants])

	const updateResourceVariant = useCallback(
		(index: number, updates: Partial<ResourceNodeRenderVariantState>) => {
			setResourceModelVariants((prev) =>
				prev.map((entry, entryIndex) => {
					if (entryIndex !== index) return entry
					return { ...entry, ...updates }
				})
			)
		},
		[]
	)

	const selectResourceVariant = useCallback(
		(index: number) => {
			const variant = resourceModelVariants[index]
			if (!variant) return
			setActiveResourceVariantIndex(index)
			setResourceRotationDeg(variant.rotationDeg)
			setResourceScale(variant.scale)
			setResourceElevation(variant.elevation)
			const modelSrc = variant.modelSrc || ''
			setResourceAssetPath(modelSrc)
			if (modelSrc) {
				if (assetOptions.includes(modelSrc)) {
					setSelectedResourceAsset(modelSrc)
				} else {
					setSelectedResourceAsset('')
				}
				void handleLoadResourceAsset(modelSrc)
			} else {
				setSelectedResourceAsset('')
			}
		},
		[assetOptions, handleLoadResourceAsset, resourceModelVariants]
	)

	const removeResourceVariant = useCallback(
		(index: number) => {
			const next = resourceModelVariants.filter((_, entryIndex) => entryIndex !== index)
			setResourceModelVariants(next)
			if (next.length === 0) {
				setActiveResourceVariantIndex(null)
				setSelectedResourceAsset('')
				setResourceRotationDeg({ x: 0, y: 0, z: 0 })
				setResourceScale({ x: 1, y: 1, z: 1 })
				setResourceElevation(0)
				void handleLoadResourceAsset('')
				return
			}
			if (activeResourceVariantIndex === null) {
				setActiveResourceVariantIndex(null)
				return
			}
			let nextIndex = activeResourceVariantIndex
			if (index === activeResourceVariantIndex) {
				nextIndex = Math.min(activeResourceVariantIndex, next.length - 1)
			} else if (index < activeResourceVariantIndex) {
				nextIndex = Math.max(0, activeResourceVariantIndex - 1)
			}
			setActiveResourceVariantIndex(nextIndex)
			const variant = next[nextIndex]
			if (variant) {
				setResourceRotationDeg(variant.rotationDeg)
				setResourceScale(variant.scale)
				setResourceElevation(variant.elevation)
				const modelSrc = variant.modelSrc || ''
				setResourceAssetPath(modelSrc)
				if (modelSrc) {
					if (assetOptions.includes(modelSrc)) {
						setSelectedResourceAsset(modelSrc)
					} else {
						setSelectedResourceAsset('')
					}
					void handleLoadResourceAsset(modelSrc)
				} else {
					setSelectedResourceAsset('')
				}
			}
		},
		[
			activeResourceVariantIndex,
			assetOptions,
			handleLoadResourceAsset,
			resourceModelVariants
		]
	)

	const updateActiveResourceRotation = useCallback(
		(updates: Partial<Vec3>) => {
			if (activeResourceVariantIndex === null) {
				setResourceRotationDeg((prev) => ({ ...prev, ...updates }))
				return
			}
			setResourceRotationDeg((prev) => {
				const next = { ...prev, ...updates }
				updateResourceVariant(activeResourceVariantIndex, { rotationDeg: next })
				return next
			})
		},
		[activeResourceVariantIndex, updateResourceVariant]
	)

	const updateActiveResourceScale = useCallback(
		(updates: Partial<Vec3>) => {
			if (activeResourceVariantIndex === null) {
				setResourceScale((prev) => ({ ...prev, ...updates }))
				return
			}
			setResourceScale((prev) => {
				const next = { ...prev, ...updates }
				updateResourceVariant(activeResourceVariantIndex, { scale: next })
				return next
			})
		},
		[activeResourceVariantIndex, updateResourceVariant]
	)

	const updateActiveResourceElevation = useCallback(
		(value: number) => {
			if (activeResourceVariantIndex === null) {
				setResourceElevation(value)
				return
			}
			setResourceElevation(value)
			updateResourceVariant(activeResourceVariantIndex, { elevation: value })
		},
		[activeResourceVariantIndex, updateResourceVariant]
	)

	const handleAddItemVariant = useCallback(() => {
		const nextVariant: ItemRenderVariantState = {
			modelSrc: '',
			weight: 1,
			rotationDeg: { x: 0, y: 0, z: 0 },
			scale: { x: 1, y: 1, z: 1 },
			elevation: 0
		}
		const next = [...itemModelVariants, nextVariant]
		setItemModelVariants(next)
		setActiveItemVariantIndex(next.length - 1)
		setSelectedItemAsset('')
		setItemAssetPath('')
	}, [itemModelVariants])

	const updateItemVariant = useCallback(
		(index: number, updates: Partial<ItemRenderVariantState>) => {
			setItemModelVariants((prev) =>
				prev.map((entry, entryIndex) => {
					if (entryIndex !== index) return entry
					return { ...entry, ...updates }
				})
			)
		},
		[]
	)

	const selectItemVariant = useCallback(
		(index: number) => {
			const variant = itemModelVariants[index]
			if (!variant) return
			setActiveItemVariantIndex(index)
			setItemRotationDeg(variant.rotationDeg)
			setItemScale(variant.scale)
			setItemElevation(variant.elevation)
			const modelSrc = variant.modelSrc || ''
			setItemAssetPath(modelSrc)
			if (modelSrc) {
				if (assetOptions.includes(modelSrc)) {
					setSelectedItemAsset(modelSrc)
				} else {
					setSelectedItemAsset('')
				}
				void handleLoadItemAsset(modelSrc)
			} else {
				setSelectedItemAsset('')
			}
		},
		[assetOptions, handleLoadItemAsset, itemModelVariants]
	)

	const removeItemVariant = useCallback(
		(index: number) => {
			const next = itemModelVariants.filter((_, entryIndex) => entryIndex !== index)
			setItemModelVariants(next)
			if (next.length === 0) {
				setActiveItemVariantIndex(null)
				setSelectedItemAsset('')
				setItemRotationDeg({ x: 0, y: 0, z: 0 })
				setItemScale({ x: 1, y: 1, z: 1 })
				setItemElevation(0)
				void handleLoadItemAsset('')
				return
			}
			if (activeItemVariantIndex === null) {
				setActiveItemVariantIndex(null)
				return
			}
			let nextIndex = activeItemVariantIndex
			if (index === activeItemVariantIndex) {
				nextIndex = Math.min(activeItemVariantIndex, next.length - 1)
			} else if (index < activeItemVariantIndex) {
				nextIndex = Math.max(0, activeItemVariantIndex - 1)
			}
			setActiveItemVariantIndex(nextIndex)
			const variant = next[nextIndex]
			if (variant) {
				setItemRotationDeg(variant.rotationDeg)
				setItemScale(variant.scale)
				setItemElevation(variant.elevation)
				const modelSrc = variant.modelSrc || ''
				setItemAssetPath(modelSrc)
				if (modelSrc) {
					if (assetOptions.includes(modelSrc)) {
						setSelectedItemAsset(modelSrc)
					} else {
						setSelectedItemAsset('')
					}
					void handleLoadItemAsset(modelSrc)
				} else {
					setSelectedItemAsset('')
				}
			}
		},
		[
			activeItemVariantIndex,
			assetOptions,
			handleLoadItemAsset,
			itemModelVariants
		]
	)

	const updateActiveItemRotation = useCallback(
		(updates: Partial<Vec3>) => {
			if (activeItemVariantIndex === null) {
				setItemRotationDeg((prev) => ({ ...prev, ...updates }))
				return
			}
			setItemRotationDeg((prev) => {
				const next = { ...prev, ...updates }
				updateItemVariant(activeItemVariantIndex, { rotationDeg: next })
				return next
			})
		},
		[activeItemVariantIndex, updateItemVariant]
	)

	const updateActiveItemScale = useCallback(
		(updates: Partial<Vec3>) => {
			if (activeItemVariantIndex === null) {
				setItemScale((prev) => ({ ...prev, ...updates }))
				return
			}
			setItemScale((prev) => {
				const next = { ...prev, ...updates }
				updateItemVariant(activeItemVariantIndex, { scale: next })
				return next
			})
		},
		[activeItemVariantIndex, updateItemVariant]
	)

	const updateActiveItemElevation = useCallback(
		(value: number) => {
			if (activeItemVariantIndex === null) {
				setItemElevation(value)
				return
			}
			setItemElevation(value)
			updateItemVariant(activeItemVariantIndex, { elevation: value })
		},
		[activeItemVariantIndex, updateItemVariant]
	)

	const updateStorageSlot = useCallback((index: number, updates: Partial<StorageSlot>) => {
		setStorageSlots((prev) =>
			prev.map((slot, slotIndex) => {
				if (slotIndex !== index) return slot
				const hasOffsetUpdate = Object.prototype.hasOwnProperty.call(updates, 'offset')
				let nextOffset = slot.offset
				if (hasOffsetUpdate) {
					if (updates.offset) {
						nextOffset = {
							...(slot.offset || { x: 0, y: 0 }),
							...updates.offset
						}
					} else {
						nextOffset = undefined
					}
				}
				return {
					...slot,
					...updates,
					offset: nextOffset
				}
			})
		)
	}, [])

	const handlePickMode = useCallback((mode: 'position' | 'entry' | 'center' | 'access' | 'blocked') => {
		setPickMode((prev) => (prev === mode ? 'position' : mode))
	}, [])

	const handleEditingFocus = useCallback(() => {
		setIsEditingFields(true)
	}, [])

	const handleEditingBlur = useCallback((event: React.FocusEvent<HTMLElement>) => {
		const next = event.relatedTarget as Node | null
		if (next && event.currentTarget.contains(next)) return
		setIsEditingFields(false)
	}, [])

	const updatePoint = useCallback((current: Vec2 | null, axis: 'x' | 'y', value: string): Vec2 | null => {
		if (!value.trim()) return null
		const parsed = Number.parseFloat(value)
		if (!Number.isFinite(parsed)) return current
		return {
			x: axis === 'x' ? parsed : current?.x ?? 0,
			y: axis === 'y' ? parsed : current?.y ?? 0
		}
	}, [])

	const handleSetCenterFromFootprint = useCallback(() => {
		setCenterPoint({
			x: footprint.width / 2,
			y: footprint.length / 2
		})
	}, [footprint.length, footprint.width])

	const removeStorageSlot = useCallback((index: number) => {
		setStorageSlots((prev) => prev.filter((_, slotIndex) => slotIndex !== index))
	}, [])

	const applyDefinitionToEditor = useCallback((draft: Record<string, any>) => {
		const footprintDef = draft.footprint || {}
		const width = Number(footprintDef.width) || 1
		const length = Number(footprintDef.height ?? footprintDef.length) || 1
		setFootprint({ width, length })
		setAssetId(draft.id || DEFAULT_ASSET_ID)
		const buildVariantState = (variant: BuildingRenderVariant): BuildingRenderVariantState => {
			const transform = variant.transform || {}
			const rotation = transform.rotation || { x: 0, y: 0, z: 0 }
			return {
				modelSrc: variant.modelSrc,
				weight: typeof variant.weight === 'number' && Number.isFinite(variant.weight) ? variant.weight : 1,
				rotationDeg: {
					x: toDegrees(rotation.x || 0),
					y: toDegrees(rotation.y || 0),
					z: toDegrees(rotation.z || 0)
				},
				scale: {
					x: transform.scale?.x ?? 1,
					y: transform.scale?.y ?? 1,
					z: transform.scale?.z ?? 1
				},
				elevation: transform.elevation ?? 0
			}
		}
		const renderVariants = Array.isArray(draft.renders)
			? draft.renders.filter((variant) => Boolean(variant?.modelSrc))
			: []
		const legacyRender = draft.render?.modelSrc
			? [
					{
						modelSrc: draft.render.modelSrc,
						weight: 1,
						transform: draft.render.transform
					}
				]
			: []
		const nextVariants = (renderVariants.length > 0 ? renderVariants : legacyRender).map(buildVariantState)
		setBuildingModelVariants(nextVariants)
		if (nextVariants.length > 0) {
			const first = nextVariants[0]
			setActiveBuildingVariantIndex(0)
			setRotationDeg(first.rotationDeg)
			setScale(first.scale)
			setElevation(first.elevation)
			const modelSrc = first.modelSrc || ''
			setAssetPath(modelSrc)
			if (modelSrc) {
				if (assetOptions.includes(modelSrc)) {
					setSelectedAsset(modelSrc)
				} else {
					setSelectedAsset('')
				}
				void handleLoadAsset(modelSrc)
			} else {
				setSelectedAsset('')
				setAssetOpen(true)
			}
		} else {
			setActiveBuildingVariantIndex(null)
			setRotationDeg({ x: 0, y: 0, z: 0 })
			setScale({ x: 1, y: 1, z: 1 })
			setElevation(0)
			setAssetPath('')
			setSelectedAsset('')
			setAssetOpen(true)
			void handleLoadAsset('')
		}
		const entry = draft.entryPoint ?? draft.entry ?? null
		if (entry && typeof entry === 'object') {
			setEntryPoint({
				x: Number(entry.x ?? 0),
				y: Number(entry.y ?? 0)
			})
		} else {
			setEntryPoint(null)
		}
		const center = draft.centerPoint ?? draft.center ?? null
		if (center && typeof center === 'object') {
			setCenterPoint({
				x: Number(center.x ?? 0),
				y: Number(center.y ?? 0)
			})
		} else {
			setCenterPoint(null)
		}
		const slots = Array.isArray(draft.storageSlots)
			? draft.storageSlots
			: Array.isArray(draft.storage?.slots)
				? draft.storage.slots
				: []
		setStorageSlots(
			slots.map((slot: any) => {
				const itemType = String(slot.itemType ?? '')
				const offset =
					slot.offset && typeof slot.offset === 'object'
						? {
								x: Number(slot.offset?.x ?? 0),
								y: Number(slot.offset?.y ?? 0)
							}
						: undefined
				return {
					itemType,
					offset,
					hidden: slot.hidden ? true : offset ? undefined : true,
					maxQuantity: typeof slot.maxQuantity === 'number' ? slot.maxQuantity : undefined,
					emoji: itemEmojiMap.get(itemType) || ''
				}
			})
		)
		const access = Array.isArray(draft.accessTiles) ? draft.accessTiles : []
		setAccessTiles(
			access.map((tile: any) => ({
				x: Number(tile?.x ?? 0),
				y: Number(tile?.y ?? 0)
			}))
		)
		const blocked = Array.isArray(draft.blockedTiles) ? draft.blockedTiles : []
		setBlockedTiles(
			blocked.map((tile: any) => ({
				x: Number(tile?.x ?? 0),
				y: Number(tile?.y ?? 0)
			}))
		)
	}, [assetOptions, handleLoadAsset, itemEmojiMap])

	const loadDefinition = useCallback((definition: Record<string, any> | null) => {
		if (!definition) {
			setDefinitionDraft(null)
			setStorageSlots([])
			setAccessTiles([])
			setBlockedTiles([])
			setBuildingModelVariants([])
			setActiveBuildingVariantIndex(null)
			setAssetPath('')
			setSelectedAsset('')
			setRotationDeg({ x: 0, y: 0, z: 0 })
			setScale({ x: 1, y: 1, z: 1 })
			setElevation(0)
			void handleLoadAsset('')
			return
		}
		const draft = cloneDefinition(definition)
		setDefinitionDraft(draft)
		applyDefinitionToEditor(draft)
	}, [applyDefinitionToEditor, handleLoadAsset])

	const applyResourceRenderToEditor = useCallback((draft: ResourceNodeRenderDefinition | null) => {
		if (!draft) {
			setResourceFootprint({ width: 1, length: 1 })
			setResourceAssetPath('')
			setSelectedResourceAsset('')
			setResourceModelVariants([])
			setActiveResourceVariantIndex(null)
			setResourceRotationDeg({ x: 0, y: 0, z: 0 })
			setResourceScale({ x: 1, y: 1, z: 1 })
			setResourceElevation(0)
			return
		}
		const footprintDef = draft.footprint || {}
		const width = Number(footprintDef.width) || 1
		const length = Number(footprintDef.height ?? footprintDef.length) || 1
		setResourceFootprint({ width, length })
		const buildVariantState = (variant: ResourceNodeRenderVariant): ResourceNodeRenderVariantState => {
			const transform = variant.transform || {}
			const rotation = transform.rotation || { x: 0, y: 0, z: 0 }
			return {
				modelSrc: variant.modelSrc,
				weight: typeof variant.weight === 'number' && Number.isFinite(variant.weight) ? variant.weight : 1,
				rotationDeg: {
					x: toDegrees(rotation.x || 0),
					y: toDegrees(rotation.y || 0),
					z: toDegrees(rotation.z || 0)
				},
				scale: {
					x: transform.scale?.x ?? 1,
					y: transform.scale?.y ?? 1,
					z: transform.scale?.z ?? 1
				},
				elevation: transform.elevation ?? 0
			}
		}
		const renderVariants = Array.isArray(draft.renders)
			? draft.renders.filter((variant) => Boolean(variant?.modelSrc))
			: []
		const legacyRender = draft.render?.modelSrc
			? [
					{
						modelSrc: draft.render.modelSrc,
						weight: 1,
						transform: draft.render.transform
					}
				]
			: []
		const nextVariants = (renderVariants.length > 0 ? renderVariants : legacyRender).map(buildVariantState)
		setResourceModelVariants(nextVariants)
		setActiveResourceVariantIndex(null)
		setResourceAssetPath('')
		setSelectedResourceAsset('')
		setResourceRotationDeg({ x: 0, y: 0, z: 0 })
		setResourceScale({ x: 1, y: 1, z: 1 })
		setResourceElevation(0)
	}, [assetOptions, handleLoadResourceAsset])

	const loadResourceRender = useCallback((definitionId: string) => {
		if (!definitionId) {
			applyResourceRenderToEditor(null)
			return
		}
		const draft = resourceRenderDefinitions.find((definition) => definition.id === definitionId) || null
		applyResourceRenderToEditor(draft)
		if (!draft) {
			setAssetOpen(true)
		}
	}, [applyResourceRenderToEditor, resourceRenderDefinitions])

	const applyItemRenderToEditor = useCallback((draft: ItemRenderDefinition | null) => {
		if (!draft) {
			setItemFootprint({ width: 1, length: 1 })
			setItemAssetPath('')
			setSelectedItemAsset('')
			setItemModelVariants([])
			setActiveItemVariantIndex(null)
			setItemRotationDeg({ x: 0, y: 0, z: 0 })
			setItemScale({ x: 1, y: 1, z: 1 })
			setItemElevation(0)
			return
		}
		const footprintDef = draft.footprint || {}
		const width = Number(footprintDef.width) || 1
		const length = Number(footprintDef.height ?? footprintDef.length) || 1
		setItemFootprint({ width, length })
		const buildVariantState = (variant: ItemRenderVariant): ItemRenderVariantState => {
			const transform = variant.transform || {}
			const rotation = transform.rotation || { x: 0, y: 0, z: 0 }
			return {
				modelSrc: variant.modelSrc,
				weight: typeof variant.weight === 'number' && Number.isFinite(variant.weight) ? variant.weight : 1,
				rotationDeg: {
					x: toDegrees(rotation.x || 0),
					y: toDegrees(rotation.y || 0),
					z: toDegrees(rotation.z || 0)
				},
				scale: {
					x: transform.scale?.x ?? 1,
					y: transform.scale?.y ?? 1,
					z: transform.scale?.z ?? 1
				},
				elevation: transform.elevation ?? 0
			}
		}
		const renderVariants = Array.isArray(draft.renders)
			? draft.renders.filter((variant) => Boolean(variant?.modelSrc))
			: []
		const legacyRender = draft.render?.modelSrc
			? [
					{
						modelSrc: draft.render.modelSrc,
						weight: 1,
						transform: draft.render.transform
					}
				]
			: []
		const nextVariants = (renderVariants.length > 0 ? renderVariants : legacyRender).map(buildVariantState)
		setItemModelVariants(nextVariants)
		setActiveItemVariantIndex(null)
		setItemAssetPath('')
		setSelectedItemAsset('')
		setItemRotationDeg({ x: 0, y: 0, z: 0 })
		setItemScale({ x: 1, y: 1, z: 1 })
		setItemElevation(0)
	}, [assetOptions, handleLoadItemAsset])

	const loadItemRender = useCallback((definitionId: string) => {
		if (!definitionId) {
			applyItemRenderToEditor(null)
			return
		}
		const draft = itemRenderDefinitions.find((definition) => definition.id === definitionId) || null
		applyItemRenderToEditor(draft)
		if (!draft) {
			setAssetOpen(true)
		}
	}, [applyItemRenderToEditor, itemRenderDefinitions])

	const buildingRenderOutput = useMemo(() => {
		const variants =
			buildingModelVariants.length > 0
				? buildingModelVariants.filter((variant) => Boolean(variant.modelSrc))
				: assetPath
					? [
							{
								modelSrc: assetPath,
								weight: 1,
								rotationDeg,
								scale,
								elevation
							}
						]
					: []
		if (variants.length === 0) return null
		const normalizedVariants = variants.map((variant) => {
			const rotationRad = {
				x: toRadians(variant.rotationDeg.x),
				y: toRadians(variant.rotationDeg.y),
				z: toRadians(variant.rotationDeg.z)
			}
			const transformOverrides = buildTransform(rotationRad, variant.scale, variant.elevation)
			return {
				modelSrc: variant.modelSrc,
				weight: variant.weight,
				transform: transformOverrides ?? undefined
			}
		})
		if (normalizedVariants.length === 1 && (normalizedVariants[0].weight ?? 1) === 1) {
			return {
				render: {
					modelSrc: normalizedVariants[0].modelSrc,
					transform: normalizedVariants[0].transform
				}
			}
		}
		return { renders: normalizedVariants }
	}, [assetPath, buildingModelVariants, elevation, rotationDeg, scale])

	const definitionOutput = useMemo(() => {
		if (!definitionDraft) return null
		return mergeDefinitionWithEditor(definitionDraft, {
			assetPath,
			rotation: rotationRad,
			scale,
			elevation,
			footprint,
			storageSlots,
			entryPoint,
			centerPoint,
			accessTiles,
			blockedTiles,
			renderOutput: buildingRenderOutput
		})
	}, [
		assetPath,
		buildingRenderOutput,
		definitionDraft,
		elevation,
		footprint,
		rotationRad,
		scale,
		storageSlots,
		entryPoint,
		centerPoint,
		accessTiles,
		blockedTiles
	])

	const resourceRenderOutput = useMemo(() => {
		if (!selectedResourceId) return null
		const variants =
			resourceModelVariants.length > 0
				? resourceModelVariants.filter((variant) => Boolean(variant.modelSrc))
				: resourceAssetPath
					? [
							{
								modelSrc: resourceAssetPath,
								weight: 1,
								rotationDeg: resourceRotationDeg,
								scale: resourceScale,
								elevation: resourceElevation
							}
						]
					: []
		const output: ResourceNodeRenderDefinition = {
			id: selectedResourceId,
			footprint: {
				width: resourceFootprint.width,
				height: resourceFootprint.length
			}
		}
		if (variants.length > 0) {
			const normalizedVariants = variants.map((variant) => {
				const rotationRad = {
					x: toRadians(variant.rotationDeg.x),
					y: toRadians(variant.rotationDeg.y),
					z: toRadians(variant.rotationDeg.z)
				}
				const transformOverrides = buildTransform(rotationRad, variant.scale, variant.elevation)
				return {
					modelSrc: variant.modelSrc,
					weight: variant.weight,
					transform: transformOverrides ?? undefined
				}
			})
			if (normalizedVariants.length === 1 && (normalizedVariants[0].weight ?? 1) === 1) {
				output.render = {
					modelSrc: normalizedVariants[0].modelSrc,
					transform: normalizedVariants[0].transform
				}
			} else {
				output.renders = normalizedVariants
			}
		}
		return output
	}, [
		resourceAssetPath,
		resourceElevation,
		resourceFootprint.length,
		resourceFootprint.width,
		resourceModelVariants,
		resourceRotationDeg,
		resourceScale,
		selectedResourceId
	])

	const itemRenderOutput = useMemo(() => {
		if (!selectedItemId) return null
		const variants =
			itemModelVariants.length > 0
				? itemModelVariants.filter((variant) => Boolean(variant.modelSrc))
				: itemAssetPath
					? [
							{
								modelSrc: itemAssetPath,
								weight: 1,
								rotationDeg: itemRotationDeg,
								scale: itemScale,
								elevation: itemElevation
							}
						]
					: []
		const output: ItemRenderDefinition = {
			id: selectedItemId,
			footprint: {
				width: itemFootprint.width,
				height: itemFootprint.length
			}
		}
		if (variants.length > 0) {
			const normalizedVariants = variants.map((variant) => {
				const rotationRad = {
					x: toRadians(variant.rotationDeg.x),
					y: toRadians(variant.rotationDeg.y),
					z: toRadians(variant.rotationDeg.z)
				}
				const transformOverrides = buildTransform(rotationRad, variant.scale, variant.elevation)
				return {
					modelSrc: variant.modelSrc,
					weight: variant.weight,
					transform: transformOverrides ?? undefined
				}
			})
			if (normalizedVariants.length === 1 && (normalizedVariants[0].weight ?? 1) === 1) {
				output.render = {
					modelSrc: normalizedVariants[0].modelSrc,
					transform: normalizedVariants[0].transform
				}
			} else {
				output.renders = normalizedVariants
			}
		}
		return output
	}, [
		itemAssetPath,
		itemElevation,
		itemFootprint.length,
		itemFootprint.width,
		itemModelVariants,
		itemRotationDeg,
		itemScale,
		selectedItemId
	])

	useEffect(() => {
		if (!resourceRenderOutput || !resourceRenderOutput.id) return
		setResourceRenderDefinitions((prev) => {
			const existingIndex = prev.findIndex((entry) => entry.id === resourceRenderOutput.id)
			if (existingIndex === -1) {
				if (!isResourceRenderMeaningful(resourceRenderOutput)) {
					return prev
				}
				return [...prev, resourceRenderOutput]
			}
			const nextList = [...prev]
			nextList[existingIndex] = resourceRenderOutput
			return nextList
		})
	}, [resourceRenderOutput])

	useEffect(() => {
		if (!itemRenderOutput || !itemRenderOutput.id) return
		setItemRenderDefinitions((prev) => {
			const existingIndex = prev.findIndex((entry) => entry.id === itemRenderOutput.id)
			if (existingIndex === -1) {
				if (!isItemRenderMeaningful(itemRenderOutput)) {
					return prev
				}
				return [...prev, itemRenderOutput]
			}
			const nextList = [...prev]
			nextList[existingIndex] = itemRenderOutput
			return nextList
		})
	}, [itemRenderOutput])

	useEffect(() => {
		const loadIndex = async () => {
			try {
				setAssetIndexError(null)
				const response = await fetch('/assets/asset-index.json', { cache: 'no-cache' })
				if (!response.ok) {
					return
				}
				const data = await response.json()
				if (Array.isArray(data?.assets)) {
					setAssetOptions(data.assets)
				}
			} catch (error) {
				void error
				setAssetIndexError('Asset index not available yet.')
			}
		}
		void loadIndex()
	}, [])

	useEffect(() => {
		const loadResourceRenders = async () => {
			try {
				setResourceRenderError(null)
				const response = await fetch('/assets/resource-node-renders.json', { cache: 'no-cache' })
				if (!response.ok) {
					setResourceRenderDefinitions([])
					return
				}
				const data = await response.json()
				if (Array.isArray(data)) {
					setResourceRenderDefinitions(data)
					return
				}
				if (Array.isArray(data?.resourceNodeRenders)) {
					setResourceRenderDefinitions(data.resourceNodeRenders)
					return
				}
				setResourceRenderError('Resource render config has unexpected format.')
			} catch (error) {
				void error
				setResourceRenderDefinitions([])
			}
		}
		void loadResourceRenders()
	}, [])

	useEffect(() => {
		const loadItemRenders = async () => {
			try {
				setItemRenderError(null)
				const response = await fetch('/assets/item-renders.json', { cache: 'no-cache' })
				if (!response.ok) {
					setItemRenderDefinitions([])
					return
				}
				const data = await response.json()
				if (Array.isArray(data)) {
					setItemRenderDefinitions(data)
					return
				}
				if (Array.isArray(data?.itemRenders)) {
					setItemRenderDefinitions(data.itemRenders)
					return
				}
				setItemRenderError('Item render config has unexpected format.')
			} catch (error) {
				void error
				setItemRenderDefinitions([])
			}
		}
		void loadItemRenders()
	}, [])

	useEffect(() => {
		if (!assetPath) return
		if (!assetOptions.includes(assetPath)) return
		if (selectedAsset === assetPath) return
		setSelectedAsset(assetPath)
	}, [assetOptions, assetPath, selectedAsset])

	useEffect(() => {
		if (!isBuildingMode) return
		if (!assetPath) return
		if (activeBuildingVariantIndex === null) return
		setBuildingModelVariants((prev) => {
			if (prev.length === 0) {
				return [
					{
						modelSrc: assetPath,
						weight: 1,
						rotationDeg,
						scale,
						elevation
					}
				]
			}
			const index = Math.min(Math.max(activeBuildingVariantIndex, 0), prev.length - 1)
			const target = prev[index]
			if (target?.modelSrc === assetPath) {
				return prev
			}
			return prev.map((variant, variantIndex) =>
				variantIndex === index ? { ...variant, modelSrc: assetPath } : variant
			)
		})
	}, [activeBuildingVariantIndex, assetPath, elevation, isBuildingMode, rotationDeg, scale])

	useEffect(() => {
		if (!resourceAssetPath) return
		if (!assetOptions.includes(resourceAssetPath)) return
		if (selectedResourceAsset === resourceAssetPath) return
		setSelectedResourceAsset(resourceAssetPath)
	}, [assetOptions, resourceAssetPath, selectedResourceAsset])

	useEffect(() => {
		if (!itemAssetPath) return
		if (!assetOptions.includes(itemAssetPath)) return
		if (selectedItemAsset === itemAssetPath) return
		setSelectedItemAsset(itemAssetPath)
	}, [assetOptions, itemAssetPath, selectedItemAsset])

	useEffect(() => {
		if (!isResourceMode) return
		if (!resourceAssetPath) return
		if (activeResourceVariantIndex === null) return
		setResourceModelVariants((prev) => {
			if (prev.length === 0) {
				return [
					{
						modelSrc: resourceAssetPath,
						weight: 1,
						rotationDeg: resourceRotationDeg,
						scale: resourceScale,
						elevation: resourceElevation
					}
				]
			}
			const index = Math.min(Math.max(activeResourceVariantIndex, 0), prev.length - 1)
			const target = prev[index]
			if (target?.modelSrc === resourceAssetPath) {
				return prev
			}
			return prev.map((variant, variantIndex) =>
				variantIndex === index ? { ...variant, modelSrc: resourceAssetPath } : variant
			)
		})
	}, [
		activeResourceVariantIndex,
		isResourceMode,
		resourceAssetPath,
		resourceElevation,
		resourceRotationDeg,
		resourceScale
	])

	useEffect(() => {
		if (!isItemMode) return
		if (!itemAssetPath) return
		if (activeItemVariantIndex === null) return
		setItemModelVariants((prev) => {
			if (prev.length === 0) {
				return [
					{
						modelSrc: itemAssetPath,
						weight: 1,
						rotationDeg: itemRotationDeg,
						scale: itemScale,
						elevation: itemElevation
					}
				]
			}
			const index = Math.min(Math.max(activeItemVariantIndex, 0), prev.length - 1)
			const target = prev[index]
			if (target?.modelSrc === itemAssetPath) {
				return prev
			}
			return prev.map((variant, variantIndex) =>
				variantIndex === index ? { ...variant, modelSrc: itemAssetPath } : variant
			)
		})
	}, [
		activeItemVariantIndex,
		isItemMode,
		itemAssetPath,
		itemElevation,
		itemRotationDeg,
		itemScale
	])

	useEffect(() => {
		if (itemEmojiMap.size === 0) return
		setStorageSlots((prev) =>
			prev.map((slot) => {
				if (slot.emoji) return slot
				const emoji = itemEmojiMap.get(slot.itemType) || ''
				if (!emoji) return slot
				return { ...slot, emoji }
			})
		)
	}, [itemEmojiMap])


	const buildBuildingsPayload = useCallback(
		(nextDefinition: Record<string, any>) => {
			const existingIndex = buildingDefinitions.findIndex((building) => building.id === nextDefinition.id)
			let buildingsList: Array<Record<string, any>> = []
			if (existingIndex >= 0) {
				buildingsList = buildingDefinitions.map((building, index) =>
					index === existingIndex ? nextDefinition : building
				)
			} else {
				buildingsList = [...buildingDefinitions, nextDefinition]
			}
			return { buildings: buildingsList }
		},
		[buildingDefinitions]
	)

	const downloadBuildingsFile = useCallback((payload: Record<string, any>) => {
		const blob = new Blob([JSON.stringify(payload, null, 2) + '\n'], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const anchor = document.createElement('a')
		anchor.href = url
		anchor.download = 'buildings.json'
		anchor.click()
		URL.revokeObjectURL(url)
	}, [])

	const handlePickBuildingsFile = useCallback(async (): Promise<FileSystemFileHandle | null> => {
		if (!('showOpenFilePicker' in window)) {
			setFileStatus('File picker not supported in this browser.')
			return null
		}
		try {
			const [handle] = await window.showOpenFilePicker({
				multiple: false,
				types: [
					{
						description: 'Buildings JSON',
						accept: { 'application/json': ['.json'] }
					}
				]
			})
			if (handle) {
				setBuildingsFileHandle(handle)
				setFileStatus(`Linked ${handle.name}`)
				return handle
			}
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				return null
			}
			setFileStatus('Failed to pick file.')
		}
		return null
	}, [])

	const handleSaveToBuildingsFile = useCallback(async () => {
		if (!definitionOutput || !definitionOutput.id) {
			setFileStatus('Select a building definition first.')
			return
		}

		if (!supportsFilePicker) {
			const payload = buildBuildingsPayload(definitionOutput)
			downloadBuildingsFile(payload)
			setFileStatus('Downloaded buildings.json. Replace content/settlerpolis/buildings.json')
			return
		}

		let handle = buildingsFileHandle
		if (!handle) {
			handle = await handlePickBuildingsFile()
		}
		if (!handle) {
			return
		}

		try {
			const permission = await handle.requestPermission({ mode: 'readwrite' })
			if (permission !== 'granted') {
				setFileStatus('Write permission denied.')
				return
			}
			const file = await handle.getFile()
			const text = await file.text()
			const parsed = JSON.parse(text)
			let buildingsList: Array<Record<string, any>> = []
			let wrapObject: Record<string, any> | null = null

			if (Array.isArray(parsed)) {
				buildingsList = parsed
			} else if (parsed && Array.isArray(parsed.buildings)) {
				buildingsList = parsed.buildings
				wrapObject = parsed
			} else {
				setFileStatus('Invalid buildings.json format.')
				return
			}

			const nextDefinition = definitionOutput
			const existingIndex = buildingsList.findIndex((building) => building.id === nextDefinition.id)
			if (existingIndex >= 0) {
				buildingsList[existingIndex] = nextDefinition
			} else {
				buildingsList.push(nextDefinition)
			}

			const payload = wrapObject ? { ...wrapObject, buildings: buildingsList } : buildingsList
			const writable = await handle.createWritable()
			await writable.write(JSON.stringify(payload, null, 2) + '\n')
			await writable.close()
			setFileStatus(`Saved ${nextDefinition.id}`)
		} catch (error) {
			void error
			setFileStatus('Failed to save file.')
		}
	}, [
		buildBuildingsPayload,
		buildingsFileHandle,
		definitionOutput,
		downloadBuildingsFile,
		handlePickBuildingsFile,
		supportsFilePicker
	])

	const buildResourceRenderList = useCallback(
		(nextDefinition: ResourceNodeRenderDefinition) => {
			const existingIndex = resourceRenderDefinitions.findIndex((entry) => entry.id === nextDefinition.id)
			if (existingIndex >= 0) {
				return resourceRenderDefinitions.map((entry, index) =>
					index === existingIndex ? nextDefinition : entry
				)
			}
			return [...resourceRenderDefinitions, nextDefinition]
		},
		[resourceRenderDefinitions]
	)

	const downloadResourceRenderFile = useCallback((payload: unknown) => {
		const blob = new Blob([JSON.stringify(payload, null, 2) + '\n'], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const anchor = document.createElement('a')
		anchor.href = url
		anchor.download = 'resourceNodeRenders.json'
		anchor.click()
		URL.revokeObjectURL(url)
	}, [])

	const handlePickResourceFile = useCallback(async (): Promise<FileSystemFileHandle | null> => {
		if (!('showOpenFilePicker' in window)) {
			setResourceFileStatus('File picker not supported in this browser.')
			return null
		}
		try {
			const [handle] = await window.showOpenFilePicker({
				multiple: false,
				types: [
					{
						description: 'Resource render JSON',
						accept: { 'application/json': ['.json'] }
					}
				]
			})
			if (handle) {
				setResourceFileHandle(handle)
				setResourceFileStatus(`Linked ${handle.name}`)
				return handle
			}
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				return null
			}
			setResourceFileStatus('Failed to pick file.')
		}
		return null
	}, [])

	const handleSaveResourceRenderFile = useCallback(async () => {
		if (!resourceRenderOutput || !resourceRenderOutput.id) {
			setResourceFileStatus('Select a resource node first.')
			return
		}

		if (!supportsFilePicker) {
			const renderList = buildResourceRenderList(resourceRenderOutput)
			downloadResourceRenderFile({ resourceNodeRenders: renderList })
			setResourceFileStatus('Downloaded resourceNodeRenders.json. Replace content/settlerpolis/resourceNodeRenders.json')
			return
		}

		let handle = resourceFileHandle
		if (!handle) {
			handle = await handlePickResourceFile()
		}
		if (!handle) {
			return
		}

		try {
			const permission = await handle.requestPermission({ mode: 'readwrite' })
			if (permission !== 'granted') {
				setResourceFileStatus('Write permission denied.')
				return
			}
			const file = await handle.getFile()
			const text = await file.text()
			const parsed = JSON.parse(text)
			let renderList: ResourceNodeRenderDefinition[] = []
			let wrapObject: Record<string, any> | null = null
			let wrapKey: 'resourceNodeRenders' | 'resourceNodes' | null = null
			let useArrayPayload = false

			if (Array.isArray(parsed)) {
				renderList = parsed
				useArrayPayload = true
			} else if (parsed && Array.isArray(parsed.resourceNodeRenders)) {
				renderList = parsed.resourceNodeRenders
				wrapObject = parsed
				wrapKey = 'resourceNodeRenders'
			} else if (parsed && Array.isArray(parsed.resourceNodes)) {
				renderList = parsed.resourceNodes
				wrapObject = parsed
				wrapKey = 'resourceNodes'
			} else {
				setResourceFileStatus('Invalid resourceNodeRenders.json format.')
				return
			}

			const nextDefinition = resourceRenderOutput
			const existingIndex = renderList.findIndex((entry) => entry.id === nextDefinition.id)
			const updatedList =
				existingIndex >= 0
					? renderList.map((entry, index) => (index === existingIndex ? nextDefinition : entry))
					: [...renderList, nextDefinition]

			let payload: unknown
			if (wrapObject) {
				const key = wrapKey ?? 'resourceNodeRenders'
				payload = { ...wrapObject, [key]: updatedList }
			} else if (useArrayPayload) {
				payload = updatedList
			} else {
				payload = { resourceNodeRenders: updatedList }
			}

			const writable = await handle.createWritable()
			await writable.write(JSON.stringify(payload, null, 2) + '\n')
			await writable.close()
			setResourceFileStatus(`Saved ${nextDefinition.id}`)
			setResourceRenderDefinitions(buildResourceRenderList(nextDefinition))
		} catch (error) {
			void error
			setResourceFileStatus('Failed to save file.')
		}
	}, [
		buildResourceRenderList,
		downloadResourceRenderFile,
		handlePickResourceFile,
		resourceFileHandle,
		resourceRenderOutput,
		supportsFilePicker
	])

	const buildItemRenderList = useCallback(
		(nextDefinition: ItemRenderDefinition) => {
			const existingIndex = itemRenderDefinitions.findIndex((entry) => entry.id === nextDefinition.id)
			if (existingIndex >= 0) {
				return itemRenderDefinitions.map((entry, index) =>
					index === existingIndex ? nextDefinition : entry
				)
			}
			return [...itemRenderDefinitions, nextDefinition]
		},
		[itemRenderDefinitions]
	)

	const downloadItemRenderFile = useCallback((payload: unknown) => {
		const blob = new Blob([JSON.stringify(payload, null, 2) + '\n'], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const anchor = document.createElement('a')
		anchor.href = url
		anchor.download = 'itemRenders.json'
		anchor.click()
		URL.revokeObjectURL(url)
	}, [])

	const handlePickItemFile = useCallback(async (): Promise<FileSystemFileHandle | null> => {
		if (!('showOpenFilePicker' in window)) {
			setItemFileStatus('File picker not supported in this browser.')
			return null
		}
		try {
			const [handle] = await window.showOpenFilePicker({
				multiple: false,
				types: [
					{
						description: 'Item render JSON',
						accept: { 'application/json': ['.json'] }
					}
				]
			})
			if (handle) {
				setItemFileHandle(handle)
				setItemFileStatus(`Linked ${handle.name}`)
				return handle
			}
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				return null
			}
			setItemFileStatus('Failed to pick file.')
		}
		return null
	}, [])

	const handleSaveItemRenderFile = useCallback(async () => {
		if (!itemRenderOutput || !itemRenderOutput.id) {
			setItemFileStatus('Select an item first.')
			return
		}

		if (!supportsFilePicker) {
			const renderList = buildItemRenderList(itemRenderOutput)
			downloadItemRenderFile({ itemRenders: renderList })
			setItemFileStatus('Downloaded itemRenders.json. Replace content/settlerpolis/itemRenders.json')
			return
		}

		let handle = itemFileHandle
		if (!handle) {
			handle = await handlePickItemFile()
		}
		if (!handle) {
			return
		}

		try {
			const permission = await handle.requestPermission({ mode: 'readwrite' })
			if (permission !== 'granted') {
				setItemFileStatus('Write permission denied.')
				return
			}
			const file = await handle.getFile()
			const text = await file.text()
			const parsed = JSON.parse(text)
			let renderList: ItemRenderDefinition[] = []
			let wrapObject: Record<string, any> | null = null
			let wrapKey: 'itemRenders' | null = null
			let useArrayPayload = false

			if (Array.isArray(parsed)) {
				renderList = parsed
				useArrayPayload = true
			} else if (parsed && Array.isArray(parsed.itemRenders)) {
				renderList = parsed.itemRenders
				wrapObject = parsed
				wrapKey = 'itemRenders'
			} else {
				setItemFileStatus('Invalid itemRenders.json format.')
				return
			}

			const nextDefinition = itemRenderOutput
			const existingIndex = renderList.findIndex((entry) => entry.id === nextDefinition.id)
			const updatedList =
				existingIndex >= 0
					? renderList.map((entry, index) => (index === existingIndex ? nextDefinition : entry))
					: [...renderList, nextDefinition]

			let payload: unknown
			if (wrapObject) {
				const key = wrapKey ?? 'itemRenders'
				payload = { ...wrapObject, [key]: updatedList }
			} else if (useArrayPayload) {
				payload = updatedList
			} else {
				payload = { itemRenders: updatedList }
			}

			const writable = await handle.createWritable()
			await writable.write(JSON.stringify(payload, null, 2) + '\n')
			await writable.close()
			setItemFileStatus(`Saved ${nextDefinition.id}`)
			setItemRenderDefinitions(buildItemRenderList(nextDefinition))
		} catch (error) {
			void error
			setItemFileStatus('Failed to save file.')
		}
	}, [
		buildItemRenderList,
		downloadItemRenderFile,
		handlePickItemFile,
		itemFileHandle,
		itemRenderOutput,
		supportsFilePicker
	])

	return (
		<div className={styles.editorApp}>
			<div className={styles.sidebar}>
				<header className={styles.header}>
					<div>
						<p className={styles.overline}>Asset Placement Editor</p>
					</div>
					<button
						className={styles.infoButton}
						type="button"
						onClick={() => setShowHelp((prev) => !prev)}
						aria-expanded={showHelp}
						aria-label="Toggle editor help"
					>
						?
					</button>
				</header>
				<div className={styles.tabRow}>
					<button
						className={`${styles.tabButton} ${isBuildingMode ? styles.tabButtonActive : ''}`}
						type="button"
						onClick={() => setEditorMode('building')}
					>
						Buildings
					</button>
					<button
						className={`${styles.tabButton} ${isResourceMode ? styles.tabButtonActive : ''}`}
						type="button"
						onClick={() => setEditorMode('resource')}
					>
						Resources
					</button>
					<button
						className={`${styles.tabButton} ${isItemMode ? styles.tabButtonActive : ''}`}
						type="button"
						onClick={() => setEditorMode('item')}
					>
						Items
					</button>
				</div>
				{showHelp && (
					<section className={styles.helpPanel}>
						<h2 className={styles.helpTitle}>How to use</h2>
						<ul className={styles.helpList}>
							<li>Drop a model in content/settlerpolis/assets.</li>
							<li>Run the dev server to copy assets + build the index.</li>
							<li>Resource renders are copied to public assets on dev/build.</li>
							<li>Select a model from the library.</li>
							<li>Click the grid to set the top-left tile.</li>
							<li>Set width/length (grid tiles) and transforms.</li>
							<li>Save updates to buildings.json from the definition panel.</li>
							<li>Use the Resources tab to save resourceNodeRenders.json.</li>
							<li>Use the Items tab to save itemRenders.json.</li>
						</ul>
					</section>
				)}

				{isBuildingMode && buildingDefinitions.length > 0 && (
					<section className={styles.section}>
						<div className={styles.sectionHeader}>Building definition</div>
						<label className={styles.field}>
							<span>Building</span>
							<select
								value={selectedBuildingId}
								onChange={(event) => {
									const next = event.target.value
									setSelectedBuildingId(next)
									const nextDefinition = buildingDefinitions.find((definition) => definition.id === next) || null
									loadDefinition(nextDefinition)
								}}
							>
								<option value="">Select a building...</option>
								{buildingDefinitions.map((definition) => (
									<option key={definition.id} value={definition.id}>
										{definition.name || definition.id}
									</option>
								))}
							</select>
						</label>
						<p className={styles.helperText}>
							Load a building definition, then adjust the render settings below. Saving updates the shared
							buildings.json file.
						</p>
						{definitionDraft && (
							<>
								<div className={styles.inlineRow}>
									{supportsFilePicker && (
										<button className={styles.secondaryButton} type="button" onClick={handlePickBuildingsFile}>
											Choose buildings.json
										</button>
									)}
									<button className={styles.primaryButton} type="button" onClick={handleSaveToBuildingsFile}>
										{supportsFilePicker ? 'Save to file' : 'Download buildings.json'}
									</button>
									{fileStatus && <span className={styles.status}>{fileStatus}</span>}
								</div>
							</>
						)}
					</section>
				)}

				{isBuildingMode && hasDefinition && (
					<section className={styles.section}>
						<div className={styles.sectionHeader}>Building models</div>
						<div className={styles.inlineRow}>
							<button
								className={styles.secondaryButton}
								type="button"
								onClick={handleAddBuildingVariant}
							>
								Add asset
							</button>
						</div>
						{buildingModelVariants.length === 0 ? (
							<p className={styles.helperText}>No models selected yet.</p>
						) : (
							<div className={styles.tileList}>
								{buildingModelVariants.map((variant, index) => (
									<div
										className={`${styles.slotCard} ${styles.variantCard} ${
											index === activeBuildingVariantIndex ? styles.variantCardActive : ''
										}`}
										key={`${variant.modelSrc || 'model'}-${index}`}
										onClick={() => selectBuildingVariant(index)}
										onFocusCapture={() => selectBuildingVariant(index)}
									>
										<div className={styles.slotRow}>
											<label className={styles.field}>
												<span>Model</span>
												<select
													value={variant.modelSrc}
													onChange={(event) => {
														const next = event.target.value
														const current = buildingModelVariants[index]
														setActiveBuildingVariantIndex(index)
														if (current) {
															setRotationDeg(current.rotationDeg)
															setScale(current.scale)
															setElevation(current.elevation)
														}
														updateBuildingVariant(index, { modelSrc: next })
														setAssetPath(next)
														if (next) {
															if (assetOptions.includes(next)) {
																setSelectedAsset(next)
															} else {
																setSelectedAsset('')
															}
															void handleLoadAsset(next)
														} else {
															setSelectedAsset('')
														}
													}}
												>
													<option value="">Select an asset...</option>
													{assetOptions.map((asset) => (
														<option key={asset} value={asset}>
															{asset}
														</option>
													))}
												</select>
											</label>
											<label className={styles.field}>
												<span>Weight</span>
												<input
													type="number"
													step="0.1"
													min="0"
													value={Number.isFinite(variant.weight) ? variant.weight : 1}
													onChange={(event) =>
														updateBuildingVariant(index, {
															weight: toNumber(event.target.value, variant.weight ?? 1)
														})
													}
												/>
											</label>
											<button
												className={styles.variantRemoveButton}
												type="button"
												aria-label="Remove model"
												onClick={(event) => {
													event.stopPropagation()
													removeBuildingVariant(index)
												}}
											>
												🗑
											</button>
										</div>
									</div>
								))}
							</div>
						)}
					</section>
				)}

				{isResourceMode && (
					<section className={styles.section}>
						<div className={styles.sectionHeader}>Resource render</div>
						{resourceDefinitions.length > 0 ? (
							<label className={styles.field}>
								<span>Resource node</span>
								<select
									value={selectedResourceId}
									onChange={(event) => {
										const next = event.target.value
										setSelectedResourceId(next)
										loadResourceRender(next)
									}}
								>
									<option value="">Select a resource...</option>
									{resourceDefinitions.map((definition) => (
										<option key={definition.id} value={definition.id}>
											{definition.name || definition.id}
										</option>
									))}
								</select>
							</label>
						) : (
							<p className={styles.helperText}>No resource nodes found in content.</p>
						)}
						{resourceRenderError && <p className={styles.error}>{resourceRenderError}</p>}
						{resourceRenderOutput && (
							<div className={styles.inlineRow}>
								{supportsFilePicker && (
									<button className={styles.secondaryButton} type="button" onClick={handlePickResourceFile}>
										Choose resourceNodeRenders.json
									</button>
								)}
								<button className={styles.primaryButton} type="button" onClick={handleSaveResourceRenderFile}>
									{supportsFilePicker ? 'Save to file' : 'Download resourceNodeRenders.json'}
								</button>
								{resourceFileStatus && <span className={styles.status}>{resourceFileStatus}</span>}
							</div>
						)}
					</section>
				)}

				{isResourceMode && (
					<section className={styles.section}>
						<div className={styles.sectionHeader}>Resource models</div>
						<div className={styles.inlineRow}>
							<button
								className={styles.secondaryButton}
								type="button"
								onClick={handleAddResourceVariant}
							>
								Add asset
							</button>
						</div>
						{resourceModelVariants.length === 0 ? (
							<p className={styles.helperText}>No models selected yet.</p>
						) : (
							<div className={styles.tileList}>
								{resourceModelVariants.map((variant, index) => (
									<div
										className={`${styles.slotCard} ${styles.variantCard} ${
											index === activeResourceVariantIndex ? styles.variantCardActive : ''
										}`}
										key={`${variant.modelSrc || 'model'}-${index}`}
										onClick={() => selectResourceVariant(index)}
										onFocusCapture={() => selectResourceVariant(index)}
									>
										<div className={styles.slotRow}>
											<label className={styles.field}>
												<span>Model</span>
												<select
													value={variant.modelSrc}
													onChange={(event) => {
														const next = event.target.value
														const current = resourceModelVariants[index]
														setActiveResourceVariantIndex(index)
														if (current) {
															setResourceRotationDeg(current.rotationDeg)
															setResourceScale(current.scale)
															setResourceElevation(current.elevation)
														}
														updateResourceVariant(index, { modelSrc: next })
														setResourceAssetPath(next)
														if (next) {
															if (assetOptions.includes(next)) {
																setSelectedResourceAsset(next)
															} else {
																setSelectedResourceAsset('')
															}
															void handleLoadResourceAsset(next)
														} else {
															setSelectedResourceAsset('')
														}
													}}
												>
													<option value="">Select an asset...</option>
													{assetOptions.map((asset) => (
														<option key={asset} value={asset}>
															{asset}
														</option>
													))}
												</select>
											</label>
											<label className={styles.field}>
												<span>Weight</span>
												<input
													type="number"
													step="0.1"
													min="0"
													value={Number.isFinite(variant.weight) ? variant.weight : 1}
													onChange={(event) =>
														updateResourceVariant(index, {
															weight: toNumber(event.target.value, variant.weight ?? 1)
														})
													}
												/>
											</label>
											<button
												className={styles.variantRemoveButton}
												type="button"
												aria-label="Remove model"
												onClick={(event) => {
													event.stopPropagation()
													removeResourceVariant(index)
												}}
											>
												🗑
											</button>
										</div>
									</div>
								))}
							</div>
						)}
					</section>
				)}

				{isItemMode && (
					<section className={styles.section}>
						<div className={styles.sectionHeader}>Item render</div>
						{itemOptions.length > 0 ? (
							<label className={styles.field}>
								<span>Item</span>
								<select
									value={selectedItemId}
									onChange={(event) => {
										const next = event.target.value
										setSelectedItemId(next)
										loadItemRender(next)
									}}
								>
									<option value="">Select an item...</option>
									{itemOptions.map((item) => (
										<option key={item.id} value={item.id}>
											{item.emoji ? `${item.emoji} ` : ''}{item.label}
										</option>
									))}
								</select>
							</label>
						) : (
							<p className={styles.helperText}>No items found in content.</p>
						)}
						{itemRenderError && <p className={styles.error}>{itemRenderError}</p>}
						{itemRenderOutput && (
							<div className={styles.inlineRow}>
								{supportsFilePicker && (
									<button className={styles.secondaryButton} type="button" onClick={handlePickItemFile}>
										Choose itemRenders.json
									</button>
								)}
								<button className={styles.primaryButton} type="button" onClick={handleSaveItemRenderFile}>
									{supportsFilePicker ? 'Save to file' : 'Download itemRenders.json'}
								</button>
								{itemFileStatus && <span className={styles.status}>{itemFileStatus}</span>}
							</div>
						)}
					</section>
				)}

				{isItemMode && (
					<section className={styles.section}>
						<div className={styles.sectionHeader}>Item models</div>
						<div className={styles.inlineRow}>
							<button
								className={styles.secondaryButton}
								type="button"
								onClick={handleAddItemVariant}
							>
								Add asset
							</button>
						</div>
						{itemModelVariants.length === 0 ? (
							<p className={styles.helperText}>No models selected yet.</p>
						) : (
							<div className={styles.tileList}>
								{itemModelVariants.map((variant, index) => (
									<div
										className={`${styles.slotCard} ${styles.variantCard} ${
											index === activeItemVariantIndex ? styles.variantCardActive : ''
										}`}
										key={`${variant.modelSrc || 'model'}-${index}`}
										onClick={() => selectItemVariant(index)}
										onFocusCapture={() => selectItemVariant(index)}
									>
										<div className={styles.slotRow}>
											<label className={styles.field}>
												<span>Model</span>
												<select
													value={variant.modelSrc}
													onChange={(event) => {
														const next = event.target.value
														const current = itemModelVariants[index]
														setActiveItemVariantIndex(index)
														if (current) {
															setItemRotationDeg(current.rotationDeg)
															setItemScale(current.scale)
															setItemElevation(current.elevation)
														}
														updateItemVariant(index, { modelSrc: next })
														setItemAssetPath(next)
														if (next) {
															if (assetOptions.includes(next)) {
																setSelectedItemAsset(next)
															} else {
																setSelectedItemAsset('')
															}
															void handleLoadItemAsset(next)
														} else {
															setSelectedItemAsset('')
														}
													}}
												>
													<option value="">Select an asset...</option>
													{assetOptions.map((asset) => (
														<option key={asset} value={asset}>
															{asset}
														</option>
													))}
												</select>
											</label>
											<label className={styles.field}>
												<span>Weight</span>
												<input
													type="number"
													step="0.1"
													min="0"
													value={Number.isFinite(variant.weight) ? variant.weight : 1}
													onChange={(event) =>
														updateItemVariant(index, {
															weight: toNumber(event.target.value, variant.weight ?? 1)
														})
													}
												/>
											</label>
											<button
												className={styles.variantRemoveButton}
												type="button"
												aria-label="Remove model"
												onClick={(event) => {
													event.stopPropagation()
													removeItemVariant(index)
												}}
											>
												🗑
											</button>
										</div>
									</div>
								))}
							</div>
						)}
					</section>
				)}

				<section className={styles.section}>
					<div className={styles.sectionHeaderRow}>
						<div className={styles.sectionHeader}>Asset</div>
						<button
							className={styles.collapseButton}
							type="button"
							onClick={() => setAssetOpen((prev) => !prev)}
							aria-expanded={assetOpen}
						>
							{assetOpen ? '^' : 'v'}
						</button>
					</div>
					{assetOpen && (
						<>
							{assetOptions.length > 0 && (
								<label className={styles.field}>
									<span>Asset library</span>
									<select
										value={isResourceMode ? selectedResourceAsset : isItemMode ? selectedItemAsset : selectedAsset}
										onChange={(event) => {
											const next = event.target.value
											if (isResourceMode) {
												setSelectedResourceAsset(next)
												setResourceAssetPath(next)
												if (next) {
													void handleLoadResourceAsset(next)
												} else {
													void handleLoadResourceAsset('')
												}
												return
											}
											if (isItemMode) {
												setSelectedItemAsset(next)
												setItemAssetPath(next)
												if (next) {
													void handleLoadItemAsset(next)
												} else {
													void handleLoadItemAsset('')
												}
												return
											}
											setSelectedAsset(next)
											setAssetPath(next)
											if (next) {
												void handleLoadAsset(next)
											} else {
												void handleLoadAsset('')
											}
										}}
									>
										<option value="">Select an asset...</option>
										{assetOptions.map((asset) => (
											<option key={asset} value={asset}>
												{asset}
											</option>
										))}
									</select>
								</label>
							)}
							{assetIndexError && <p className={styles.error}>{assetIndexError}</p>}
							{!assetIndexError && assetOptions.length === 0 && (
								<p className={styles.helperText}>No assets found yet. Run the content loader to build the index.</p>
							)}
							{isBuildingMode && !hasDefinition && (
								<label className={styles.field}>
									<span>Asset ID</span>
									<input
										type="text"
										value={assetId}
										onChange={(event) => setAssetId(event.target.value)}
										placeholder="my_asset"
									/>
								</label>
							)}
							{activeLoadError && <p className={styles.error}>{activeLoadError}</p>}
						</>
					)}
				</section>

				<section
					className={styles.section}
					onFocusCapture={handleEditingFocus}
					onBlurCapture={handleEditingBlur}
				>
					<div className={styles.sectionHeaderRow}>
						<div className={styles.sectionHeader}>Grid footprint</div>
						<button
							className={styles.collapseButton}
							type="button"
							onClick={() => setFootprintOpen((prev) => !prev)}
							aria-expanded={footprintOpen}
						>
							{footprintOpen ? '^' : 'v'}
						</button>
					</div>
					{footprintOpen && (
						<>
							<div className={styles.gridRow}>
								<label className={styles.field}>
									<span>Width</span>
									<input
										type="number"
										step="1"
										min="1"
										value={activeFootprint.width}
										onChange={(event) =>
											isResourceMode
												? setResourceFootprint((prev) => ({
														...prev,
														width: toInteger(event.target.value, prev.width)
													}))
												: isItemMode
													? setItemFootprint((prev) => ({
															...prev,
															width: toInteger(event.target.value, prev.width)
														}))
													: setFootprint((prev) => ({
															...prev,
															width: toInteger(event.target.value, prev.width)
														}))
										}
									/>
								</label>
								<label className={styles.field}>
									<span>Length</span>
									<input
										type="number"
										step="1"
										min="1"
										value={activeFootprint.length}
										onChange={(event) =>
											isResourceMode
												? setResourceFootprint((prev) => ({
														...prev,
														length: toInteger(event.target.value, prev.length)
													}))
												: isItemMode
													? setItemFootprint((prev) => ({
															...prev,
															length: toInteger(event.target.value, prev.length)
														}))
													: setFootprint((prev) => ({
															...prev,
															length: toInteger(event.target.value, prev.length)
														}))
										}
									/>
								</label>
							</div>
							<div className={styles.gridRow}>
								<label className={styles.field}>
									<span>Grid X</span>
									<input
										type="number"
										step="1"
										value={activePosition.x}
										onChange={(event) =>
											isResourceMode
												? setResourcePosition((prev) => ({
														...prev,
														x: toNumber(event.target.value, prev.x)
													}))
												: isItemMode
													? setItemPosition((prev) => ({
															...prev,
															x: toNumber(event.target.value, prev.x)
														}))
													: setPosition((prev) => ({
															...prev,
															x: toNumber(event.target.value, prev.x)
														}))
										}
									/>
								</label>
								<label className={styles.field}>
									<span>Grid Y</span>
									<input
										type="number"
										step="1"
										value={activePosition.y}
										onChange={(event) =>
											isResourceMode
												? setResourcePosition((prev) => ({
														...prev,
														y: toNumber(event.target.value, prev.y)
													}))
												: isItemMode
													? setItemPosition((prev) => ({
															...prev,
															y: toNumber(event.target.value, prev.y)
														}))
													: setPosition((prev) => ({
															...prev,
															y: toNumber(event.target.value, prev.y)
														}))
										}
									/>
								</label>
							</div>
						</>
					)}
				</section>

				{isBuildingMode && (
					<section
						className={styles.section}
						onFocusCapture={handleEditingFocus}
						onBlurCapture={handleEditingBlur}
					>
						<div className={styles.sectionHeaderRow}>
							<div className={styles.sectionHeader}>Entry + center points</div>
							<button
								className={styles.collapseButton}
								type="button"
								onClick={() => setEntryCenterOpen((prev) => !prev)}
								aria-expanded={entryCenterOpen}
							>
								{entryCenterOpen ? '^' : 'v'}
							</button>
						</div>
						{entryCenterOpen && (
							<>
								<p className={styles.helperText}>
									Offsets are in tiles from the top-left corner of the footprint. Click the grid to pick a point.
								</p>
								{pickMode === 'entry' && (
									<p className={styles.pickHint}>Click the grid to set the entry point.</p>
								)}
								{pickMode === 'center' && (
									<p className={styles.pickHint}>Click the grid to set the center point.</p>
								)}
								{pickMode === 'access' && (
									<p className={styles.pickHint}>Click the grid to toggle access tiles.</p>
								)}
								{pickMode === 'blocked' && (
									<p className={styles.pickHint}>Click the grid to toggle blocked tiles.</p>
								)}
								<div className={styles.gridRow}>
									<label className={styles.field}>
										<span>Entry X</span>
										<input
											type="number"
											step="0.1"
											value={entryPoint?.x ?? ''}
											onChange={(event) => setEntryPoint(updatePoint(entryPoint, 'x', event.target.value))}
											placeholder="unset"
										/>
									</label>
									<label className={styles.field}>
										<span>Entry Y</span>
										<input
											type="number"
											step="0.1"
											value={entryPoint?.y ?? ''}
											onChange={(event) => setEntryPoint(updatePoint(entryPoint, 'y', event.target.value))}
											placeholder="unset"
										/>
									</label>
								</div>
								<div className={styles.inlineRow}>
									<button
										className={`${styles.modeButton} ${pickMode === 'entry' ? styles.modeButtonActive : ''}`}
										type="button"
										onClick={() => handlePickMode('entry')}
									>
										Pick entry
									</button>
									<button className={styles.smallButton} type="button" onClick={() => setEntryPoint(null)}>
										Clear
									</button>
								</div>

								<div className={styles.gridRow}>
									<label className={styles.field}>
										<span>Center X</span>
										<input
											type="number"
											step="0.1"
											value={centerPoint?.x ?? ''}
											onChange={(event) => setCenterPoint(updatePoint(centerPoint, 'x', event.target.value))}
											placeholder="unset"
										/>
									</label>
									<label className={styles.field}>
										<span>Center Y</span>
										<input
											type="number"
											step="0.1"
											value={centerPoint?.y ?? ''}
											onChange={(event) => setCenterPoint(updatePoint(centerPoint, 'y', event.target.value))}
											placeholder="unset"
										/>
									</label>
								</div>
								<div className={styles.inlineRow}>
									<button
										className={`${styles.modeButton} ${pickMode === 'center' ? styles.modeButtonActive : ''}`}
										type="button"
										onClick={() => handlePickMode('center')}
									>
										Pick center
									</button>
									<button className={styles.secondaryButton} type="button" onClick={handleSetCenterFromFootprint}>
										Use footprint center
									</button>
									<button className={styles.smallButton} type="button" onClick={() => setCenterPoint(null)}>
										Clear
									</button>
								</div>
							</>
						)}
					</section>
				)}

				{isBuildingMode && hasDefinition && (
					<section className={styles.section}>
						<div className={styles.sectionHeaderRow}>
							<div className={styles.sectionHeader}>Access + blocked tiles</div>
							<button
								className={styles.collapseButton}
								type="button"
								onClick={() => setAccessBlockedOpen((prev) => !prev)}
								aria-expanded={accessBlockedOpen}
							>
								{accessBlockedOpen ? '^' : 'v'}
							</button>
						</div>
						{accessBlockedOpen && (
							<>
								<p className={styles.helperText}>
									Access tiles are walkable entry tiles (can be outside the footprint). Blocked tiles mark non-passable
									tiles after the building completes.
								</p>
								<div className={styles.inlineRow}>
									<button
										className={`${styles.modeButton} ${pickMode === 'access' ? styles.modeButtonActive : ''}`}
										type="button"
										onClick={() => handlePickMode('access')}
									>
										Pick access
									</button>
									<button
										className={`${styles.modeButton} ${pickMode === 'blocked' ? styles.modeButtonActive : ''}`}
										type="button"
										onClick={() => handlePickMode('blocked')}
									>
										Pick blocked
									</button>
									<button className={styles.smallButton} type="button" onClick={() => setAccessTiles([])}>
										Clear access
									</button>
									<button className={styles.smallButton} type="button" onClick={() => setBlockedTiles([])}>
										Clear blocked
									</button>
								</div>
								<div className={styles.tileList}>
									<div className={styles.tileGroup}>
										<div className={styles.tileTitle}>Access tiles</div>
										{accessTiles.length === 0 ? (
											<span className={styles.helperText}>None set.</span>
										) : (
											<div className={styles.tileRow}>
												{accessTiles.map((tile, index) => (
													<div key={`access-${tile.x}-${tile.y}-${index}`} className={styles.tilePill}>
														<span>({Math.round(tile.x)}, {Math.round(tile.y)})</span>
														<button
															className={styles.tileRemove}
															type="button"
															onClick={() =>
																setAccessTiles((prev) =>
																	prev.filter((_, tileIndex) => tileIndex !== index)
																)
															}
														>
															x
														</button>
													</div>
												))}
											</div>
										)}
									</div>
									<div className={styles.tileGroup}>
										<div className={styles.tileTitle}>Blocked tiles</div>
										{blockedTiles.length === 0 ? (
											<span className={styles.helperText}>None set.</span>
										) : (
											<div className={styles.tileRow}>
												{blockedTiles.map((tile, index) => (
													<div key={`blocked-${tile.x}-${tile.y}-${index}`} className={styles.tilePill}>
														<span>({Math.round(tile.x)}, {Math.round(tile.y)})</span>
														<button
															className={styles.tileRemove}
															type="button"
															onClick={() =>
																setBlockedTiles((prev) =>
																	prev.filter((_, tileIndex) => tileIndex !== index)
																)
															}
														>
															x
														</button>
													</div>
												))}
											</div>
										)}
									</div>
								</div>
							</>
						)}
					</section>
				)}

				<section className={styles.section}>
					<div className={styles.sectionHeaderRow}>
						<div className={styles.sectionHeader}>Transform</div>
						<button
							className={styles.collapseButton}
							type="button"
							onClick={() => setTransformOpen((prev) => !prev)}
							aria-expanded={transformOpen}
						>
							{transformOpen ? '^' : 'v'}
						</button>
					</div>
					{transformOpen && (
						<>
							{isResourceMode &&
								(activeResourceVariantIndex === null ||
									!resourceModelVariants[activeResourceVariantIndex]?.modelSrc) && (
									<p className={styles.helperText}>Select a resource model to edit its transform.</p>
								)}
							{isItemMode &&
								(activeItemVariantIndex === null || !itemModelVariants[activeItemVariantIndex]?.modelSrc) && (
									<p className={styles.helperText}>Select an item model to edit its transform.</p>
								)}
							{isBuildingMode &&
								buildingModelVariants.length > 0 &&
								(activeBuildingVariantIndex === null ||
									!buildingModelVariants[activeBuildingVariantIndex]?.modelSrc) && (
									<p className={styles.helperText}>Select a building model to edit its transform.</p>
								)}
							{(isBuildingMode &&
								(buildingModelVariants.length === 0 ||
									(activeBuildingVariantIndex !== null &&
										buildingModelVariants[activeBuildingVariantIndex]?.modelSrc))) ||
							(isResourceMode &&
								activeResourceVariantIndex !== null &&
								resourceModelVariants[activeResourceVariantIndex]?.modelSrc) ||
							(isItemMode &&
								activeItemVariantIndex !== null &&
								itemModelVariants[activeItemVariantIndex]?.modelSrc) ? (
								<>
									{isResourceMode && activeResourceVariantIndex !== null && (
										<p className={styles.helperText}>
											Editing transform for model {activeResourceVariantIndex + 1}:{' '}
											{resourceModelVariants[activeResourceVariantIndex]?.modelSrc || 'unset'}
										</p>
									)}
									{isItemMode && activeItemVariantIndex !== null && (
										<p className={styles.helperText}>
											Editing transform for model {activeItemVariantIndex + 1}:{' '}
											{itemModelVariants[activeItemVariantIndex]?.modelSrc || 'unset'}
										</p>
									)}
									{isBuildingMode && activeBuildingVariantIndex !== null && (
										<p className={styles.helperText}>
											Editing transform for model {activeBuildingVariantIndex + 1}:{' '}
											{buildingModelVariants[activeBuildingVariantIndex]?.modelSrc || 'unset'}
										</p>
									)}
									<div className={styles.gridRow}>
										<label className={styles.field}>
											<span>Rotate X (deg)</span>
											<input
												type="number"
												step="1"
												value={isResourceMode ? resourceRotationDeg.x : isItemMode ? itemRotationDeg.x : rotationDeg.x}
												onChange={(event) =>
													isResourceMode
														? updateActiveResourceRotation({
																x: toNumber(event.target.value, resourceRotationDeg.x)
															})
														: isItemMode
															? updateActiveItemRotation({
																	x: toNumber(event.target.value, itemRotationDeg.x)
																})
															: isBuildingMode
																? updateActiveBuildingRotation({
																		x: toNumber(event.target.value, rotationDeg.x)
																	})
																: setRotationDeg((prev) => ({
																		...prev,
																		x: toNumber(event.target.value, prev.x)
																	}))
												}
											/>
										</label>
										<label className={styles.field}>
											<span>Rotate Y (deg)</span>
											<input
												type="number"
												step="1"
												value={isResourceMode ? resourceRotationDeg.y : isItemMode ? itemRotationDeg.y : rotationDeg.y}
												onChange={(event) =>
													isResourceMode
														? updateActiveResourceRotation({
																y: toNumber(event.target.value, resourceRotationDeg.y)
															})
														: isItemMode
															? updateActiveItemRotation({
																	y: toNumber(event.target.value, itemRotationDeg.y)
																})
															: isBuildingMode
																? updateActiveBuildingRotation({
																		y: toNumber(event.target.value, rotationDeg.y)
																	})
																: setRotationDeg((prev) => ({
																		...prev,
																		y: toNumber(event.target.value, prev.y)
																	}))
												}
											/>
										</label>
										<label className={styles.field}>
											<span>Rotate Z (deg)</span>
											<input
												type="number"
												step="1"
												value={isResourceMode ? resourceRotationDeg.z : isItemMode ? itemRotationDeg.z : rotationDeg.z}
												onChange={(event) =>
													isResourceMode
														? updateActiveResourceRotation({
																z: toNumber(event.target.value, resourceRotationDeg.z)
															})
														: isItemMode
															? updateActiveItemRotation({
																	z: toNumber(event.target.value, itemRotationDeg.z)
																})
															: isBuildingMode
																? updateActiveBuildingRotation({
																		z: toNumber(event.target.value, rotationDeg.z)
																	})
																: setRotationDeg((prev) => ({
																		...prev,
																		z: toNumber(event.target.value, prev.z)
																	}))
												}
											/>
										</label>
									</div>
									<div className={styles.gridRow}>
										<label className={styles.field}>
											<span>Scale X</span>
											<input
												type="number"
												step="0.05"
												value={isResourceMode ? resourceScale.x : isItemMode ? itemScale.x : scale.x}
												onChange={(event) =>
													isResourceMode
														? updateActiveResourceScale({
																x: toNumber(event.target.value, resourceScale.x)
															})
														: isItemMode
															? updateActiveItemScale({
																	x: toNumber(event.target.value, itemScale.x)
																})
															: isBuildingMode
																? updateActiveBuildingScale({
																		x: toNumber(event.target.value, scale.x)
																	})
																: setScale((prev) => ({
																		...prev,
																		x: toNumber(event.target.value, prev.x)
																	}))
												}
											/>
										</label>
										<label className={styles.field}>
											<span>Scale Y</span>
											<input
												type="number"
												step="0.05"
												value={isResourceMode ? resourceScale.y : isItemMode ? itemScale.y : scale.y}
												onChange={(event) =>
													isResourceMode
														? updateActiveResourceScale({
																y: toNumber(event.target.value, resourceScale.y)
															})
														: isItemMode
															? updateActiveItemScale({
																	y: toNumber(event.target.value, itemScale.y)
																})
															: isBuildingMode
																? updateActiveBuildingScale({
																		y: toNumber(event.target.value, scale.y)
																	})
																: setScale((prev) => ({
																		...prev,
																		y: toNumber(event.target.value, prev.y)
																	}))
												}
											/>
										</label>
										<label className={styles.field}>
											<span>Scale Z</span>
											<input
												type="number"
												step="0.05"
												value={isResourceMode ? resourceScale.z : isItemMode ? itemScale.z : scale.z}
												onChange={(event) =>
													isResourceMode
														? updateActiveResourceScale({
																z: toNumber(event.target.value, resourceScale.z)
															})
														: isItemMode
															? updateActiveItemScale({
																	z: toNumber(event.target.value, itemScale.z)
																})
															: isBuildingMode
																? updateActiveBuildingScale({
																		z: toNumber(event.target.value, scale.z)
																	})
																: setScale((prev) => ({
																		...prev,
																		z: toNumber(event.target.value, prev.z)
																	}))
												}
											/>
										</label>
									</div>
									<label className={styles.field}>
										<span>Elevation (Y)</span>
										<input
											type="number"
											step="0.1"
											value={isResourceMode ? resourceElevation : isItemMode ? itemElevation : elevation}
											onChange={(event) =>
												isResourceMode
													? updateActiveResourceElevation(toNumber(event.target.value, resourceElevation))
													: isItemMode
														? updateActiveItemElevation(toNumber(event.target.value, itemElevation))
														: isBuildingMode
															? updateActiveBuildingElevation(toNumber(event.target.value, elevation))
															: setElevation(toNumber(event.target.value, elevation))
											}
										/>
									</label>
								</>
							) : null}
						</>
					)}
				</section>

				{isBuildingMode && hasDefinition && (
					<section className={styles.section}>
						<div className={styles.sectionHeaderRow}>
							<div className={styles.sectionHeader}>Storage slots</div>
							<button
								className={styles.collapseButton}
								type="button"
								onClick={() => setStorageOpen((prev) => !prev)}
								aria-expanded={storageOpen}
							>
								{storageOpen ? '^' : 'v'}
							</button>
						</div>
						{storageOpen && (
							<>
								{storageSlots.length === 0 && (
									<p className={styles.helperText}>No storage slots yet.</p>
								)}
								{storageSlots.map((slot, index) => (
									<div key={`${slot.itemType}-${index}`} className={styles.slotCard}>
										<div className={styles.gridRow}>
											<label className={styles.field}>
												<span>Item</span>
												{itemOptions.length > 0 ? (
													<select
														value={slot.itemType}
														onChange={(event) =>
															updateStorageSlot(index, {
																itemType: event.target.value,
																emoji: itemEmojiMap.get(event.target.value) || ''
															})
														}
													>
														{itemOptions.map((item) => (
															<option key={item.id} value={item.id}>
																{item.emoji ? `${item.emoji} ` : ''}{item.label}
															</option>
														))}
													</select>
												) : (
													<input
														type="text"
														value={slot.itemType}
														onChange={(event) =>
															updateStorageSlot(index, {
																itemType: event.target.value,
																emoji: itemEmojiMap.get(event.target.value) || ''
															})
														}
														placeholder="item_type"
													/>
												)}
											</label>
											<label className={styles.field}>
												<span>Max qty</span>
												<input
													type="number"
													min="1"
													step="1"
													value={slot.maxQuantity ?? ''}
													onChange={(event) =>
														updateStorageSlot(index, {
															maxQuantity: parseOptionalInt(event.target.value)
														})
													}
												/>
											</label>
										</div>
										<div className={styles.inlineRow}>
											<label className={styles.checkboxField}>
												<input
													type="checkbox"
													checked={Boolean(slot.offset)}
													onChange={(event) =>
														updateStorageSlot(index, {
															offset: event.target.checked ? { x: 0, y: 0 } : undefined,
															hidden: event.target.checked ? undefined : true
														})
													}
												/>
												<span>Visible</span>
											</label>
											<button
												type="button"
												className={styles.smallButton}
												onClick={() => removeStorageSlot(index)}
											>
												Remove
											</button>
										</div>
										{slot.offset && (
											<div className={styles.gridRow}>
												<label className={styles.field}>
													<span>Offset X</span>
													<input
														type="number"
														step="1"
														value={slot.offset?.x ?? ''}
														placeholder="unset"
														onChange={(event) =>
															updateStorageSlot(index, {
																offset: { x: toIntegerLoose(event.target.value, slot.offset?.x ?? 0) }
															})
														}
													/>
												</label>
												<label className={styles.field}>
													<span>Offset Y</span>
													<input
														type="number"
														step="1"
														value={slot.offset?.y ?? ''}
														placeholder="unset"
														onChange={(event) =>
															updateStorageSlot(index, {
																offset: { y: toIntegerLoose(event.target.value, slot.offset?.y ?? 0) }
															})
														}
													/>
												</label>
											</div>
										)}
									</div>
								))}
								<div className={styles.inlineRow}>
									<button
										className={styles.secondaryButton}
										type="button"
										onClick={handleAddStorageSlot}
										disabled={itemOptions.length === 0}
									>
										Add slot
									</button>
									{itemOptions.length === 0 && (
										<span className={styles.helperText}>Item catalog not loaded.</span>
									)}
								</div>
							</>
						)}
					</section>
				)}

			</div>

			<div className={styles.viewport}>
				<div className={styles.viewportControls}>
					<label className={styles.checkboxField}>
						<input
							type="checkbox"
							checked={isTransparent}
							onChange={() => setManualTransparent((prev) => !prev)}
						/>
						Model 30% opacity
					</label>
				</div>
				<EditorViewport onSceneReady={handleSceneReady} />
				<div className={styles.hud}>
					<div className={styles.hudCard}>
						<p>Footprint: {activeFootprint.width} x {activeFootprint.length}</p>
						<p>Grid: ({activePosition.x}, {activePosition.y})</p>
					</div>
				</div>
			</div>
		</div>
	)
}

interface EditorViewportProps {
	onSceneReady: (scene: EditorScene | null) => void
}

function EditorViewport({ onSceneReady }: EditorViewportProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null)

	useEffect(() => {
		if (!canvasRef.current) return
		const scene = new EditorScene(canvasRef.current)
		onSceneReady(scene)
		return () => {
			scene.dispose()
			onSceneReady(null)
		}
	}, [onSceneReady])

	return <canvas ref={canvasRef} className={styles.canvas} />
}

function toNumber(value: string, fallback: number): number {
	const parsed = Number.parseFloat(value)
	return Number.isFinite(parsed) ? parsed : fallback
}

function toInteger(value: string, fallback: number): number {
	const parsed = Math.round(Number.parseFloat(value))
	return Number.isFinite(parsed) ? Math.max(1, parsed) : fallback
}

function toIntegerLoose(value: string, fallback: number): number {
	const parsed = Math.round(Number.parseFloat(value))
	return Number.isFinite(parsed) ? parsed : fallback
}

function parseOptionalInt(value: string): number | undefined {
	if (!value.trim()) return undefined
	const parsed = Math.round(Number.parseFloat(value))
	if (!Number.isFinite(parsed)) return undefined
	return Math.max(1, parsed)
}

function toRadians(value: number): number {
	return (value * Math.PI) / 180
}

function toDegrees(value: number): number {
	return (value * 180) / Math.PI
}

function normalizeAssetPath(path: string): string {
	const trimmed = path.trim()
	if (!trimmed) return ''
	if (/^(https?:)?\/\//.test(trimmed)) return trimmed
	if (trimmed.startsWith('/')) return trimmed
	return `/${trimmed}`
}

function cloneDefinition(definition: Record<string, any>): Record<string, any> {
	return JSON.parse(JSON.stringify(definition)) as Record<string, any>
}

function mergeDefinitionWithEditor(
	definition: Record<string, any>,
	editor: {
		assetPath: string
		rotation: { x: number; y: number; z: number }
		scale: { x: number; y: number; z: number }
		elevation: number
		footprint: { width: number; length: number }
		storageSlots: StorageSlot[]
		entryPoint: Vec2 | null
		centerPoint: Vec2 | null
		accessTiles: Vec2[]
		blockedTiles: Vec2[]
		renderOutput?: {
			render?: {
				modelSrc: string
				transform?: {
					rotation?: { x: number; y: number; z: number }
					scale?: { x: number; y: number; z: number }
					elevation?: number
				}
			}
			renders?: Array<{
				modelSrc: string
				weight?: number
				transform?: {
					rotation?: { x: number; y: number; z: number }
					scale?: { x: number; y: number; z: number }
					elevation?: number
				}
			}>
		} | null
	}
): Record<string, any> {
	const next = cloneDefinition(definition)
	const footprint = next.footprint || {}
	next.footprint = {
		...footprint,
		width: editor.footprint.width,
		height: editor.footprint.length,
		length: editor.footprint.length
	}
	if (Object.prototype.hasOwnProperty.call(editor, 'renderOutput')) {
		const renderOutput = editor.renderOutput
		if (renderOutput?.render?.modelSrc) {
			next.render = {
				modelSrc: renderOutput.render.modelSrc,
				transform: renderOutput.render.transform
			}
		} else if (next.render) {
			delete next.render
		}
		if (renderOutput?.renders && renderOutput.renders.length > 0) {
			next.renders = renderOutput.renders
		} else if (next.renders) {
			delete next.renders
		}
	} else {
		const render = next.render || {}
		if (editor.assetPath || render.modelSrc) {
			const transformOverrides = buildTransform(editor.rotation, editor.scale, editor.elevation)
			next.render = {
				...render,
				modelSrc: editor.assetPath || render.modelSrc
			}
			if (transformOverrides) {
				next.render.transform = transformOverrides
			} else {
				delete next.render.transform
			}
		}
	}
	const normalizedSlots = normalizeStorageSlots(editor.storageSlots)
	if (normalizedSlots.length > 0) {
		next.storageSlots = normalizedSlots
	} else if (next.storageSlots) {
		delete next.storageSlots
	}
	if (editor.entryPoint) {
		next.entryPoint = {
			x: editor.entryPoint.x,
			y: editor.entryPoint.y
		}
	} else if (next.entryPoint) {
		delete next.entryPoint
	}
	if (editor.centerPoint) {
		next.centerPoint = {
			x: editor.centerPoint.x,
			y: editor.centerPoint.y
		}
	} else if (next.centerPoint) {
		delete next.centerPoint
	}
	const normalizedAccessTiles = normalizeTileOffsets(editor.accessTiles)
	if (normalizedAccessTiles.length > 0) {
		next.accessTiles = normalizedAccessTiles
	} else if (next.accessTiles) {
		delete next.accessTiles
	}
	const normalizedBlockedTiles = normalizeTileOffsets(editor.blockedTiles)
	if (normalizedBlockedTiles.length > 0) {
		next.blockedTiles = normalizedBlockedTiles
	} else if (next.blockedTiles) {
		delete next.blockedTiles
	}
	if (!next.storagePreservation && next.storage?.preservation) {
		next.storagePreservation = next.storage.preservation
	}
	if ('storage' in next) {
		delete next.storage
	}
	return next
}

function buildTransform(
	rotation: { x: number; y: number; z: number },
	scale: { x: number; y: number; z: number },
	elevation: number
): { rotation?: { x: number; y: number; z: number }; scale?: { x: number; y: number; z: number }; elevation?: number } | null {
	const transform: {
		rotation?: { x: number; y: number; z: number }
		scale?: { x: number; y: number; z: number }
		elevation?: number
	} = {}
	if (!isNearZero(rotation.x) || !isNearZero(rotation.y) || !isNearZero(rotation.z)) {
		transform.rotation = rotation
	}
	if (!isNearOne(scale.x) || !isNearOne(scale.y) || !isNearOne(scale.z)) {
		transform.scale = scale
	}
	if (!isNearZero(elevation)) {
		transform.elevation = elevation
	}
	return Object.keys(transform).length > 0 ? transform : null
}

function isNearZero(value: number): boolean {
	return Math.abs(value) < 1e-6
}

function isNearOne(value: number): boolean {
	return Math.abs(value - 1) < 1e-6
}

function normalizeStorageSlots(slots: StorageSlot[]): Array<{
	itemType: string
	offset?: { x: number; y: number }
	hidden?: boolean
	maxQuantity?: number
}> {
	return slots
		.filter((slot) => Boolean(slot.itemType))
		.map((slot) => {
			const normalized: {
				itemType: string
				offset?: { x: number; y: number }
				hidden?: boolean
				maxQuantity?: number
			} = {
				itemType: slot.itemType
			}
			if (slot.offset) {
				normalized.offset = {
					x: Math.round(slot.offset.x),
					y: Math.round(slot.offset.y)
				}
			}
			if (slot.hidden) {
				normalized.hidden = true
			}
			if (!slot.offset && !slot.hidden) {
				normalized.hidden = true
			}
			if (typeof slot.maxQuantity === 'number' && Number.isFinite(slot.maxQuantity)) {
				normalized.maxQuantity = Math.max(1, Math.round(slot.maxQuantity))
			}
			return normalized
		})
}

function normalizeTileOffsets(tiles: Vec2[]): Array<{ x: number; y: number }> {
	const seen = new Set<string>()
	const normalized: Array<{ x: number; y: number }> = []
	for (const tile of tiles) {
		const x = Math.round(tile.x)
		const y = Math.round(tile.y)
		if (!Number.isFinite(x) || !Number.isFinite(y)) {
			continue
		}
		const key = `${x},${y}`
		if (seen.has(key)) {
			continue
		}
		seen.add(key)
		normalized.push({ x, y })
	}
	return normalized
}

function resolveItemPreviewRender(
	definition: ItemRenderDefinition | null
): { modelSrc: string; transform?: { rotation?: Vec3; scale?: Vec3; elevation?: number } } | null {
	if (!definition) return null
	const variants = Array.isArray(definition.renders)
		? definition.renders.filter((variant) => Boolean(variant?.modelSrc))
		: []
	if (variants.length > 0) {
		const variant = variants[0]
		return {
			modelSrc: variant.modelSrc,
			transform: variant.transform
		}
	}
	if (definition.render?.modelSrc) {
		return {
			modelSrc: definition.render.modelSrc,
			transform: definition.render.transform
		}
	}
	return null
}

function isResourceRenderMeaningful(definition: ResourceNodeRenderDefinition): boolean {
	const footprint = definition.footprint
	const width = Number(footprint?.width ?? 1)
	const length = Number(footprint?.height ?? footprint?.length ?? 1)
	const hasFootprint =
		Number.isFinite(width) &&
		Number.isFinite(length) &&
		(Math.round(width) !== 1 || Math.round(length) !== 1)
	const hasRender =
		Boolean(definition.render?.modelSrc) ||
		(Array.isArray(definition.renders) && definition.renders.some((variant) => Boolean(variant?.modelSrc)))
	return hasRender || hasFootprint
}

function isItemRenderMeaningful(definition: ItemRenderDefinition): boolean {
	const footprint = definition.footprint
	const width = Number(footprint?.width ?? 1)
	const length = Number(footprint?.height ?? footprint?.length ?? 1)
	const hasFootprint =
		Number.isFinite(width) &&
		Number.isFinite(length) &&
		(Math.round(width) !== 1 || Math.round(length) !== 1)
	const hasRender =
		Boolean(definition.render?.modelSrc) ||
		(Array.isArray(definition.renders) && definition.renders.some((variant) => Boolean(variant?.modelSrc)))
	return hasRender || hasFootprint
}
