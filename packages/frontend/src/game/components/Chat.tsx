import React, { useState, useEffect, useRef } from 'react'
import { EventBus } from '../EventBus'
import styles from './Chat.module.css'
import { Event } from '@rugged/game'
import { UiEvents } from '../uiEvents'

export const Chat: React.FC<ChatProps> = () => {
	const [isInputVisible, setIsInputVisible] = useState(false)
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		const handleChatToggle = () => {
			const newVisibility = !isInputVisible
			setIsInputVisible(newVisibility)
			setTimeout(() => {
				inputRef.current?.focus()
			}, 1)
			
		}

		EventBus.on(UiEvents.Chat.Toggle, handleChatToggle)

		return () => {
			EventBus.off(UiEvents.Chat.Toggle, handleChatToggle)
		}
	}, [isInputVisible])

	const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter') {
			e.preventDefault()
			e.stopPropagation()
			
			if (inputRef.current?.value.trim()) {
				const message = inputRef.current.value.trim()
				
				// Emit event to send message (will be handled by MultiplayerService and Player)
				EventBus.emit(Event.Chat.CS.Send, { message })
				
				inputRef.current.value = ''
			}
			
			setIsInputVisible(false)
			EventBus.emit(UiEvents.Chat.Toggle, false)
		} else if (e.key === 'Escape') {
			e.preventDefault()
			e.stopPropagation()
			
			setIsInputVisible(false)
			EventBus.emit(UiEvents.Chat.Toggle, false)
		}
	}

	return (
		<div className={styles.chatContainer}>
			{isInputVisible && (
				<div className={styles.inputContainer}>
					<input
						ref={inputRef}
						type="text"
						onKeyDown={handleInputKeyDown}
						placeholder="Type a message..."
						className={styles.input}
					/>
				</div>
			)}
		</div>
	)
} 
