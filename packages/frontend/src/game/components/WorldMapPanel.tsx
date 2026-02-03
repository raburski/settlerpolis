import { useEffect, useMemo, useState } from 'react'
import styles from './WorldMapPanel.module.css'
import { worldMapData, WorldMapNodeType, type WorldMapNode } from '../worldmap/data'

type WorldMapPanelProps = {
	isOpen: boolean
	onClose: () => void
}

const formatDays = (days: number) => {
	if (days < 0.05) return '<0.1'
	return days.toFixed(1)
}

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => {
	const dx = a.x - b.x
	const dy = a.y - b.y
	return Math.hypot(dx, dy)
}

const getTypeLabel = (node: WorldMapNode) => {
	switch (node.type) {
		case WorldMapNodeType.Home:
			return 'Capital'
		case WorldMapNodeType.City:
			return 'City'
		case WorldMapNodeType.Expedition:
			return 'Expedition'
		default:
			return 'Unknown'
	}
}

export const WorldMapPanel = ({ isOpen, onClose }: WorldMapPanelProps) => {
	const [selectedId, setSelectedId] = useState(worldMapData.homeNodeId)

	useEffect(() => {
		if (!isOpen) return
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.code === 'Escape') {
				onClose()
			}
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [isOpen, onClose])

	useEffect(() => {
		if (!isOpen) return
		setSelectedId(worldMapData.homeNodeId)
	}, [isOpen])

	const selectedNode = useMemo(
		() => worldMapData.nodes.find((node) => node.id === selectedId) || worldMapData.nodes[0],
		[selectedId]
	)
	const homeNode = useMemo(
		() => worldMapData.nodes.find((node) => node.id === worldMapData.homeNodeId),
		[]
	)

	const travelDays = useMemo(() => {
		if (!homeNode || !selectedNode || homeNode.id === selectedNode.id) return null
		const dist = distance(homeNode.position, selectedNode.position)
		return dist * worldMapData.travelDaysPerUnit
	}, [homeNode, selectedNode])

	if (!isOpen) {
		return null
	}

	return (
		<div className={styles.overlay}>
			<div className={styles.panel}>
				<div className={styles.header}>
					<div>
						<div className={styles.kicker}>World Map</div>
						<div className={styles.subtitle}>Select a node to inspect details.</div>
					</div>
					<button type="button" className={styles.closeButton} onClick={onClose}>
						Close
					</button>
				</div>
				<div className={styles.body}>
					<div
						className={styles.map}
						style={{ backgroundImage: `url(${worldMapData.image})` }}
					>
						{worldMapData.nodes.map((node) => (
							<button
								key={node.id}
								type="button"
								className={styles.node}
								data-type={node.type}
								data-selected={selectedNode?.id === node.id}
								style={{
									left: `${node.position.x * 100}%`,
									top: `${node.position.y * 100}%`
								}}
								onClick={() => setSelectedId(node.id)}
							>
								<span className={styles.nodeDot} />
								<span className={styles.nodeLabel}>{node.label}</span>
							</button>
						))}
					</div>
					<aside className={styles.details}>
						<div className={styles.detailHeader}>
							<div className={styles.detailType}>{getTypeLabel(selectedNode)}</div>
							<div className={styles.detailName}>{selectedNode.label}</div>
						</div>
						<p className={styles.detailDescription}>{selectedNode.description}</p>
						{homeNode && selectedNode.id !== homeNode.id ? (
							<div className={styles.detailStat}>
								<span>Estimated travel</span>
								<strong>{formatDays(travelDays ?? 0)} days</strong>
							</div>
						) : (
							<div className={styles.detailStat}>
								<span>Home base</span>
								<strong>Supply routes start here</strong>
							</div>
						)}
						<div className={styles.detailHint}>Missions and trade routes arrive next.</div>
					</aside>
				</div>
			</div>
		</div>
	)
}
