import { useEffect, useState } from 'react'
import { EventBus } from '../EventBus'
import { reputationService } from '../services/ReputationService'
import { playerService } from '../services/PlayerService'
import { UiEvents } from '../uiEvents'
import styles from './ReputationPanel.module.css'

type ReputationPanelProps = {
	isVisible: boolean
	onClose?: () => void
	anchorRect?: DOMRect | null
}

export const ReputationPanel = ({ isVisible, onClose, anchorRect }: ReputationPanelProps) => {
	const [reputation, setReputation] = useState(
		reputationService.getReputation(playerService.playerId)
	)

	useEffect(() => {
		const handleReputationUpdated = () => {
			setReputation(reputationService.getReputation(playerService.playerId))
		}

		EventBus.on(UiEvents.Reputation.Updated, handleReputationUpdated)
		reputationService.requestState()

		return () => {
			EventBus.off(UiEvents.Reputation.Updated, handleReputationUpdated)
		}
	}, [])

	if (!isVisible) {
		return null
	}

	const panelStyle = anchorRect
		? {
			left: anchorRect.left + anchorRect.width / 2,
			top: 'calc(var(--top-bar-height, 64px) + var(--spacing-md))',
			transform: 'translateX(-50%)'
		}
		: undefined

	return (
		<div className={styles.panel} style={panelStyle}>
			<div className={styles.header}>
				<h3>Reputation</h3>
				<button
					className={styles.closeButton}
					onClick={onClose}
					type="button"
					aria-label="Close reputation panel"
				>
					×
				</button>
			</div>
			<div className={styles.content}>
				<div className={styles.statRow}>
					<span className={styles.label}>Current</span>
					<span className={styles.value}>
						<span className={styles.icon}>⭐</span>
						{reputation}
					</span>
				</div>
				<p className={styles.description}>
					Reputation reflects how trusted your settlement is. Earn it by completing
					trade routes and future civic actions.
				</p>
			</div>
		</div>
	)
}
