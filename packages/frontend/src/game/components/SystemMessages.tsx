import { useEffect, useRef, useState } from 'react'
import { EventBus } from '../EventBus'
import { Event, ChatSystemMessageData } from '@rugged/game'
import styles from './SystemMessages.module.css'

interface Message {
	id: number
	text: string
	timestamp: Date
	type: 'system' | 'warning' | 'info' | 'success' | 'error'
}

export function SystemMessages() {
	const [messages, setMessages] = useState<Message[]>([])
	const messageCounter = useRef(0)

	useEffect(() => {
		function handleSystemMessage(data: ChatSystemMessageData) {
			const newMessage = {
				id: messageCounter.current++,
				text: data.message,
				timestamp: new Date(),
				type: data.type
			}

			setMessages(prev => [...prev, newMessage])

			// Remove message after 2 seconds
			setTimeout(() => {
				setMessages(prev => prev.filter(msg => msg.id !== newMessage.id))
			}, 3000)
		}

		// Listen for system messages
		EventBus.on(Event.Chat.SC.System, handleSystemMessage)

		return () => {
			EventBus.off(Event.Chat.SC.System, handleSystemMessage)
		}
	}, [])

	return (
		<div className={styles.container}>
			{messages.map(message => (
				<div 
					key={message.id} 
					className={`${styles.message} ${styles[message.type]}`}
				>
					{message.text}
				</div>
			))}
		</div>
	)
} 
