import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styles from './MapGeneratorApp.module.css'
import {
	GROUND_TYPE_COLORS,
	GROUND_TYPE_ORDER,
	buildMapJson,
	generateMap,
	type MapGenConfig,
	type MapGenResult
} from './generator'

const DEFAULT_CONFIG: MapGenConfig = {
	seed: 'settlerpolis',
	width: 512,
	height: 512,
	tileWidth: 32,
	tileHeight: 32,
	seaLevel: 0.28,
	roughness: 0.9,
	moisture: 0.6,
	temperature: 0.55,
	grassBias: 0.7,
	mountainBias: 0.55
}

const formatPercent = (value: number, total: number) => {
	if (total <= 0) return '0%'
	return `${((value / total) * 100).toFixed(1)}%`
}

const createSeed = () => Math.random().toString(36).slice(2, 10)
const FOREST_PREVIEW_COLOR: [number, number, number] = [18, 58, 24]
const FISH_PREVIEW_COLOR: [number, number, number] = [74, 226, 255]
const STONE_PREVIEW_COLOR: [number, number, number] = [166, 172, 186]
const RESOURCE_DEPOSIT_PREVIEW_COLOR: [number, number, number] = [208, 188, 132]
const DEER_PREVIEW_COLOR: [number, number, number] = [150, 92, 56]
const SPAWN_PREVIEW_COLOR: [number, number, number] = [220, 58, 64]

export function MapGeneratorApp() {
	const [config, setConfig] = useState<MapGenConfig>(DEFAULT_CONFIG)
	const [result, setResult] = useState<MapGenResult | null>(null)
	const [isGenerating, setIsGenerating] = useState(false)
	const [lastDuration, setLastDuration] = useState(0)
	const canvasRef = useRef<HTMLCanvasElement | null>(null)

	const colorByGid = useMemo(() => {
		const colors: Array<[number, number, number]> = new Array(GROUND_TYPE_ORDER.length + 1)
		colors[0] = [21, 21, 21]
		for (let i = 0; i < GROUND_TYPE_ORDER.length; i += 1) {
			colors[i + 1] = hexToRgb(GROUND_TYPE_COLORS[GROUND_TYPE_ORDER[i]])
		}
		return colors
	}, [])

	const handleConfigChange = useCallback(
		<Key extends keyof MapGenConfig>(key: Key, value: MapGenConfig[Key]) => {
			setConfig((prev) => ({ ...prev, [key]: value }))
		},
		[]
	)

	const handleGenerate = useCallback(async () => {
		setIsGenerating(true)
		const start = performance.now()
		await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
		const nextResult = generateMap(config)
		setResult(nextResult)
		setLastDuration(Math.round(performance.now() - start))
		setIsGenerating(false)
	}, [config])

	const handleRandomSeed = useCallback(() => {
		handleConfigChange('seed', createSeed())
	}, [handleConfigChange])

	const handleDownload = useCallback(() => {
		if (!result) return
		const mapJson = buildMapJson(result)
		const blob = new Blob([JSON.stringify(mapJson)], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const anchor = document.createElement('a')
		const safeSeed = (result.seed || 'map').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()
		anchor.href = url
		anchor.download = `map-${safeSeed}-${result.width}x${result.height}.json`
		anchor.click()
		URL.revokeObjectURL(url)
	}, [result])

	useEffect(() => {
		if (!result) return
		const canvas = canvasRef.current
		if (!canvas) return
		const { width, height, tiles } = result
		canvas.width = width
		canvas.height = height
		const context = canvas.getContext('2d')
		if (!context) return
		const image = context.createImageData(width, height)
		const pixels = image.data
		for (let i = 0; i < tiles.length; i += 1) {
			const rgb = colorByGid[tiles[i]] || colorByGid[1]
			const offset = i * 4
			pixels[offset] = rgb[0]
			pixels[offset + 1] = rgb[1]
			pixels[offset + 2] = rgb[2]
			pixels[offset + 3] = 255
		}
		if (result.resourceNodes.length > 0) {
			for (const node of result.resourceNodes) {
				const isTree = node.nodeType === 'tree'
				const isFish = node.nodeType === 'fish'
				const isStone = node.nodeType === 'stone_deposit'
				const isDeposit = node.nodeType === 'resource_deposit'
				if (!isTree && !isFish && !isStone && !isDeposit) continue
				const x = node.position.x
				const y = node.position.y
				const color = isTree
					? FOREST_PREVIEW_COLOR
					: isStone
						? STONE_PREVIEW_COLOR
						: isDeposit
							? RESOURCE_DEPOSIT_PREVIEW_COLOR
							: FISH_PREVIEW_COLOR
				const size = isTree || isStone || isDeposit ? 2 : 1
				for (let dy = 0; dy < size; dy += 1) {
					for (let dx = 0; dx < size; dx += 1) {
						const nx = x + dx
						const ny = y + dy
						if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
						const idx = ny * width + nx
						const pixelOffset = idx * 4
						pixels[pixelOffset] = color[0]
						pixels[pixelOffset + 1] = color[1]
						pixels[pixelOffset + 2] = color[2]
						pixels[pixelOffset + 3] = 255
					}
				}
			}
		}
		if (result.deerSpawns.length > 0) {
			for (const deer of result.deerSpawns) {
				const x = deer.position.x
				const y = deer.position.y
				const size = 2
				for (let dy = 0; dy < size; dy += 1) {
					for (let dx = 0; dx < size; dx += 1) {
						const nx = x + dx
						const ny = y + dy
						if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
						const idx = ny * width + nx
						const pixelOffset = idx * 4
						pixels[pixelOffset] = DEER_PREVIEW_COLOR[0]
						pixels[pixelOffset + 1] = DEER_PREVIEW_COLOR[1]
						pixels[pixelOffset + 2] = DEER_PREVIEW_COLOR[2]
						pixels[pixelOffset + 3] = 255
					}
				}
			}
		}
		const spawnX = Math.round(result.spawn.x)
		const spawnY = Math.round(result.spawn.y)
		if (spawnX >= 0 && spawnX < width && spawnY >= 0 && spawnY < height) {
			for (let dy = -1; dy <= 1; dy += 1) {
				for (let dx = -1; dx <= 1; dx += 1) {
					const nx = spawnX + dx
					const ny = spawnY + dy
					if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
					const idx = ny * width + nx
					const pixelOffset = idx * 4
					pixels[pixelOffset] = SPAWN_PREVIEW_COLOR[0]
					pixels[pixelOffset + 1] = SPAWN_PREVIEW_COLOR[1]
					pixels[pixelOffset + 2] = SPAWN_PREVIEW_COLOR[2]
					pixels[pixelOffset + 3] = 255
				}
			}
		}
		context.putImageData(image, 0, 0)
	}, [colorByGid, result])

	const stats = useMemo(() => {
		if (!result) return []
		const total = result.width * result.height
		return GROUND_TYPE_ORDER.map((type) => ({
			type,
			count: result.stats[type],
			percent: formatPercent(result.stats[type], total)
		}))
	}, [result])

	return (
		<div className={styles.mapApp}>
			<aside className={styles.sidebar}>
				<header className={styles.header}>
					<div>
						<p className={styles.overline}>Map Lab</p>
						<h1 className={styles.title}>Realistic Map Generator</h1>
					</div>
				</header>

				<section className={styles.section}>
					<div className={styles.sectionHeader}>Seed</div>
					<div className={styles.field}>
						<label htmlFor="seed-input">Seed value</label>
						<div className={styles.inlineRow}>
							<input
								id="seed-input"
								type="text"
								value={config.seed}
								onChange={(event) => handleConfigChange('seed', event.target.value)}
							/>
							<button className={styles.button} type="button" onClick={handleRandomSeed}>
								Randomize
							</button>
						</div>
					</div>
					<p className={styles.note}>Map size is fixed at 512 x 512 for now.</p>
				</section>

				<section className={styles.section}>
					<div className={styles.sectionHeader}>Terrain Controls</div>
					<div className={styles.field}>
						<label htmlFor="sea-level">Sea level</label>
						<div className={styles.sliderRow}>
							<input
								id="sea-level"
								type="range"
								min="0.18"
								max="0.4"
								step="0.01"
								value={config.seaLevel}
								onChange={(event) => handleConfigChange('seaLevel', Number(event.target.value))}
							/>
							<span className={styles.valueBadge}>{config.seaLevel.toFixed(2)}</span>
						</div>
					</div>
					<div className={styles.field}>
						<label htmlFor="roughness">Roughness</label>
						<div className={styles.sliderRow}>
							<input
								id="roughness"
								type="range"
								min="0.4"
								max="1.4"
								step="0.05"
								value={config.roughness}
								onChange={(event) => handleConfigChange('roughness', Number(event.target.value))}
							/>
							<span className={styles.valueBadge}>{config.roughness.toFixed(2)}</span>
						</div>
					</div>
					<div className={styles.field}>
						<label htmlFor="moisture">Moisture</label>
						<div className={styles.sliderRow}>
							<input
								id="moisture"
								type="range"
								min="0.3"
								max="0.9"
								step="0.02"
								value={config.moisture}
								onChange={(event) => handleConfigChange('moisture', Number(event.target.value))}
							/>
							<span className={styles.valueBadge}>{config.moisture.toFixed(2)}</span>
						</div>
					</div>
					<div className={styles.field}>
						<label htmlFor="temperature">Temperature</label>
						<div className={styles.sliderRow}>
							<input
								id="temperature"
								type="range"
								min="0.3"
								max="0.8"
								step="0.02"
								value={config.temperature}
								onChange={(event) => handleConfigChange('temperature', Number(event.target.value))}
							/>
							<span className={styles.valueBadge}>{config.temperature.toFixed(2)}</span>
						</div>
					</div>
					<div className={styles.field}>
						<label htmlFor="grass-bias">Grass bias</label>
						<div className={styles.sliderRow}>
							<input
								id="grass-bias"
								type="range"
								min="0.4"
								max="0.9"
								step="0.02"
								value={config.grassBias}
								onChange={(event) => handleConfigChange('grassBias', Number(event.target.value))}
							/>
							<span className={styles.valueBadge}>{config.grassBias.toFixed(2)}</span>
						</div>
					</div>
					<div className={styles.field}>
						<label htmlFor="mountain-bias">Mountain bias</label>
						<div className={styles.sliderRow}>
							<input
								id="mountain-bias"
								type="range"
								min="0.3"
								max="0.9"
								step="0.02"
								value={config.mountainBias}
								onChange={(event) => handleConfigChange('mountainBias', Number(event.target.value))}
							/>
							<span className={styles.valueBadge}>{config.mountainBias.toFixed(2)}</span>
						</div>
					</div>
				</section>

				<section className={styles.section}>
					<div className={styles.sectionHeader}>Actions</div>
					<div className={styles.actionRow}>
						<button className={styles.buttonPrimary} type="button" onClick={handleGenerate} disabled={isGenerating}>
							{isGenerating ? 'Generating...' : 'Generate Map'}
						</button>
						<button className={styles.buttonGhost} type="button" onClick={handleDownload} disabled={!result}>
							Download JSON
						</button>
					</div>
					{result ? (
						<p className={styles.note}>
							Last run: {lastDuration} ms. Seed: <span className={styles.inlineCode}>{result.seed}</span>
						</p>
					) : (
						<p className={styles.note}>Run the generator to preview and download a map.</p>
					)}
				</section>

				<section className={styles.section}>
					<div className={styles.sectionHeader}>Biome Legend</div>
					<div className={styles.legend}>
						{GROUND_TYPE_ORDER.map((type) => (
							<div className={styles.legendItem} key={type}>
								<span className={styles.legendSwatch} style={{ background: GROUND_TYPE_COLORS[type] }} />
								<span className={styles.legendLabel}>{type.replace('_', ' ')}</span>
							</div>
						))}
					</div>
				</section>
			</aside>

			<main className={styles.preview}>
				<div className={styles.previewHeader}>
					<h2 className={styles.previewTitle}>Preview</h2>
				</div>
				<div className={styles.previewFrame}>
					<canvas ref={canvasRef} className={styles.previewCanvas} />
					{!result && <div className={styles.previewPlaceholder}>Generate a map to see the preview.</div>}
				</div>

				<div className={styles.statsCard}>
					<h3 className={styles.statsTitle}>Biome Mix</h3>
					<div className={styles.statsGrid}>
						{stats.map((entry) => (
							<div className={styles.statsRow} key={entry.type}>
								<span className={styles.statsName}>{entry.type.replace('_', ' ')}</span>
								<span className={styles.statsValue}>{entry.percent}</span>
							</div>
						))}
					</div>
				</div>
			</main>
		</div>
	)
}

const hexToRgb = (hex: string): [number, number, number] => {
	const clean = hex.replace('#', '').trim()
	if (clean.length === 3) {
		const r = parseInt(clean[0] + clean[0], 16)
		const g = parseInt(clean[1] + clean[1], 16)
		const b = parseInt(clean[2] + clean[2], 16)
		return [r, g, b]
	}
	const r = parseInt(clean.slice(0, 2), 16)
	const g = parseInt(clean.slice(2, 4), 16)
	const b = parseInt(clean.slice(4, 6), 16)
	return [r, g, b]
}
