import { useEffect, useState, useRef } from 'react'
import { EventBus } from '../EventBus'
import { Event } from '../../../backend/src/Event'
import { ChatMessageData } from '../../../backend/src/DataTypes'
import styles from './ChatLog.module.css'

interface Message {
	id: number
	text: string
	timestamp: Date
	sourcePlayerId?: string
}

export function ChatLog() {
	const [messages, setMessages] = useState<Message[]>([])
	const messageCounter = useRef(0)
	const containerRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		function handleChatMessage(data: ChatMessageData) {
			setMessages(prev => {
				const newMessages = [
					...prev,
					{
						id: messageCounter.current++,
						text: data.message,
						timestamp: new Date(),
						sourcePlayerId: data.sourcePlayerId
					}
				].slice(-20) // Keep only last 20 messages
				return newMessages
			})
		}

		EventBus.on(Event.Chat.Message, handleChatMessage)

		return () => {
			EventBus.off(Event.Chat.Message, handleChatMessage)
		}
	}, [])

	// Scroll to bottom when new messages arrive
	useEffect(() => {
		if (containerRef.current) {
			containerRef.current.scrollTop = containerRef.current.scrollHeight
		}
	}, [messages])

	return (
		<div className={styles.container} ref={containerRef}>
			{messages.map(message => (
				<div key={message.id} className={styles.message}>
					<span className={styles.timestamp}>
						{message.timestamp.toLocaleTimeString()}
					</span>
					<span className={styles.text}>
						{message.sourcePlayerId ? `${message.sourcePlayerId}: ` : ''}
						{message.text}
					</span>
				</div>
			))}
		</div>
	)
} 