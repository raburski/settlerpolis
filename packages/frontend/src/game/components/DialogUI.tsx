import React, { useEffect, useState, useRef } from 'react'
import { DialogueNode } from '@rugged/game'
import styles from './DialogUI.module.css'
import { EventBus } from '../EventBus'
import { Event } from '@rugged/game'
import { itemService } from '../services/ItemService'
import { ItemTexture } from './ItemTexture'
import { npcAssetsService } from '../services/NPCAssetsService'

export function DialogUI() {
	const [activeNode, setActiveNode] = useState<DialogueNode | null>(null)
	const [dialogueId, setDialogueId] = useState<string | null>(null)
	const [npcId, setNpcId] = useState<string | null>(null)
	const [, setUpdateCounter] = useState(0)
	const [displayedText, setDisplayedText] = useState('')
	const [isAnimating, setIsAnimating] = useState(false)
	const [showResponses, setShowResponses] = useState(false)
	const [predictedHeight, setPredictedHeight] = useState<number | undefined>(undefined)
	const measureRef = useRef<HTMLDivElement>(null)
	const dialogTextRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const handleDialogueTrigger = (data: { dialogueId: string, node: DialogueNode, npcId: string }) => {
			setDialogueId(data.dialogueId)
			setActiveNode(data.node)
			setNpcId(data.npcId)
			setDisplayedText('')
			setIsAnimating(true)
			setShowResponses(false)
		}

		const handleDialogueEnd = (data: { dialogueId: string }) => {
			setDialogueId(null)
			setActiveNode(null)
			setNpcId(null)
			setDisplayedText('')
			setIsAnimating(false)
			setShowResponses(false)
		}

		const handleItemUpdate = () => {
			setUpdateCounter(c => c + 1)
		}

		const handleKeyPress = (event: KeyboardEvent) => {
			if (event.code === 'Space' && activeNode && isAnimating) {
				event.preventDefault()
				setDisplayedText(activeNode.text)
				setIsAnimating(false)
				setTimeout(() => {
					setShowResponses(true)
				}, 200)
			}
		}

		// Listen for dialogue events
		EventBus.on(Event.Dialogue.SC.Trigger, handleDialogueTrigger)
		EventBus.on(Event.Dialogue.SC.End, handleDialogueEnd)

		// Listen for item type updates
		const unsubscribe = itemService.onUpdate(handleItemUpdate)

		// Add keyboard listener
		window.addEventListener('keydown', handleKeyPress)

		return () => {
			EventBus.off(Event.Dialogue.SC.Trigger, handleDialogueTrigger)
			EventBus.off(Event.Dialogue.SC.End, handleDialogueEnd)
			unsubscribe()
			window.removeEventListener('keydown', handleKeyPress)
		}
	}, [activeNode, isAnimating])

	useEffect(() => {
		if (!activeNode || !isAnimating) return

		let currentIndex = 0
		const text = activeNode.text
		const interval = setInterval(() => {
			if (currentIndex < text.length) {
				setDisplayedText(text.slice(0, currentIndex + 1))
				currentIndex++
			} else {
				clearInterval(interval)
				setIsAnimating(false)
				// Add a small delay before showing responses
				setTimeout(() => {
					setShowResponses(true)
				}, 200)
			}
		}, 40) // Slightly slower for better readability

		return () => clearInterval(interval)
	}, [activeNode, isAnimating])

	// Predict the height of the full text and set minHeight
	useEffect(() => {
		if (!activeNode) return
		if (!dialogTextRef.current || !measureRef.current) return
		// Set the full text in the hidden measure element
		measureRef.current.innerText = activeNode.text
		// Get the height of the measure element
		const height = measureRef.current.offsetHeight
		setPredictedHeight(height)
	}, [activeNode])

	if (!activeNode) {
		return null
	}

	const handleContinue = () => {
		if (dialogueId && activeNode.next) {
			EventBus.emit(Event.Dialogue.CS.Continue, { 
				dialogueId,
				nodeId: activeNode.next 
			})
		}
	}

	const handleOptionSelect = (optionId: string) => {
		if (dialogueId) {
			EventBus.emit(Event.Dialogue.CS.Choice, {
				dialogueId,
				choiceId: optionId
			})
		}
	}

	const handleClose = () => {
		if (dialogueId) {
			EventBus.emit(Event.Dialogue.CS.End, { dialogueId })
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

				{activeNode.speaker && (
					<div className={styles.avatarContainer}>
						<img 
							src={npcId ? npcAssetsService.getAvatarUrl(npcId) : '/assets/npcs/placeholder/avatar.png'} 
							alt={activeNode.speaker}
							className={styles.avatar}
						/>
					</div>
				)}

				<div className={styles.dialogMain}>
					<div className={styles.speakerName}>
						{activeNode.speaker}
					</div>

					<div
						className={styles.dialogText}
						ref={dialogTextRef}
						style={predictedHeight ? { minHeight: predictedHeight } : {}}
					>
						<p>
							{displayedText.split('').map((char, index) => (
								<span key={index}>{char}</span>
							))}
						</p>
						{activeNode.item && renderItem(activeNode.item)}
						{/* Hidden element for measuring full text height */}
						<div
							ref={measureRef}
							style={{
								position: 'absolute',
								visibility: 'hidden',
								pointerEvents: 'none',
								zIndex: -1,
								whiteSpace: 'pre-wrap',
								width: '100%',
								fontFamily: 'inherit',
								fontSize: 'inherit',
								fontWeight: 'inherit',
								lineHeight: 'inherit',
							}}
						/>
					</div>

					<div className={`${styles.responsesList} ${showResponses ? styles.visible : ''}`}>
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
			</div>
		</div>
	)
} 