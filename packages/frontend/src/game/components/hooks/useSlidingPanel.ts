import { useCallback, useEffect, useRef, useState } from 'react'

export const useSlidingPanel = (animationMs: number = 300) => {
	const [isVisible, setIsVisible] = useState(false)
	const [isExiting, setIsExiting] = useState(false)
	const exitTimerRef = useRef<number | null>(null)

	const clearExitTimer = useCallback(() => {
		if (exitTimerRef.current !== null) {
			window.clearTimeout(exitTimerRef.current)
			exitTimerRef.current = null
		}
	}, [])

	const open = useCallback(() => {
		clearExitTimer()
		setIsExiting(false)
		setIsVisible(true)
	}, [clearExitTimer])

	const close = useCallback(() => {
		if (!isVisible) {
			return
		}
		clearExitTimer()
		setIsExiting(true)
		exitTimerRef.current = window.setTimeout(() => {
			setIsVisible(false)
			setIsExiting(false)
			exitTimerRef.current = null
		}, animationMs)
	}, [animationMs, clearExitTimer, isVisible])

	const toggle = useCallback(() => {
		if (isVisible) {
			close()
		} else {
			open()
		}
	}, [close, isVisible, open])

	useEffect(() => {
		return () => clearExitTimer()
	}, [clearExitTimer])

	return {
		isVisible,
		isExiting,
		open,
		close,
		toggle
	}
}
