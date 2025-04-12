import { useEffect, useState } from 'react'
import { EventBus } from '../EventBus'
import { Event } from '../../../backend/src/events'
import styles from './DisconnectModal.module.css'

export function DisconnectModal() {
	const [isVisible, setIsVisible] = useState(false)

	useEffect(() => {
		const handleDisconnect = () => {
			setIsVisible(true)
		}

		// TODO: FIX LATER
		// EventBus.on(Event.Players.SC.Disconnected, handleDisconnect)

		return () => {
			// EventBus.off(Event.Players.SC.Disconnected, handleDisconnect)
		}
	}, [])

	const handleReload = () => {
		window.location.reload()
	}

	if (!isVisible) return null

	return (
		<div className={styles.overlay}>
			<div className={styles.modal}>
				<h2>Disconnected</h2>
				<p>You have been disconnected from the server</p>
				<button onClick={handleReload}>
					Reload Game
				</button>
			</div>
		</div>
	)
} 