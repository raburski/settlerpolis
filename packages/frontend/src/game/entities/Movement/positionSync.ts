import type { BaseMovementView } from './BaseMovementView'

interface SyncConfig {
	softSyncThreshold: number
	hardSnapThreshold: number
	smoothDurationMs: number
}

const POSITION_UPDATE_SYNC: SyncConfig = {
	softSyncThreshold: 8,
	hardSnapThreshold: 48,
	smoothDurationMs: 90
}

const PAUSED_SYNC: SyncConfig = {
	softSyncThreshold: 8,
	hardSnapThreshold: 64,
	smoothDurationMs: 120
}

const getPositionDiff = (view: BaseMovementView, target: { x: number, y: number }): number =>
	Math.abs(view.x - target.x) + Math.abs(view.y - target.y)

const applySync = (view: BaseMovementView, target: { x: number, y: number }, config: SyncConfig, forceSync: boolean): void => {
	const positionDiff = getPositionDiff(view, target)
	if (forceSync || positionDiff > config.hardSnapThreshold) {
		view.updatePosition(target.x, target.y)
		return
	}
	if (positionDiff > config.softSyncThreshold) {
		view.smoothSyncPosition(target.x, target.y, config.smoothDurationMs)
	}
}

export const syncPositionUpdated = (view: BaseMovementView, target: { x: number, y: number }): void => {
	applySync(view, target, POSITION_UPDATE_SYNC, !view.isInterpolating())
}

export const syncMovementPaused = (view: BaseMovementView, target: { x: number, y: number }): void => {
	view.stopMovementInterpolation()
	applySync(view, target, PAUSED_SYNC, false)
}
