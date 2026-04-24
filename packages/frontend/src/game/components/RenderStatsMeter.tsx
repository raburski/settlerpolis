import { useEffect, useState } from 'react'
import { EventBus } from '../EventBus'
import { UiEvents } from '../uiEvents'
import styles from './RenderStatsMeter.module.css'

type RenderStats = {
	fps: number
	meshes: number
	activeMeshes: number
	drawCalls: number
	activeIndices: number
	totalVertices: number
	forcedActiveMeshes: number
	instances: number
	thinInstances: number
	groups?: {
		mapObjects?: number
		collision?: number
		roads?: number
		resourceNodes?: number
		resourceNodeThinHosts?: number
		resourceNodeThinInstances?: number
	}
}

const emptyStats: RenderStats = {
	fps: 0,
	meshes: 0,
	activeMeshes: 0,
	drawCalls: 0,
	activeIndices: 0,
	totalVertices: 0,
	forcedActiveMeshes: 0,
	instances: 0,
	thinInstances: 0,
	groups: {}
}

type CopyState = 'idle' | 'copied' | 'error'

const asRounded = (value: number, digits: number = 1): number => {
	if (!Number.isFinite(value)) return 0
	const factor = 10 ** digits
	return Math.round(value * factor) / factor
}

const asRatio = (numerator: number, denominator: number): number | null => {
	if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null
	return asRounded(numerator / denominator, 3)
}

const buildStatsSnapshot = (stats: RenderStats): string => {
	const groups = stats.groups || {}
	const snapshot = {
		ts: new Date().toISOString(),
		fps: asRounded(stats.fps),
		meshes: stats.meshes,
		activeMeshes: stats.activeMeshes,
		drawCalls: stats.drawCalls,
		activeIndices: stats.activeIndices,
		totalVertices: stats.totalVertices,
		instances: stats.instances,
		thinInstances: stats.thinInstances,
		forcedActiveMeshes: stats.forcedActiveMeshes,
		groups: {
			mapObjects: groups.mapObjects ?? 0,
			collision: groups.collision ?? 0,
			roads: groups.roads ?? 0,
			resourceNodes: groups.resourceNodes ?? 0,
			resourceNodeThinHosts: groups.resourceNodeThinHosts ?? 0,
			resourceNodeThinInstances: groups.resourceNodeThinInstances ?? 0
		},
		ratios: {
			activeMeshRatio: asRatio(stats.activeMeshes, stats.meshes),
			forcedActiveRatio: asRatio(stats.forcedActiveMeshes, stats.meshes),
			thinPerDraw: asRatio(stats.thinInstances, stats.drawCalls),
			resourceThinShare: asRatio(groups.resourceNodeThinInstances ?? 0, stats.thinInstances),
			indicesPerDraw: asRatio(stats.activeIndices, stats.drawCalls)
		}
	}
	return JSON.stringify(snapshot, null, 2)
}

const copyText = async (text: string): Promise<void> => {
	if (navigator.clipboard?.writeText) {
		await navigator.clipboard.writeText(text)
		return
	}
	const textarea = document.createElement('textarea')
	textarea.value = text
	textarea.setAttribute('readonly', 'true')
	textarea.style.position = 'fixed'
	textarea.style.opacity = '0'
	textarea.style.pointerEvents = 'none'
	document.body.appendChild(textarea)
	textarea.select()
	const copied = document.execCommand('copy')
	document.body.removeChild(textarea)
	if (!copied) {
		throw new Error('copy failed')
	}
}

export const RenderStatsMeter = () => {
	const [stats, setStats] = useState<RenderStats>(emptyStats)
	const [copyState, setCopyState] = useState<CopyState>('idle')

	useEffect(() => {
		const handleStats = (data: RenderStats) => {
			if (!data) return
			setStats(data)
		}
		EventBus.on(UiEvents.Debug.RenderStats, handleStats)
		return () => {
			EventBus.off(UiEvents.Debug.RenderStats, handleStats)
		}
	}, [])

	useEffect(() => {
		if (copyState === 'idle') return
		const timeoutId = window.setTimeout(() => {
			setCopyState('idle')
		}, 1400)
		return () => {
			window.clearTimeout(timeoutId)
		}
	}, [copyState])

	const handleCopy = async () => {
		try {
			await copyText(buildStatsSnapshot(stats))
			setCopyState('copied')
		} catch {
			setCopyState('error')
		}
	}

	const copyLabel = copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Retry' : 'Copy'

	return (
		<div className={styles.meter}>
			<div className={styles.header}>
				<div className={styles.title}>Render</div>
				<button type="button" className={styles.copyButton} onClick={handleCopy} aria-label="Copy render stats">
					{copyLabel}
				</button>
			</div>
			<div className={styles.row}>
				<span className={styles.label}>FPS</span>
				<span>{Math.round(stats.fps || 0)}</span>
			</div>
			<div className={styles.row}>
				<span className={styles.label}>Meshes</span>
				<span>{stats.meshes}</span>
			</div>
			<div className={styles.row}>
				<span className={styles.label}>Active</span>
				<span>{stats.activeMeshes}</span>
			</div>
			<div className={styles.row}>
				<span className={styles.label}>Draw</span>
				<span>{stats.drawCalls}</span>
			</div>
			<div className={styles.row}>
				<span className={styles.label}>ActIdx</span>
				<span>{stats.activeIndices}</span>
			</div>
			<div className={styles.row}>
				<span className={styles.label}>Vertices</span>
				<span>{stats.totalVertices}</span>
			</div>
			<div className={styles.row}>
				<span className={styles.label}>Inst</span>
				<span>{stats.instances}</span>
			</div>
			<div className={styles.row}>
				<span className={styles.label}>Thin</span>
				<span>{stats.thinInstances}</span>
			</div>
			<div className={styles.row}>
				<span className={styles.label}>Forced</span>
				<span>{stats.forcedActiveMeshes}</span>
			</div>
			{stats.groups ? (
				<>
					<div className={styles.row}>
						<span className={styles.label}>MapObj</span>
						<span>{stats.groups.mapObjects ?? 0}</span>
					</div>
					<div className={styles.row}>
						<span className={styles.label}>Coll</span>
						<span>{stats.groups.collision ?? 0}</span>
					</div>
					<div className={styles.row}>
						<span className={styles.label}>Roads</span>
						<span>{stats.groups.roads ?? 0}</span>
					</div>
					<div className={styles.row}>
						<span className={styles.label}>Res</span>
						<span>{stats.groups.resourceNodes ?? 0}</span>
					</div>
					<div className={styles.row}>
						<span className={styles.label}>ResHost</span>
						<span>{stats.groups.resourceNodeThinHosts ?? 0}</span>
					</div>
					<div className={styles.row}>
						<span className={styles.label}>ResThin</span>
						<span>{stats.groups.resourceNodeThinInstances ?? 0}</span>
					</div>
				</>
			) : null}
		</div>
	)
}
