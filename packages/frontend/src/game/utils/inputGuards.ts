const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export const isTypingTarget = (target: EventTarget | null): boolean => {
	if (!target || !(target instanceof HTMLElement)) {
		return false
	}
	return target.isContentEditable || TYPING_TAGS.has(target.tagName)
}

export const isTextInputActive = (): boolean => {
	if (typeof document === 'undefined') {
		return false
	}
	return isTypingTarget(document.activeElement)
}

export const shouldIgnoreKeyboardEvent = (event: KeyboardEvent): boolean => {
	if (isTypingTarget(event.target)) {
		return true
	}
	return isTextInputActive()
}
