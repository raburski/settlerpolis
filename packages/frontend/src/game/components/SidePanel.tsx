import React, { useEffect, useState } from 'react'
import { EventBus } from '../EventBus'
import { Event } from '@rugged/game'
import styles from './SidePanel.module.css'

export function SidePanel() {
	const [inventoryPulse, setInventoryPulse] = useState(false)
	const [questsPulse, setQuestsPulse] = useState(false)
	const [relationshipsPulse, setRelationshipsPulse] = useState(false)

	const handleInventoryClick = () => {
		EventBus.emit('ui:inventory:toggle')
	}

	const handleQuestsClick = () => {
		EventBus.emit('ui:quests:toggle')
	}

	const handleRelationshipsClick = () => {
		EventBus.emit('ui:relationships:toggle')
	}

	const handleSettingsClick = () => {
		EventBus.emit('ui:settings:toggle')
	}

	useEffect(() => {
		const triggerInventoryPulse = () => {
			setInventoryPulse(true)
			setTimeout(() => setInventoryPulse(false), 500)
		}

		const triggerQuestsPulse = () => {
			setQuestsPulse(true)
			setTimeout(() => setQuestsPulse(false), 500)
		}

		const triggerRelationshipsPulse = () => {
			setRelationshipsPulse(true)
			setTimeout(() => setRelationshipsPulse(false), 500)
		}

		// Inventory updates
		EventBus.on(Event.Inventory.SC.Update, triggerInventoryPulse)
		EventBus.on(Event.Inventory.SC.Add, triggerInventoryPulse)
		EventBus.on(Event.Inventory.SC.Remove, triggerInventoryPulse)

		// Quest updates
		EventBus.on(Event.Quest.SC.Update, triggerQuestsPulse)
		EventBus.on(Event.Quest.SC.Complete, triggerQuestsPulse)
		EventBus.on(Event.Quest.SC.StepComplete, triggerQuestsPulse)

		// Relationships updates
		EventBus.on(Event.Affinity.SC.Update, triggerRelationshipsPulse)

		return () => {
			EventBus.off(Event.Inventory.SC.Update, triggerInventoryPulse)
			EventBus.off(Event.Quest.SC.Update, triggerQuestsPulse)
			EventBus.off(Event.Quest.SC.Complete, triggerQuestsPulse)
			EventBus.off(Event.Quest.SC.StepComplete, triggerQuestsPulse)
			EventBus.off(Event.Affinity.SC.Update, triggerRelationshipsPulse)
		}
	}, [])

	return (
		<div className={styles.panel}>
			<div className={styles.topButtons}>
				<button 
					className={`${styles.button} ${questsPulse ? styles.pulse : ''}`}
					onClick={handleQuestsClick}
					title="Toggle Quests"
				>
					📜
				</button>
				<button 
					className={`${styles.button} ${inventoryPulse ? styles.pulse : ''}`}
					onClick={handleInventoryClick}
					title="Toggle Inventory"
				>
					🎒
				</button>
				<button 
					className={`${styles.button} ${relationshipsPulse ? styles.pulse : ''}`}
					onClick={handleRelationshipsClick}
					title="Toggle Relationships"
				>
					💝
				</button>
			</div>
			<button 
				className={styles.button}
				onClick={handleSettingsClick}
				title="Settings"
			>
				⚙️
			</button>
		</div>
	)
} 