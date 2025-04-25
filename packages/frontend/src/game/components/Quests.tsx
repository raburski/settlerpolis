import React, { useEffect, useState } from 'react'
import { EventBus } from '../EventBus'
import { Event } from '@rugged/game'
import { Quest, QuestProgress } from '@rugged/game'
import styles from './Quests.module.css'

export function Quests() {
	const [isVisible, setIsVisible] = useState(false)
	const [isExiting, setIsExiting] = useState(false)
	const [quests, setQuests] = useState<Quest[]>([])
	const [activeQuest, setActiveQuest] = useState<Quest | null>(null)
	const [questDetails, setQuestDetails] = useState<Record<string, Quest>>({})

	useEffect(() => {
		const handleToggle = () => {
			if (isVisible) {
				// Start exit animation
				setIsExiting(true)
				// Wait for animation to complete before hiding
				setTimeout(() => {
					setIsVisible(false)
					setIsExiting(false)
				}, 300) // Match animation duration
			} else {
				setIsVisible(true)
			}
		}

		const handleInventoryToggle = () => {
			// Close quests when inventory is opened
			if (isVisible) {
				setIsExiting(true)
				setTimeout(() => {
					setIsVisible(false)
					setIsExiting(false)
				}, 300)
			}
		}

		const handleRelationshipsToggle = () => {
			// Close quests when relationships is opened
			if (isVisible) {
				setIsExiting(true)
				setTimeout(() => {
					setIsVisible(false)
					setIsExiting(false)
				}, 300)
			}
		}

		const handleSettingsToggle = () => {
			// Close quests when settings is opened
			if (isVisible) {
				setIsExiting(true)
				setTimeout(() => {
					setIsVisible(false)
					setIsExiting(false)
				}, 300)
			}
		}

		EventBus.on('ui:quests:toggle', handleToggle)
		EventBus.on('ui:inventory:toggle', handleInventoryToggle)
		EventBus.on('ui:relationships:toggle', handleRelationshipsToggle)
		EventBus.on('ui:settings:toggle', handleSettingsToggle)

		return () => {
			EventBus.off('ui:quests:toggle', handleToggle)
			EventBus.off('ui:inventory:toggle', handleInventoryToggle)
			EventBus.off('ui:relationships:toggle', handleRelationshipsToggle)
			EventBus.off('ui:settings:toggle', handleSettingsToggle)
		}
	}, [isVisible])

	useEffect(() => {
		const handleQuestList = (data: { quests: QuestProgress[] }) => {
			setQuests(data.quests)
		}

		const handleQuestStart = (data: { quest: Quest, progress: QuestProgress }) => {
			setQuestDetails(prev => ({
				...prev,
				[data.quest.id]: data.quest
			}))
			setQuests(prev => {
				const newQuests = [...prev]
				const index = newQuests.findIndex(q => q.questId === data.quest.id)
				if (index !== -1) {
					newQuests[index] = data.progress
				} else {
					newQuests.push(data.progress)
				}
				return newQuests
			})
		}

		const handleQuestUpdate = (data: { questId: string, progress: QuestProgress }) => {
			setQuests(prev => {
				const newQuests = [...prev]
				const index = newQuests.findIndex(q => q.questId === data.questId)
				if (index !== -1) {
					newQuests[index] = data.progress
				}
				return newQuests
			})
		}

		const handleQuestComplete = (data: { questId: string }) => {
			setQuests(prev => prev.filter(q => q.questId !== data.questId))
		}

		const handleStepComplete = (data: { questId: string, stepId: string }) => {
			setQuests(prev => {
				return prev.map(quest => {
					if (quest.questId === data.questId) {
						return {
							...quest,
							completedSteps: [...quest.completedSteps, data.stepId]
						}
					}
					return quest
				})
			})
		}

		EventBus.on(Event.Quest.SC.List, handleQuestList)
		EventBus.on(Event.Quest.SC.Start, handleQuestStart)
		EventBus.on(Event.Quest.SC.Update, handleQuestUpdate)
		EventBus.on(Event.Quest.SC.Complete, handleQuestComplete)
		EventBus.on(Event.Quest.SC.StepComplete, handleStepComplete)

		return () => {
			EventBus.off(Event.Quest.SC.List, handleQuestList)
			EventBus.off(Event.Quest.SC.Start, handleQuestStart)
			EventBus.off(Event.Quest.SC.Update, handleQuestUpdate)
			EventBus.off(Event.Quest.SC.Complete, handleQuestComplete)
			EventBus.off(Event.Quest.SC.StepComplete, handleStepComplete)
		}
	}, [])

	const handleClose = () => {
		setIsExiting(true)
		setTimeout(() => {
			setIsVisible(false)
			setIsExiting(false)
		}, 300)
	}

	if (!isVisible && !isExiting) {
		return null
	}

	const renderQuest = (progress: QuestProgress) => {
		const quest = questDetails[progress.questId]
		if (!quest) {
			return null
		}

		return (
			<div key={progress.questId} className={styles.questCard}>
				<div className={styles.questHeader}>
					<h3 className={styles.questTitle}>{quest.title}</h3>
					{progress.completed && (
						<span className={styles.completedBadge}>Completed</span>
					)}
				</div>
				<p className={styles.questDescription}>{quest.description}</p>
				<div className={styles.questContent}>
					<div className={styles.steps}>
						{quest.steps.map((step, index) => (
							<div 
								key={step.id} 
								className={`${styles.step} ${
									progress.completedSteps.includes(step.id) 
										? styles.completed 
										: index === progress.currentStep 
											? styles.current 
											: ''
								}`}
							>
								<div className={styles.stepMarker}>
									{progress.completedSteps.includes(step.id) 
										? '✓' 
										: index === progress.currentStep 
											? '→'
											: '○'}
								</div>
								<div className={styles.stepLabel}>
									{step.label}
								</div>
							</div>
						))}
					</div>
					{quest.reward && (
						<div className={styles.rewards}>
							<h4>Rewards:</h4>
							<ul>
								{quest.reward.exp && (
									<li>{quest.reward.exp} XP</li>
								)}
								{quest.reward.items?.map(item => (
									<li key={item.id}>{item.qty}x {item.id}</li>
								))}
							</ul>
						</div>
					)}
				</div>
			</div>
		)
	}

	return (
		<div className={`${styles.questsContainer} ${isExiting ? styles.slideOut : ''}`}>
			<div className={styles.questsContent}>
				<button 
					className={styles.closeIcon}
					onClick={handleClose}
					aria-label="Close quests"
				>
					×
				</button>
				<h2 className={styles.title}>Quests</h2>
				<div className={styles.questList}>
					{quests.length === 0 ? (
						<p className={styles.emptyText}>No active quests</p>
					) : (
						quests.map(quest => renderQuest(quest))
					)}
				</div>
			</div>
		</div>
	)
} 