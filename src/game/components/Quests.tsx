import React, { useEffect, useState } from 'react'
import { EventBus } from '../EventBus'
import { Event } from '../../../backend/src/events'
import { Quest, QuestProgress } from '../../../backend/src/Game/Quest/types'
import styles from './Quests.module.css'

export function Quests() {
	const [isVisible, setIsVisible] = useState(false)
	const [quests, setQuests] = useState<QuestProgress[]>([])
	const [questDetails, setQuestDetails] = useState<Record<string, Quest>>({})

	useEffect(() => {
		const handleToggle = () => {
			console.log('[DEBUG] Quests panel visibility toggled:', !isVisible)
			setIsVisible(prev => !prev)
		}

		EventBus.on('ui:quests:toggle', handleToggle)

		return () => {
			EventBus.off('ui:quests:toggle', handleToggle)
		}
	}, [isVisible])

	useEffect(() => {
		const handleQuestList = (data: { quests: QuestProgress[] }) => {
			console.log('[DEBUG] Received quest list:', data.quests)
			setQuests(data.quests)
		}

		const handleQuestStart = (data: { quest: Quest, progress: QuestProgress }) => {
			console.log('[DEBUG] Quest started:', data)
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
			console.log('[DEBUG] Received quest update:', data)
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
			console.log('[DEBUG] Quest completed:', data.questId)
			setQuests(prev => prev.filter(q => q.questId !== data.questId))
		}

		const handleStepComplete = (data: { questId: string, stepId: string }) => {
			console.log('[DEBUG] Quest step completed:', data)
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

	console.log('[DEBUG] Current quests state:', quests)
	console.log('[DEBUG] Current quest details:', questDetails)

	if (!isVisible) {
		return null
	}

	const renderQuest = (progress: QuestProgress) => {
		console.log('[DEBUG] Attempting to render quest:', progress.questId)
		const quest = questDetails[progress.questId]
		if (!quest) {
			console.log('[DEBUG] No quest details found for:', progress.questId)
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
				<div className={styles.progress}>
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
		<div className={styles.questsContainer}>
			<div className={styles.questsContent}>
				<button 
					className={styles.closeIcon}
					onClick={() => setIsVisible(false)}
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