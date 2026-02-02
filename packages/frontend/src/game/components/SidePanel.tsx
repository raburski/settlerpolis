import React, { useEffect, useState } from 'react'
import { EventBus } from '../EventBus'
import { Event } from '@rugged/game'
import styles from './SidePanel.module.css'
import { itemService } from '../services/ItemService'
import { ItemCategory } from '@rugged/game'
import { UiEvents } from '../uiEvents'

const LABEL_TOOLTIP_TIME = 4000

export function SidePanel() {
	const [inventoryPulse, setInventoryPulse] = useState(false)
	const [questsPulse, setQuestsPulse] = useState(false)
	const [relationshipsPulse, setRelationshipsPulse] = useState(false)
	const [hasNewQuest, setHasNewQuest] = useState(false)
	const [hasNewQuestItem, setHasNewQuestItem] = useState(false)
	const [hasCompletedQuest, setHasCompletedQuest] = useState(false)

	const handleInventoryClick = () => {
		EventBus.emit(UiEvents.Inventory.Toggle)
		setHasNewQuestItem(false)
	}

	const handleQuestsClick = () => {
		EventBus.emit(UiEvents.Quests.Toggle)
		setHasNewQuest(false)
		setHasCompletedQuest(false)
	}

	const handleRelationshipsClick = () => {
		EventBus.emit(UiEvents.Relationships.Toggle)
	}

	const handleSettingsClick = () => {
		EventBus.emit(UiEvents.Settings.Toggle)
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

		const handleNewQuest = () => {
			setHasNewQuest(true)
			setTimeout(() => {
				setHasNewQuest(false)
			}, LABEL_TOOLTIP_TIME)
		}

		const handleQuestComplete = () => {
			setHasCompletedQuest(true)
			setTimeout(() => {
				setHasCompletedQuest(false)
			}, LABEL_TOOLTIP_TIME)
		}

		const handleItemAdded = async (data: { item: { itemType: string } }) => {
			const itemType = await itemService.getItemTypeAsync(data.item.itemType)
			if (itemType?.category === ItemCategory.Quest) {
				setHasNewQuestItem(true)
				setTimeout(() => {
					setHasNewQuestItem(false)
				}, LABEL_TOOLTIP_TIME)
			}
		}

		// Inventory updates
		EventBus.on(Event.Inventory.SC.Update, triggerInventoryPulse)
		EventBus.on(Event.Inventory.SC.Add, triggerInventoryPulse)
		EventBus.on(Event.Inventory.SC.Remove, triggerInventoryPulse)
		EventBus.on(Event.Inventory.SC.Add, handleItemAdded)

		// Quest updates
		EventBus.on(Event.Quest.SC.Update, triggerQuestsPulse)
		EventBus.on(Event.Quest.SC.Complete, triggerQuestsPulse)
		EventBus.on(Event.Quest.SC.StepComplete, triggerQuestsPulse)
		EventBus.on(Event.Quest.SC.Start, handleNewQuest)
		EventBus.on(Event.Quest.SC.Complete, handleQuestComplete)

		// Relationships updates
		EventBus.on(Event.Affinity.SC.Update, triggerRelationshipsPulse)

		return () => {
			EventBus.off(Event.Inventory.SC.Update, triggerInventoryPulse)
			EventBus.off(Event.Inventory.SC.Add, triggerInventoryPulse)
			EventBus.off(Event.Inventory.SC.Remove, triggerInventoryPulse)
			EventBus.off(Event.Inventory.SC.Add, handleItemAdded)
			EventBus.off(Event.Quest.SC.Update, triggerQuestsPulse)
			EventBus.off(Event.Quest.SC.Complete, triggerQuestsPulse)
			EventBus.off(Event.Quest.SC.StepComplete, triggerQuestsPulse)
			EventBus.off(Event.Quest.SC.Start, handleNewQuest)
			EventBus.off(Event.Quest.SC.Complete, handleQuestComplete)
			EventBus.off(Event.Affinity.SC.Update, triggerRelationshipsPulse)
		}
	}, [])

	return (
		<div className={styles.panel}>
			<div className={styles.topButtons}>
				<div className={styles.buttonContainer}>
					<button 
						className={`${styles.button} ${questsPulse ? styles.pulse : ''}`}
						onClick={handleQuestsClick}
						title="Toggle Quests"
					>
						📜
					</button>
					{hasNewQuest && (
						<span className={styles.newQuestLabel}>New quest!</span>
					)}
					{hasCompletedQuest && (
						<span className={styles.newQuestLabel}>Quest completed!</span>
					)}
				</div>
				<div className={styles.buttonContainer}>
					<button 
						className={`${styles.button} ${inventoryPulse ? styles.pulse : ''}`}
						onClick={handleInventoryClick}
						title="Toggle Inventory"
					>
						🎒
					</button>
					{hasNewQuestItem && (
						<span className={styles.newQuestLabel}>New quest item!</span>
					)}
				</div>
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
