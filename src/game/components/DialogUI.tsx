import React, { useEffect, useState } from 'react'
import { DialogueNode } from '../../../backend/src/Game/Dialogue/types'
import styles from './DialogUI.module.css'
import { EventBus } from '../EventBus'
import { DialogueEvents } from '../../../backend/src/Game/Dialogue/events'
import { itemService } from '../services/ItemService'
import { ItemTexture } from './ItemTexture'

export function DialogUI() {
	const [activeNode, setActiveNode] = useState<DialogueNode | null>(null)
	const [dialogueId, setDialogueId] = useState<string | null>(null)
	const [, setUpdateCounter] = useState(0)

	useEffect(() => {
		const handleDialogueTrigger = (data: { dialogueId: string, node: DialogueNode }) => {
			setDialogueId(data.dialogueId)
			setActiveNode(data.node)
		}

		const handleDialogueEnd = (data: { dialogueId: string }) => {
			setDialogueId(null)
			setActiveNode(null)
		}

		const handleItemUpdate = () => {
			setUpdateCounter(c => c + 1)
		}

		// Listen for dialogue events
		EventBus.on(DialogueEvents.SC.Trigger, handleDialogueTrigger)
		EventBus.on(DialogueEvents.SC.End, handleDialogueEnd)

		// Listen for item type updates
		const unsubscribe = itemService.onUpdate(handleItemUpdate)

		return () => {
			EventBus.off(DialogueEvents.SC.Trigger, handleDialogueTrigger)
			EventBus.off(DialogueEvents.SC.End, handleDialogueEnd)
			unsubscribe()
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
			EventBus.emit(DialogueEvents.CS.End, { dialogueId })
		}
	}

	const renderItem = (item: DialogueNode['item']) => {
		if (!item) return null

		const itemType = itemService.getItemType(item.itemType)
		if (!itemType) return null

		return (
			<div className={styles.itemContainer}>
				<div className={styles.itemIcon}>
					<ItemTexture 
						itemType={item.itemType}
						fallbackEmoji={itemType.emoji || '📦'}
						style={{ width: '48px', height: '48px' }}
					/>
				</div>
				<div className={styles.itemInfo}>
					<div className={styles.itemHeader}>
						<span className={styles.itemName}>{itemType.name}</span>
					</div>
					{itemType.description && (
						<div className={styles.itemDescription}>{itemType.description}</div>
					)}
					<div className={styles.itemType}>{itemType.type}</div>
				</div>
			</div>
		)
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
					{activeNode.item && renderItem(activeNode.item)}
				</div>

				<div className={styles.responsesList}>
					{activeNode.options?.map((option) => (
						<div key={option.id} className={styles.responseWrapper}>
							<button
								className={styles.responseButton}
								onClick={() => handleOptionSelect(option.id)}
							>
								{option.text}
							</button>
							{option.item && renderItem(option.item)}
						</div>
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