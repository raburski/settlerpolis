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
	const [loadError, setLoadError] = useState<string | null>(null)
	const [copyStatus, setCopyStatus] = useState('')
	const [showHelp, setShowHelp] = useState(false)
	const [pickMode, setPickMode] = useState<'position' | 'entry' | 'center'>('position')
	const [assetOptions, setAssetOptions] = useState<string[]>([])
	const [assetIndexError, setAssetIndexError] = useState<string | null>(null)
	const [selectedAsset, setSelectedAsset] = useState('')
	const [selectedBuildingId, setSelectedBuildingId] = useState('')
	const [definitionDraft, setDefinitionDraft] = useState<Record<string, any> | null>(null)
	const [definitionText, setDefinitionText] = useState('')
	const [definitionError, setDefinitionError] = useState<string | null>(null)
	const [definitionMode, setDefinitionMode] = useState<'editor' | 'json'>('editor')
	const [storageSlots, setStorageSlots] = useState<StorageSlot[]>([])
	const hasDefinition = Boolean(definitionDraft)

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

	const handleSceneReady = useCallback((scene: EditorScene | null) => {
		sceneRef.current = scene
		if (!scene) return
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
			setPosition(gridPosition)
		})
	}, [pickMode, position.x, position.y])

	const rotationRad = useMemo(
		() => ({
			x: toRadians(rotationDeg.x),
			y: toRadians(rotationDeg.y),
			z: toRadians(rotationDeg.z)
		}),
		[rotationDeg]
	)

	const placement: EditorPlacement = useMemo(
		() => ({
			footprint,
			position,
			rotation: rotationRad,
			scale,
			elevation,
			storageSlots,
			entryPoint,
			centerPoint
		}),
		[footprint, position, rotationRad, scale, elevation, storageSlots, entryPoint, centerPoint]
	)

	useEffect(() => {
		sceneRef.current?.updatePlacement(placement)
	}, [placement])

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
		setStorageSlots((prev) => [
			...prev,
			{
				itemType: defaultItem,
				offset: { x: 0, y: 0 }
			}
		])
	}, [itemOptions])

	const updateStorageSlot = useCallback((index: number, updates: Partial<StorageSlot>) => {
		setStorageSlots((prev) =>
			prev.map((slot, slotIndex) => {
				if (slotIndex !== index) return slot
				return {
					...slot,
					...updates,
					offset: {
						...slot.offset,
						...(updates.offset || {})
					}
				}
			})
		)
	}, [])

	const handlePickMode = useCallback((mode: 'position' | 'entry' | 'center') => {
		setPickMode((prev) => (prev === mode ? 'position' : mode))
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

	const syncDefinitionText = useCallback((draft: Record<string, any> | null) => {
		if (!draft) {
			setDefinitionText('')
			return
		}
		setDefinitionText(JSON.stringify(draft, null, 2))
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
			slots.map((slot: any) => ({
				itemType: String(slot.itemType ?? ''),
				offset: {
					x: Number(slot.offset?.x ?? 0),
					y: Number(slot.offset?.y ?? 0)
				},
				hidden: slot.hidden ? true : undefined,
				maxQuantity: typeof slot.maxQuantity === 'number' ? slot.maxQuantity : undefined
			}))
		)
	}, [assetOptions, handleLoadAsset])

	const loadDefinition = useCallback((definition: Record<string, any> | null) => {
		if (!definition) {
			setDefinitionDraft(null)
			setDefinitionMode('editor')
			syncDefinitionText(null)
			setStorageSlots([])
			return
		}
		const draft = cloneDefinition(definition)
		setDefinitionDraft(draft)
		setDefinitionMode('editor')
		syncDefinitionText(draft)
		applyDefinitionToEditor(draft)
	}, [applyDefinitionToEditor, syncDefinitionText])

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
			centerPoint
		})
	}, [assetPath, definitionDraft, elevation, footprint, rotationRad, scale, storageSlots, entryPoint, centerPoint])

	const definitionOutputText = useMemo(() => {
		return definitionOutput ? JSON.stringify(definitionOutput, null, 2) : ''
	}, [definitionOutput])

	useEffect(() => {
		if (definitionMode !== 'editor') return
		setDefinitionText(definitionOutputText)
	}, [definitionMode, definitionOutputText])

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


	const jsonDefinition = useMemo(() => {
		const transform = buildTransform(rotationRad, scale, elevation)
		const base = {
			version: 1,
			asset: {
				id: assetId || DEFAULT_ASSET_ID,
				src: assetPath
			},
			footprint: {
				width: footprint.width,
				length: footprint.length
			},
			position: {
				x: position.x,
				y: position.y
			}
		} as Record<string, any>
		if (entryPoint) {
			base.entryPoint = { x: entryPoint.x, y: entryPoint.y }
		}
		if (centerPoint) {
			base.centerPoint = { x: centerPoint.x, y: centerPoint.y }
		}
		if (transform) {
			base.transform = transform
		}
		return base
	}, [assetId, assetPath, footprint, position, rotationRad, scale, elevation, entryPoint, centerPoint])

	const formattedJson = useMemo(() => JSON.stringify(jsonDefinition, null, 2), [jsonDefinition])

	const handleDownload = useCallback(() => {
		const fileBase = (assetId || 'building').replace(/\s+/g, '_').toLowerCase()
		const blob = new Blob([formattedJson], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const anchor = document.createElement('a')
		anchor.href = url
		anchor.download = `${fileBase}.model.json`
		anchor.click()
		URL.revokeObjectURL(url)
	}, [assetId, formattedJson])

	const handleCopy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(formattedJson)
			setCopyStatus('Copied!')
			setTimeout(() => setCopyStatus(''), 1500)
		} catch (error) {
			void error
			setCopyStatus('Copy failed')
		}
	}, [formattedJson])

	const handleCopyDefinition = useCallback(async () => {
		if (!definitionOutputText) return
		try {
			await navigator.clipboard.writeText(definitionOutputText)
			setCopyStatus('Definition copied!')
			setTimeout(() => setCopyStatus(''), 1500)
		} catch (error) {
			void error
			setCopyStatus('Copy failed')
		}
	}, [definitionOutputText])

	const handleDownloadDefinition = useCallback(() => {
		if (!definitionOutputText) return
		const fileBase = (definitionOutput?.id || 'definition').replace(/\s+/g, '_').toLowerCase()
		const blob = new Blob([definitionOutputText], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const anchor = document.createElement('a')
		anchor.href = url
		anchor.download = `${fileBase}.definition.json`
		anchor.click()
		URL.revokeObjectURL(url)
	}, [definitionOutput, definitionOutputText])

	const handleApplyDefinitionJson = useCallback(() => {
		if (!definitionText.trim()) return
		try {
			const parsed = JSON.parse(definitionText) as Record<string, any>
			setDefinitionError(null)
			setDefinitionDraft(parsed)
			setDefinitionMode('editor')
			if (typeof parsed.id === 'string') {
				setSelectedBuildingId(parsed.id)
			}
			applyDefinitionToEditor(parsed)
		} catch (error) {
			void error
			setDefinitionError('Invalid JSON. Fix the syntax and try again.')
		}
	}, [applyDefinitionToEditor, definitionText])

	const handleSyncDefinitionFromEditor = useCallback(() => {
		setDefinitionMode('editor')
		setDefinitionText(definitionOutputText)
		setDefinitionError(null)
	}, [definitionOutputText])

	return (
		<div className={styles.editorApp}>
			<div className={styles.sidebar}>
				<header className={styles.header}>
					<div>
						<p className={styles.overline}>Asset Placement Editor</p>
						<h1 className={styles.title}>Define grid placement + transforms</h1>
						<p className={styles.subtitle}>
							Click the grid to set the top-left tile. Rotation inputs are in degrees; JSON exports radians.
							Models are loaded from the frontend public assets folder (for example:
							<code className={styles.inlineCode}>/assets/library/house.glb</code>).
						</p>
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
							<li>Copy or download the JSON for game content.</li>
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
							Load a building definition, then adjust the render settings below. Use “Apply JSON” if you edit the
							definition text directly.
						</p>
						{definitionDraft && (
							<>
								<div className={styles.inlineRow}>
									<button className={styles.secondaryButton} type="button" onClick={handleApplyDefinitionJson}>
										Apply JSON
									</button>
									<button className={styles.secondaryButton} type="button" onClick={handleSyncDefinitionFromEditor}>
										Sync from editor
									</button>
								</div>
								{definitionError && <p className={styles.error}>{definitionError}</p>}
								<textarea
									className={styles.textArea}
									value={definitionText}
									onChange={(event) => {
										setDefinitionMode('json')
										setDefinitionText(event.target.value)
									}}
									rows={12}
								/>
								<div className={styles.inlineRow}>
									<button className={styles.secondaryButton} type="button" onClick={handleCopyDefinition}>
										Copy definition JSON
									</button>
									<button className={styles.primaryButton} type="button" onClick={handleDownloadDefinition}>
										Download definition JSON
									</button>
								</div>
							</>
						)}
					</section>
				)}

				<section className={styles.section}>
					<div className={styles.sectionHeader}>Asset</div>
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
				</section>

				<section className={styles.section}>
					<div className={styles.sectionHeader}>Grid footprint</div>
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
				</section>

				<section className={styles.section}>
					<div className={styles.sectionHeader}>Entry + center points</div>
					<p className={styles.helperText}>
						Offsets are in tiles from the top-left corner of the footprint. Click the grid to pick a point.
					</p>
					{pickMode !== 'position' && (
						<p className={styles.pickHint}>Click the grid to set the {pickMode} point.</p>
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
				</section>

				<section className={styles.section}>
					<div className={styles.sectionHeader}>Transform</div>
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
				</section>

				{hasDefinition && (
					<section className={styles.section}>
						<div className={styles.sectionHeader}>Storage slots</div>
						<p className={styles.helperText}>
							Offsets are in tiles from the building’s top-left corner (0,0). Each slot renders as a colored
							box on the grid.
						</p>
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
												onChange={(event) => updateStorageSlot(index, { itemType: event.target.value })}
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
												onChange={(event) => updateStorageSlot(index, { itemType: event.target.value })}
												placeholder="item_type"
											/>
										)}
									</label>
									<label className={styles.field}>
										<span>Offset X</span>
										<input
											type="number"
											step="1"
											value={slot.offset.x}
											onChange={(event) =>
												updateStorageSlot(index, {
													offset: { x: toIntegerLoose(event.target.value, slot.offset.x) }
												})
											}
										/>
									</label>
									<label className={styles.field}>
										<span>Offset Y</span>
										<input
											type="number"
											step="1"
											value={slot.offset.y}
											onChange={(event) =>
												updateStorageSlot(index, {
													offset: { y: toIntegerLoose(event.target.value, slot.offset.y) }
												})
											}
										/>
									</label>
								</div>
								<div className={styles.slotRow}>
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
									<label className={styles.checkboxField}>
										<input
											type="checkbox"
											checked={Boolean(slot.hidden)}
											onChange={(event) => updateStorageSlot(index, { hidden: event.target.checked || undefined })}
										/>
										<span>Hidden</span>
									</label>
									<button
										type="button"
										className={styles.smallButton}
										onClick={() => removeStorageSlot(index)}
									>
										Remove
									</button>
								</div>
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
					</section>
				)}

				<section className={styles.section}>
					<div className={styles.sectionHeader}>Export</div>
					<div className={styles.inlineRow}>
						<button className={styles.secondaryButton} type="button" onClick={handleCopy}>
							Copy JSON
						</button>
						<button className={styles.primaryButton} type="button" onClick={handleDownload}>
							Download JSON
						</button>
						{copyStatus && <span className={styles.status}>{copyStatus}</span>}
					</div>
					<pre className={styles.jsonPreview}>{formattedJson}</pre>
				</section>
			</div>

			<div className={styles.viewport}>
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
	offset: { x: number; y: number }
	hidden?: boolean
	maxQuantity?: number
}> {
	return slots
		.filter((slot) => Boolean(slot.itemType))
		.map((slot) => {
			const normalized: {
				itemType: string
				offset: { x: number; y: number }
				hidden?: boolean
				maxQuantity?: number
			} = {
				itemType: slot.itemType,
				offset: {
					x: Math.round(slot.offset.x),
					y: Math.round(slot.offset.y)
				}
			}
			if (slot.hidden) {
				normalized.hidden = true
			}
			if (typeof slot.maxQuantity === 'number' && Number.isFinite(slot.maxQuantity)) {
				normalized.maxQuantity = Math.max(1, Math.round(slot.maxQuantity))
			}
			return normalized
		})
}
