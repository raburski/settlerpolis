import React, { useEffect, useState } from 'react'
import { EventBus } from '../EventBus'
import { Event } from '../../../backend/src/events'
import styles from './SidePanel.module.css'

export function SidePanel() {
	const [inventoryPulse, setInventoryPulse] = useState(false)
	const [questsPulse, setQuestsPulse] = useState(false)

	const handleInventoryClick = () => {
		EventBus.emit('ui:inventory:toggle')
	}

	const handleQuestsClick = () => {
		EventBus.emit('ui:quests:toggle')
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

		// Inventory updates
		EventBus.on(Event.Inventory.SC.Update, triggerInventoryPulse)
		EventBus.on(Event.Inventory.SC.Add, triggerInventoryPulse)
		EventBus.on(Event.Inventory.SC.Remove, triggerInventoryPulse)

		// Quest updates
		EventBus.on(Event.Quest.SC.Update, triggerQuestsPulse)
		EventBus.on(Event.Quest.SC.Complete, triggerQuestsPulse)
		EventBus.on(Event.Quest.SC.StepComplete, triggerQuestsPulse)

		return () => {
			EventBus.off(Event.Inventory.SC.Update, triggerInventoryPulse)
			EventBus.off(Event.Quest.SC.Update, triggerQuestsPulse)
			EventBus.off(Event.Quest.SC.Complete, triggerQuestsPulse)
			EventBus.off(Event.Quest.SC.StepComplete, triggerQuestsPulse)
		}
	}, [])

	return (
		<div className={styles.panel}>
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
		</div>
	)
} 