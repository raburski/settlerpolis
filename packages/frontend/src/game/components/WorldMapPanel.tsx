import { useEffect, useMemo, useState } from 'react'
import styles from './WorldMapPanel.module.css'
import { worldMapData, WorldMapNodeType, type WorldMapNode, type WorldMapNodeTradeOffer, type WorldMapLink } from '../worldmap/data'
import { shouldIgnoreKeyboardEvent } from '../utils/inputGuards'

type WorldMapPanelProps = {
	isOpen: boolean
	onClose: () => void
}

const formatDuration = (seconds: number) => {
	if (seconds < 1) return '<1 sec'
	if (seconds < 60) return `${Math.round(seconds)} sec`
	return `${(seconds / 60).toFixed(1)} min`
}

const getLinkDistance = (link: WorldMapLink, nodes: WorldMapNode[]) => {
	if (typeof link.distance === 'number') return link.distance
	const from = nodes.find(node => node.id === link.fromId)
	const to = nodes.find(node => node.id === link.toId)
	if (!from || !to) return 0
	const dx = from.position.x - to.position.x
	const dy = from.position.y - to.position.y
	return Math.hypot(dx, dy)
}

const getShortestDistance = (homeId: string, targetId: string, nodes: WorldMapNode[], links: WorldMapLink[]) => {
	if (homeId === targetId) return 0
	const distances = new Map<string, number>([[homeId, 0]])
	const visited = new Set<string>()

	const neighbors = (nodeId: string) => {
		return links.flatMap((link) => {
			if (link.fromId === nodeId) return [{ id: link.toId, distance: getLinkDistance(link, nodes) }]
			if (link.toId === nodeId) return [{ id: link.fromId, distance: getLinkDistance(link, nodes) }]
			return []
		})
	}

	while (visited.size < nodes.length) {
		let current: string | null = null
		let currentDistance = Number.POSITIVE_INFINITY
		for (const [nodeId, distance] of distances.entries()) {
			if (visited.has(nodeId)) continue
			if (distance < currentDistance) {
				current = nodeId
				currentDistance = distance
			}
		}
		if (!current) break
		if (current === targetId) return currentDistance
		visited.add(current)
		for (const neighbor of neighbors(current)) {
			if (visited.has(neighbor.id)) continue
			const nextDistance = currentDistance + neighbor.distance
			const existing = distances.get(neighbor.id)
			if (existing === undefined || nextDistance < existing) {
				distances.set(neighbor.id, nextDistance)
			}
		}
	}

	return null
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

const formatOffer = (offer: WorldMapNodeTradeOffer) => {
	return `${offer.offerQuantity} ${offer.offerItem} → ${offer.receiveQuantity} ${offer.receiveItem}`
}

export const WorldMapPanel = ({ isOpen, onClose }: WorldMapPanelProps) => {
	const [selectedId, setSelectedId] = useState(worldMapData.homeNodeId)

	useEffect(() => {
		if (!isOpen) return
		const handleKeyDown = (event: KeyboardEvent) => {
			if (shouldIgnoreKeyboardEvent(event)) {
				return
			}
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

	const travelSeconds = useMemo(() => {
		if (!homeNode || !selectedNode || homeNode.id === selectedNode.id) return null
		if (!worldMapData.links || worldMapData.links.length === 0) return null
		const dist = getShortestDistance(homeNode.id, selectedNode.id, worldMapData.nodes, worldMapData.links)
		if (dist === null) return null
		return dist * worldMapData.travelSecondsPerUnit
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
								<strong>{travelSeconds !== null ? formatDuration(travelSeconds) : 'No route'}</strong>
							</div>
						) : (
							<div className={styles.detailStat}>
								<span>Home base</span>
								<strong>Supply routes start here</strong>
							</div>
						)}
						{selectedNode.tradeOffers && selectedNode.tradeOffers.length > 0 ? (
							<div className={styles.detailStat}>
								<span>Trade offers</span>
								<strong>{selectedNode.tradeOffers.map(formatOffer).join(' · ')}</strong>
							</div>
						) : (
							<div className={styles.detailStat}>
								<span>Trade offers</span>
								<strong>None listed</strong>
							</div>
						)}
						<div className={styles.detailHint}>Set routes at a Trading Post or Trading Port.</div>
					</aside>
				</div>
			</div>
		</div>
	)
}
