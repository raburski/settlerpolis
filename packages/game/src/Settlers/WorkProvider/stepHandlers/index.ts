import type { StepHandler } from './types'
import { WorkStepType } from '../types'
import { AcquireToolHandler } from './acquireTool'
import { ConstructHandler } from './construct'
import { HarvestHandler } from './harvest'
import { ProduceHandler } from './produce'
import { PlantHandler } from './plant'
import { TransportHandler } from './transport'
import { WaitHandler } from './wait'

export const StepHandlers: Record<WorkStepType, StepHandler> = {
	[WorkStepType.AcquireTool]: AcquireToolHandler,
	[WorkStepType.Construct]: ConstructHandler,
	[WorkStepType.Harvest]: HarvestHandler,
	[WorkStepType.Produce]: ProduceHandler,
	[WorkStepType.Plant]: PlantHandler,
	[WorkStepType.Transport]: TransportHandler,
	[WorkStepType.Wait]: WaitHandler
}

export * from './types'
