import { useEffect, useState, useRef } from 'react'
import { EventBus } from '../EventBus'
import { Event } from '@rugged/game'
import { ChatMessageData, ChatSystemMessageData, ChatMessageType } from '../../../backend/src/DataTypes'
import styles from './ChatLog.module.css'

interface Message {
	id: number
	text: string
	timestamp: Date
	sourcePlayerId?: string
	type: ChatMessageType | 'warning' | 'info' | 'success' | 'error'
}

export function ChatLog() {
	const [messages, setMessages] = useState<Message[]>([])
	const [collapsed, setCollapsed] = useState(true)
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
						playerId: data.playerId,
						type: data.type
					}
				].slice(-50) // Keep last 50 messages
				return newMessages
			})
		}

		function handleSystemMessage(data: ChatSystemMessageData) {
			setMessages(prev => {
				const newMessages = [
					...prev,
					{
						id: messageCounter.current++,
						text: data.message,
						timestamp: new Date(),
						type: data.type
					}
				].slice(-50)
				return newMessages
			})
		}

		// Listen for both regular chat messages and system messages
		EventBus.on(Event.Chat.SC.Receive, handleChatMessage)
		EventBus.on(Event.Chat.SC.System, handleSystemMessage)

		return () => {
			EventBus.off(Event.Chat.SC.Receive, handleChatMessage)
			EventBus.off(Event.Chat.SC.System, handleSystemMessage)
		}
	}, [])

	// Scroll to bottom when new messages arrive
	useEffect(() => {
		if (containerRef.current && !collapsed) {
			containerRef.current.scrollTop = containerRef.current.scrollHeight
		}
	}, [messages, collapsed])

	return (
		<div style={{ position: 'absolute', bottom: 'var(--spacing-xl)', left: 'var(--spacing-xl)' }}>
			<button
				type="button"
				className={styles.toggleButton}
				onClick={() => setCollapsed(c => !c)}
				aria-label={collapsed ? 'Expand chat log' : 'Collapse chat log'}
			>
				{collapsed ? '▲ Show Chat' : '▼ Hide Chat'}
			</button>
			<div className={`${styles.container} ${collapsed ? styles.collapsed : ''}`} ref={containerRef}>
				{!collapsed && messages.map(message => (
					<div 
						key={message.id} 
						className={`${styles.message} ${styles[message.type]}`}
					>
						<span className={styles.timestamp}>
							{message.timestamp.toLocaleTimeString()}
						</span>
						<span className={styles.text}>
							{message.playerId ? `${message.playerId}: ` : ''}
							{message.text}
						</span>
					</div>
				))}
			</div>
		</div>
	)
} 