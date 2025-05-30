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
	const [selectedOptionIndex, setSelectedOptionIndex] = useState(0)
	const measureRef = useRef<HTMLDivElement>(null)
	const dialogTextRef = useRef<HTMLDivElement>(null)

	const handleClose = () => {
		if (dialogueId) {
			EventBus.emit(Event.Dialogue.CS.End, { dialogueId })
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

	useEffect(() => {
		const handleDialogueTrigger = (data: { dialogueId: string, node: DialogueNode, npcId: string }) => {
			setDialogueId(data.dialogueId)
			setActiveNode(data.node)
			setNpcId(data.npcId)
			setDisplayedText('')
			setIsAnimating(true)
			setShowResponses(false)
			setSelectedOptionIndex(0)
			EventBus.emit('ui:dialogue:animation:start')
		}

		const handleDialogueEnd = (data: { dialogueId: string }) => {
			setDialogueId(null)
			setActiveNode(null)
			setNpcId(null)
			setDisplayedText('')
			setIsAnimating(false)
			setShowResponses(false)
			setSelectedOptionIndex(0)
		}

		const handleItemUpdate = () => {
			setUpdateCounter(c => c + 1)
		}

		const handleSkipAnimation = () => {
			if (activeNode && isAnimating) {
				setDisplayedText(activeNode.text)
				setIsAnimating(false)
				setTimeout(() => {
					setShowResponses(true)
					EventBus.emit('ui:dialogue:responses:show', true)
				}, 200)
			}
		}

		const handleOptionUp = () => {
			if (!activeNode) return
			const totalOptions = activeNode.options?.length || (activeNode.next ? 1 : 0)
			setSelectedOptionIndex(prev => (prev - 1 + totalOptions) % totalOptions)
		}

		const handleOptionDown = () => {
			if (!activeNode) return
			const totalOptions = activeNode.options?.length || (activeNode.next ? 1 : 0)
			setSelectedOptionIndex(prev => (prev + 1) % totalOptions)
		}

		const handleOptionConfirm = () => {
			if (!activeNode) return

			// If text is still animating, show all text and options immediately
			if (isAnimating) {
				setDisplayedText(activeNode.text)
				setIsAnimating(false)
				setTimeout(() => {
					setShowResponses(true)
					EventBus.emit('ui:dialogue:responses:show', true)
				}, 200)
				return
			}

			const options = activeNode.options || []
			if (options.length > 0) {
				handleOptionSelect(options[selectedOptionIndex].id)
			} else if (activeNode.next) {
				handleContinue()
			} else {
				handleClose()
			}
		}

		// Listen for dialogue events
		EventBus.on(Event.Dialogue.SC.Trigger, handleDialogueTrigger)
		EventBus.on(Event.Dialogue.SC.End, handleDialogueEnd)

		// Listen for keyboard events
		EventBus.on('ui:dialogue:skip-animation', handleSkipAnimation)
		EventBus.on('ui:dialogue:option:up', handleOptionUp)
		EventBus.on('ui:dialogue:option:down', handleOptionDown)
		EventBus.on('ui:dialogue:option:confirm', handleOptionConfirm)
		EventBus.on('ui:dialogue:close', handleClose)

		// Listen for item type updates
		const unsubscribe = itemService.onUpdate(handleItemUpdate)

		return () => {
			EventBus.off(Event.Dialogue.SC.Trigger, handleDialogueTrigger)
			EventBus.off(Event.Dialogue.SC.End, handleDialogueEnd)
			EventBus.off('ui:dialogue:skip-animation', handleSkipAnimation)
			EventBus.off('ui:dialogue:option:up', handleOptionUp)
			EventBus.off('ui:dialogue:option:down', handleOptionDown)
			EventBus.off('ui:dialogue:option:confirm', handleOptionConfirm)
			EventBus.off('ui:dialogue:close', handleClose)
			unsubscribe()
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
				EventBus.emit('ui:dialogue:animation:end')
				// Add a small delay before showing responses
				setTimeout(() => {
					setShowResponses(true)
					EventBus.emit('ui:dialogue:responses:show', true)
				}, 200)
			}
		}, 40) // Slightly slower for better readability

		return () => clearInterval(interval)
	}, [activeNode, isAnimating])

	// Update total options when activeNode changes
	useEffect(() => {
		if (activeNode) {
			const totalOptions = activeNode.options?.length || (activeNode.next ? 1 : 0)
			EventBus.emit('ui:dialogue:options:update', { totalOptions })
		}
	}, [activeNode])

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
						{activeNode.options?.map((option, index) => (
							<div key={option.id} className={styles.responseWrapper}>
								<button
									className={`${styles.responseButton} ${index === selectedOptionIndex ? styles.selected : ''}`}
									onClick={() => handleOptionSelect(option.id)}
								>
									{option.text}
								</button>
								{option.item && renderItem(option.item)}
							</div>
						))}

						{(!activeNode.options && activeNode.next) && (
							<button
								className={`${styles.continueButton} ${selectedOptionIndex === 0 ? styles.selected : ''}`}
								onClick={handleContinue}
							>
								Continue
							</button>
						)}

						{(!activeNode.options && !activeNode.next) && (
							<button
								className={`${styles.closeButton} ${selectedOptionIndex === 0 ? styles.selected : ''}`}
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