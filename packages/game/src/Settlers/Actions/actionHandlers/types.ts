import type { SettlerAction, SettlerActionType } from '../types'
import type { ActionSystemDeps } from '..'
import type { SettlerActionFailureReason } from '../../failureReasons'

export interface InProgressAction {
	type: SettlerActionType.Wait | SettlerActionType.Construct | SettlerActionType.BuildRoad | SettlerActionType.Consume | SettlerActionType.Sleep
	endAtMs: number
	buildingInstanceId?: string
	jobId?: string
}

export interface ActionHandlerBaseContext {
	settlerId: string
	action: SettlerAction
	managers: ActionSystemDeps
	nowMs: number
}

export interface ActionHandlerStartContext extends ActionHandlerBaseContext {
	setInProgress: (inProgress: InProgressAction) => void
	complete: () => void
	fail: (reason: SettlerActionFailureReason) => void
}

export interface ActionHandler {
	type: SettlerActionType
	start(context: ActionHandlerStartContext): void
	onComplete?: (context: ActionHandlerBaseContext) => void
	onFail?: (context: ActionHandlerBaseContext, reason: SettlerActionFailureReason) => void
}
