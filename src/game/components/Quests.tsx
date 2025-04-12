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
			setIsVisible(prev => !prev)
		}

		EventBus.on('ui:quests:toggle', handleToggle)

		return () => {
			EventBus.off('ui:quests:toggle', handleToggle)
		}
	}, [])

	useEffect(() => {
		const handleQuestList = (data: { quests: QuestProgress[] }) => {
			setQuests(data.quests)
		}

		const handleQuestUpdate = (data: { questId: string, progress: QuestProgress }) => {
			setQuests(prev => {
				const newQuests = [...prev]
				const index = newQuests.findIndex(q => q.questId === data.questId)
				if (index !== -1) {
					newQuests[index] = data.progress
				} else {
					newQuests.push(data.progress)
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
		EventBus.on(Event.Quest.SC.Update, handleQuestUpdate)
		EventBus.on(Event.Quest.SC.Complete, handleQuestComplete)
		EventBus.on(Event.Quest.SC.StepComplete, handleStepComplete)

		return () => {
			EventBus.off(Event.Quest.SC.List, handleQuestList)
			EventBus.off(Event.Quest.SC.Update, handleQuestUpdate)
			EventBus.off(Event.Quest.SC.Complete, handleQuestComplete)
			EventBus.off(Event.Quest.SC.StepComplete, handleStepComplete)
		}
	}, [])

	if (!isVisible) {
		return null
	}

	const renderQuestStep = (quest: QuestProgress, step: Quest['steps'][number]) => {
		const isCompleted = quest.completedSteps.includes(step.id)
		const isCurrent = quest.currentStep === quest.steps.indexOf(step)

		return (
			<div 
				key={step.id} 
				className={`${styles.step} ${isCompleted ? styles.completed : ''} ${isCurrent ? styles.current : ''}`}
			>
				<div className={styles.stepIcon}>
					{isCompleted ? '✓' : isCurrent ? '→' : '○'}
				</div>
				<div className={styles.stepInfo}>
					<div className={styles.stepLabel}>{step.label}</div>
					{step.optional && <span className={styles.optionalTag}>Optional</span>}
				</div>
			</div>
		)
	}

	const renderQuest = (progress: QuestProgress) => {
		const quest = questDetails[progress.questId]
		if (!quest) return null

		return (
			<div key={progress.questId} className={styles.questCard}>
				<div className={styles.questHeader}>
					<h3 className={styles.questTitle}>{quest.title}</h3>
					{progress.completed && (
						<span className={styles.completedBadge}>Completed</span>
					)}
				</div>
				<p className={styles.questDescription}>{quest.description}</p>
				<div className={styles.steps}>
					{quest.steps.map(step => renderQuestStep(progress, step))}
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