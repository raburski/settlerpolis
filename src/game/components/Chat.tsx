import React, { useState, useEffect, useRef } from 'react'
import { EventBus } from '../EventBus'
import styles from './Chat.module.css'

interface ChatProps {
	scene: string
}

export const Chat: React.FC<ChatProps> = ({ scene }) => {
	const [isInputVisible, setIsInputVisible] = useState(false)
	const inputRef = useRef<HTMLInputElement>(null)

	// Focus input when it becomes visible
	useEffect(() => {
		if (isInputVisible && inputRef.current) {
			console.log('Input is visible, focusing it')
			inputRef.current.focus()
		}
	}, [isInputVisible])

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !isInputVisible) {
				setIsInputVisible(true)
				EventBus.emit('chat:inputVisible', true)
			}
		}

		window.addEventListener('keydown', handleKeyDown)

		return () => {
			window.removeEventListener('keydown', handleKeyDown)
		}
	}, [isInputVisible])

	const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		console.log('Input key pressed:', e.key)
		
		if (e.key === 'Enter' && inputRef.current?.value.trim()) {
			console.log('Enter pressed with message:', inputRef.current.value.trim())
			e.preventDefault()
			e.stopPropagation()
			
			const message = inputRef.current.value.trim()
			
			// Emit event to send message (will be handled by MultiplayerService and Player)
			EventBus.emit('player:sendMessage', message)
			
			inputRef.current.value = ''
			console.log('Setting isInputVisible to false')
			setIsInputVisible(false)
			EventBus.emit('chat:inputVisible', false)
		} else if (e.key === 'Escape') {
			console.log('Escape pressed, closing input')
			e.preventDefault()
			e.stopPropagation()
			
			setIsInputVisible(false)
			EventBus.emit('chat:inputVisible', false)
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