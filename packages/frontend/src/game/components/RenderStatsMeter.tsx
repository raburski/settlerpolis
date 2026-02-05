import { useEffect, useState } from 'react'
import { EventBus } from '../EventBus'
import { UiEvents } from '../uiEvents'
import styles from './RenderStatsMeter.module.css'

type RenderStats = {
	fps: number
	meshes: number
	activeMeshes: number
	instances: number
	thinInstances: number
	groups?: {
		mapObjects?: number
		collision?: number
		roads?: number
		resourceNodes?: number
	}
}

const emptyStats: RenderStats = {
	fps: 0,
	meshes: 0,
	activeMeshes: 0,
	instances: 0,
	thinInstances: 0,
	groups: {}
}

export const RenderStatsMeter = () => {
	const [stats, setStats] = useState<RenderStats>(emptyStats)

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

	return (
		<div className={styles.meter}>
			<div className={styles.title}>Render</div>
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
				<span className={styles.label}>Inst</span>
				<span>{stats.instances}</span>
			</div>
			<div className={styles.row}>
				<span className={styles.label}>Thin</span>
				<span>{stats.thinInstances}</span>
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
				</>
			) : null}
		</div>
	)
}
