const STORAGE_KEY_HIGH_FIDELITY = 'rugged:graphics:high-fidelity'
const STORAGE_KEY_SCROLL_SENSITIVITY = 'rugged:controls:scroll-sensitivity'
const SCROLL_SENSITIVITY_LEVELS = [0.0025, 0.0075, 0.02, 0.06] as const
const DEFAULT_SCROLL_SENSITIVITY = 2

export const getHighFidelity = (): boolean => {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY_HIGH_FIDELITY)
		if (raw === null) {
			return true
		}
		return raw === 'true'
	} catch {
		return true
	}
}

export const setHighFidelity = (enabled: boolean): void => {
	try {
		window.localStorage.setItem(STORAGE_KEY_HIGH_FIDELITY, enabled ? 'true' : 'false')
	} catch {
		// ignore storage failures
	}
}

const clampScrollSensitivity = (value: number): number => {
	if (!Number.isFinite(value)) return DEFAULT_SCROLL_SENSITIVITY
	return Math.min(SCROLL_SENSITIVITY_LEVELS.length, Math.max(1, Math.round(value)))
}

export const getScrollSensitivity = (): number => {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY_SCROLL_SENSITIVITY)
		if (raw === null) {
			return DEFAULT_SCROLL_SENSITIVITY
		}
		const parsed = Number(raw)
		return clampScrollSensitivity(parsed)
	} catch {
		return DEFAULT_SCROLL_SENSITIVITY
	}
}

export const setScrollSensitivity = (level: number): number => {
	const clamped = clampScrollSensitivity(level)
	try {
		window.localStorage.setItem(STORAGE_KEY_SCROLL_SENSITIVITY, String(clamped))
	} catch {
		// ignore storage failures
	}
	return clamped
}

export const getScrollSensitivityWheelDelta = (level?: number): number => {
	const clamped = clampScrollSensitivity(level ?? getScrollSensitivity())
	return SCROLL_SENSITIVITY_LEVELS[clamped - 1] ?? SCROLL_SENSITIVITY_LEVELS[DEFAULT_SCROLL_SENSITIVITY - 1]
}

export const getScrollSensitivityOptions = (): ReadonlyArray<{ label: string; value: number }> => [
	{ label: 'Slow', value: 1 },
	{ label: 'Normal', value: 2 },
	{ label: 'Fast', value: 3 },
	{ label: 'Ultra', value: 4 }
]
