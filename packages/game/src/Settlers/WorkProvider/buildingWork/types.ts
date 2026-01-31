import type { BuildingInstance, BuildingDefinition } from '../../../Buildings/types'
import type { BuildingWorkKind } from '../../../Buildings/work'
import type { WorkStep } from '../types'
import type { WorkProviderDeps } from '..'
import type { LogisticsProvider } from '../providers/LogisticsProvider'
import type { Logger } from '../../../Logs'
import type { Settler } from '../../../Population/types'

export interface BuildingWorkContext {
	building: BuildingInstance
	definition: BuildingDefinition
	settler: Settler
	managers: WorkProviderDeps
	logistics: LogisticsProvider
	logger: Logger
}

export interface BuildingWorkHandler {
	kind: BuildingWorkKind
	canHandle(definition: BuildingDefinition): boolean
	getNextStep(context: BuildingWorkContext): WorkStep | null
}
