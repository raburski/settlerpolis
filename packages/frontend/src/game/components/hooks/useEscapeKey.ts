import { useEffect, useRef } from 'react'

export const useEscapeKey = (onEscape: () => void, enabled: boolean = true): void => {
	const onEscapeRef = useRef(onEscape)

	useEffect(() => {
		onEscapeRef.current = onEscape
	}, [onEscape])

	useEffect(() => {
		if (!enabled) {
			return
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.code !== 'Escape') {
				return
			}
			if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
				return
			}
			onEscapeRef.current()
		}

		window.addEventListener('keydown', handleKeyDown)
		return () => {
			window.removeEventListener('keydown', handleKeyDown)
		}
	}, [enabled])
}
