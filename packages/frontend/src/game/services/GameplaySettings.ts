const STORAGE_KEY_AUTO_REQUEST_WORKER = 'rugged:gameplay:auto-request-worker'
const DEFAULT_AUTO_REQUEST_WORKER = true

export const getAutoRequestWorker = (): boolean => {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY_AUTO_REQUEST_WORKER)
		if (raw === null) {
			return DEFAULT_AUTO_REQUEST_WORKER
		}
		return raw === 'true'
	} catch {
		return DEFAULT_AUTO_REQUEST_WORKER
	}
}

export const setAutoRequestWorker = (enabled: boolean): void => {
	try {
		window.localStorage.setItem(STORAGE_KEY_AUTO_REQUEST_WORKER, enabled ? 'true' : 'false')
	} catch {
		// ignore storage failures
	}
}
