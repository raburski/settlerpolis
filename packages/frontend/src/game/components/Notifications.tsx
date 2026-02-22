import { useEffect, useRef, useState } from 'react'
import { EventBus } from '../EventBus'
import { Event } from '@rugged/game'
import { itemService } from '../services/ItemService'
import { buildingService } from '../services/BuildingService'
import styles from './Notifications.module.css'
import { UiEvents } from '../uiEvents'

type NotificationType = 'info' | 'warning' | 'success' | 'error'

interface Notification {
	id: number
	text: string
	type: NotificationType
}

interface UiNotificationPayload {
	message: string
	type?: NotificationType
	durationMs?: number
}

export function Notifications() {
	const [notifications, setNotifications] = useState<Notification[]>([])
	const counter = useRef(0)
	const DEFAULT_DURATION_MS = 3200

	useEffect(() => {
		const addNotification = (text: string, type: NotificationType = 'info', durationMs: number = DEFAULT_DURATION_MS) => {
			const notification = {
				id: counter.current++,
				text,
				type
			}
			setNotifications(prev => [...prev, notification])
			setTimeout(() => {
				setNotifications(prev => prev.filter(item => item.id !== notification.id))
			}, durationMs)
		}

		const handleSpoilage = (data: { buildingInstanceId: string, itemType: string, spoiledQuantity: number }) => {
			const item = itemService.getItemType(data.itemType)
			const emoji = item?.emoji || '🗑️'
			const building = buildingService.getBuildingInstance(data.buildingInstanceId)
			const definition = building ? buildingService.getBuildingDefinition(building.buildingId) : undefined
			const buildingName = definition?.name || 'Storage'
			addNotification(`Spoilage: -${data.spoiledQuantity} ${emoji} in ${buildingName}`, 'warning')
		}

		const handleUiNotification = (data: UiNotificationPayload) => {
			if (!data?.message) {
				return
			}
			addNotification(data.message, data.type ?? 'info', data.durationMs ?? DEFAULT_DURATION_MS)
		}

		EventBus.on(Event.Storage.SC.Spoilage, handleSpoilage)
		EventBus.on(UiEvents.Notifications.UiNotification, handleUiNotification)

		return () => {
			EventBus.off(Event.Storage.SC.Spoilage, handleSpoilage)
			EventBus.off(UiEvents.Notifications.UiNotification, handleUiNotification)
		}
	}, [])

	return (
		<div className={styles.container}>
			{notifications.map(notification => (
				<div key={notification.id} className={`${styles.message} ${styles[notification.type]}`}>
					{notification.text}
				</div>
			))}
		</div>
	)
}
