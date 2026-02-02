const STORAGE_KEY_HIGH_FIDELITY = 'rugged:graphics:high-fidelity'

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
