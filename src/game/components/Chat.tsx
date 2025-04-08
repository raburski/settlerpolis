import React, { useState, useEffect, useRef } from 'react'
import { EventBus } from '../EventBus'
import { MultiplayerService, ChatMessage } from '../services/MultiplayerService'
import styles from './Chat.module.css'

interface ChatProps {
	scene: string
}

export const Chat: React.FC<ChatProps> = ({ scene }) => {
	const [messages, setMessages] = useState<ChatMessage[]>([])
	const [isInputVisible, setIsInputVisible] = useState(false)
	const inputRef = useRef<HTMLInputElement>(null)
	const multiplayerService = MultiplayerService.getInstance()

	useEffect(() => {
		const handleChatMessage = (message: ChatMessage) => {
			if (message.scene === scene) {
				setMessages(prev => [...prev, message])
				
				// Remove message after 5 seconds
				setTimeout(() => {
					setMessages(prev => prev.filter(m => m.timestamp !== message.timestamp))
				}, 5000)
			}
		}

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !isInputVisible) {
				setIsInputVisible(true)
				EventBus.emit('chat:inputVisible', true)
				setTimeout(() => {
					inputRef.current?.focus()
				}, 0)
			}
		}

		EventBus.on('chat:message', handleChatMessage)
		window.addEventListener('keydown', handleKeyDown)

		return () => {
			EventBus.off('chat:message', handleChatMessage)
			window.removeEventListener('keydown', handleKeyDown)
		}
	}, [scene, isInputVisible])

	const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter' && inputRef.current?.value.trim()) {
			multiplayerService.sendChatMessage(inputRef.current.value.trim())
			inputRef.current.value = ''
			setIsInputVisible(false)
			EventBus.emit('chat:inputVisible', false)
		} else if (e.key === 'Escape') {
			setIsInputVisible(false)
			EventBus.emit('chat:inputVisible', false)
		}
	}

	return (
		<div className={styles.chatContainer}>
			{messages.map(message => (
				<div 
					key={message.timestamp} 
					className={styles.message}
					style={{
						opacity: 1 - (Date.now() - message.timestamp) / 5000
					}}
				>
					<span className={styles.playerName}>{message.playerName || 'Player'}:</span> {message.message}
				</div>
			))}
			
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