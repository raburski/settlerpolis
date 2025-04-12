import React, { useState, useEffect, useRef } from 'react'
import { EventBus } from '../EventBus'
import styles from './Chat.module.css'
import { Event } from "../../../backend/src/events"

interface ChatProps {
	scene: string
}

export const Chat: React.FC<ChatProps> = ({ scene }) => {
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

		EventBus.on('ui:chat:toggle', handleChatToggle)

		return () => {
			EventBus.off('ui:chat:toggle', handleChatToggle)
		}
	}, [isInputVisible])

	const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter' && inputRef.current?.value.trim()) {
			e.preventDefault()
			e.stopPropagation()
			
			const message = inputRef.current.value.trim()
			
			// Emit event to send message (will be handled by MultiplayerService and Player)
			EventBus.emit(Event.Chat.CS.Send, { message })
			
			inputRef.current.value = ''
			setIsInputVisible(false)
			EventBus.emit('ui:chat:toggle', false)
		} else if (e.key === 'Escape') {
			e.preventDefault()
			e.stopPropagation()
			
			setIsInputVisible(false)
			EventBus.emit('ui:chat:toggle', false)
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