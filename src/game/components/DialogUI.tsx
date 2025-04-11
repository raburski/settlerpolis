import React, { useEffect, useState } from 'react'
import { DialogueNode } from '../../../backend/src/Game/Dialogue/types'
import styles from './DialogUI.module.css'
import { EventBus } from '../EventBus'
import { DialogueEvents } from '../../../backend/src/Game/Dialogue/events'

export function DialogUI() {
	const [activeNode, setActiveNode] = useState<DialogueNode | null>(null)
	const [dialogueId, setDialogueId] = useState<string | null>(null)

	useEffect(() => {
		const handleDialogueTrigger = (data: { dialogueId: string, node: DialogueNode }) => {
			console.log('Dialogue trigger:', data)
			setDialogueId(data.dialogueId)
			setActiveNode(data.node)
		}

		const handleDialogueEnd = (data: { dialogueId: string }) => {
			console.log('Dialogue end:', data)
			setDialogueId(null)
			setActiveNode(null)
		}

		// Listen for dialogue events
		EventBus.on(DialogueEvents.SC.Trigger, handleDialogueTrigger)
		EventBus.on(DialogueEvents.SC.End, handleDialogueEnd)

		return () => {
			EventBus.off(DialogueEvents.SC.Trigger, handleDialogueTrigger)
			EventBus.off(DialogueEvents.SC.End, handleDialogueEnd)
		}
	}, [])

	if (!activeNode) {
		return null
	}

	const handleContinue = () => {
		if (dialogueId && activeNode.next) {
			EventBus.emit(DialogueEvents.CS.Continue, { 
				dialogueId,
				nodeId: activeNode.next 
			})
		}
	}

	const handleOptionSelect = (optionId: string) => {
		if (dialogueId) {
			EventBus.emit(DialogueEvents.CS.Choice, {
				dialogueId,
				choiceId: optionId
			})
		}
	}

	const handleClose = () => {
		if (dialogueId) {
			EventBus.emit(DialogueEvents.SC.End, { dialogueId })
		}
	}

	return (
		<div className={styles.dialogContainer}>
			<div className={styles.dialogContent}>
				<button 
					className={styles.closeIcon}
					onClick={handleClose}
					aria-label="Close dialog"
				>
					×
				</button>

				<div className={styles.speakerName}>
					{activeNode.speaker}
				</div>

				<div className={styles.dialogText}>
					<p>{activeNode.text}</p>
				</div>

				<div className={styles.responsesList}>
					{activeNode.options?.map((option) => (
						<button
							key={option.id}
							className={styles.responseButton}
							onClick={() => handleOptionSelect(option.id)}
						>
							{option.text}
						</button>
					))}
				</div>

				{(!activeNode.options && activeNode.next) && (
					<button
						className={styles.continueButton}
						onClick={handleContinue}
					>
						Continue
					</button>
				)}

				{(!activeNode.options && !activeNode.next) && (
					<button
						className={styles.closeButton}
						onClick={handleClose}
					>
						Close
					</button>
				)}
			</div>
		</div>
	)
} 