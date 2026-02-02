import { useEffect } from 'react'
import { EventBus } from '../../EventBus'

type EventBusHandler = (...args: any[]) => void

export const useEventBus = (event: string, handler: EventBusHandler): void => {
	useEffect(() => {
		EventBus.on(event, handler)
		return () => {
			EventBus.off(event, handler)
		}
	}, [event, handler])
}
