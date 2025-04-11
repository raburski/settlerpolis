import React, { useEffect, useState } from 'react'
import { DialogueNode } from '@backend/Game/Dialogue/types'
import styles from './DialogUI.module.css'
import { EventBus } from '../EventBus'

export function DialogUI() {
	const [activeNode, setActiveNode] = useState<DialogueNode | null>(null)
	const [dialogueId, setDialogueId] = useState<string | null>(null)

	useEffect(() => {
		const handleDialogueUpdate = (data: { dialogueId: string, node: DialogueNode }) => {
			console.log('Dialogue update:', data)
			setDialogueId(data.dialogueId)
			setActiveNode(data.node)
		}

		const handleDialogueEnd = (data: { dialogueId: string }) => {
			console.log('Dialogue end:', data)
			setDialogueId(null)
			setActiveNode(null)
		}

		// Listen for both local and server events
		EventBus.on('dialogue:update', handleDialogueUpdate)
		EventBus.on('dialogue:end', handleDialogueEnd)

		return () => {
			EventBus.off('dialogue:update', handleDialogueUpdate)
			EventBus.off('dialogue:end', handleDialogueEnd)
		}
	}, [])

	if (!activeNode) {
		return null
	}

	const handleContinue = () => {
		console.log('Continuing dialogue')

	}

	const handleOptionSelect = (optionId: string) => {
		console.log('Selected option:', optionId)

	}

	const handleClose = () => {
		console.log('Closing dialogue:', dialogueId)
		if (dialogueId) {
			EventBus.emit('dialogue:end', { dialogueId })
		}
	}

	return (
		<div className={styles.dialogContainer}>
			<div className={styles.dialogContent}>
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