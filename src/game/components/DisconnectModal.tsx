import { useEffect, useState } from 'react'
import { EventBus } from '../EventBus'
import { Event } from '../../../backend/src/Event'
import styles from './DisconnectModal.module.css'

export function DisconnectModal() {
	const [isVisible, setIsVisible] = useState(false)

	useEffect(() => {
		const handleDisconnect = () => {
			setIsVisible(true)
		}

		EventBus.on(Event.Player.Disconnected, handleDisconnect)

		return () => {
			EventBus.off(Event.Player.Disconnected, handleDisconnect)
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