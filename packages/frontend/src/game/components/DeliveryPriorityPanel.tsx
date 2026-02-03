import React, { useEffect, useMemo, useState } from 'react'
import { EventBus } from '../EventBus'
import { logisticsService } from '../services/LogisticsService'
import { itemService } from '../services/ItemService'
import { useResourceList } from './hooks/useResourceList'
import styles from './DeliveryPriorityPanel.module.css'
import { UiEvents } from '../uiEvents'

type DeliveryPriorityPanelProps = {
	isVisible: boolean
	anchorRect?: DOMRect | null
	offsetX?: number
}

const ItemIcon: React.FC<{ itemType: string }> = ({ itemType }) => {
	const [emoji, setEmoji] = useState(() => itemService.getItemType(itemType)?.emoji || '[]')

	useEffect(() => {
		const meta = itemService.getItemType(itemType)
		if (meta?.emoji) {
			setEmoji(meta.emoji)
		}
		const unsubscribe = itemService.subscribeToItemMetadata(itemType, (data) => {
			if (data?.emoji) {
				setEmoji(data.emoji)
			}
		})
		return unsubscribe
	}, [itemType])

	return <span className={styles.itemIcon}>{emoji}</span>
}

const ItemLabel: React.FC<{ itemType: string }> = ({ itemType }) => {
	const [label, setLabel] = useState(() => itemService.getItemType(itemType)?.name || itemType)

	useEffect(() => {
		const meta = itemService.getItemType(itemType)
		if (meta?.name) {
			setLabel(meta.name)
		}
		const unsubscribe = itemService.subscribeToItemMetadata(itemType, (data) => {
			if (data?.name) {
				setLabel(data.name)
			}
		})
		return unsubscribe
	}, [itemType])

	return <span className={styles.itemName}>{label}</span>
}

export const DeliveryPriorityPanel: React.FC<DeliveryPriorityPanelProps> = ({
	isVisible,
	anchorRect,
	offsetX = 0
}) => {
	const resourceTypes = useResourceList()
	const [itemPriorities, setItemPriorities] = useState<string[]>(
		logisticsService.getItemPriorities()
	)
	const [draggingItem, setDraggingItem] = useState<string | null>(null)
	const [dragOverItem, setDragOverItem] = useState<string | null>(null)

	useEffect(() => {
		const handleUpdated = (data: { itemPriorities?: string[] }) => {
			if (Array.isArray(data?.itemPriorities)) {
				setItemPriorities(data.itemPriorities)
			}
		}

		EventBus.on(UiEvents.Logistics.Updated, handleUpdated)

		return () => {
			EventBus.off(UiEvents.Logistics.Updated, handleUpdated)
		}
	}, [])

	const orderedResources = useMemo(() => {
		if (resourceTypes.length === 0) {
			return []
		}
		const resourceSet = new Set(resourceTypes)
		const prioritized = itemPriorities.filter((itemType) => resourceSet.has(itemType))
		const prioritizedSet = new Set(prioritized)
		const missing = resourceTypes.filter((itemType) => !prioritizedSet.has(itemType))
		return [...prioritized, ...missing]
	}, [resourceTypes, itemPriorities])

	if (!isVisible) {
		return null
	}

	const handleDrop = (targetItem: string) => {
		if (!draggingItem || draggingItem === targetItem) {
			return
		}
		const next = [...orderedResources]
		const fromIndex = next.indexOf(draggingItem)
		const toIndex = next.indexOf(targetItem)
		if (fromIndex < 0 || toIndex < 0) {
			return
		}
		next.splice(toIndex, 0, next.splice(fromIndex, 1)[0])
		setItemPriorities(next)
		logisticsService.setItemPriorities(next)
		setDragOverItem(null)
		setDraggingItem(null)
	}

	const panelStyle = anchorRect
		? {
			left: anchorRect.left + anchorRect.width / 2 + offsetX,
			top: 'calc(var(--top-bar-height, 64px) + var(--spacing-md))',
			transform: 'translateX(-50%)'
		}
		: undefined

	return (
		<div className={styles.panel} style={panelStyle}>
			<div className={styles.header}>
				<div className={styles.headerText}>
					<div className={styles.title}>Delivery priority</div>
					<div className={styles.subtitle}>1 = next pickup. Drag to reorder.</div>
				</div>
			</div>
			<div className={styles.content}>
				{orderedResources.length === 0 ? (
					<div className={styles.empty}>No resources available.</div>
				) : (
					orderedResources.map((itemType, index) => (
						<div
							key={itemType}
							className={styles.tile}
							draggable
							data-next={index === 0}
							data-dragging={draggingItem === itemType}
							data-over={dragOverItem === itemType}
							onDragStart={(event) => {
								setDraggingItem(itemType)
								setDragOverItem(null)
								event.dataTransfer.effectAllowed = 'move'
								event.dataTransfer.setData('text/plain', itemType)
							}}
							onDragOver={(event) => {
								event.preventDefault()
								if (dragOverItem !== itemType) {
									setDragOverItem(itemType)
								}
							}}
							onDragLeave={() => {
								if (dragOverItem === itemType) {
									setDragOverItem(null)
								}
							}}
							onDrop={(event) => {
								event.preventDefault()
								handleDrop(itemType)
							}}
							onDragEnd={() => {
								setDraggingItem(null)
								setDragOverItem(null)
							}}
						>
							<span className={styles.orderBadge}>{index + 1}</span>
							<ItemIcon itemType={itemType} />
							<ItemLabel itemType={itemType} />
						</div>
					))
				)}
			</div>
		</div>
	)
}
