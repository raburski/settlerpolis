import type { WorkAction, WorkActionType } from '../../Work/types'
import type { ActionSystemDeps } from '..'

export interface InProgressAction {
	type: WorkActionType.Wait | WorkActionType.Construct | WorkActionType.BuildRoad | WorkActionType.Consume | WorkActionType.Sleep
	endAtMs: number
	buildingInstanceId?: string
	jobId?: string
}

export interface ActionHandlerBaseContext {
	settlerId: string
	action: WorkAction
	managers: ActionSystemDeps
	nowMs: number
}

export interface ActionHandlerStartContext extends ActionHandlerBaseContext {
	setInProgress: (inProgress: InProgressAction) => void
	complete: () => void
	fail: (reason: string) => void
}

export interface ActionHandler {
	type: WorkActionType
	start(context: ActionHandlerStartContext): void
	onComplete?: (context: ActionHandlerBaseContext) => void
	onFail?: (context: ActionHandlerBaseContext, reason: string) => void
}
