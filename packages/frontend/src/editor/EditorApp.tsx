import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styles from './EditorApp.module.css'
import { EditorPlacement, EditorScene, StorageSlot } from './EditorScene'

type Vec2 = { x: number; y: number }

type Vec3 = { x: number; y: number; z: number }

const DEFAULT_ASSET_ID = 'building_model'
const DEFAULT_ASSET_PATH = ''
const CONTENT_FOLDER = import.meta.env.VITE_GAME_CONTENT || 'settlerpolis'
const contentModules = import.meta.glob('../../../../content/*/index.ts', { eager: true })
const content = contentModules[`../../../../content/${CONTENT_FOLDER}/index.ts`]

export function EditorApp() {
	const sceneRef = useRef<EditorScene | null>(null)
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
	const [showHelp, setShowHelp] = useState(false)
	const [pickMode, setPickMode] = useState<'position' | 'entry' | 'center' | 'access' | 'blocked'>('position')
	const [assetOptions, setAssetOptions] = useState<string[]>([])
	const [assetIndexError, setAssetIndexError] = useState<string | null>(null)
	const [selectedAsset, setSelectedAsset] = useState('')
	const [assetOpen, setAssetOpen] = useState(false)
	const [selectedBuildingId, setSelectedBuildingId] = useState('')
	const [definitionDraft, setDefinitionDraft] = useState<Record<string, any> | null>(null)
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
	const hasDefinition = Boolean(definitionDraft)
	const supportsFilePicker = typeof window !== 'undefined' && 'showOpenFilePicker' in window

	const buildingDefinitions = useMemo(() => {
		const definitions = (content as { buildings?: Array<Record<string, any>> })?.buildings
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
	}, [pickMode, position.x, position.y, toggleTileOffset])

	const rotationRad = useMemo(
		() => ({
			x: toRadians(rotationDeg.x),
			y: toRadians(rotationDeg.y),
			z: toRadians(rotationDeg.z)
		}),
		[rotationDeg]
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

	const placement: EditorPlacement = useMemo(
		() => ({
			footprint,
			position,
			rotation: rotationRad,
			scale,
			elevation,
			storageSlots,
			entryPoint,
			centerPoint,
			accessTiles,
			blockedTiles
		}),
		[footprint, position, rotationRad, scale, elevation, storageSlots, entryPoint, centerPoint, accessTiles, blockedTiles]
	)

	useEffect(() => {
		sceneRef.current?.updatePlacement(placement)
	}, [placement])

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
		const render = draft.render || {}
		const modelSrc = render.modelSrc || ''
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
		const transform = render.transform || {}
		const rotation = transform.rotation || { x: 0, y: 0, z: 0 }
		setRotationDeg({
			x: toDegrees(rotation.x || 0),
			y: toDegrees(rotation.y || 0),
			z: toDegrees(rotation.z || 0)
		})
		setScale({
			x: transform.scale?.x ?? 1,
			y: transform.scale?.y ?? 1,
			z: transform.scale?.z ?? 1
		})
		setElevation(transform.elevation ?? 0)
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
			return
		}
		const draft = cloneDefinition(definition)
		setDefinitionDraft(draft)
		applyDefinitionToEditor(draft)
	}, [applyDefinitionToEditor])

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
			blockedTiles
		})
	}, [assetPath, definitionDraft, elevation, footprint, rotationRad, scale, storageSlots, entryPoint, centerPoint, accessTiles, blockedTiles])

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
		if (!assetPath) return
		if (!assetOptions.includes(assetPath)) return
		if (selectedAsset === assetPath) return
		setSelectedAsset(assetPath)
	}, [assetOptions, assetPath, selectedAsset])

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
				{showHelp && (
					<section className={styles.helpPanel}>
						<h2 className={styles.helpTitle}>How to use</h2>
						<ul className={styles.helpList}>
							<li>Drop a model in content/settlerpolis/assets.</li>
							<li>Run the dev server to copy assets + build the index.</li>
							<li>Select a model from the library.</li>
							<li>Click the grid to set the top-left tile.</li>
							<li>Set width/length (grid tiles) and transforms.</li>
							<li>Save updates to buildings.json from the definition panel.</li>
						</ul>
					</section>
				)}

				{buildingDefinitions.length > 0 && (
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
										value={selectedAsset}
										onChange={(event) => {
											const next = event.target.value
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
							{!hasDefinition && (
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
							{loadError && <p className={styles.error}>{loadError}</p>}
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
										value={footprint.width}
										onChange={(event) =>
											setFootprint((prev) => ({
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
										value={footprint.length}
										onChange={(event) =>
											setFootprint((prev) => ({
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
										value={position.x}
										onChange={(event) =>
											setPosition((prev) => ({
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
										value={position.y}
										onChange={(event) =>
											setPosition((prev) => ({
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

				{hasDefinition && (
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
							<div className={styles.gridRow}>
								<label className={styles.field}>
									<span>Rotate X (deg)</span>
									<input
										type="number"
										step="1"
										value={rotationDeg.x}
										onChange={(event) =>
											setRotationDeg((prev) => ({
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
										value={rotationDeg.y}
										onChange={(event) =>
											setRotationDeg((prev) => ({
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
										value={rotationDeg.z}
										onChange={(event) =>
											setRotationDeg((prev) => ({
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
										value={scale.x}
										onChange={(event) =>
											setScale((prev) => ({
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
										value={scale.y}
										onChange={(event) =>
											setScale((prev) => ({
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
										value={scale.z}
										onChange={(event) =>
											setScale((prev) => ({
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
									value={elevation}
									onChange={(event) => setElevation(toNumber(event.target.value, elevation))}
								/>
							</label>
						</>
					)}
				</section>

				{hasDefinition && (
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
						<p>Footprint: {footprint.width} x {footprint.length}</p>
						<p>Grid: ({position.x}, {position.y})</p>
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
