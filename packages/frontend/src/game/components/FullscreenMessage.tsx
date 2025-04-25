import { useEffect, useState, useRef } from 'react'
import { EventBus } from '../EventBus'
import { Event } from '@rugged/game'
import styles from './FullscreenMessage.module.css'

interface MessageData {
	message: string
	duration: number
}

type MessageState = 'idle' | 'fadingIn' | 'presenting' | 'fadingOut'

export const FullscreenMessage = () => {
	const [state, setState] = useState<MessageState>({ state: 'idle', nextMessage: null, currentMessage: null })
	const timerRef = useRef<number | null>(null)

	const clearTimer = () => {
		if (timerRef.current) {
			clearTimeout(timerRef.current)
			timerRef.current = null
		}
	}

	useEffect(() => {
		switch (state.state) {
			case 'idle':
				if (state.nextMessage) {
					setState({ ...state, state: 'fadingIn', currentMessage: state.nextMessage, nextMessage: null })
                    clearTimer()
					timerRef.current = setTimeout(() => setState(prev => ({ ...prev, state: 'presenting' })), 300)
				}
				break

			case 'fadingIn':
                if (state.nextMessage) {
                    clearTimer()
                    setState({ ...state, state: 'fadingOut' })
                }
				break

			case 'presenting':
                
                if (state.nextMessage) {
                    clearTimer()
                    setState({ ...state, state: 'fadingOut' })
                } else {
                    timerRef.current = setTimeout(() => setState(prev => ({ ...prev, state: 'fadingOut'})), state.currentMessage?.duration || 0)
                }
				break

			case 'fadingOut':
				timerRef.current = setTimeout(() => {
					setState(prev => ({ ...prev, state: 'idle', currentMessage: null }))
				}, 300)
				break
            default:
                break;
		}

		return () => {}
	}, [state])


	useEffect(() => {
		const handleFullscreenMessage = (data: MessageData) => {
            setState({ ...state, nextMessage: data })
		}

		EventBus.on(Event.Chat.SC.Fullscreen, handleFullscreenMessage)

		return () => {
			EventBus.off(Event.Chat.SC.Fullscreen, handleFullscreenMessage)
		}
	}, [state])

	if (state.state === 'idle' && !state.currentMessage) return null

	return (
		<div className={styles.container}>
			{state.currentMessage && (
				<div className={`${styles.message} ${
					state.state === 'fadingIn' ? styles.fadeIn :
					state.state === 'fadingOut' ? styles.fadeOut :
					styles.visible
				}`}>
					{state.currentMessage.message}
				</div>
			)}
		</div>
	)
} 